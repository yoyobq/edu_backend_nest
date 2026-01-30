// 文件位置： src/usecases/course/course-usecases.module.ts
import { IntegrationEventsModule } from '@modules/common/integration-events/integration-events.module';
import { PaginationModule } from '@modules/common/pagination.module';
import { Module } from '@nestjs/common';
import { CoachServiceModule } from '@src/modules/account/identities/training/coach/coach-service.module';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { LearnerServiceModule } from '@src/modules/account/identities/training/learner/learner-service.module';
import { ManagerServiceModule } from '@src/modules/account/identities/training/manager/manager-service.module';
import { CourseCatalogServiceModule } from '@src/modules/course/catalogs/course-catalog-service.module';
import { PayoutSeriesRuleServiceModule } from '@src/modules/course/payout-series-rule/payout-series-rule-service.module';
import { CourseSeriesServiceModule } from '@src/modules/course/series/course-series-service.module';
import { CourseSessionCoachesServiceModule } from '@src/modules/course/session-coaches/course-session-coaches-service.module';
import { CourseSessionsServiceModule } from '@src/modules/course/sessions/course-sessions-service.module';
import { ParticipationAttendanceModule } from '@src/modules/participation/attendance/participation-attendance.module';
import { ParticipationEnrollmentModule } from '@src/modules/participation/enrollment/participation-enrollment.module';
import { CreateCatalogUsecase } from '@src/usecases/course/catalogs/create-catalog.usecase';
import { DeactivateCatalogUsecase } from '@src/usecases/course/catalogs/deactivate-catalog.usecase';
import { GetCatalogByLevelUsecase } from '@src/usecases/course/catalogs/get-catalog-by-level.usecase';
import { ListCatalogsUsecase } from '@src/usecases/course/catalogs/list-catalogs.usecase';
import { ReactivateCatalogUsecase } from '@src/usecases/course/catalogs/reactivate-catalog.usecase';
import { SearchCatalogsUsecase } from '@src/usecases/course/catalogs/search-catalogs.usecase';
import { UpdateCatalogDetailsUsecase } from '@src/usecases/course/catalogs/update-catalog-details.usecase';
import { LoadLearnerFinancialsUsecase } from '@src/usecases/course/financials/load-learner-financials.usecase';
import { LoadSeriesFinancialsUsecase } from '@src/usecases/course/financials/load-series-financials.usecase';
import { BindPayoutRuleUsecase } from '@src/usecases/course/payout/bind-payout-rule.usecase';
import { CreatePayoutRuleUsecase } from '@src/usecases/course/payout/create-payout-rule.usecase';
import { DeactivatePayoutRuleUsecase } from '@src/usecases/course/payout/deactivate-payout-rule.usecase';
import { DeletePayoutRuleUsecase } from '@src/usecases/course/payout/delete-payout-rule.usecase';
import { GetPayoutRuleUsecase } from '@src/usecases/course/payout/get-payout-rule.usecase';
import { ListPayoutRulesUsecase } from '@src/usecases/course/payout/list-payout-rules.usecase';
import { ReactivatePayoutRuleUsecase } from '@src/usecases/course/payout/reactivate-payout-rule.usecase';
import { UnbindPayoutRuleUsecase } from '@src/usecases/course/payout/unbind-payout-rule.usecase';
import { UpdatePayoutRuleUsecase } from '@src/usecases/course/payout/update-payout-rule.usecase';
import { ApplySeriesScheduleUsecase } from '@src/usecases/course/series/apply-series-schedule.usecase';
import { CreateSeriesUsecase } from '@src/usecases/course/series/create-series.usecase';
import { DeleteSeriesUsecase } from '@src/usecases/course/series/delete-series.usecase';
import { GetSeriesUsecase } from '@src/usecases/course/series/get-series.usecase';
import { ListSeriesUsecase } from '@src/usecases/course/series/list-series.usecase';
import { PreviewSeriesScheduleUsecase } from '@src/usecases/course/series/preview-series-schedule.usecase';
import { PublishSeriesUsecase } from '@src/usecases/course/series/publish-series.usecase';
import { SearchSeriesForCustomerUsecase } from '@src/usecases/course/series/search-series-for-customer.usecase';
import { SearchSeriesUsecase } from '@src/usecases/course/series/search-series.usecase';
import {
  CloseSeriesUsecase,
  UpdateSeriesUsecase,
} from '@src/usecases/course/series/update-series.usecase';
import { CourseSeriesAccessPolicy } from '@src/usecases/course/sessions/course-series-access.policy';
import { GenerateSessionCoachesForSeriesUsecase } from '@src/usecases/course/sessions/generate-session-coaches-for-series.usecase';
import { ListSessionsBySeriesUsecase } from '@src/usecases/course/sessions/list-sessions-by-series.usecase';
import { SyncSessionCoachesRosterUsecase } from '@src/usecases/course/sessions/sync-session-coaches-roster.usecase';
import { UpdateSessionBasicInfoUsecase } from '@src/usecases/course/sessions/update-session-basic-info.usecase';
import { SetSessionCoachPayoutUsecase } from '@src/usecases/course/sessions/update-session-coach-settlement.usecase';
import { ViewSessionsBySeriesUsecase } from '@src/usecases/course/sessions/view-sessions-by-series.usecase';
import { BatchRecordAttendanceUsecase } from '@src/usecases/course/workflows/batch-record-attendance.usecase';
import { CancelEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-enrollment.usecase';
import { CancelSeriesEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-series-enrollment.usecase';
import { CancelSessionUsecase } from '@src/usecases/course/workflows/cancel-session.usecase';
import { CloseSessionUsecase } from '@src/usecases/course/workflows/close-session.usecase';
import { EnrollLearnerToSeriesUsecase } from '@src/usecases/course/workflows/enroll-learner-to-series.usecase';
import { EnrollLearnerToSessionUsecase } from '@src/usecases/course/workflows/enroll-learner-to-session.usecase';
import { HasCustomerEnrollmentBySeriesUsecase } from '@src/usecases/course/workflows/has-customer-enrollment-by-series.usecase';
import { HasLearnerEnrollmentUsecase } from '@src/usecases/course/workflows/has-learner-enrollment.usecase';
import { ListLearnerEnrolledSessionIdsBySeriesUsecase } from '@src/usecases/course/workflows/list-learner-enrolled-session-ids-by-series.usecase';
import { LoadSessionAttendanceSheetUsecase } from '@src/usecases/course/workflows/load-session-attendance-sheet.usecase';
import { RestoreSessionUsecase } from '@src/usecases/course/workflows/restore-session.usecase';

@Module({
  imports: [
    PaginationModule,
    IntegrationEventsModule,
    CourseCatalogServiceModule,
    CourseSeriesServiceModule,
    CourseSessionsServiceModule,
    CourseSessionCoachesServiceModule,
    PayoutSeriesRuleServiceModule,
    ParticipationEnrollmentModule,
    ParticipationAttendanceModule,
    CustomerServiceModule,
    LearnerServiceModule,
    CoachServiceModule,
    ManagerServiceModule,
  ],
  providers: [
    CreateCatalogUsecase,
    DeactivateCatalogUsecase,
    GetCatalogByLevelUsecase,
    ListCatalogsUsecase,
    ReactivateCatalogUsecase,
    SearchCatalogsUsecase,
    UpdateCatalogDetailsUsecase,
    LoadLearnerFinancialsUsecase,
    LoadSeriesFinancialsUsecase,
    CreateSeriesUsecase,
    UpdateSeriesUsecase,
    CloseSeriesUsecase,
    DeleteSeriesUsecase,
    GetSeriesUsecase,
    ListSeriesUsecase,
    SearchSeriesUsecase,
    SearchSeriesForCustomerUsecase,
    PreviewSeriesScheduleUsecase,
    ApplySeriesScheduleUsecase,
    PublishSeriesUsecase,
    ListSessionsBySeriesUsecase,
    ViewSessionsBySeriesUsecase,
    GenerateSessionCoachesForSeriesUsecase,
    SyncSessionCoachesRosterUsecase,
    UpdateSessionBasicInfoUsecase,
    SetSessionCoachPayoutUsecase,
    CourseSeriesAccessPolicy,
    EnrollLearnerToSessionUsecase,
    EnrollLearnerToSeriesUsecase,
    HasCustomerEnrollmentBySeriesUsecase,
    HasLearnerEnrollmentUsecase,
    ListLearnerEnrolledSessionIdsBySeriesUsecase,
    CancelEnrollmentUsecase,
    CancelSeriesEnrollmentUsecase,
    CancelSessionUsecase,
    RestoreSessionUsecase,
    CloseSessionUsecase,
    LoadSessionAttendanceSheetUsecase,
    BatchRecordAttendanceUsecase,
    CreatePayoutRuleUsecase,
    UpdatePayoutRuleUsecase,
    DeletePayoutRuleUsecase,
    GetPayoutRuleUsecase,
    ListPayoutRulesUsecase,
    ReactivatePayoutRuleUsecase,
    DeactivatePayoutRuleUsecase,
    BindPayoutRuleUsecase,
    UnbindPayoutRuleUsecase,
  ],
  exports: [
    CreateCatalogUsecase,
    DeactivateCatalogUsecase,
    GetCatalogByLevelUsecase,
    ListCatalogsUsecase,
    ReactivateCatalogUsecase,
    SearchCatalogsUsecase,
    UpdateCatalogDetailsUsecase,
    LoadLearnerFinancialsUsecase,
    LoadSeriesFinancialsUsecase,
    CreateSeriesUsecase,
    UpdateSeriesUsecase,
    CloseSeriesUsecase,
    DeleteSeriesUsecase,
    GetSeriesUsecase,
    ListSeriesUsecase,
    SearchSeriesUsecase,
    SearchSeriesForCustomerUsecase,
    PreviewSeriesScheduleUsecase,
    ApplySeriesScheduleUsecase,
    PublishSeriesUsecase,
    ListSessionsBySeriesUsecase,
    ViewSessionsBySeriesUsecase,
    GenerateSessionCoachesForSeriesUsecase,
    SyncSessionCoachesRosterUsecase,
    UpdateSessionBasicInfoUsecase,
    SetSessionCoachPayoutUsecase,
    CourseSeriesAccessPolicy,
    EnrollLearnerToSessionUsecase,
    EnrollLearnerToSeriesUsecase,
    HasCustomerEnrollmentBySeriesUsecase,
    HasLearnerEnrollmentUsecase,
    ListLearnerEnrolledSessionIdsBySeriesUsecase,
    CancelEnrollmentUsecase,
    CancelSeriesEnrollmentUsecase,
    CancelSessionUsecase,
    RestoreSessionUsecase,
    CloseSessionUsecase,
    LoadSessionAttendanceSheetUsecase,
    BatchRecordAttendanceUsecase,
    CreatePayoutRuleUsecase,
    UpdatePayoutRuleUsecase,
    DeletePayoutRuleUsecase,
    GetPayoutRuleUsecase,
    ListPayoutRulesUsecase,
    ReactivatePayoutRuleUsecase,
    DeactivatePayoutRuleUsecase,
    BindPayoutRuleUsecase,
    UnbindPayoutRuleUsecase,
  ],
})
export class CourseUsecasesModule {}
