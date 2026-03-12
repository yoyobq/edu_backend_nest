// test/08-qm-worker/ai-worker-consume.e2e-spec.ts
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiJobHandler } from '@src/adapters/worker/ai/ai-generate.handler';
import type { AiGenerateJob } from '@src/adapters/worker/ai/ai-generate.mapper';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import { BullMqWorkerRuntime } from '@src/infrastructure/bullmq/worker.runtime';
import {
  AsyncTaskRecordEntity,
  type AsyncTaskRecordStatus,
} from '@src/modules/async-task-record/async-task-record.entity';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import {
  type EmbedAiContentInput,
  type EmbedAiContentResult,
  type GenerateAiContentInput,
  type GenerateAiContentResult,
} from '@src/modules/common/ai-worker/ai-worker.types';
import { type Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';

type FinalJobState = 'completed' | 'failed';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class MockAiWorkerService {
  readonly generateCalls: GenerateAiContentInput[] = [];
  readonly embedCalls: EmbedAiContentInput[] = [];
  private readonly generateAttemptsByPrompt = new Map<string, number>();

  async generate(input: GenerateAiContentInput): Promise<GenerateAiContentResult> {
    this.generateCalls.push(input);
    const slowMs = this.resolveSlowMs({ content: input.prompt });
    if (slowMs > 0) {
      await sleep(slowMs);
    }
    const attemptKey = `${input.model}:${input.prompt}`;
    const currentAttempt = (this.generateAttemptsByPrompt.get(attemptKey) ?? 0) + 1;
    this.generateAttemptsByPrompt.set(attemptKey, currentAttempt);
    if (input.prompt.includes('__FAIL_GENERATE__')) {
      throw new Error('Mock AI generate failure');
    }
    if (input.prompt.includes('__RETRY_SUCCESS_2__') && currentAttempt <= 2) {
      throw new Error(`Mock AI transient failure ${currentAttempt}`);
    }
    if (input.prompt.includes('__RETRY_EXHAUST__')) {
      throw new Error(`Mock AI exhausted failure ${currentAttempt}`);
    }
    return {
      accepted: true,
      outputText: `mock-output:${input.prompt.trim()}`,
      providerJobId: `mock-g-${this.generateCalls.length}`,
    };
  }

  async embed(input: EmbedAiContentInput): Promise<EmbedAiContentResult> {
    this.embedCalls.push(input);
    const slowMs = this.resolveSlowMs({ content: input.text });
    if (slowMs > 0) {
      await sleep(slowMs);
    }
    if (input.text.includes('__FAIL_EMBED__')) {
      throw new Error('Mock AI embed failure');
    }
    return {
      accepted: true,
      vector: [0.11, 0.22, 0.33, 0.44],
      providerJobId: `mock-e-${this.embedCalls.length}`,
    };
  }

  private resolveSlowMs(input: { readonly content: string }): number {
    const matched = input.content.match(/__SLOW_MS_(\d+)__/);
    if (!matched) {
      return 0;
    }
    const parsed = Number(matched[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(parsed, 5000);
  }
}

const enqueueAiGenerate = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
  readonly prompt: string;
  readonly traceId?: string;
  readonly attempts?: number;
}): Promise<void> => {
  const traceId = input.traceId ?? `ai-generate-e2e-trace:${input.jobId}`;
  await input.queue.add(
    BULLMQ_JOBS.AI.GENERATE,
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: input.prompt,
      traceId,
      metadata: {
        source: 'e2e-ai-generate',
      },
    },
    {
      jobId: input.jobId,
      attempts: input.attempts ?? 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  );
};

const enqueueAiEmbed = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
  readonly text: string;
  readonly traceId?: string;
  readonly attempts?: number;
}): Promise<void> => {
  const traceId = input.traceId ?? `ai-embed-e2e-trace:${input.jobId}`;
  await input.queue.add(
    BULLMQ_JOBS.AI.EMBED,
    {
      provider: 'openai',
      model: 'text-embedding-3-small',
      text: input.text,
      traceId,
      metadata: {
        source: 'e2e-ai-embed',
      },
    },
    {
      jobId: input.jobId,
      attempts: input.attempts ?? 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  );
};

const waitJobFinalState = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
  readonly timeoutMs: number;
  readonly pollMs: number;
}): Promise<{
  readonly state: FinalJobState;
  readonly returnvalue: unknown;
  readonly failedReason: string | undefined;
}> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const job = await input.queue.getJob(input.jobId);
    if (job) {
      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        return {
          state,
          returnvalue: job.returnvalue,
          failedReason: job.failedReason,
        };
      }
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI job did not reach final state in time: ${input.jobId}`);
};

const getJobAttemptsMade = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
}): Promise<number> => {
  const job = await input.queue.getJob(input.jobId);
  if (!job) {
    throw new Error(`AI job not found: ${input.jobId}`);
  }
  return job.attemptsMade;
};

const findAsyncTaskRecord = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly jobId: string;
}): Promise<AsyncTaskRecordEntity | null> => {
  return await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
    where: { queueName: input.queueName, jobId: input.jobId },
  });
};

const waitAsyncTaskRecord = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly jobId: string;
  readonly timeoutMs: number;
  readonly pollMs: number;
  readonly statuses?: ReadonlyArray<AsyncTaskRecordStatus>;
}): Promise<AsyncTaskRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const record = await findAsyncTaskRecord({
      dataSource: input.dataSource,
      queueName: input.queueName,
      jobId: input.jobId,
    });
    if (record && (!input.statuses || input.statuses.includes(record.status))) {
      return record;
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI async task record did not reach expected state in time: ${input.jobId}`);
};

const countAsyncTaskRecords = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly jobId: string;
}): Promise<number> => {
  return await input.dataSource.getRepository(AsyncTaskRecordEntity).count({
    where: { queueName: input.queueName, jobId: input.jobId },
  });
};

const waitLatestMissingRecord = async (input: {
  readonly dataSource: DataSource;
  readonly timeoutMs: number;
  readonly pollMs: number;
  readonly reasonKeyword: string;
  readonly jobName?: string;
}): Promise<AsyncTaskRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const where: {
      readonly queueName: string;
      readonly status: AsyncTaskRecordStatus;
      readonly jobName?: string;
    } = {
      queueName: BULLMQ_QUEUES.AI,
      status: 'failed',
      jobName: input.jobName,
    };
    const record = await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
      where,
      order: { id: 'DESC' },
    });
    if (record && record.reason?.includes(input.reasonKeyword)) {
      return record;
    }
    await sleep(input.pollMs);
  }
  throw new Error('Missing-job degraded record was not created in time');
};

const recordAiEnqueued = async (input: {
  readonly asyncTaskRecordService: AsyncTaskRecordService;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly maxAttempts?: number;
}): Promise<void> => {
  const bizType = input.jobName === BULLMQ_JOBS.AI.EMBED ? 'ai_embedding' : 'ai_generation';
  await input.asyncTaskRecordService.recordEnqueued({
    data: {
      queueName: BULLMQ_QUEUES.AI,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      bizType,
      bizKey: input.traceId,
      source: 'system',
      reason: 'enqueue_accepted',
      maxAttempts: input.maxAttempts,
    },
  });
};

describe('AI Worker（e2e）', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;
  let aiQueue: Queue;
  let workerRuntime: BullMqWorkerRuntime;
  let dataSource: DataSource;
  let aiWorkerMock: MockAiWorkerService;
  let aiJobHandler: AiJobHandler;
  let asyncTaskRecordService: AsyncTaskRecordService;
  let producerGateway: BullMqProducerGateway;

  beforeAll(async () => {
    initGraphQLSchema();

    const apiModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
    apiApp = apiModuleFixture.createNestApplication();
    await apiApp.init();

    const workerModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(AiWorkerService)
      .useClass(MockAiWorkerService)
      .compile();
    workerApp = workerModuleFixture.createNestApplication();
    await workerApp.init();

    aiQueue = apiApp.get<Queue>(getQueueToken(BULLMQ_QUEUES.AI));
    workerRuntime = workerApp.get(BullMqWorkerRuntime);
    dataSource = apiApp.get(DataSource);
    aiWorkerMock = workerApp.get(AiWorkerService);
    aiJobHandler = workerApp.get(AiJobHandler);
    asyncTaskRecordService = apiApp.get(AsyncTaskRecordService);
    producerGateway = apiApp.get(BullMqProducerGateway);
  }, 60000);

  afterAll(async () => {
    if (workerApp) {
      await workerApp.close();
    }
    if (apiApp) {
      await apiApp.close();
    }
  });

  it('API 应用上下文不应注册 Worker 运行时', () => {
    expect(() => apiApp.get(BullMqWorkerRuntime)).toThrow();
  });

  it('generate 成功时应落库为 succeeded，traceId 应保持 payload 显式值', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-trace-${timestamp}`;
    const traceId = `ai-generate-trace-${timestamp}`;

    try {
      await workerRuntime.stop();
      const callsBefore = aiWorkerMock.generateCalls.length;
      await recordAiEnqueued({
        asyncTaskRecordService,
        jobName: BULLMQ_JOBS.AI.GENERATE,
        jobId,
        traceId,
        maxAttempts: 1,
      });

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: 'generate success case __SLOW_MS_400__',
        traceId,
        attempts: 1,
      });

      const queuedJob = await aiQueue.getJob(jobId);
      expect(queuedJob).toBeDefined();
      const queuedRecord = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['queued'],
        timeoutMs: 5000,
        pollMs: 100,
      });
      expect(queuedRecord.status).toBe('queued');
      expect(queuedRecord.reason).toBe('enqueue_accepted');
      expect(queuedRecord.traceId).toBe(traceId);

      await workerRuntime.start();
      const processingRecord = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['processing'],
        timeoutMs: 5000,
        pollMs: 100,
      });
      expect(processingRecord.status).toBe('processing');
      expect(processingRecord.reason).toBe('worker_processing');
      expect(processingRecord.startedAt).toBeInstanceOf(Date);
      expect(processingRecord.finishedAt).toBeNull();

      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      expect(finalState.returnvalue).toMatchObject({
        accepted: true,
        outputText: 'mock-output:generate success case __SLOW_MS_400__',
      });

      const attemptsMade = await getJobAttemptsMade({ queue: aiQueue, jobId });
      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.jobName).toBe(BULLMQ_JOBS.AI.GENERATE);
      expect(record.traceId).toBe(traceId);
      expect(record.status).toBe('succeeded');
      expect(record.source).toBe('system');
      expect(record.reason).toBe('worker_completed');
      expect(record.bizType).toBe('ai_generation');
      expect(record.bizKey).toBe(traceId);
      expect(record.attemptCount).toBe(attemptsMade);
      expect(record.maxAttempts).toBe(1);
      expect(record.startedAt).toBeInstanceOf(Date);
      expect(record.finishedAt).toBeInstanceOf(Date);
      expect(aiWorkerMock.generateCalls.length - callsBefore).toBe(1);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('embed 成功时应落库为 succeeded 且记录 ai_embedding 语义', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.EMBED}-ai-embed-trace-${timestamp}`;
    const traceId = `ai-embed-trace-${timestamp}`;

    try {
      await workerRuntime.stop();
      const callsBefore = aiWorkerMock.embedCalls.length;

      await enqueueAiEmbed({
        queue: aiQueue,
        jobId,
        text: 'embed success case',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      expect(finalState.returnvalue).toMatchObject({
        accepted: true,
        vector: [0.11, 0.22, 0.33, 0.44],
      });

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.jobName).toBe(BULLMQ_JOBS.AI.EMBED);
      expect(record.traceId).toBe(traceId);
      expect(record.bizType).toBe('ai_embedding');
      expect(record.bizKey).toBe(traceId);
      expect(record.reason).toBe('worker_completed');
      expect(aiWorkerMock.embedCalls.length - callsBefore).toBe(1);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('generate 失败时应落库为 failed 并写入失败原因', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-fail-${timestamp}`;
    const traceId = `ai-generate-fail-trace-${timestamp}`;

    try {
      await workerRuntime.stop();
      await recordAiEnqueued({
        asyncTaskRecordService,
        jobName: BULLMQ_JOBS.AI.GENERATE,
        jobId,
        traceId,
        maxAttempts: 1,
      });

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: '__FAIL_GENERATE__ __SLOW_MS_400__',
        traceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const processingRecord = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['processing'],
        timeoutMs: 5000,
        pollMs: 100,
      });
      expect(processingRecord.status).toBe('processing');
      expect(processingRecord.reason).toBe('worker_processing');
      expect(processingRecord.startedAt).toBeInstanceOf(Date);
      expect(processingRecord.finishedAt).toBeNull();

      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      expect(finalState.failedReason).toContain('Mock AI generate failure');

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.jobName).toBe(BULLMQ_JOBS.AI.GENERATE);
      expect(record.bizType).toBe('ai_generation');
      expect(record.traceId).toBe(traceId);
      expect(record.bizKey).toBe(traceId);
      expect(record.status).toBe('failed');
      expect(record.reason).toContain('Mock AI generate failure');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('attempts=3 前两次失败第三次成功时应落库 succeeded 且重试计数正确', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-retry-success-${timestamp}`;
    const prompt = `__RETRY_SUCCESS_2__-${timestamp}`;

    try {
      await workerRuntime.stop();

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt,
        attempts: 3,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');
      expect(finalState.returnvalue).toMatchObject({
        accepted: true,
        outputText: `mock-output:${prompt}`,
      });

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('succeeded');
      expect(record.attemptCount).toBe(3);
      expect(record.maxAttempts).toBe(3);
      expect(record.reason).toBe('worker_completed');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('attempts=3 重试耗尽后应 failed 且 reason 仅来自最后一次错误', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-retry-failed-${timestamp}`;
    const prompt = `__RETRY_EXHAUST__-${timestamp}`;

    try {
      await workerRuntime.stop();

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt,
        attempts: 3,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.status).toBe('failed');
      expect(record.maxAttempts).toBe(3);
      expect(record.reason).toContain('Mock AI exhausted failure 3');
      expect(record.reason).not.toContain('Mock AI exhausted failure 1');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('embed 失败时应落库为 failed 并写入失败原因', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.EMBED}-ai-embed-fail-${timestamp}`;

    try {
      await workerRuntime.stop();

      await enqueueAiEmbed({
        queue: aiQueue,
        jobId,
        text: '__FAIL_EMBED__',
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');
      expect(finalState.failedReason).toContain('Mock AI embed failure');

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.jobName).toBe(BULLMQ_JOBS.AI.EMBED);
      expect(record.bizType).toBe('ai_embedding');
      expect(record.status).toBe('failed');
      expect(record.reason).toContain('Mock AI embed failure');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('重复入队同一 jobId 时应保持单条任务记录并仅消费一次', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-dedup-${timestamp}`;
    const firstTraceId = `ai-dedup-trace-first-${timestamp}`;
    const secondTraceId = `ai-dedup-trace-second-${timestamp}`;

    try {
      await workerRuntime.stop();
      const callsBefore = aiWorkerMock.generateCalls.length;

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: 'dedup first payload',
        traceId: firstTraceId,
        attempts: 1,
      });
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: 'dedup second payload',
        traceId: secondTraceId,
        attempts: 1,
      });

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['succeeded'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      const recordCount = await countAsyncTaskRecords({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
      });
      expect(record.status).toBe('succeeded');
      expect(record.traceId).toBe(firstTraceId);
      expect(record.bizKey).toBe(firstTraceId);
      expect(recordCount).toBe(1);
      expect(aiWorkerMock.generateCalls.length - callsBefore).toBe(1);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('同队列不同 jobName 复用 dedupKey 时应抛出冲突错误', async () => {
    const timestamp = Date.now();
    const dedupKey = `ai-dedup-cross-job-${timestamp}`;

    await producerGateway.enqueue({
      queueName: BULLMQ_QUEUES.AI,
      jobName: BULLMQ_JOBS.AI.GENERATE,
      dedupKey,
      traceId: `ai-cross-job-generate-trace-${timestamp}`,
      payload: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'cross job dedup generate',
        metadata: {
          source: 'e2e-ai-cross-job-generate',
        },
      },
    });

    await expect(
      producerGateway.enqueue({
        queueName: BULLMQ_QUEUES.AI,
        jobName: BULLMQ_JOBS.AI.EMBED,
        dedupKey,
        traceId: `ai-cross-job-embed-trace-${timestamp}`,
        payload: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          text: 'cross job dedup embed',
          metadata: {
            source: 'e2e-ai-cross-job-embed',
          },
        },
      }),
    ).rejects.toThrow(`dedup_job_name_conflict:${BULLMQ_QUEUES.AI}:${dedupKey}`);
  }, 60000);

  it('payload 缺失 traceId 时应走降级失败语义且不回流 jobId', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-missing-trace-${timestamp}`;

    try {
      await workerRuntime.stop();
      await aiQueue.add(
        BULLMQ_JOBS.AI.GENERATE,
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'missing trace id payload',
          metadata: {
            source: 'e2e-ai-missing-trace',
          },
        },
        {
          jobId,
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(record.traceId).toBe(`degraded-trace:${BULLMQ_JOBS.AI.GENERATE}:${jobId}`);
      expect(record.bizKey).toBe(record.traceId);
      expect(record.reason).toContain('missing_payload_trace_id');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('重复触发 completed 事件时不应新增记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-completed-idempotent-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: 'completed idempotent case',
        attempts: 1,
      });
      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('completed');

      const job = await aiQueue.getJob(jobId);
      expect(job).toBeDefined();
      await aiJobHandler.onGenerateCompleted({ job: job as unknown as AiGenerateJob });
      await aiJobHandler.onGenerateCompleted({ job: job as unknown as AiGenerateJob });

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['succeeded'],
        timeoutMs: 10000,
        pollMs: 120,
      });
      const recordCount = await countAsyncTaskRecords({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
      });
      expect(record.status).toBe('succeeded');
      expect(recordCount).toBe(1);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('重复触发 failed 事件时不应新增记录', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-failed-idempotent-${timestamp}`;

    try {
      await workerRuntime.stop();
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: '__FAIL_GENERATE__',
        attempts: 1,
      });
      await workerRuntime.start();
      const finalState = await waitJobFinalState({
        queue: aiQueue,
        jobId,
        timeoutMs: 20000,
        pollMs: 150,
      });
      expect(finalState.state).toBe('failed');

      const job = await aiQueue.getJob(jobId);
      expect(job).toBeDefined();
      await aiJobHandler.onGenerateFailed({
        job: job as unknown as AiGenerateJob,
        error: new Error('Manual idempotent failed event'),
      });
      await aiJobHandler.onGenerateFailed({
        job: job as unknown as AiGenerateJob,
        error: new Error('Manual idempotent failed event'),
      });

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
        statuses: ['failed'],
        timeoutMs: 10000,
        pollMs: 120,
      });
      const recordCount = await countAsyncTaskRecords({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId,
      });
      expect(record.status).toBe('failed');
      expect(record.reason).toContain('Manual idempotent failed event');
      expect(recordCount).toBe(1);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('failed 事件缺失 job 时应落库 unknown/ai_worker 降级语义', async () => {
    const reasonKeyword = `missing-job-${Date.now()}`;

    await aiJobHandler.onFailed({
      job: undefined,
      error: new Error(reasonKeyword),
    });

    const record = await waitLatestMissingRecord({
      dataSource,
      reasonKeyword,
      jobName: 'unknown',
      timeoutMs: 10000,
      pollMs: 100,
    });
    expect(record.queueName).toBe(BULLMQ_QUEUES.AI);
    expect(record.jobName).toBe('unknown');
    expect(record.status).toBe('failed');
    expect(record.bizType).toBe('ai_worker');
    expect(record.traceId.startsWith('missing-job:unknown:')).toBe(true);
    expect(record.bizKey).toBe(record.traceId);
    expect(record.reason).toContain(`worker_event_job_missing:${reasonKeyword}`);
  }, 30000);

  it('failed 事件遇到未知 jobName 时应落库 ai_worker 降级语义', async () => {
    const timestamp = Date.now();
    const reasonKeyword = `unknown-job-${timestamp}`;
    const jobId = `ai-unsupported-job-${timestamp}`;
    const unknownJobName = 'summarize';
    const unsupportedJob = {
      id: jobId,
      name: unknownJobName,
      data: {
        payload: 'invalid',
      },
      attemptsMade: 0,
      opts: {},
      timestamp,
      processedOn: timestamp,
      finishedOn: timestamp,
    } as unknown as Job<Record<string, unknown>, unknown, string>;

    await aiJobHandler.onFailed({
      job: unsupportedJob,
      error: new Error(reasonKeyword),
    });

    const record = await waitLatestMissingRecord({
      dataSource,
      reasonKeyword,
      jobName: unknownJobName,
      timeoutMs: 10000,
      pollMs: 100,
    });
    expect(record.queueName).toBe(BULLMQ_QUEUES.AI);
    expect(record.jobName).toBe(unknownJobName);
    expect(record.jobId).toBe(jobId);
    expect(record.status).toBe('failed');
    expect(record.bizType).toBe('ai_worker');
    expect(record.traceId).toBe(`degraded-trace:${unknownJobName}:${jobId}`);
    expect(record.bizKey).toBe(record.traceId);
    expect(record.reason).toContain(`unsupported_ai_job:${unknownJobName}:${reasonKeyword}`);
  }, 30000);
});
