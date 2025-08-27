import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROFILE_PROVIDER_TOKEN } from '../../../base/constants/provider-tokens';
import { StaffEntity } from './account-staff.entity';
import { StaffProfileProvider } from './staff-profile.provider';

/**
 * Staff 身份包
 * - 提供 StaffEntity 的 repository
 * - 使用“唯一身份 token”注册 Provider（不再用数组 token）
 * - 不对外导出底层 token，由 AccountModule 聚合为 Map 后对外暴露
 */
@Module({
  imports: [TypeOrmModule.forFeature([StaffEntity])],
  providers: [{ provide: PROFILE_PROVIDER_TOKEN.STAFF, useClass: StaffProfileProvider }],
  exports: [TypeOrmModule, PROFILE_PROVIDER_TOKEN.STAFF],
})
export class StaffIdentityModule {}
