import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { StaffEntity } from './account-staff.entity';

/**
 * 教职工 Profile Provider
 * - 仅在 StaffIdentityModule 被 import 时注册
 */
export class StaffProfileProvider implements AccountProfileProvider<StaffEntity> {
  readonly identity = SUPPORTED_IDENTITIES.STAFF;

  constructor(
    @InjectRepository(StaffEntity)
    private readonly repo: Repository<StaffEntity>,
  ) {}

  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.map((r) => [r.accountId, r]));
  }
}
