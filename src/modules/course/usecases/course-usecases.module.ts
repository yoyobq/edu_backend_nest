// src/modules/course/usecases/course-usecases.module.ts
import { CoachServiceModule } from '@modules/account/identities/training/coach/coach-service.module';
import { CustomerServiceModule } from '@modules/account/identities/training/customer/customer-service.module';
import { LearnerIdentityModule } from '@modules/account/identities/training/learner/learner.module';
import { ManagerServiceModule } from '@modules/account/identities/training/manager/manager-service.module';
import { IntegrationEventsModule } from '@modules/common/integration-events/integration-events.module';
import { Module } from '@nestjs/common';
import { PayoutSeriesRuleModule } from '@src/modules/course/payout-series-rule/payout-series-rule.module';
import { CourseSeriesModule } from '@src/modules/course/series/course-series.module';
import { CourseSessionCoachesModule } from '@src/modules/course/session-coaches/course-session-coaches.module';
import { CourseSessionsModule } from '@src/modules/course/sessions/course-sessions.module';
import { ParticipationAttendanceModule } from '@src/modules/participation/attendance/participation-attendance.module';
import { ParticipationEnrollmentModule } from '@src/modules/participation/enrollment/participation-enrollment.module';
import { PreviewSeriesScheduleUsecase } from '@src/usecases/course/series/preview-series-schedule.usecase';
import { PublishSeriesUsecase } from '@src/usecases/course/series/publish-series.usecase';
import { CourseSeriesAccessPolicy } from '@src/usecases/course/sessions/course-series-access.policy';
import { UpdateSessionBasicInfoUsecase } from '@src/usecases/course/sessions/update-session-basic-info.usecase';
import { SetSessionCoachPayoutUsecase } from '@src/usecases/course/sessions/update-session-coach-settlement.usecase';
import { ViewSessionsBySeriesUsecase } from '@src/usecases/course/sessions/view-sessions-by-series.usecase';
import { BatchRecordAttendanceUsecase } from '@src/usecases/course/workflows/batch-record-attendance.usecase';
import { CancelEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-enrollment.usecase';
import { CloseSessionUsecase } from '@src/usecases/course/workflows/close-session.usecase';
import { EnrollLearnerToSessionUsecase } from '@src/usecases/course/workflows/enroll-learner-to-session.usecase';
import { LoadSessionAttendanceSheetUsecase } from '@src/usecases/course/workflows/load-session-attendance-sheet.usecase';

@Module({
  imports: [
    CourseSeriesModule,
    CourseSessionsModule,
    ParticipationEnrollmentModule,
    ParticipationAttendanceModule,
    CourseSessionCoachesModule,
    CustomerServiceModule,
    LearnerIdentityModule,
    CoachServiceModule,
    ManagerServiceModule,
    IntegrationEventsModule,
    PayoutSeriesRuleModule,
  ],
  providers: [
    EnrollLearnerToSessionUsecase,
    CancelEnrollmentUsecase,
    CloseSessionUsecase,
    LoadSessionAttendanceSheetUsecase,
    BatchRecordAttendanceUsecase,
    PreviewSeriesScheduleUsecase,
    PublishSeriesUsecase,
    CourseSeriesAccessPolicy,
    ViewSessionsBySeriesUsecase,
    SetSessionCoachPayoutUsecase,
    UpdateSessionBasicInfoUsecase,
  ],
  exports: [
    EnrollLearnerToSessionUsecase,
    CancelEnrollmentUsecase,
    CloseSessionUsecase,
    LoadSessionAttendanceSheetUsecase,
    BatchRecordAttendanceUsecase,
    PreviewSeriesScheduleUsecase,
    PublishSeriesUsecase,
    CourseSeriesAccessPolicy,
    ViewSessionsBySeriesUsecase,
    SetSessionCoachPayoutUsecase,
    UpdateSessionBasicInfoUsecase,
  ],
})
export class CourseUsecasesModule {}
