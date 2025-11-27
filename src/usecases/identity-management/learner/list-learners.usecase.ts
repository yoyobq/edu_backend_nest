// src/usecases/learner/list-learners.usecase.ts

import { Injectable } from '@nestjs/common';
import { LearnerSortField, OrderDirection } from '@src/types/common/sort.types';
import { DomainError, PERMISSION_ERROR } from '../../../core/common/errors/domain-error';
import { CustomerService } from '../../../modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '../../../modules/account/identities/training/manager/manager.service';
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
  /** 可选：按指定客户过滤（仅 manager 可用） */
  customerId?: number;
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
    private readonly learnerService: LearnerService,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 将 GraphQL 排序字段枚举映射为数据库字段名
   * @param sortBy GraphQL 排序字段枚举
   * @returns 数据库字段名
   */
  private mapSortFieldToDbField(sortBy?: LearnerSortField): 'createdAt' | 'updatedAt' | 'name' {
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
   * 执行分页查询学员列表
   * @param accountId 当前用户的账户 ID（从 JWT token 解析）
   * @param input 查询参数
   * @returns 分页学员列表
   */
  async execute(accountId: number, input: PaginationInput): Promise<PaginatedLearners> {
    const page = input.page || 1;
    const limit = Math.min(input.limit || 10, 100);
    const sortBy = this.mapSortFieldToDbField(input.sortBy || LearnerSortField.CREATED_AT);
    const sortOrder = input.sortOrder || OrderDirection.DESC;

    // 首先尝试查找 Customer
    const customer = await this.customerService.findByAccountId(accountId);

    if (customer) {
      // 如果是 Customer：只能查询该 Customer 的学员
      const result = await this.learnerService.findPaginated({
        customerId: customer.id,
        page,
        limit,
        sortBy,
        sortOrder: sortOrder as 'ASC' | 'DESC',
        includeDeleted: false,
      });

      return {
        items: result.learners,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      };
    }

    // 然后尝试查找 Manager
    const manager = await this.managerService.findByAccountId(accountId);

    if (manager) {
      // 如果是 Manager：允许查询所有的 learner，或按 customerId 过滤
      if (input.customerId) {
        const targetCustomer = await this.customerService.findById(input.customerId);
        if (!targetCustomer) {
          throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标客户不存在');
        }
      }

      const result = await this.learnerService.findPaginated({
        customerId: input.customerId ?? undefined,
        page,
        limit,
        sortBy,
        sortOrder: sortOrder as 'ASC' | 'DESC',
        includeDeleted: false,
      });

      return {
        items: result.learners,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      };
    }

    // 如果既不是 Customer 也不是 Manager，抛出权限错误
    throw new DomainError(
      PERMISSION_ERROR.ACCESS_DENIED,
      '用户身份验证失败：该账户既不是客户也不是管理员',
    );
  }
}
