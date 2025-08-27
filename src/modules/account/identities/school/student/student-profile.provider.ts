import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { StudentEntity } from './account-student.entity';

/** 学生 Profile Provider */
export class StudentProfileProvider implements AccountProfileProvider<StudentEntity> {
  readonly identity = SUPPORTED_IDENTITIES.STUDENT;

  constructor(
    @InjectRepository(StudentEntity)
    private readonly repo: Repository<StudentEntity>,
  ) {}

  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.map((r) => [r.accountId, r]));
  }
}
