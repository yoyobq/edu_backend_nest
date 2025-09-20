// src/modules/account/identities/school/staff/staff-profile.provider.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { StaffEntity } from './account-staff.entity';

/**
 * 教职工 Profile Provider
 * 提供 Staff 身份相关的数据访问方法
 * - 仅在 StaffIdentityModule 被 import 时注册
 */
@Injectable()
export class StaffProfileProvider implements AccountProfileProvider<StaffEntity> {
  readonly identity = SUPPORTED_IDENTITIES.STAFF;

  constructor(
    @InjectRepository(StaffEntity)
    private readonly repo: Repository<StaffEntity>,
  ) {}

  /**
   * 根据账户 ID 获取 Staff 信息
   * @param accountId 账户 ID
   * @returns Staff 实体或 null
   */
  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  /**
   * 批量获取 Staff 信息
   * @param accountIds 账户 ID 数组
   * @returns 账户 ID 到 Staff 实体的映射
   */
  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.map((r) => [r.accountId, r]));
  }
}
