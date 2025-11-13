// src/modules/common/integration-events/integration-events.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { INTEGRATION_EVENTS_TOKENS } from './events.tokens';
import { OutboxMemoryService } from './outbox.memory.service';
import { OutboxDispatcher } from './outbox.dispatcher';
import { EnrollmentCreatedHandler } from './handlers/enrollment-created.handler';

/**
 * Integration Events 模块：提供 Outbox 端口与调度器
 */
@Module({
  imports: [ConfigModule],
  providers: [
    // 端口实现：内存 Outbox Writer
    { provide: INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT, useClass: OutboxMemoryService },
    // 端口实现：内存 Outbox Store（与 Writer 复用同一实现实例）
    {
      provide: INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT,
      useExisting: INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT,
    },
    // 事件处理器集合
    EnrollmentCreatedHandler,
    {
      provide: INTEGRATION_EVENTS_TOKENS.HANDLERS,
      useFactory: (h1: EnrollmentCreatedHandler) => [h1],
      inject: [EnrollmentCreatedHandler],
    },
    // 调度器实现端口
    { provide: INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT, useClass: OutboxDispatcher },
  ],
  exports: [
    INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT,
    INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT,
    INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT,
  ],
})
export class IntegrationEventsModule {}
