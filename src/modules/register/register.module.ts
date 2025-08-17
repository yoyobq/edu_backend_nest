// src/modules/register/register.module.ts

import { AccountModule } from '@modules/account/account.module';
import { Module } from '@nestjs/common';
import '../../adapters/graphql/registration/enums/register-type.enum';
import { RegisterService } from './register.service';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';

@Module({
  imports: [AccountModule],
  providers: [
    RegisterService,
    CreateAccountUsecase, // 保留复杂业务逻辑的 usecase
    // 移除纯读操作的 usecase：
    // CheckNicknameExistsUsecase,
    // CheckAccountExistsUsecase,
  ],
  exports: [
    RegisterService,
    CreateAccountUsecase, // 导出供 GraphQLAdapterModule 使用
  ],
})
export class RegisterModule {}
