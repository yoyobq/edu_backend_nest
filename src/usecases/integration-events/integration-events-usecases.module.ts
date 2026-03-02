import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { EnrollmentCreatedHandler } from '@src/modules/common/integration-events/handlers/enrollment-created.handler';
import { IntegrationEventsModule } from '@src/modules/common/integration-events/integration-events.module';
import { OutboxDispatcher } from '@src/modules/common/integration-events/outbox.dispatcher';

@Module({
  imports: [ConfigModule, IntegrationEventsModule],
  providers: [
    {
      provide: INTEGRATION_EVENTS_TOKENS.HANDLERS,
      useFactory: (h1: EnrollmentCreatedHandler) => [h1],
      inject: [EnrollmentCreatedHandler],
    },
    { provide: INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT, useClass: OutboxDispatcher },
  ],
  exports: [INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT],
})
export class IntegrationEventsUsecasesModule {}
