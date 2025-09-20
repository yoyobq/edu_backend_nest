// src/modules/account/identities/training/manager/manager-profile.provider.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { ManagerEntity } from './account-manager.entity';

/**
 * Manager Profile Provider
 * 提供 Manager 身份相关的数据访问方法
 */
@Injectable()
export class ManagerProfileProvider implements AccountProfileProvider<ManagerEntity> {
  readonly identity = SUPPORTED_IDENTITIES.MANAGER;

  constructor(
    @InjectRepository(ManagerEntity)
    private readonly repo: Repository<ManagerEntity>,
  ) {}

  /**
   * 根据账户 ID 获取 Manager 信息
   * @param accountId 账户 ID
   * @returns Manager 实体或 null
   */
  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  /**
   * 批量获取 Manager 信息
   * @param accountIds 账户 ID 数组
   * @returns 账户 ID 到 Manager 实体的映射
   */
  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.map((r) => [r.accountId, r]));
  }
}
