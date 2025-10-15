// src/modules/identity-management/identity-management.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { LearnerIdentityModule } from '@src/modules/account/identities/training/learner/learner.module';
import { AuthModule } from '@src/modules/auth/auth.module';
import { PerformUpgradeToCustomerUsecase } from '@src/usecases/identity-management/perform-upgrade-to-customer.usecase';
import { CreateLearnerUsecase } from '@src/usecases/identity-management/learner/create-learner.usecase';
import { UpdateLearnerUsecase } from '@src/usecases/identity-management/learner/update-learner.usecase';
import { DeleteLearnerUsecase } from '@src/usecases/identity-management/learner/delete-learner.usecase';
import { GetLearnerUsecase } from '@src/usecases/identity-management/learner/get-learner.usecase';
import { ListLearnersUsecase } from '@src/usecases/identity-management/learner/list-learners.usecase';

/**
 * 身份管理模块
 * 提供身份升级、转换等相关功能
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([]), // 为 DataSource 注入提供支持
    AccountInstallerModule, // 提供账户相关服务
    CustomerServiceModule, // 提供 CustomerService
    LearnerIdentityModule, // 提供 LearnerService
    AuthModule, // 提供认证相关服务
  ],
  providers: [
    PerformUpgradeToCustomerUsecase, // 升级为客户用例
    // 学员管理相关用例
    CreateLearnerUsecase,
    UpdateLearnerUsecase,
    DeleteLearnerUsecase,
    GetLearnerUsecase,
    ListLearnersUsecase,
  ],
  exports: [
    PerformUpgradeToCustomerUsecase, // 导出用例供其他模块使用
    // 导出学员管理相关用例
    CreateLearnerUsecase,
    UpdateLearnerUsecase,
    DeleteLearnerUsecase,
    GetLearnerUsecase,
    ListLearnersUsecase,
  ],
})
export class IdentityManagementModule {}
