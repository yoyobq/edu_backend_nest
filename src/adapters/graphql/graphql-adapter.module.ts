// src/adapters/graphql/graphql-adapter.module.ts

import { AuthModule } from '@modules/auth/auth.module';
import { PaginationModule } from '@modules/common/pagination.module';
import { RegisterModule } from '@modules/register/register.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { VerificationRecordModule } from '@modules/verification-record/verification-record.module';
import { CourseCatalogsModule } from '@src/modules/course/catalogs/course-catalogs.module';
import { PayoutSeriesRuleModule } from '@src/modules/course/payout-series-rule/payout-series-rule.module';
// 为报名用例提供依赖的服务模块
import { CourseSeriesModule } from '@src/modules/course/series/course-series.module';
import { CourseSessionsModule } from '@src/modules/course/sessions/course-sessions.module';
import { ParticipationEnrollmentModule } from '@src/modules/participation/enrollment/participation-enrollment.module';
import { ParticipationAttendanceModule } from '@src/modules/participation/attendance/participation-attendance.module';
import { CourseSessionCoachesModule } from '@src/modules/course/session-coaches/course-session-coaches.module';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { LearnerIdentityModule } from '@src/modules/account/identities/training/learner/learner.module';
import { CoachServiceModule } from '@src/modules/account/identities/training/coach/coach-service.module';
import { IntegrationEventsModule } from '@src/modules/common/integration-events/integration-events.module';
import { EnrollLearnerToSessionUsecase } from '@src/usecases/course/workflows/enroll-learner-to-session.usecase';
import { CancelEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-enrollment.usecase';
import { CloseSessionUsecase } from '@src/usecases/course/workflows/close-session.usecase';

import { Module } from '@nestjs/common';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { IdentityManagementModule } from '@src/modules/identity-management/identity-management.module';

// Resolvers
import { AccountResolver } from './account/account.resolver';
import { AuthResolver } from './auth/auth.resolver';
import { CourseCatalogResolver } from './course/catalogs/course-catalog.resolver';
import { SessionEnrollmentResolver } from './course/workflows/session-enrollment.resolver';
import { SessionCancelResolver } from './course/workflows/session-cancel.resolver';
import { SessionCloseResolver } from './course/workflows/session-close.resolver';
import { CoachResolver } from './identity-management/coach/coach.resolver';
import { CustomerResolver } from './identity-management/customer/customer.resolver';
import { IdentityManagementResolver } from './identity-management/identity-management.resolver';
import { LearnerResolver } from './identity-management/learner/learner.resolver';
import { ManagerResolver } from './identity-management/manager/manager.resolver';
import { PayoutRuleResolver } from './payout/payout-rule.resolver';
import { RegistrationResolver } from './registration/registration.resolver';
import { ThirdPartyAuthResolver } from './third-party-auth/third-party-auth.resolver';
import { VerificationRecordResolver } from './verification-record/verification-record.resolver';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * GraphQL 适配器模块
 * 统一管理所有 GraphQL Resolvers 和相关的 Guards，遵循适配器层架构原则
 */
@Module({
  imports: [
    // 导入业务模块以获取服务
    AccountInstallerModule, // 或根据你的需求选择合适的预设
    AuthModule,
    RegisterModule,
    ThirdPartyAuthModule,
    // 提供 CURSOR_SIGNER 与 PAGINATOR（分页相关的 DI 令牌）
    PaginationModule,
    CourseCatalogsModule, // 导入课程目录模块
    // 报名用例所需依赖模块（适配器模块内直接注入，不依赖已删除的 CourseWorkflowsModule）
    CourseSeriesModule,
    CourseSessionsModule,
    ParticipationEnrollmentModule,
    ParticipationAttendanceModule, // 结课用例依赖出勤服务（锁定与定稿校验）
    CourseSessionCoachesModule, // 结课用例依赖节次-教练结算模板服务（存在性校验）
    CustomerServiceModule,
    LearnerIdentityModule,
    CoachServiceModule, // 结课用例需要校验当前操作者是否为主教练
    IntegrationEventsModule,
    PayoutSeriesRuleModule, // 导入结算规则模块，提供 usecase 与服务
    VerificationRecordModule, // 导入验证记录模块（包含验证流程相关组件）
    IdentityManagementModule, // 导入身份管理模块
  ],
  providers: [
    // Resolvers
    AccountResolver,
    AuthResolver,
    RegistrationResolver,
    ThirdPartyAuthResolver,
    CourseCatalogResolver, // 注册课程目录 resolver
    PayoutRuleResolver, // 注册结算规则 resolver
    VerificationRecordResolver,
    IdentityManagementResolver, // 注册身份管理 resolver
    LearnerResolver, // 注册学员管理 resolver
    CustomerResolver, // 注册客户管理 resolver
    CoachResolver, // 注册教练管理 resolver
    ManagerResolver, // 注册经理管理 resolver
    SessionEnrollmentResolver, // 注册节次报名 resolver
    SessionCancelResolver, // 注册取消报名 resolver
    SessionCloseResolver, // 注册节次结课 resolver
    // 用例
    EnrollLearnerToSessionUsecase, // 在适配器模块内直接提供报名用例
    CancelEnrollmentUsecase, // 在适配器模块内直接提供取消报名用例
    CloseSessionUsecase,
    // Guards
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    // Resolvers
    AccountResolver,
    AuthResolver,
    RegistrationResolver,
    ThirdPartyAuthResolver,
    CourseCatalogResolver, // 导出课程目录 resolver
    PayoutRuleResolver, // 导出结算规则 resolver
    VerificationRecordResolver,
    IdentityManagementResolver, // 导出身份管理 resolver
    LearnerResolver, // 导出学员管理 resolver
    CustomerResolver, // 导出客户管理 resolver
    CoachResolver, // 导出教练管理 resolver
    ManagerResolver, // 导出经理管理 resolver
    SessionEnrollmentResolver, // 导出节次报名 resolver
    SessionCancelResolver, // 导出取消报名 resolver
    SessionCloseResolver, // 导出节次结课 resolver
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class GraphQLAdapterModule {}
