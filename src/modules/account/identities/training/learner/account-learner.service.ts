// src/modules/account/identities/training/learner/account-learner.service.ts

import { Gender } from '@app-types/models/user-info.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearnerEntity } from './account-learner.entity';

/**
 * 分页查询参数接口
 */
export interface LearnerPaginationParams {
  /** 客户 ID */
  customerId: number;
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量，默认 10，最大 100 */
  limit?: number;
  /** 排序字段 */
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  /** 排序方向 */
  sortOrder?: 'ASC' | 'DESC';
  /** 是否包含已删除的记录 */
  includeDeleted?: boolean;
}

/**
 * 分页查询结果接口
 */
export interface LearnerPaginationResult {
  /** 学员列表 */
  learners: LearnerEntity[];
  /** 总数量 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  limit: number;
  /** 总页数 */
  totalPages: number;
}

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

  /**
   * 分页查询学员列表（支持权限校验）
   * @param params 分页查询参数
   * @returns 分页查询结果
   */
  async findPaginated(params: LearnerPaginationParams): Promise<LearnerPaginationResult> {
    const {
      customerId,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      includeDeleted = false,
    } = params;

    // 限制每页最大数量
    const actualLimit = Math.min(limit, 100);
    const offset = (page - 1) * actualLimit;

    // 构建查询
    const queryBuilder = this.learnerRepository
      .createQueryBuilder('learner')
      .where('learner.customerId = :customerId', { customerId });

    // 是否包含已删除的记录
    if (!includeDeleted) {
      queryBuilder.andWhere('learner.deactivatedAt IS NULL');
    }

    // 排序
    queryBuilder.orderBy(`learner.${sortBy}`, sortOrder);

    // 分页
    queryBuilder.skip(offset).take(actualLimit);

    // 执行查询
    const [learners, total] = await queryBuilder.getManyAndCount();

    // 计算总页数
    const totalPages = Math.ceil(total / actualLimit);

    return {
      learners,
      total,
      page,
      limit: actualLimit,
      totalPages,
    };
  }

  /**
   * 验证学员是否属于指定客户
   * @param learnerId 学员 ID
   * @param customerId 客户 ID
   * @returns 是否属于该客户
   */
  async verifyOwnership(learnerId: number, customerId: number): Promise<boolean> {
    const count = await this.learnerRepository.count({
      where: {
        id: learnerId,
        customerId,
      },
    });

    return count > 0;
  }

  /**
   * 检查学员姓名在客户下是否唯一
   * @param name 学员姓名
   * @param customerId 客户 ID
   * @param excludeId 排除的学员 ID（用于更新时检查）
   * @returns 是否唯一
   */
  async isNameUniqueForCustomer(
    name: string,
    customerId: number,
    excludeId?: number,
  ): Promise<boolean> {
    const queryBuilder = this.learnerRepository
      .createQueryBuilder('learner')
      .where('learner.name = :name', { name })
      .andWhere('learner.customerId = :customerId', { customerId })
      .andWhere('learner.deactivatedAt IS NULL');

    if (excludeId) {
      queryBuilder.andWhere('learner.id != :excludeId', { excludeId });
    }

    const count = await queryBuilder.getCount();
    return count === 0;
  }
}
