// src/modules/account/identities/training/coach/coach-profile.provider.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { CoachEntity } from './account-coach.entity';

/**
 * Coach Profile Provider
 * 提供 Coach 身份相关的数据访问方法
 */
@Injectable()
export class CoachProfileProvider implements AccountProfileProvider<CoachEntity> {
  readonly identity = SUPPORTED_IDENTITIES.COACH;

  constructor(
    @InjectRepository(CoachEntity)
    private readonly repo: Repository<CoachEntity>,
  ) {}

  /**
   * 根据账户 ID 获取 Coach 信息
   * @param accountId 账户 ID
   * @returns Coach 实体或 null
   */
  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  /**
   * 批量获取 Coach 信息
   * @param accountIds 账户 ID 数组
   * @returns 账户 ID 到 Coach 实体的映射
   */
  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.map((r) => [r.accountId, r]));
  }
}
