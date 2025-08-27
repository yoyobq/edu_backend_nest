// src/modules/account/identities/training/coach/coach.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROFILE_PROVIDER_TOKEN } from '../../../base/constants/provider-tokens';
import { CoachEntity } from './account-coach.entity';
import { CoachProfileProvider } from './coach-profile.provider';

/**
 * Coach 身份包
 * - 提供 CoachEntity 的 repository
 * - 使用“唯一身份 token”注册 Provider（不对外导出底层 token）
 */
@Module({
  imports: [TypeOrmModule.forFeature([CoachEntity])],
  providers: [{ provide: PROFILE_PROVIDER_TOKEN.COACH, useClass: CoachProfileProvider }],
  exports: [TypeOrmModule, PROFILE_PROVIDER_TOKEN.COACH],
})
export class CoachIdentityModule {}
