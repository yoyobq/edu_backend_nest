// src/modules/account/identities/training/customer/customer.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROFILE_PROVIDER_TOKEN } from '../../../base/constants/provider-tokens';
import { CustomerEntity } from './account-customer.entity';
import { CustomerProfileProvider } from './customer-profile.provider';

/**
 * Customer 身份包
 */
@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity])],
  providers: [{ provide: PROFILE_PROVIDER_TOKEN.CUSTOMER, useClass: CustomerProfileProvider }],
  exports: [TypeOrmModule, PROFILE_PROVIDER_TOKEN.CUSTOMER],
})
export class CustomerIdentityModule {}
