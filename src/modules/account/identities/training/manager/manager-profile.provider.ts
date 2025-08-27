// src/modules/account/identities/training/manager/manager-profile.provider.ts
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { ManagerEntity } from './account-manager.entity';

export class ManagerProfileProvider implements AccountProfileProvider<ManagerEntity> {
  readonly identity = SUPPORTED_IDENTITIES.MANAGER;

  constructor(
    @InjectRepository(ManagerEntity)
    private readonly repo: Repository<ManagerEntity>,
  ) {}

  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.map((r) => [r.accountId, r]));
  }
}
