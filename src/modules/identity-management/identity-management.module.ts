// src/modules/identity-management/identity-management.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { CoachServiceModule } from '@src/modules/account/identities/training/coach/coach-service.module';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { LearnerIdentityModule } from '@src/modules/account/identities/training/learner/learner.module';
import { ManagerServiceModule } from '@src/modules/account/identities/training/manager/manager-service.module';
import { AuthModule } from '@src/modules/auth/auth.module';
import { MembershipLevelsModule } from '@src/modules/membership-levels/membership-levels.module';

/**
 * 身份管理模块
 * 聚合身份相关服务模块
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([]), // 为 DataSource 注入提供支持
    AccountInstallerModule, // 提供账户相关服务
    CustomerServiceModule, // 提供 CustomerService
    CoachServiceModule, // 提供 CoachService
    LearnerIdentityModule, // 提供 LearnerService
    ManagerServiceModule, // 提供 ManagerService
    MembershipLevelsModule, // 会员等级服务
    AuthModule, // 提供认证相关服务
  ],
})
export class IdentityManagementModule {}
