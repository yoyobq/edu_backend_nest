import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { CoachEntity } from './account-coach.entity';

export class CoachProfileProvider implements AccountProfileProvider<CoachEntity> {
  readonly identity = SUPPORTED_IDENTITIES.COACH;

  constructor(
    @InjectRepository(CoachEntity)
    private readonly repo: Repository<CoachEntity>,
  ) {}

  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.map((r) => [r.accountId, r]));
  }
}
