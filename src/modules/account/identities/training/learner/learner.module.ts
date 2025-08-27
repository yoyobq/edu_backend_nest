// src/modules/account/identities/training/learner/learner.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROFILE_PROVIDER_TOKEN } from '../../../base/constants/provider-tokens';
import { LearnerEntity } from './account-learner.entity';
import { LearnerProfileProvider } from './learner-profile.provider';

/**
 * Learner 身份包
 */
@Module({
  imports: [TypeOrmModule.forFeature([LearnerEntity])],
  providers: [{ provide: PROFILE_PROVIDER_TOKEN.LEARNER, useClass: LearnerProfileProvider }],
  exports: [TypeOrmModule, PROFILE_PROVIDER_TOKEN.LEARNER],
})
export class LearnerIdentityModule {}
