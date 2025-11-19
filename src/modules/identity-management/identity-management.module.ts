// src/modules/identity-management/identity-management.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { CoachServiceModule } from '@src/modules/account/identities/training/coach/coach-service.module';
import { LearnerIdentityModule } from '@src/modules/account/identities/training/learner/learner.module';
import { ManagerServiceModule } from '@src/modules/account/identities/training/manager/manager-service.module';
import { AuthModule } from '@src/modules/auth/auth.module';
import { MembershipLevelsModule } from '@src/modules/membership-levels/membership-levels.module';
import { GetMembershipLevelByIdUsecase } from '@src/usecases/membership-levels/get-membership-level-by-id.usecase';
import { UpgradeToCustomerUsecase } from '@src/usecases/identity-management/customer/upgrade-to-customer.usecase';
import { UpgradeToCoachUsecase } from '@src/usecases/identity-management/coach/upgrade-to-coach.usecase';
import { UpdateCoachUsecase } from '@src/usecases/identity-management/coach/update-coach.usecase';
import { DeactivateCoachUsecase } from '@src/usecases/identity-management/coach/deactivate-coach.usecase';
import { ReactivateCoachUsecase } from '@src/usecases/identity-management/coach/reactivate-coach.usecase';
import { ListCoachesUsecase } from '@src/usecases/identity-management/coach/list-coaches.usecase';
import { CreateLearnerUsecase } from '@src/usecases/identity-management/learner/create-learner.usecase';
import { UpdateLearnerUsecase } from '@src/usecases/identity-management/learner/update-learner.usecase';
import { DeleteLearnerUsecase } from '@src/usecases/identity-management/learner/delete-learner.usecase';
import { GetLearnerUsecase } from '@src/usecases/identity-management/learner/get-learner.usecase';
import { ListLearnersUsecase } from '@src/usecases/identity-management/learner/list-learners.usecase';
import { UpdateCustomerUsecase } from '@src/usecases/identity-management/customer/update-customer.usecase';
import { DeactivateCustomerUsecase } from '@src/usecases/identity-management/customer/deactivate-customer.usecase';
import { ReactivateCustomerUsecase } from '@src/usecases/identity-management/customer/reactivate-customer.usecase';
import { ListCustomersUsecase } from '@src/usecases/identity-management/customer/list-customers.usecase';
import { GetCustomerUsecase } from '@src/usecases/identity-management/customer/get-customer.usecase';
import { ListManagersUsecase } from '@src/usecases/identity-management/manager/list-managers.usecase';
import { UpdateManagerUsecase } from '@src/usecases/identity-management/manager/update-manager.usecase';
import { DeactivateManagerUsecase } from '@src/usecases/identity-management/manager/deactivate-manager.usecase';
import { ReactivateManagerUsecase } from '@src/usecases/identity-management/manager/reactivate-manager.usecase';

/**
 * 身份管理模块
 * 提供身份升级、转换等相关功能
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
  providers: [
    UpgradeToCustomerUsecase, // 升级为客户用例
    UpgradeToCoachUsecase, // 升级为教练用例
    GetMembershipLevelByIdUsecase, // 新增：读取会员等级信息用例
    // 客户管理相关用例
    UpdateCustomerUsecase,
    DeactivateCustomerUsecase,
    ReactivateCustomerUsecase,
    ListCustomersUsecase,
    GetCustomerUsecase,
    // 教练管理相关用例
    UpdateCoachUsecase,
    DeactivateCoachUsecase,
    ReactivateCoachUsecase,
    ListCoachesUsecase,
    // 学员管理相关用例
    CreateLearnerUsecase,
    UpdateLearnerUsecase,
    DeleteLearnerUsecase,
    GetLearnerUsecase,
    ListLearnersUsecase,
    // 经理管理相关用例
    ListManagersUsecase,
    UpdateManagerUsecase,
    DeactivateManagerUsecase,
    ReactivateManagerUsecase,
  ],
  exports: [
    UpgradeToCustomerUsecase, // 导出用例供其他模块使用
    UpgradeToCoachUsecase, // 导出教练升级用例
    GetMembershipLevelByIdUsecase, // 导出读取会员等级信息用例
    // 导出客户管理相关用例
    UpdateCustomerUsecase,
    DeactivateCustomerUsecase,
    ReactivateCustomerUsecase,
    ListCustomersUsecase,
    GetCustomerUsecase,
    // 导出教练管理相关用例
    UpdateCoachUsecase,
    DeactivateCoachUsecase,
    ReactivateCoachUsecase,
    ListCoachesUsecase,
    // 导出学员管理相关用例
    CreateLearnerUsecase,
    UpdateLearnerUsecase,
    DeleteLearnerUsecase,
    GetLearnerUsecase,
    ListLearnersUsecase,
    // 导出经理管理相关用例
    ListManagersUsecase,
    UpdateManagerUsecase,
    DeactivateManagerUsecase,
    ReactivateManagerUsecase,
  ],
})
export class IdentityManagementModule {}
