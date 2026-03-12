import { LoginTypeEnum } from '@app-types/models/account.types';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqWorkerRuntime } from '@src/infrastructure/bullmq/worker.runtime';
import {
  AsyncTaskRecordEntity,
  type AsyncTaskRecordStatus,
} from '@src/modules/async-task-record/async-task-record.entity';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '@src/modules/common/ai-worker/ai-worker.types';
import { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { login } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

type FinalJobState = 'completed' | 'failed';

interface QueueAiResultData {
  readonly queued: boolean;
  readonly jobId: string;
  readonly traceId: string;
}

const QUEUE_AI_GENERATE_MUTATION = `
  mutation QueueAiGenerate($input: QueueAiGenerateInput!) {
    queueAiGenerate(input: $input) {
      queued
      jobId
      traceId
    }
  }
`;

const QUEUE_AI_EMBED_MUTATION = `
  mutation QueueAiEmbed($input: QueueAiEmbedInput!) {
    queueAiEmbed(input: $input) {
      queued
      jobId
      traceId
    }
  }
`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class MockAiWorkerService {
  readonly generateCalls: GenerateAiContentInput[] = [];
  readonly embedCalls: EmbedAiContentInput[] = [];

  async generate(input: GenerateAiContentInput): Promise<GenerateAiContentResult> {
    this.generateCalls.push(input);
    const slowMs = this.resolveSlowMs({ content: input.prompt });
    if (slowMs > 0) {
      await sleep(slowMs);
    }
    if (input.prompt.includes('__FAIL_GENERATE__')) {
      throw new Error('Mock AI generate failure');
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

const queueAiGenerate = async (input: {
  readonly app: INestApplication;
  readonly token?: string;
  readonly model: string;
  readonly prompt: string;
  readonly provider?: 'openai' | 'qwen' | 'deepseek' | 'kimi';
  readonly metadata?: Record<string, string>;
  readonly dedupKey?: string;
  readonly traceId?: string;
}): Promise<request.Response> => {
  const req = request(input.app.getHttpServer())
    .post('/graphql')
    .send({
      query: QUEUE_AI_GENERATE_MUTATION,
      variables: {
        input: {
          provider: input.provider,
          model: input.model,
          prompt: input.prompt,
          metadata: input.metadata,
          dedupKey: input.dedupKey,
          traceId: input.traceId,
        },
      },
    });
  if (input.token) {
    req.set('Authorization', `Bearer ${input.token}`);
  }
  return await req.expect(200);
};

const queueAiEmbed = async (input: {
  readonly app: INestApplication;
  readonly token?: string;
  readonly model: string;
  readonly text: string;
  readonly provider?: 'openai' | 'qwen' | 'deepseek' | 'kimi';
  readonly metadata?: Record<string, string>;
  readonly dedupKey?: string;
  readonly traceId?: string;
}): Promise<request.Response> => {
  const req = request(input.app.getHttpServer())
    .post('/graphql')
    .send({
      query: QUEUE_AI_EMBED_MUTATION,
      variables: {
        input: {
          provider: input.provider,
          model: input.model,
          text: input.text,
          metadata: input.metadata,
          dedupKey: input.dedupKey,
          traceId: input.traceId,
        },
      },
    });
  if (input.token) {
    req.set('Authorization', `Bearer ${input.token}`);
  }
  return await req.expect(200);
};

const parseQueueAiGenerateData = (response: request.Response): QueueAiResultData => {
  return (response.body as { data?: { queueAiGenerate?: QueueAiResultData } }).data
    ?.queueAiGenerate as QueueAiResultData;
};

const parseQueueAiEmbedData = (response: request.Response): QueueAiResultData => {
  return (response.body as { data?: { queueAiEmbed?: QueueAiResultData } }).data
    ?.queueAiEmbed as QueueAiResultData;
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

const waitAsyncTaskRecordByTrace = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly traceId: string;
  readonly timeoutMs: number;
  readonly pollMs: number;
  readonly statuses?: ReadonlyArray<AsyncTaskRecordStatus>;
}): Promise<AsyncTaskRecordEntity> => {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const record = await input.dataSource.getRepository(AsyncTaskRecordEntity).findOne({
      where: {
        queueName: input.queueName,
        traceId: input.traceId,
      },
      order: {
        id: 'DESC',
      },
    });
    if (record && (!input.statuses || input.statuses.includes(record.status))) {
      return record;
    }
    await sleep(input.pollMs);
  }
  throw new Error(`AI async task record did not reach expected state in time: ${input.traceId}`);
};

const countAsyncTaskRecords = async (input: {
  readonly dataSource: DataSource;
  readonly queueName: string;
  readonly jobId: string;
}): Promise<number> => {
  return await input.dataSource.getRepository(AsyncTaskRecordEntity).count({
    where: {
      queueName: input.queueName,
      jobId: input.jobId,
    },
  });
};

describe('AI GraphQL 队列入口与 Worker 联动（e2e）', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;
  let aiQueue: Queue;
  let workerRuntime: BullMqWorkerRuntime;
  let dataSource: DataSource;
  let managerToken: string;
  let coachToken: string;
  let aiWorkerMock: MockAiWorkerService;

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

    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource, includeKeys: ['manager', 'coach'] });
    managerToken = await login({
      app: apiApp,
      loginName: testAccountsConfig.manager.loginName,
      loginPassword: testAccountsConfig.manager.loginPassword,
      type: LoginTypeEnum.PASSWORD,
    });
    coachToken = await login({
      app: apiApp,
      loginName: testAccountsConfig.coach.loginName,
      loginPassword: testAccountsConfig.coach.loginPassword,
      type: LoginTypeEnum.PASSWORD,
    });
  }, 60000);

  afterAll(async () => {
    await cleanupTestAccounts(dataSource);
    if (workerApp) {
      await workerApp.close();
    }
    if (apiApp) {
      await apiApp.close();
    }
  });

  it('GraphQL queueAiGenerate 成功入队应返回 queued 并写入 queued 记录', async () => {
    const timestamp = Date.now();
    const dedupKey = `e2e-ai-graphql-success-${timestamp}`;
    const traceId = `e2e-ai-graphql-success-trace-${timestamp}`;

    try {
      await workerRuntime.stop();
      const response = await queueAiGenerate({
        app: apiApp,
        token: managerToken,
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'ai graphql success enqueue',
        metadata: { scene: 'success' },
        dedupKey,
        traceId,
      });

      expect(response.body.errors).toBeUndefined();
      const data = parseQueueAiGenerateData(response);
      expect(data.queued).toBe(true);
      expect(data.jobId).toBe(dedupKey);
      expect(data.traceId).toBe(traceId);

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId: dedupKey,
        statuses: ['queued'],
        timeoutMs: 8000,
        pollMs: 120,
      });
      expect(record.status).toBe('queued');
      expect(record.queueName).toBe(BULLMQ_QUEUES.AI);
      expect(record.jobName).toBe(BULLMQ_JOBS.AI.GENERATE);
      expect(record.bizType).toBe('ai_generation');
      expect(record.bizKey).toBe(traceId);
      expect(record.source).toBe('user_action');
      expect(record.reason).toBe('enqueue_accepted');
      expect(record.traceId).toBe(traceId);
      expect(record.jobId).toBe(dedupKey);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('相同 dedupKey 重复命中应复用原 jobId/traceId 且不新增记录', async () => {
    const timestamp = Date.now();
    const dedupKey = `e2e-ai-graphql-dedup-${timestamp}`;
    const firstTraceId = `e2e-ai-graphql-dedup-first-${timestamp}`;
    const secondTraceId = `e2e-ai-graphql-dedup-second-${timestamp}`;

    try {
      await workerRuntime.stop();
      const firstResponse = await queueAiGenerate({
        app: apiApp,
        token: managerToken,
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'ai graphql dedup first',
        dedupKey,
        traceId: firstTraceId,
      });
      const secondResponse = await queueAiGenerate({
        app: apiApp,
        token: managerToken,
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'ai graphql dedup second',
        dedupKey,
        traceId: secondTraceId,
      });

      expect(firstResponse.body.errors).toBeUndefined();
      expect(secondResponse.body.errors).toBeUndefined();

      const firstData = parseQueueAiGenerateData(firstResponse);
      const secondData = parseQueueAiGenerateData(secondResponse);
      expect(firstData.jobId).toBe(dedupKey);
      expect(secondData.jobId).toBe(dedupKey);
      expect(firstData.traceId).toBe(firstTraceId);
      expect(secondData.traceId).toBe(firstTraceId);

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId: dedupKey,
        statuses: ['queued'],
        timeoutMs: 8000,
        pollMs: 120,
      });
      expect(record.traceId).toBe(firstTraceId);
      expect(record.status).toBe('queued');
      expect(record.reason).toBe('enqueue_accepted');

      const count = await countAsyncTaskRecords({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId: dedupKey,
      });
      expect(count).toBe(1);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('未传 dedupKey 与 traceId 时应自动生成标识', async () => {
    const response = await queueAiGenerate({
      app: apiApp,
      token: managerToken,
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: 'ai graphql auto identifiers',
      metadata: { scene: 'auto-identifiers' },
    });

    expect(response.body.errors).toBeUndefined();
    const data = parseQueueAiGenerateData(response);
    expect(data.queued).toBe(true);
    expect(typeof data.jobId).toBe('string');
    expect(typeof data.traceId).toBe('string');
    expect(data.jobId.length).toBeGreaterThan(0);
    expect(data.traceId.length).toBeGreaterThan(0);
    expect(data.jobId).not.toBe(data.traceId);

    const record = await waitAsyncTaskRecord({
      dataSource,
      queueName: BULLMQ_QUEUES.AI,
      jobId: data.jobId,
      statuses: ['queued', 'processing', 'succeeded'],
      timeoutMs: 15000,
      pollMs: 150,
    });
    expect(record.traceId).toBe(data.traceId);
    expect(record.jobId).toBe(data.jobId);
    expect(record.bizKey).toBe(data.traceId);
  }, 60000);

  it('enqueue 失败时应写 failed 记录并使用 enqueue_failed 前缀', async () => {
    const timestamp = Date.now();
    const dedupKey = `e2e-ai-graphql-conflict-${timestamp}`;
    const conflictTraceId = `e2e-ai-graphql-conflict-existing-${timestamp}`;
    const failedTraceId = `e2e-ai-graphql-conflict-failed-${timestamp}`;

    try {
      await workerRuntime.stop();
      await aiQueue.add(
        BULLMQ_JOBS.AI.EMBED,
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          text: 'conflict-existing-job',
          traceId: conflictTraceId,
        },
        {
          jobId: dedupKey,
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      const response = await queueAiGenerate({
        app: apiApp,
        token: managerToken,
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'should hit dedup job conflict',
        dedupKey,
        traceId: failedTraceId,
      });

      const errors = (response.body as { errors?: Array<{ message?: string }> }).errors ?? [];
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message ?? '').toContain('dedup_job_name_conflict');

      const record = await waitAsyncTaskRecordByTrace({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        traceId: failedTraceId,
        statuses: ['failed'],
        timeoutMs: 8000,
        pollMs: 120,
      });
      expect(record.status).toBe('failed');
      expect(record.jobName).toBe(BULLMQ_JOBS.AI.GENERATE);
      expect(record.jobId).toBe(dedupKey);
      expect(record.bizType).toBe('ai_generation');
      expect(record.bizKey).toBe(failedTraceId);
      expect(record.source).toBe('user_action');
      const failedReason = record.reason ?? '';
      expect(failedReason.startsWith('enqueue_failed:')).toBe(true);
      expect(failedReason).toContain('dedup_job_name_conflict');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('enqueue 失败且旧任务记录已占用同 jobId 时应回退 failed 记录 jobId', async () => {
    const timestamp = Date.now();
    const dedupKey = `e2e-ai-graphql-existing-record-conflict-${timestamp}`;
    const existingTraceId = `e2e-ai-graphql-existing-record-trace-${timestamp}`;
    const failedTraceId = `e2e-ai-graphql-existing-record-failed-${timestamp}`;
    const existingOccurredAt = new Date();

    try {
      await workerRuntime.stop();
      await aiQueue.add(
        BULLMQ_JOBS.AI.EMBED,
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          text: 'existing job in bullmq',
          traceId: existingTraceId,
        },
        {
          jobId: dedupKey,
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
      await dataSource.getRepository(AsyncTaskRecordEntity).save(
        dataSource.getRepository(AsyncTaskRecordEntity).create({
          queueName: BULLMQ_QUEUES.AI,
          jobName: BULLMQ_JOBS.AI.EMBED,
          jobId: dedupKey,
          traceId: existingTraceId,
          bizType: 'ai_embedding',
          bizKey: existingTraceId,
          source: 'user_action',
          reason: 'enqueue_accepted',
          status: 'queued',
          attemptCount: 0,
          occurredAt: existingOccurredAt,
          enqueuedAt: existingOccurredAt,
          dedupKey,
        }),
      );

      const response = await queueAiGenerate({
        app: apiApp,
        token: managerToken,
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'should hit dedup conflict with existing record',
        dedupKey,
        traceId: failedTraceId,
      });

      const errors = (response.body as { errors?: Array<{ message?: string }> }).errors ?? [];
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message ?? '').toContain('dedup_job_name_conflict');

      const failedRecord = await waitAsyncTaskRecordByTrace({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        traceId: failedTraceId,
        statuses: ['failed'],
        timeoutMs: 8000,
        pollMs: 120,
      });
      expect(failedRecord.jobId).not.toBe(dedupKey);
      expect(failedRecord.jobId.startsWith(`enqueue-failed:${failedTraceId}:`)).toBe(true);
      const failedReason = failedRecord.reason ?? '';
      expect(failedReason.startsWith('enqueue_failed:')).toBe(true);
      expect(failedReason).toContain('dedup_job_name_conflict');

      const existingRecord = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId: dedupKey,
        statuses: ['queued'],
        timeoutMs: 3000,
        pollMs: 100,
      });
      expect(existingRecord.traceId).toBe(existingTraceId);
      expect(existingRecord.status).toBe('queued');

      const count = await countAsyncTaskRecords({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId: dedupKey,
      });
      expect(count).toBe(1);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('QueueAiUsecase 语义应保持 embed 入队字段映射一致', async () => {
    const timestamp = Date.now();
    const dedupKey = `e2e-ai-graphql-embed-${timestamp}`;
    const traceId = `e2e-ai-graphql-embed-trace-${timestamp}`;

    try {
      await workerRuntime.stop();
      const response = await queueAiEmbed({
        app: apiApp,
        token: managerToken,
        provider: 'openai',
        model: 'text-embedding-3-small',
        text: 'ai graphql embed semantic assert',
        dedupKey,
        traceId,
      });

      expect(response.body.errors).toBeUndefined();
      const data = parseQueueAiEmbedData(response);
      expect(data.queued).toBe(true);
      expect(data.jobId).toBe(dedupKey);
      expect(data.traceId).toBe(traceId);

      const record = await waitAsyncTaskRecord({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        jobId: dedupKey,
        statuses: ['queued'],
        timeoutMs: 8000,
        pollMs: 120,
      });
      expect(record.jobName).toBe(BULLMQ_JOBS.AI.EMBED);
      expect(record.bizType).toBe('ai_embedding');
      expect(record.bizKey).toBe(traceId);
      expect(record.source).toBe('user_action');
      expect(record.reason).toBe('enqueue_accepted');
      expect(record.dedupKey).toBe(dedupKey);
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  it('queueAiEmbed 未传 dedupKey 与 traceId 时应自动生成标识', async () => {
    const response = await queueAiEmbed({
      app: apiApp,
      token: managerToken,
      provider: 'openai',
      model: 'text-embedding-3-small',
      text: 'embed auto identifiers',
      metadata: { scene: 'embed-auto-identifiers' },
    });

    expect(response.body.errors).toBeUndefined();
    const data = parseQueueAiEmbedData(response);
    expect(data.queued).toBe(true);
    expect(typeof data.jobId).toBe('string');
    expect(typeof data.traceId).toBe('string');
    expect(data.jobId.length).toBeGreaterThan(0);
    expect(data.traceId.length).toBeGreaterThan(0);
    expect(data.jobId).not.toBe(data.traceId);

    const record = await waitAsyncTaskRecord({
      dataSource,
      queueName: BULLMQ_QUEUES.AI,
      jobId: data.jobId,
      statuses: ['queued', 'processing', 'succeeded'],
      timeoutMs: 15000,
      pollMs: 150,
    });
    expect(record.traceId).toBe(data.traceId);
    expect(record.jobId).toBe(data.jobId);
    expect(record.bizKey).toBe(data.traceId);
    expect(record.bizType).toBe('ai_embedding');
  }, 60000);

  it('queueAiEmbed enqueue 失败时应写 failed 记录并使用 enqueue_failed 前缀', async () => {
    const timestamp = Date.now();
    const dedupKey = `e2e-ai-graphql-embed-conflict-${timestamp}`;
    const conflictTraceId = `e2e-ai-graphql-embed-conflict-existing-${timestamp}`;
    const failedTraceId = `e2e-ai-graphql-embed-conflict-failed-${timestamp}`;

    try {
      await workerRuntime.stop();
      await aiQueue.add(
        BULLMQ_JOBS.AI.GENERATE,
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'conflict-existing-job',
          traceId: conflictTraceId,
        },
        {
          jobId: dedupKey,
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      const response = await queueAiEmbed({
        app: apiApp,
        token: managerToken,
        provider: 'openai',
        model: 'text-embedding-3-small',
        text: 'should hit embed dedup job conflict',
        dedupKey,
        traceId: failedTraceId,
      });

      const errors = (response.body as { errors?: Array<{ message?: string }> }).errors ?? [];
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message ?? '').toContain('dedup_job_name_conflict');

      const record = await waitAsyncTaskRecordByTrace({
        dataSource,
        queueName: BULLMQ_QUEUES.AI,
        traceId: failedTraceId,
        statuses: ['failed'],
        timeoutMs: 8000,
        pollMs: 120,
      });
      expect(record.status).toBe('failed');
      expect(record.jobName).toBe(BULLMQ_JOBS.AI.EMBED);
      expect(record.jobId).toBe(dedupKey);
      expect(record.bizType).toBe('ai_embedding');
      expect(record.bizKey).toBe(failedTraceId);
      expect(record.source).toBe('user_action');
      const failedReason = record.reason ?? '';
      expect(failedReason.startsWith('enqueue_failed:')).toBe(true);
      expect(failedReason).toContain('dedup_job_name_conflict');
    } finally {
      await workerRuntime.start();
    }
  }, 60000);

  describe('resolver 边界', () => {
    it('未登录调用 queueAiGenerate 应返回未认证错误', async () => {
      const response = await queueAiGenerate({
        app: apiApp,
        model: 'gpt-4o-mini',
        prompt: 'unauthorized call',
      });
      const errors = (response.body as { errors?: Array<{ message?: string }> }).errors ?? [];
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message ?? '').toMatch(/Unauthorized|未认证|认证/);
    });

    it('非 manager 角色调用 queueAiGenerate 应返回权限错误', async () => {
      const response = await queueAiGenerate({
        app: apiApp,
        token: coachToken,
        model: 'gpt-4o-mini',
        prompt: 'forbidden role call',
      });
      const errors = (response.body as { errors?: Array<{ message?: string }> }).errors ?? [];
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message ?? '').toMatch(
        /无权限|拒绝|Forbidden|forbidden|access denied|缺少所需角色/i,
      );
    });

    it('非法输入调用 queueAiGenerate 应返回校验错误', async () => {
      const response = await queueAiGenerate({
        app: apiApp,
        token: managerToken,
        model: ' ',
        prompt: 'invalid model',
      });
      const errors = (response.body as { errors?: Array<{ message?: string }> }).errors ?? [];
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message ?? '').toMatch(
        /模型名称不能为空|Validation failed|校验|validation/i,
      );
    });


  });

  it('GraphQL 入队到 Worker 完整联动应消费成功并落库为 succeeded', async () => {
    const timestamp = Date.now();
    const dedupKey = `e2e-ai-graphql-link-${timestamp}`;
    const traceId = `e2e-ai-graphql-link-trace-${timestamp}`;
    const generateCallsBefore = aiWorkerMock.generateCalls.length;

    const response = await queueAiGenerate({
      app: apiApp,
      token: managerToken,
      provider: 'openai',
      model: 'gpt-4o-mini',
      prompt: 'ai graphql worker linkage __SLOW_MS_200__',
      dedupKey,
      traceId,
    });

    expect(response.body.errors).toBeUndefined();
    const data = parseQueueAiGenerateData(response);
    expect(data.queued).toBe(true);
    expect(data.jobId).toBe(dedupKey);
    expect(data.traceId).toBe(traceId);

    const finalState = await waitJobFinalState({
      queue: aiQueue,
      jobId: dedupKey,
      timeoutMs: 20000,
      pollMs: 150,
    });
    expect(finalState.state).toBe('completed');

    const record = await waitAsyncTaskRecord({
      dataSource,
      queueName: BULLMQ_QUEUES.AI,
      jobId: dedupKey,
      statuses: ['succeeded'],
      timeoutMs: 20000,
      pollMs: 150,
    });
    expect(record.status).toBe('succeeded');
    expect(record.reason).toBe('worker_completed');
    expect(record.bizType).toBe('ai_generation');
    expect(record.bizKey).toBe(traceId);
    expect(aiWorkerMock.generateCalls.length - generateCallsBefore).toBe(1);
  }, 60000);
});
