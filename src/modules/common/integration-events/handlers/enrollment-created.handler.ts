// src/modules/common/integration-events/handlers/enrollment-created.handler.ts
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { IntegrationEventEnvelope } from '@core/common/integration-events/events.types';
import type { IntegrationEventHandler } from '../outbox.dispatcher';

/**
 * EnrollmentCreated 事件处理器（幂等）
 */
@Injectable()
export class EnrollmentCreatedHandler implements IntegrationEventHandler {
  readonly type = 'EnrollmentCreated' as const;
  private readonly dedup = new Set<string>();

  constructor(private readonly logger: PinoLogger) {}

  /**
   * 处理 EnrollmentCreated：按 dedupKey 幂等
   * @param input 事件信封包裹
   */
  async handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void> {
    const key =
      input.envelope.dedupKey ??
      `${input.envelope.type}:${input.envelope.aggregateId}:${input.envelope.schemaVersion}`;
    if (this.dedup.has(key)) return;
    this.dedup.add(key);
    await Promise.resolve();
    this.logger.info(
      {
        type: input.envelope.type,
        dedupKey: key,
        aggregateType: input.envelope.aggregateType,
        aggregateId: input.envelope.aggregateId,
        occurredAt: input.envelope.occurredAt,
        correlationId: input.envelope.correlationId,
      },
      'IntegrationEvent dispatched',
    );
  }
}
