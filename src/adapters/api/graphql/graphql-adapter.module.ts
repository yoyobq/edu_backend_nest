// src/adapters/api/graphql/graphql-adapter.module.ts

import { AccountUsecasesModule } from '@src/usecases/account/account-usecases.module';
import { AuthUsecasesModule } from '@src/usecases/auth/auth-usecases.module';
import { EmailQueueUsecasesModule } from '@src/usecases/email-queue/email-queue-usecases.module';
import { IdentityManagementUsecasesModule } from '@src/usecases/identity-management/identity-management-usecases.module';
import { RegistrationUsecasesModule } from '@src/usecases/registration/registration-usecases.module';
import { ThirdPartyAccountsUsecasesModule } from '@src/usecases/third-party-accounts/third-party-accounts-usecases.module';
import { VerificationRecordUsecasesModule } from '@src/usecases/verification-record/verification-record-usecases.module';
import { VerificationUsecasesModule } from '@src/usecases/verification/verification-usecases.module';

import { Module } from '@nestjs/common';

// Resolvers
import { AccountResolver } from './account/account.resolver';
import { UserInfoResolver } from './account/user-info.resolver';
import { AuthResolver } from './auth/auth.resolver';
import { EmailResolver } from './email/email.resolver';
import { CoachResolver } from './identity-management/coach/coach.resolver';
import { CustomerResolver } from './identity-management/customer/customer.resolver';
import { IdentityManagementResolver } from './identity-management/identity-management.resolver';
import { LearnerResolver } from './identity-management/learner/learner.resolver';
import { ManagerResolver } from './identity-management/manager/manager.resolver';
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
    AccountUsecasesModule,
    AuthUsecasesModule,
    EmailQueueUsecasesModule,
    RegistrationUsecasesModule,
    ThirdPartyAccountsUsecasesModule,
    IdentityManagementUsecasesModule,
    VerificationRecordUsecasesModule,
    VerificationUsecasesModule,
  ],
  providers: [
    // Resolvers
    AccountResolver,
    AuthResolver,
    ThirdPartyAuthResolver,
    EmailResolver,
    RegistrationResolver,
    VerificationRecordResolver,
    IdentityManagementResolver, // 注册身份管理 resolver
    LearnerResolver, // 注册学员管理 resolver
    CustomerResolver, // 注册客户管理 resolver
    CoachResolver, // 注册教练管理 resolver
    ManagerResolver, // 注册经理管理 resolver
    UserInfoResolver,
    // Guards
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    // Resolvers
    AccountResolver,
    AuthResolver,
    ThirdPartyAuthResolver,
    EmailResolver,
    RegistrationResolver,
    VerificationRecordResolver,
    IdentityManagementResolver, // 导出身份管理 resolver
    LearnerResolver, // 导出学员管理 resolver
    CustomerResolver, // 导出客户管理 resolver
    CoachResolver, // 导出教练管理 resolver
    ManagerResolver, // 导出经理管理 resolver
    UserInfoResolver,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class GraphQLAdapterModule {}
