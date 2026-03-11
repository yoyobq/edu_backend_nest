import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { AiJobHandler } from '@src/adapters/worker/ai/ai-generate.handler';
import {
  AsyncTaskRecordEntity,
  type AsyncTaskRecordStatus,
} from '@src/modules/async-task-record/async-task-record.entity';
import {
  type EmbedAiContentInput,
  type EmbedAiContentResult,
  type GenerateAiContentInput,
  type GenerateAiContentResult,
} from '@src/modules/common/ai-worker/ai-worker.types';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqWorkerRuntime } from '@src/infrastructure/bullmq/worker.runtime';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';

type FinalJobState = 'completed' | 'failed';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class MockAiWorkerService {
  readonly generateCalls: GenerateAiContentInput[] = [];
  readonly embedCalls: EmbedAiContentInput[] = [];

  generate(input: GenerateAiContentInput): GenerateAiContentResult {
    this.generateCalls.push(input);
    if (input.prompt.includes('__FAIL_GENERATE__')) {
      throw new Error('Mock AI generate failure');
    }
    return {
      accepted: true,
      outputText: `mock-output:${input.prompt.trim()}`,
      providerJobId: `mock-g-${this.generateCalls.length}`,
    };
  }

  embed(input: EmbedAiContentInput): EmbedAiContentResult {
    this.embedCalls.push(input);
    if (input.text.includes('__FAIL_EMBED__')) {
      throw new Error('Mock AI embed failure');
    }
    return {
      accepted: true,
      vector: [0.11, 0.22, 0.33, 0.44],
      providerJobId: `mock-e-${this.embedCalls.length}`,
    };
  }
}

const enqueueAiGenerate = async (input: {
  readonly queue: Queue;
  readonly jobId: string;
  readonly prompt: string;
  readonly attempts?: number;
}): Promise<void> => {
  await input.queue.add(
    BULLMQ_JOBS.AI.GENERATE,
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: input.prompt,
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
  readonly attempts?: number;
}): Promise<void> => {
  await input.queue.add(
    BULLMQ_JOBS.AI.EMBED,
    {
      provider: 'openai',
      model: 'text-embedding-3-small',
      text: input.text,
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
}): Promise<AsyncTaskRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const record = await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
      where: {
        queueName: BULLMQ_QUEUES.AI,
        jobName: 'unknown',
        status: 'failed',
      },
      order: { id: 'DESC' },
    });
    if (record && record.reason?.includes(input.reasonKeyword)) {
      return record;
    }
    await sleep(input.pollMs);
  }
  throw new Error('Missing-job degraded record was not created in time');
};

describe('AI Worker（e2e）', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;
  let aiQueue: Queue;
  let workerRuntime: BullMqWorkerRuntime;
  let dataSource: DataSource;
  let aiWorkerMock: MockAiWorkerService;
  let aiJobHandler: AiJobHandler;

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

  it('generate 成功时应落库为 succeeded，traceId 应与 jobId 对齐', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-trace-${timestamp}`;

    try {
      await workerRuntime.stop();
      const callsBefore = aiWorkerMock.generateCalls.length;

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: 'generate success case',
        attempts: 1,
      });

      const queuedJob = await aiQueue.getJob(jobId);
      expect(queuedJob).toBeDefined();
      expect(
        await findAsyncTaskRecord({
          dataSource,
          queueName: BULLMQ_QUEUES.AI,
          jobId,
        }),
      ).toBeNull();

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
        outputText: 'mock-output:generate success case',
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
      expect(record.traceId).toBe(jobId);
      expect(record.status).toBe('succeeded');
      expect(record.source).toBe('system');
      expect(record.reason).toBe('worker_completed');
      expect(record.bizType).toBe('ai_generation');
      expect(record.bizKey).toBe(jobId);
      expect(record.attemptCount).toBe(attemptsMade + 1);
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

    try {
      await workerRuntime.stop();
      const callsBefore = aiWorkerMock.embedCalls.length;

      await enqueueAiEmbed({
        queue: aiQueue,
        jobId,
        text: 'embed success case',
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
      expect(record.traceId).toBe(jobId);
      expect(record.bizType).toBe('ai_embedding');
      expect(record.reason).toBe('worker_completed');
      expect(aiWorkerMock.embedCalls.length - callsBefore).toBe(1);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('generate 失败时应落库为 failed 并写入失败原因', async () => {
    const timestamp = Date.now();
    const jobId = `${BULLMQ_JOBS.AI.GENERATE}-ai-gen-fail-${timestamp}`;

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
      expect(record.status).toBe('failed');
      expect(record.reason).toContain('Mock AI generate failure');
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

    try {
      await workerRuntime.stop();
      const callsBefore = aiWorkerMock.generateCalls.length;

      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: 'dedup first payload',
        attempts: 1,
      });
      await enqueueAiGenerate({
        queue: aiQueue,
        jobId,
        prompt: 'dedup second payload',
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
      expect(recordCount).toBe(1);
      expect(aiWorkerMock.generateCalls.length - callsBefore).toBe(1);
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
      timeoutMs: 10000,
      pollMs: 100,
    });
    expect(record.queueName).toBe(BULLMQ_QUEUES.AI);
    expect(record.jobName).toBe('unknown');
    expect(record.status).toBe('failed');
    expect(record.bizType).toBe('ai_worker');
    expect(record.traceId.startsWith('missing-job:unknown:')).toBe(true);
    expect(record.reason).toContain(`worker_event_job_missing:${reasonKeyword}`);
  }, 30000);
});
