// src/modules/account/account.module.ts

import { AccountResolver } from '@adapters/graphql/account/account.resolver';
import { FieldEncryptionModule } from '@core/field-encryption/field-encryption.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountService } from './account.service';
import { AccountEntity } from './entities/account.entity';

// 确保所有 GraphQL 类型和枚举都被导入
import '@adapters/graphql/account/enums/account-status.enum';
import '@adapters/graphql/account/enums/gender.enum';
import '@adapters/graphql/account/enums/identity-type.enum';
import '@src/adapters/graphql/account/dto/user-state.enum';
import '@src/adapters/graphql/account/enums/login-history.types';
import { UserInfoEntity } from './entities/user-info.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      UserInfoEntity,
      // StudentEntity,
      // StaffEntity
    ]),
    FieldEncryptionModule,
  ],
  providers: [AccountService, AccountResolver],
  exports: [AccountService, TypeOrmModule],
})
export class AccountModule {}
