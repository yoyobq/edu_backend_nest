// src/modules/account/identities/training/learner/learner.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROFILE_PROVIDER_TOKEN } from '../../../base/constants/provider-tokens';
import { LearnerEntity } from './account-learner.entity';
import { LearnerService } from './account-learner.service';
import { LearnerProfileProvider } from './learner-profile.provider';

/**
 * Learner 身份包
 * - 提供 LearnerEntity 的 repository
 * - 提供 LearnerService 服务
 * - 使用"唯一身份 token"注册 Provider
 */
@Module({
  imports: [TypeOrmModule.forFeature([LearnerEntity])],
  providers: [
    LearnerService,
    { provide: PROFILE_PROVIDER_TOKEN.LEARNER, useClass: LearnerProfileProvider },
  ],
  exports: [TypeOrmModule, LearnerService, PROFILE_PROVIDER_TOKEN.LEARNER],
})
export class LearnerIdentityModule {}
