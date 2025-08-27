// src/modules/account/identities/training/customer/customer-profile.provider.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { CustomerEntity } from './account-customer.entity';

/**
 * 客户 Profile Provider
 * 提供客户身份相关的数据访问方法
 */
@Injectable()
export class CustomerProfileProvider implements AccountProfileProvider<CustomerEntity> {
  readonly identity = SUPPORTED_IDENTITIES.CUSTOMER;

  constructor(
    @InjectRepository(CustomerEntity)
    private readonly repo: Repository<CustomerEntity>,
  ) {}

  /**
   * 根据账户 ID 获取客户信息
   * @param accountId 账户 ID
   * @returns 客户实体或 null
   */
  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  /**
   * 批量获取客户信息
   * @param accountIds 账户 ID 数组
   * @returns 账户 ID 到客户实体的映射
   */
  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.filter((r) => r.accountId !== null).map((r) => [r.accountId!, r]));
  }
}
