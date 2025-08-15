// src/modules/register/register.module.ts

import { AccountModule } from '@modules/account/account.module';
import { Module } from '@nestjs/common';
import '../../adapters/graphql/registration/enums/register-type.enum';
import { RegistrationResolver } from '../../adapters/graphql/registration/registration.resolver';
import { RegisterService } from './register.service';

/**
 * 注册模块
 */
@Module({
  imports: [AccountModule],
  providers: [RegistrationResolver, RegisterService],
  exports: [RegisterService],
})
export class RegisterModule {}
