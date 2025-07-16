// src/modules/account/providers/staff-profile.provider.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../constants/provider-tokens';
import { StaffEntity } from '../entities/account-staff.entity';
import { AccountProfileProvider } from '../interfaces';

/**
 * 教职工 Profile Provider
 * 负责获取教职工相关的 profile 信息
 */
@Injectable()
export class StaffProfileProvider implements AccountProfileProvider<StaffEntity> {
  readonly identity = SUPPORTED_IDENTITIES.STAFF;

  constructor(
    @InjectRepository(StaffEntity)
    private readonly staffRepo: Repository<StaffEntity>,
  ) {}

  /**
   * 获取教职工 profile 信息
   * @param accountId 账户 ID
   * @returns Promise<StaffEntity | null>
   */
  async getProfile(accountId: number): Promise<StaffEntity | null> {
    return this.staffRepo.findOne({
      where: { accountId },
    });
  }

  /**
   * 批量获取教职工 profile 信息
   * @param accountIds 账户 ID 数组
   * @returns Promise<Map<number, StaffEntity>>
   */
  async getProfiles(accountIds: number[]): Promise<Map<number, StaffEntity>> {
    const staff = await this.staffRepo.find({
      where: { accountId: In(accountIds) },
    });

    const profileMap = new Map<number, StaffEntity>();
    staff.forEach((member) => {
      profileMap.set(member.accountId, member);
    });

    return profileMap;
  }
}
