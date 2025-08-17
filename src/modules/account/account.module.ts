// src/modules/account/account.module.ts

import { FieldEncryptionModule } from '@core/field-encryption/field-encryption.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountService } from './account.service';
import { CoachEntity } from './entities/account-coach.entity';
import { ManagerEntity } from './entities/account-manager.entity';
import { StaffEntity } from './entities/account-staff.entity';
import { AccountEntity } from './entities/account.entity';

// 确保所有 GraphQL 类型和枚举都被导入
import '@adapters/graphql/account/enums/account-status.enum';
import '@adapters/graphql/account/enums/gender.enum';
import '@adapters/graphql/account/enums/identity-type.enum';
import '@src/adapters/graphql/account/dto/user-state.enum';
import '@src/adapters/graphql/account/enums/login-history.types';
import { FetchIdentityByRoleUsecase } from '@usecases/account/fetch-identity-by-role.usecase';
import { UserInfoEntity } from './entities/user-info.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      UserInfoEntity,
      StaffEntity,
      CoachEntity,
      ManagerEntity,
    ]),
    FieldEncryptionModule,
  ],
  providers: [AccountService, FetchIdentityByRoleUsecase],
  exports: [
    AccountService,
    TypeOrmModule,
    // 添加 FetchIdentityByRoleUsecase 到导出列表
    FetchIdentityByRoleUsecase,
  ],
})
export class AccountModule {}
