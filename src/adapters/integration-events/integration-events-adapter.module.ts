// 文件位置：/var/www/backend/src/adapters/integration-events/integration-events-adapter.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { IntegrationEventsModule } from '@src/modules/common/integration-events/integration-events.module';
import { EnrollmentCreatedHandler } from '@src/modules/common/integration-events/handlers/enrollment-created.handler';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { OutboxDispatcher } from '@src/modules/common/integration-events/outbox.dispatcher';
import { ParticipationAttendanceModule } from '@src/modules/participation/attendance/participation-attendance.module';
import { ParticipationEnrollmentModule } from '@src/modules/participation/enrollment/participation-enrollment.module';
import { PayoutSessionAdjustmentsModule } from '@src/modules/payout/session-adjustments/payout-session-adjustments.module';
import { AttendanceFinalizedHandler } from '@src/usecases/course/workflows/attendance-finalized.handler';

@Module({
  imports: [
    ConfigModule,
    IntegrationEventsModule,
    CustomerServiceModule,
    ParticipationAttendanceModule,
    ParticipationEnrollmentModule,
    PayoutSessionAdjustmentsModule,
  ],
  providers: [
    AttendanceFinalizedHandler,
    {
      provide: INTEGRATION_EVENTS_TOKENS.HANDLERS,
      useFactory: (h1: EnrollmentCreatedHandler, h2: AttendanceFinalizedHandler) => [h1, h2],
      inject: [EnrollmentCreatedHandler, AttendanceFinalizedHandler],
    },
    { provide: INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT, useClass: OutboxDispatcher },
  ],
  exports: [INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT],
})
export class IntegrationEventsAdapterModule {}
