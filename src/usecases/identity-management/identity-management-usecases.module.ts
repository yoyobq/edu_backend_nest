// 文件位置： src/usecases/identity-management/identity-management-usecases.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { CoachServiceModule } from '@src/modules/account/identities/training/coach/coach-service.module';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { LearnerIdentityModule } from '@src/modules/account/identities/training/learner/learner.module';
import { ManagerServiceModule } from '@src/modules/account/identities/training/manager/manager-service.module';
import { AuthModule } from '@src/modules/auth/auth.module';
import { MembershipLevelsModule } from '@src/modules/membership-levels/membership-levels.module';
import { DeactivateCoachUsecase } from '@src/usecases/identity-management/coach/deactivate-coach.usecase';
import { GetMyCoachUsecase } from '@src/usecases/identity-management/coach/get-my-coach.usecase';
import { ListCoachesUsecase } from '@src/usecases/identity-management/coach/list-coaches.usecase';
import { ReactivateCoachUsecase } from '@src/usecases/identity-management/coach/reactivate-coach.usecase';
import { UpdateCoachUsecase } from '@src/usecases/identity-management/coach/update-coach.usecase';
import { UpgradeToCoachUsecase } from '@src/usecases/identity-management/coach/upgrade-to-coach.usecase';
import { DeactivateCustomerUsecase } from '@src/usecases/identity-management/customer/deactivate-customer.usecase';
import { GetCustomerUsecase } from '@src/usecases/identity-management/customer/get-customer.usecase';
import { ListCustomersUsecase } from '@src/usecases/identity-management/customer/list-customers.usecase';
import { ListOverdueCustomersUsecase } from '@src/usecases/identity-management/customer/list-overdue-customers.usecase';
import { ReactivateCustomerUsecase } from '@src/usecases/identity-management/customer/reactivate-customer.usecase';
import { UpdateCustomerUsecase } from '@src/usecases/identity-management/customer/update-customer.usecase';
import { UpgradeToCustomerUsecase } from '@src/usecases/identity-management/customer/upgrade-to-customer.usecase';
import { CreateLearnerUsecase } from '@src/usecases/identity-management/learner/create-learner.usecase';
import { DeleteLearnerUsecase } from '@src/usecases/identity-management/learner/delete-learner.usecase';
import { GetLearnerUsecase } from '@src/usecases/identity-management/learner/get-learner.usecase';
import { ListLearnersUsecase } from '@src/usecases/identity-management/learner/list-learners.usecase';
import { UpdateLearnerByCustomerUsecase } from '@src/usecases/identity-management/learner/update-learner-by-customer.usecase';
import { UpdateLearnerByManagerUsecase } from '@src/usecases/identity-management/learner/update-learner-by-manager.usecase';
import { DeactivateManagerUsecase } from '@src/usecases/identity-management/manager/deactivate-manager.usecase';
import { ListManagersUsecase } from '@src/usecases/identity-management/manager/list-managers.usecase';
import { ReactivateManagerUsecase } from '@src/usecases/identity-management/manager/reactivate-manager.usecase';
import { UpdateManagerUsecase } from '@src/usecases/identity-management/manager/update-manager.usecase';
import { GetMembershipLevelByIdUsecase } from '@src/usecases/membership-levels/get-membership-level-by-id.usecase';
import { ListMembershipLevelsUsecase } from '@src/usecases/membership-levels/list-membership-levels.usecase';

@Module({
  imports: [
    TypeOrmModule.forFeature([]),
    AccountInstallerModule,
    CustomerServiceModule,
    CoachServiceModule,
    LearnerIdentityModule,
    ManagerServiceModule,
    MembershipLevelsModule,
    AuthModule,
  ],
  providers: [
    UpgradeToCustomerUsecase,
    UpgradeToCoachUsecase,
    GetMembershipLevelByIdUsecase,
    ListMembershipLevelsUsecase,
    UpdateCustomerUsecase,
    DeactivateCustomerUsecase,
    ReactivateCustomerUsecase,
    ListCustomersUsecase,
    ListOverdueCustomersUsecase,
    GetCustomerUsecase,
    UpdateCoachUsecase,
    DeactivateCoachUsecase,
    ReactivateCoachUsecase,
    ListCoachesUsecase,
    GetMyCoachUsecase,
    CreateLearnerUsecase,
    UpdateLearnerByCustomerUsecase,
    UpdateLearnerByManagerUsecase,
    DeleteLearnerUsecase,
    GetLearnerUsecase,
    ListLearnersUsecase,
    ListManagersUsecase,
    UpdateManagerUsecase,
    DeactivateManagerUsecase,
    ReactivateManagerUsecase,
  ],
  exports: [
    UpgradeToCustomerUsecase,
    UpgradeToCoachUsecase,
    GetMembershipLevelByIdUsecase,
    ListMembershipLevelsUsecase,
    UpdateCustomerUsecase,
    DeactivateCustomerUsecase,
    ReactivateCustomerUsecase,
    ListCustomersUsecase,
    ListOverdueCustomersUsecase,
    GetCustomerUsecase,
    UpdateCoachUsecase,
    DeactivateCoachUsecase,
    ReactivateCoachUsecase,
    ListCoachesUsecase,
    GetMyCoachUsecase,
    CreateLearnerUsecase,
    UpdateLearnerByCustomerUsecase,
    UpdateLearnerByManagerUsecase,
    DeleteLearnerUsecase,
    GetLearnerUsecase,
    ListLearnersUsecase,
    ListManagersUsecase,
    UpdateManagerUsecase,
    DeactivateManagerUsecase,
    ReactivateManagerUsecase,
  ],
})
export class IdentityManagementUsecasesModule {}
