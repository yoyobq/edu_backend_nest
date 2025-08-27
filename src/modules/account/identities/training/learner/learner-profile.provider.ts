// src/modules/account/identities/training/learner/learner-profile.provider.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { LearnerEntity } from './account-learner.entity';

/**
 * 学员 Profile Provider
 * 提供学员身份相关的数据访问方法
 */
@Injectable()
export class LearnerProfileProvider implements AccountProfileProvider<LearnerEntity> {
  readonly identity = SUPPORTED_IDENTITIES.LEARNER;

  constructor(
    @InjectRepository(LearnerEntity)
    private readonly repo: Repository<LearnerEntity>,
  ) {}

  /**
   * 根据账户 ID 获取学员信息
   * @param accountId 账户 ID
   * @returns 学员实体或 null
   */
  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  /**
   * 批量获取学员信息
   * @param accountIds 账户 ID 数组
   * @returns 账户 ID 到学员实体的映射
   */
  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.filter((r) => r.accountId !== null).map((r) => [r.accountId!, r]));
  }
}
