// src/modules/identity-management/identity-management.module.ts

import { Module } from '@nestjs/common';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { AuthModule } from '@src/modules/auth/auth.module';
import { PerformUpgradeToCustomerUsecase } from '@src/usecases/identity-management/perform-upgrade-to-customer.usecase';

/**
 * 身份管理模块
 * 提供身份升级、转换等相关功能
 */
@Module({
  imports: [
    AccountInstallerModule, // 提供账户相关服务
    CustomerServiceModule, // 提供 CustomerService
    AuthModule, // 提供认证相关服务
  ],
  providers: [
    PerformUpgradeToCustomerUsecase, // 升级为客户用例
  ],
  exports: [
    PerformUpgradeToCustomerUsecase, // 导出用例供其他模块使用
  ],
})
export class IdentityManagementModule {}
