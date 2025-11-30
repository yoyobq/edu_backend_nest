// src/usecases/learner/list-learners.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { LearnerSortField, OrderDirection } from '@src/types/common/sort.types';
import { DomainError, PERMISSION_ERROR } from '../../../core/common/errors/domain-error';
import { CustomerService } from '../../../modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '../../../modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '../../../modules/account/identities/training/learner/account-learner.service';
import { ManagerService } from '../../../modules/account/identities/training/manager/manager.service';

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

  private normalizeActiveRole(
    activeRole?: IdentityTypeEnum | string | null,
  ): 'CUSTOMER' | 'MANAGER' | null {
    if (activeRole == null) return null;
    const v =
      typeof activeRole === 'string' ? activeRole.toUpperCase() : String(activeRole).toUpperCase();
    return v === 'CUSTOMER' ? 'CUSTOMER' : v === 'MANAGER' ? 'MANAGER' : null;
  }

  private resolvePagination(input: PaginationInput): {
    page: number;
    limit: number;
    sortBy: 'createdAt' | 'updatedAt' | 'name';
    sortOrder: 'ASC' | 'DESC';
  } {
    const page = input.page ?? 1;
    const limit = Math.min(input.limit ?? 10, 100);
    const sortBy = this.mapSortFieldToDbField(input.sortBy ?? LearnerSortField.CREATED_AT);
    const sortOrder = (input.sortOrder ?? OrderDirection.DESC) as 'ASC' | 'DESC';
    return { page, limit, sortBy, sortOrder };
  }

  private toOutput(result: {
    learners: LearnerEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }): PaginatedLearners {
    return {
      items: result.learners,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  private async listForCustomer(
    accountId: number,
    params: {
      page: number;
      limit: number;
      sortBy: 'createdAt' | 'updatedAt' | 'name';
      sortOrder: 'ASC' | 'DESC';
    },
  ): Promise<PaginatedLearners> {
    const customer = await this.customerService.findByAccountId(accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定客户身份');
    }
    const result = await this.learnerService.findPaginated({
      customerId: customer.id,
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      includeDeleted: false,
    });
    return this.toOutput(result);
  }

  private async listForManager(
    accountId: number,
    customerId: number | undefined,
    params: {
      page: number;
      limit: number;
      sortBy: 'createdAt' | 'updatedAt' | 'name';
      sortOrder: 'ASC' | 'DESC';
    },
  ): Promise<PaginatedLearners> {
    const isActive = await this.managerService.isActiveManager(accountId);
    if (!isActive) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可访问学员列表');
    }
    if (customerId) {
      const targetCustomer = await this.customerService.findById(customerId);
      if (!targetCustomer) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标客户不存在');
      }
    }
    const result = await this.learnerService.findPaginated({
      customerId: customerId ?? undefined,
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      includeDeleted: false,
    });
    return this.toOutput(result);
  }

  private async fallbackByIdentities(
    accountId: number,
    customerId: number | undefined,
    params: {
      page: number;
      limit: number;
      sortBy: 'createdAt' | 'updatedAt' | 'name';
      sortOrder: 'ASC' | 'DESC';
    },
  ): Promise<PaginatedLearners> {
    const customer = await this.customerService.findByAccountId(accountId);
    if (customer) {
      const result = await this.learnerService.findPaginated({
        customerId: customer.id,
        page: params.page,
        limit: params.limit,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        includeDeleted: false,
      });
      return this.toOutput(result);
    }

    const manager = await this.managerService.findByAccountId(accountId);
    if (manager) {
      if (customerId) {
        const targetCustomer = await this.customerService.findById(customerId);
        if (!targetCustomer) {
          throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标客户不存在');
        }
      }
      const result = await this.learnerService.findPaginated({
        customerId: customerId ?? undefined,
        page: params.page,
        limit: params.limit,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        includeDeleted: false,
      });
      return this.toOutput(result);
    }

    throw new DomainError(
      PERMISSION_ERROR.ACCESS_DENIED,
      '用户身份验证失败：该账户既不是客户也不是管理员',
    );
  }

  /**
   * 执行分页查询学员列表
   * @param accountId 当前用户的账户 ID（从 JWT token 解析）
   * @param input 查询参数
   * @returns 分页学员列表
   */
  async execute(
    accountId: number,
    input: PaginationInput,
    activeRole?: IdentityTypeEnum | string,
  ): Promise<PaginatedLearners> {
    const { page, limit, sortBy, sortOrder } = this.resolvePagination(input);
    const role = this.normalizeActiveRole(activeRole);

    if (role === 'CUSTOMER') {
      return this.listForCustomer(accountId, { page, limit, sortBy, sortOrder });
    }
    if (role === 'MANAGER') {
      return this.listForManager(accountId, input.customerId, { page, limit, sortBy, sortOrder });
    }

    return this.fallbackByIdentities(accountId, input.customerId, {
      page,
      limit,
      sortBy,
      sortOrder,
    });
  }
}
