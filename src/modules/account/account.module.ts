// src/modules/account/account.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldEncryptionModule } from '../../core/field-encryption/field-encryption.module';
import { AccountResolver } from './account.resolver';
import { AccountService } from './account.service';
import { AccountEntity } from './entities/account.entity';

// 确保所有 GraphQL 类型和枚举都被导入
import { UserInfoEntity } from './entities/user-info.entity';
import './graphql/enums/account-status.enum';
import './graphql/enums/gender.enum';
import './graphql/enums/identity-type.enum';
import './graphql/enums/user-state.enum';
import './graphql/types/login-history.types';

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
