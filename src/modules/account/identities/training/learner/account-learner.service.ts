// src/modules/account/identities/training/learner/learner.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearnerEntity } from './account-learner.entity';

/**
 * 学员服务类
 * 提供学员相关的基础数据操作功能
 */
@Injectable()
export class LearnerService {
  constructor(
    @InjectRepository(LearnerEntity)
    private readonly learnerRepository: Repository<LearnerEntity>,
  ) {}

  /**
   * 根据账户 ID 查找学员信息
   * @param accountId 账户 ID
   * @returns 学员信息或 null
   */
  async findByAccountId(accountId: number): Promise<LearnerEntity | null> {
    return await this.learnerRepository.findOne({
      where: { accountId },
    });
  }

  /**
   * 根据学员 ID 查找学员信息
   * @param id 学员 ID
   * @returns 学员信息或 null
   */
  async findById(id: number): Promise<LearnerEntity | null> {
    return await this.learnerRepository.findOne({
      where: { id },
    });
  }

  /**
   * 根据客户 ID 查找该客户的所有学员
   * @param customerId 客户 ID
   * @returns 学员列表
   */
  async findByCustomerId(customerId: number): Promise<LearnerEntity[]> {
    return await this.learnerRepository.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 创建学员实体
   * @param learnerData 学员数据
   * @returns 学员实体
   */
  createLearnerEntity(learnerData: Partial<LearnerEntity>): LearnerEntity {
    return this.learnerRepository.create(learnerData);
  }

  /**
   * 保存学员信息
   * @param learner 学员实体
   * @returns 保存后的学员实体
   */
  async saveLearner(learner: LearnerEntity): Promise<LearnerEntity> {
    return await this.learnerRepository.save(learner);
  }

  /**
   * 更新学员信息
   * @param id 学员 ID
   * @param updateData 更新数据
   */
  async updateLearner(id: number, updateData: Partial<LearnerEntity>): Promise<void> {
    await this.learnerRepository.update(id, updateData);
  }

  /**
   * 检查学员是否存在
   * @param accountId 账户 ID
   * @returns 是否存在
   */
  async checkLearnerExists(accountId: number): Promise<boolean> {
    const learner = await this.findByAccountId(accountId);
    return !!learner;
  }

  /**
   * 获取学员及其关联的客户信息
   * @param learnerId 学员 ID
   * @returns 学员信息（包含客户信息）
   */
  async getLearnerWithCustomer(learnerId: number): Promise<LearnerEntity | null> {
    return await this.learnerRepository.findOne({
      where: { id: learnerId },
      relations: ['customer'],
    });
  }

  /**
   * 根据学员姓名模糊查询
   * @param name 学员姓名（支持模糊匹配）
   * @returns 学员列表
   */
  async findByNameLike(name: string): Promise<LearnerEntity[]> {
    return await this.learnerRepository
      .createQueryBuilder('learner')
      .where('learner.name LIKE :name', { name: `%${name}%` })
      .orderBy('learner.createdAt', 'DESC')
      .getMany();
  }
}
