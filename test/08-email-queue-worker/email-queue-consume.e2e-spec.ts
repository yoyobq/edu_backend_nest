import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { Queue } from 'bullmq';
import request from 'supertest';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';

type FinalJobState = 'completed' | 'failed';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
  throw new Error(`Email job did not reach final state in time: ${input.jobId}`);
};

describe('Email Queue + Worker (e2e)', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplicationContext;
  let emailQueue: Queue;

  beforeAll(async () => {
    initGraphQLSchema();

    const apiModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    apiApp = apiModuleFixture.createNestApplication();
    await apiApp.init();

    workerApp = await NestFactory.createApplicationContext(WorkerModule);

    emailQueue = apiApp.get<Queue>(getQueueToken(BULLMQ_QUEUES.EMAIL));
  }, 60000);

  afterAll(async () => {
    if (workerApp) {
      await workerApp.close();
    }
    if (apiApp) {
      await apiApp.close();
    }
  });

  it('should enqueue email job and consume it to completed state', async () => {
    const timestamp = Date.now();
    const dedupKey = `e2e-email-job-${timestamp}`;
    const traceId = `e2e-email-trace-${timestamp}`;

    const mutation = `
      mutation QueueEmail($input: QueueEmailInput!) {
        queueEmail(input: $input) {
          queued
          jobId
          traceId
        }
      }
    `;

    const response = await request(apiApp.getHttpServer())
      .post('/graphql')
      .send({
        query: mutation,
        variables: {
          input: {
            to: 'queue.e2e@example.com',
            subject: 'E2E email queue test',
            text: 'queue-consume-flow',
            dedupKey,
            traceId,
            meta: {
              source: 'e2e',
            },
          },
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.queueEmail.queued).toBe(true);
    expect(response.body.data.queueEmail.jobId).toBe(dedupKey);
    expect(response.body.data.queueEmail.traceId).toBe(traceId);

    const finalState = await waitJobFinalState({
      queue: emailQueue,
      jobId: dedupKey,
      timeoutMs: 15000,
      pollMs: 150,
    });

    expect(finalState.state).toBe('completed');
    const returnvalue = finalState.returnvalue as {
      readonly accepted?: boolean;
      readonly providerMessageId?: string;
    };
    expect(returnvalue.accepted).toBe(true);
    expect(typeof returnvalue.providerMessageId).toBe('string');
  }, 60000);
});
