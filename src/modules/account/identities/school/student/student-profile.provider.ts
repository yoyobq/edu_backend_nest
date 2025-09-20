// src/modules/account/identities/school/student/student-profile.provider.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../../../base/constants/provider-tokens';
import { AccountProfileProvider } from '../../../base/interfaces/account-profile-provider.interface';
import { StudentEntity } from './account-student.entity';

/**
 * 学生 Profile Provider
 * 提供 Student 身份相关的数据访问方法
 */
@Injectable()
export class StudentProfileProvider implements AccountProfileProvider<StudentEntity> {
  readonly identity = SUPPORTED_IDENTITIES.STUDENT;

  constructor(
    @InjectRepository(StudentEntity)
    private readonly repo: Repository<StudentEntity>,
  ) {}

  /**
   * 根据账户 ID 获取 Student 信息
   * @param accountId 账户 ID
   * @returns Student 实体或 null
   */
  getProfile(accountId: number) {
    return this.repo.findOne({ where: { accountId } });
  }

  /**
   * 批量获取 Student 信息
   * @param accountIds 账户 ID 数组
   * @returns 账户 ID 到 Student 实体的映射
   */
  async getProfiles(accountIds: number[]) {
    const rows = await this.repo.find({ where: { accountId: In(accountIds) } });
    return new Map(rows.map((r) => [r.accountId, r]));
  }
}
