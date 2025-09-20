// src/modules/account/identities/training/learner/account-learner.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gender } from '@app-types/models/user-info.types';
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
   * 根据学员姓名和客户 ID 查找学员
   * @param params 查询参数
   * @returns 学员信息或 null
   */
  async findByNameAndCustomerId(params: {
    name: string;
    customerId: number;
  }): Promise<LearnerEntity | null> {
    const { name, customerId } = params;
    return await this.learnerRepository.findOne({
      where: { name, customerId },
    });
  }

  /**
   * 创建学员记录
   * @param params 创建参数
   * @returns 创建的学员实体
   */
  async create(params: {
    accountId?: number | null;
    customerId: number;
    name: string;
    gender?: Gender;
    birthDate?: string | null;
    avatarUrl?: string | null;
    specialNeeds?: string | null;
    remark?: string | null;
    countPerSession?: number;
    createdBy?: number | null;
  }): Promise<LearnerEntity> {
    const learner = this.learnerRepository.create({
      accountId: params.accountId || null,
      customerId: params.customerId,
      name: params.name,
      gender: params.gender || Gender.SECRET,
      birthDate: params.birthDate || null,
      avatarUrl: params.avatarUrl || null,
      specialNeeds: params.specialNeeds || null,
      remark: params.remark || null,
      countPerSession: params.countPerSession || 1.0,
      deactivatedAt: null,
      createdBy: params.createdBy || null,
      updatedBy: params.createdBy || null,
    });

    return await this.learnerRepository.save(learner);
  }

  /**
   * 更新学员信息
   * @param params 更新参数
   * @returns 更新后的学员实体或 null
   */
  async update(params: {
    id: number;
    name?: string;
    gender?: Gender;
    birthDate?: string | null;
    avatarUrl?: string | null;
    specialNeeds?: string | null;
    remark?: string | null;
    countPerSession?: number;
    updatedBy?: number | null;
  }): Promise<LearnerEntity | null> {
    const { id, updatedBy, ...updateData } = params;

    await this.learnerRepository.update(id, {
      ...updateData,
      updatedBy,
    });

    return await this.findById(id);
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

  /**
   * 软删除学员（设置 deactivatedAt）
   * @param params 删除参数
   * @returns 是否删除成功
   */
  async softDelete(params: { id: number; updatedBy?: number | null }): Promise<boolean> {
    const { id, updatedBy } = params;
    const result = await this.learnerRepository.update(id, {
      deactivatedAt: new Date(),
      updatedBy,
    });

    return result.affected !== undefined && result.affected > 0;
  }

  /**
   * 恢复学员（清除 deactivatedAt）
   * @param params 恢复参数
   * @returns 是否恢复成功
   */
  async restore(params: { id: number; updatedBy?: number | null }): Promise<boolean> {
    const { id, updatedBy } = params;
    const result = await this.learnerRepository.update(id, {
      deactivatedAt: null,
      updatedBy,
    });

    return result.affected !== undefined && result.affected > 0;
  }
}
