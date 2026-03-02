import { Module } from '@nestjs/common';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { FetchIdentityByRoleUsecase } from '@src/usecases/account/fetch-identity-by-role.usecase';
import { FetchUserInfoUsecase } from '@src/usecases/account/fetch-user-info.usecase';
import { GetAccountByIdUsecase } from '@src/usecases/account/get-account-by-id.usecase';
import { GetVisibleUserInfoUsecase } from '@src/usecases/account/get-visible-user-info.usecase';
import {
  UpdateAccessGroupUsecase,
  UpdateVisibleUserInfoUsecase,
} from '@src/usecases/account/update-visible-user-info.usecase';

@Module({
  imports: [AccountInstallerModule],
  exports: [
    FetchIdentityByRoleUsecase,
    FetchUserInfoUsecase,
    GetAccountByIdUsecase,
    GetVisibleUserInfoUsecase,
    UpdateVisibleUserInfoUsecase,
    UpdateAccessGroupUsecase,
  ],
})
export class AccountUsecasesModule {}
