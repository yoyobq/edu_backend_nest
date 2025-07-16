// src/modules/account/providers/student-profile.provider.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SUPPORTED_IDENTITIES } from '../constants/provider-tokens';
import { StudentEntity } from '../entities/account-student.entity';
import { AccountProfileProvider } from '../interfaces';

/**
 * 学生 Profile Provider
 * 负责获取学生相关的 profile 信息
 */
@Injectable()
export class StudentProfileProvider implements AccountProfileProvider<StudentEntity> {
  readonly identity = SUPPORTED_IDENTITIES.STUDENT;

  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepo: Repository<StudentEntity>,
  ) {}

  /**
   * 获取学生 profile 信息
   * @param accountId 账户 ID
   * @returns Promise<StudentEntity | null>
   */
  async getProfile(accountId: number): Promise<StudentEntity | null> {
    return this.studentRepo.findOne({
      where: { accountId },
    });
  }

  /**
   * 批量获取学生 profile 信息
   * @param accountIds 账户 ID 数组
   * @returns Promise<Map<number, StudentEntity>>
   */
  async getProfiles(accountIds: number[]): Promise<Map<number, StudentEntity>> {
    const students = await this.studentRepo.find({
      where: { accountId: In(accountIds) },
    });

    const profileMap = new Map<number, StudentEntity>();
    students.forEach((student) => {
      profileMap.set(student.accountId, student);
    });

    return profileMap;
  }
}
