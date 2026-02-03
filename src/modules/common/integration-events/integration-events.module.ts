// src/modules/common/integration-events/integration-events.module.ts
import { Module } from '@nestjs/common';
import { INTEGRATION_EVENTS_TOKENS } from './events.tokens';
import { EnrollmentCreatedHandler } from './handlers/enrollment-created.handler';
import { OutboxMemoryService } from './outbox.memory.service';

/**
 * Integration Events 模块：提供 Outbox 端口与调度器
 */
@Module({
  imports: [],
  providers: [
    // 端口实现：内存 Outbox Writer
    { provide: INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT, useClass: OutboxMemoryService },
    // 端口实现：内存 Outbox Store（与 Writer 复用同一实现实例）
    {
      provide: INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT,
      useExisting: INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT,
    },
    EnrollmentCreatedHandler,
  ],
  exports: [
    INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT,
    INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT,
    EnrollmentCreatedHandler,
  ],
})
export class IntegrationEventsModule {}
