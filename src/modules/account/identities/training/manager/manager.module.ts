// src/modules/account/identities/training/manager/manager.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROFILE_PROVIDER_TOKEN } from '../../../base/constants/provider-tokens';
import { ManagerEntity } from './account-manager.entity';
import { ManagerProfileProvider } from './manager-profile.provider';

/**
 * Manager 身份包
 */
@Module({
  imports: [TypeOrmModule.forFeature([ManagerEntity])],
  providers: [{ provide: PROFILE_PROVIDER_TOKEN.MANAGER, useClass: ManagerProfileProvider }],
  exports: [TypeOrmModule, PROFILE_PROVIDER_TOKEN.MANAGER],
})
export class ManagerIdentityModule {}
