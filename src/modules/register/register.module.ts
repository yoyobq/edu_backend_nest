// src/modules/register/register.module.ts

import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import './graphql/enums/register-type.enum';
import { RegisterResolver } from './register.resolver';
import { RegisterService } from './register.service';

/**
 * 注册模块
 */
@Module({
  imports: [AccountModule],
  providers: [RegisterResolver, RegisterService],
  exports: [RegisterService],
})
export class RegisterModule {}
