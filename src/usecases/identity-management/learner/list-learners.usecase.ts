// src/usecases/learner/list-learners.usecase.ts

import { Injectable } from '@nestjs/common';
import { LearnerSortField, OrderDirection } from '@src/types/common/sort.types';
import { DomainError, PERMISSION_ERROR } from '../../../core/common/errors/domain-error';
import { CustomerService } from '../../../modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '../../../modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '../../../modules/account/identities/training/learner/account-learner.service';

/**
 * 分页查询参数
 */
export interface PaginationInput {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量，默认 10，最大 100 */
  limit?: number;
  /** 排序字段，默认按创建时间倒序 */
  sortBy?: LearnerSortField;
  /** 排序方向，默认 DESC */
  sortOrder?: OrderDirection;
}

/**
 * 分页查询结果
 */
export interface PaginatedLearners {
  /** 学员列表 */
  items: LearnerEntity[];
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
 * 列出学员信息用例
 *
 * 功能：
 * - 权限校验：确保当前用户是 Customer 且只能查看自己名下的学员
 * - 只返回未软删除的学员信息
 * - 支持分页和排序
 * - 负责业务映射逻辑，将 GraphQL 枚举映射为数据库字段
 */
@Injectable()
export class ListLearnersUsecase {
  constructor(
    private readonly customerService: CustomerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 将 GraphQL 排序字段枚举映射为数据库字段名
   * @param sortBy GraphQL 排序字段枚举
   * @returns 数据库字段名
   */
  private mapSortFieldToDbField(sortBy?: LearnerSortField): string {
    switch (sortBy) {
      case LearnerSortField.NAME:
        return 'name';
      case LearnerSortField.UPDATED_AT:
        return 'updatedAt';
      case LearnerSortField.CREATED_AT:
      default:
        return 'createdAt';
    }
  }

  /**
   * 执行列出学员信息
   * @param customerAccountId 当前登录的客户账户 ID
   * @param pagination 分页参数
   * @returns 分页的学员列表
   */
  async execute(
    customerAccountId: number,
    pagination: PaginationInput = {},
  ): Promise<PaginatedLearners> {
    // 1. 权限校验：验证当前用户是 Customer
    const customer = await this.customerService.findByAccountId(customerAccountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '只有客户可以查看学员信息');
    }

    // 2. 设置分页参数默认值和业务映射
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(100, Math.max(1, pagination.limit || 10));
    const sortBy = this.mapSortFieldToDbField(pagination.sortBy || LearnerSortField.CREATED_AT);
    const sortOrder = pagination.sortOrder || OrderDirection.DESC;

    // 3. 查询学员列表（只查询未软删除的）
    const learners = await this.learnerService.findByCustomerId(customer.id);

    // 4. 过滤掉已软删除的学员
    const activeLearners = learners.filter((learner) => !learner.deactivatedAt);

    // 5. 排序
    activeLearners.sort((a, b) => {
      let aValue: string | Date;
      let bValue: string | Date;

      switch (sortBy) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'updatedAt':
          aValue = a.updatedAt;
          bValue = b.updatedAt;
          break;
        case 'createdAt':
        default:
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
      }

      if (sortOrder === OrderDirection.ASC) {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    // 6. 分页
    const total = activeLearners.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const items = activeLearners.slice(startIndex, endIndex);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
