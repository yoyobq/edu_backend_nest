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
import { ApplySeriesScheduleUsecase } from '@src/usecases/course/series/apply-series-schedule.usecase';
import { PreviewSeriesScheduleUsecase } from '@src/usecases/course/series/preview-series-schedule.usecase';
import { PublishSeriesUsecase } from '@src/usecases/course/series/publish-series.usecase';
import { CourseSeriesAccessPolicy } from '@src/usecases/course/sessions/course-series-access.policy';
import { GenerateSessionCoachesForSeriesUsecase } from '@src/usecases/course/sessions/generate-session-coaches-for-series.usecase';
import { SyncSessionCoachesRosterUsecase } from '@src/usecases/course/sessions/sync-session-coaches-roster.usecase';
import { UpdateSessionBasicInfoUsecase } from '@src/usecases/course/sessions/update-session-basic-info.usecase';
import { SetSessionCoachPayoutUsecase } from '@src/usecases/course/sessions/update-session-coach-settlement.usecase';
import { ViewSessionsBySeriesUsecase } from '@src/usecases/course/sessions/view-sessions-by-series.usecase';
import { BatchRecordAttendanceUsecase } from '@src/usecases/course/workflows/batch-record-attendance.usecase';
import { CancelEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-enrollment.usecase';
import { CancelSeriesEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-series-enrollment.usecase';
import { CancelSessionUsecase } from '@src/usecases/course/workflows/cancel-session.usecase';
import { CloseSessionUsecase } from '@src/usecases/course/workflows/close-session.usecase';
import { EnrollLearnerToSessionUsecase } from '@src/usecases/course/workflows/enroll-learner-to-session.usecase';
import { ListLearnerEnrolledSessionIdsBySeriesUsecase } from '@src/usecases/course/workflows/list-learner-enrolled-session-ids-by-series.usecase';
import { LoadSessionAttendanceSheetUsecase } from '@src/usecases/course/workflows/load-session-attendance-sheet.usecase';
import { RestoreSessionUsecase } from '@src/usecases/course/workflows/restore-session.usecase';

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
    ListLearnerEnrolledSessionIdsBySeriesUsecase,
    CancelEnrollmentUsecase,
    CancelSeriesEnrollmentUsecase,
    CancelSessionUsecase,
    RestoreSessionUsecase,
    CloseSessionUsecase,
    LoadSessionAttendanceSheetUsecase,
    BatchRecordAttendanceUsecase,
    PreviewSeriesScheduleUsecase,
    ApplySeriesScheduleUsecase,
    PublishSeriesUsecase,
    GenerateSessionCoachesForSeriesUsecase,
    SyncSessionCoachesRosterUsecase,
    CourseSeriesAccessPolicy,
    ViewSessionsBySeriesUsecase,
    SetSessionCoachPayoutUsecase,
    UpdateSessionBasicInfoUsecase,
  ],
  exports: [
    EnrollLearnerToSessionUsecase,
    ListLearnerEnrolledSessionIdsBySeriesUsecase,
    CancelEnrollmentUsecase,
    CancelSeriesEnrollmentUsecase,
    CancelSessionUsecase,
    RestoreSessionUsecase,
    CloseSessionUsecase,
    LoadSessionAttendanceSheetUsecase,
    BatchRecordAttendanceUsecase,
    PreviewSeriesScheduleUsecase,
    ApplySeriesScheduleUsecase,
    PublishSeriesUsecase,
    GenerateSessionCoachesForSeriesUsecase,
    SyncSessionCoachesRosterUsecase,
    CourseSeriesAccessPolicy,
    ViewSessionsBySeriesUsecase,
    SetSessionCoachPayoutUsecase,
    UpdateSessionBasicInfoUsecase,
  ],
})
export class CourseUsecasesModule {}
