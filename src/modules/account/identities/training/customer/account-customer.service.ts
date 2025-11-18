// src/modules/account/identities/training/customer/customer.service.ts

import { ACCOUNT_ERROR, DomainError } from '@core/common/errors/domain-error';
import type { PaginatedResult, SortParam } from '@core/pagination/pagination.types';
import type { ISortResolver } from '@core/sort/sort.ports';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationService } from '@src/modules/common/pagination.service';
import { Brackets, EntityManager, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { normalizePhone } from '@src/core/common/normalize/normalize.helper';
import { CustomerEntity } from './account-customer.entity';

/**
 * 客户服务类
 * 提供客户相关的基础数据操作功能
 */
@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepository: Repository<CustomerEntity>,
    private readonly paginationService: PaginationService,
    // 从模块注入 Customer 域专用排序解析器（仅用于内部/专用接口的 CURSOR 流程）
    @Inject('CUSTOMER_SORT_RESOLVER') private readonly customerSortResolver: ISortResolver,
  ) {}

  /**
   * 根据账户 ID 查找客户信息
   * @param accountId 账户 ID
   * @returns 客户信息或 null
   */
  async findByAccountId(
    accountId: number,
    manager?: EntityManager,
  ): Promise<CustomerEntity | null> {
    const repo = manager ? manager.getRepository(CustomerEntity) : this.customerRepository;
    return await repo.findOne({ where: { accountId } });
  }

  /**
   * 根据客户 ID 查找客户信息
   * @param id 客户 ID
   * @returns 客户信息或 null
   */
  async findById(id: number): Promise<CustomerEntity | null> {
    return await this.customerRepository.findOne({
      where: { id },
    });
  }

  /**
   * 根据联系电话查找客户信息
   * @param contactPhone 联系电话
   * @returns 客户信息或 null
   */
  async findByContactPhone(contactPhone: string): Promise<CustomerEntity | null> {
    return await this.customerRepository.findOne({
      where: { contactPhone },
    });
  }

  /**
   * 创建客户实体
   * @param customerData 客户数据
   * @returns 客户实体
   */
  createCustomerEntity(customerData: Partial<CustomerEntity>): CustomerEntity {
    return this.customerRepository.create(customerData);
  }

  /**
   * 提取底层 SQL 错误信息（code/errno/sqlState），以便统一判断唯一约束冲突
   */
  private getSqlErrorInfo(error: unknown): {
    code?: string;
    errno?: number;
    sqlState?: string;
  } {
    if (error instanceof QueryFailedError) {
      const driverError = (
        error as unknown as {
          driverError?: { code?: string; errno?: number; sqlState?: string };
        }
      ).driverError;
      return {
        code: driverError?.code ?? (error as unknown as { code?: string }).code,
        errno: driverError?.errno ?? (error as unknown as { errno?: number }).errno,
        sqlState: driverError?.sqlState ?? (error as unknown as { sqlState?: string }).sqlState,
      };
    }
    return {
      code: (error as { code?: string }).code,
      errno: (error as { errno?: number }).errno,
      sqlState: (error as { sqlState?: string }).sqlState,
    };
  }

  /**
   * 判断是否为唯一约束冲突（兼容 MySQL、PostgreSQL 常见错误码）
   */
  private isUniqueViolation(info: { code?: string; errno?: number; sqlState?: string }): boolean {
    const { code, errno, sqlState } = info;
    return code === 'ER_DUP_ENTRY' || errno === 1062 || sqlState === '23000' || code === '23505';
  }

  /**
   * 保存客户信息
   * @param customer 客户实体
   * @param manager 可选的事务管理器，用于保证事务一致性
   * @returns 保存后的客户实体
   */
  async saveCustomer(customer: CustomerEntity, manager?: EntityManager): Promise<CustomerEntity> {
    const repo = manager ? manager.getRepository(CustomerEntity) : this.customerRepository;
    try {
      return await repo.save(customer);
    } catch (error) {
      // 处理唯一约束冲突（accountId 唯一）且返回已存在实体，实现幂等
      const info = this.getSqlErrorInfo(error);
      if (this.isUniqueViolation(info) && customer.accountId != null) {
        const existing = await this.findByAccountId(customer.accountId, manager);
        if (existing) return existing;
      }

      // 其他错误：抛出领域错误，便于上层捕获与回滚
      throw new DomainError(
        ACCOUNT_ERROR.REGISTRATION_FAILED,
        `创建 Customer 实体失败: ${error instanceof Error ? error.message : '未知错误'}`,
        { accountId: customer.accountId ?? null },
        error,
      );
    }
  }

  /**
   * 更新客户信息
   * @param id 客户 ID
   * @param updateData 更新数据
   */
  async updateCustomer(id: number, updateData: Partial<CustomerEntity>): Promise<void> {
    await this.customerRepository.update(id, updateData);
  }

  /**
   * 检查客户是否存在
   * @param accountId 账户 ID
   * @returns 是否存在
   */
  async checkCustomerExists(accountId: number): Promise<boolean> {
    const customer = await this.findByAccountId(accountId);
    return !!customer;
  }

  /**
   * 获取客户的学员列表
   * @param customerId 客户 ID
   * @returns 学员列表
   */
  async getCustomerWithLearners(customerId: number): Promise<CustomerEntity | null> {
    return await this.customerRepository.findOne({
      where: { id: customerId },
      relations: ['learners'],
    });
  }

  /**
   * 分页查询客户列表（OFFSET 模式，兼容现有 GraphQL 列表返回）
   * @param params 分页查询参数
   * @returns 分页查询结果
   */
  async findPaginated(params: {
    readonly page?: number;
    readonly limit?: number;
    readonly sortBy?: import('@src/types/common/sort.types').CustomerSortField;
    readonly sortOrder?: 'ASC' | 'DESC';
    readonly includeDeleted?: boolean;
    readonly query?: string;
    readonly filters?: Readonly<{
      userState?: string;
      name?: string;
      contactPhone?: string;
      membershipLevel?: number;
    }>;
  }): Promise<{
    readonly customers: CustomerEntity[];
    readonly total: number;
    readonly page: number;
    readonly limit: number;
    readonly totalPages: number;
  }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'accountId',
      sortOrder = 'ASC',
      includeDeleted = false,
    } = params;

    const actualLimit = Math.min(limit, 100);
    const qb = this.createBaseQb(includeDeleted);

    this.applyQuerySearch(qb, params.query);
    this.applyExactFilters(qb, params.filters);

    // 排序（使用域解析器，防注入；并补充稳定副键）
    const primaryColumn =
      this.customerSortResolver.resolveColumn(sortBy) ??
      this.customerSortResolver.resolveColumn('accountId');
    if (primaryColumn) qb.orderBy(primaryColumn, sortOrder);
    const tieBreaker = this.customerSortResolver.resolveColumn('id');
    if (tieBreaker) qb.addOrderBy(tieBreaker, sortOrder);

    // 统计总数（克隆一个用于 COUNT 的查询，避免 ORDER BY 干扰）
    const countQb = qb.clone();
    const total = await countQb.getCount();

    // 应用分页
    qb.take(actualLimit).skip((page - 1) * actualLimit);
    const customers = await qb.getMany();

    const totalPages = Math.ceil(total / actualLimit) || 1;
    return { customers, total, page, limit: actualLimit, totalPages };
  }

  /**
   * 构建客户列表的基础查询
   */
  private createBaseQb(includeDeleted: boolean): SelectQueryBuilder<CustomerEntity> {
    const qb = this.customerRepository.createQueryBuilder('customer');
    qb.leftJoin(UserInfoEntity, 'ui', 'ui.account_id = customer.account_id');
    if (!includeDeleted) {
      qb.where('customer.deactivatedAt IS NULL');
    }
    return qb;
  }

  /**
   * 应用关键词搜索（姓名/手机号）
   */
  private applyQuerySearch(qb: SelectQueryBuilder<CustomerEntity>, query?: string): void {
    if (!query || typeof query !== 'string') return;
    const raw = query.trim();
    if (raw.length === 0) return;
    const normalized = raw.toLowerCase();
    const digits = normalizePhone(raw);
    const like = `%${normalized}%`;
    qb.andWhere(
      new Brackets((subQb) => {
        subQb
          .where('LOWER(customer.name) LIKE :q', { q: like })
          .orWhere('LOWER(customer.contactPhone) LIKE :q', { q: like });
        if (digits.length > 0) {
          subQb.orWhere('customer.contactPhone LIKE :p', { p: `%${digits}%` });
          if (/^[0-9]+$/.test(raw)) {
            subQb.orWhere('customer.contactPhone IS NOT NULL');
          }
        }
        subQb.orWhere('LOWER(ui.nickname) LIKE :q', { q: like });
      }),
    );
  }

  /**
   * 应用精确过滤（姓名/手机号/会员等级）
   */
  private applyExactFilters(
    qb: SelectQueryBuilder<CustomerEntity>,
    filters?: Readonly<{
      userState?: string;
      name?: string;
      contactPhone?: string;
      membershipLevel?: number;
    }>,
  ): void {
    if (!filters) return;
    if (filters.name) qb.andWhere('customer.name = :fname', { fname: filters.name });
    if (filters.contactPhone)
      qb.andWhere('customer.contactPhone = :fphone', { fphone: filters.contactPhone });
    if (typeof filters.membershipLevel === 'number')
      qb.andWhere('customer.membershipLevel = :flevel', { flevel: filters.membershipLevel });
    if (filters.userState) qb.andWhere('ui.userState = :fstate', { fstate: filters.userState });
  }

  /**
   * 内部接口：基于统一 PaginationService 的 CURSOR 分页
   * 保持 GraphQL 不变，仅供内部/专用接口调用
   * @param args 分页与筛选参数（CURSOR 模式）
   */
  async findCursorPage(args: {
    readonly limit: number;
    readonly after?: string;
    readonly before?: string; // 可选：上一页游标，支持回退翻页
    readonly includeDeleted?: boolean;
    readonly sorts?: ReadonlyArray<SortParam>;
  }): Promise<PaginatedResult<CustomerEntity>> {
    const qb = this.customerRepository.createQueryBuilder('customer');

    if (!args.includeDeleted) qb.where('customer.deactivatedAt IS NULL');

    const allowedSorts: ReadonlyArray<string> = ['name', 'id', 'createdAt', 'updatedAt'];
    const defaultSorts: ReadonlyArray<SortParam> = [
      { field: 'name', direction: 'ASC' },
      { field: 'id', direction: 'ASC' },
    ];

    const result = await this.paginationService.paginateQuery<CustomerEntity>({
      qb,
      params: {
        mode: 'CURSOR',
        limit: Math.min(args.limit, 100),
        after: args.after,
        before: args.before,
        sorts: args.sorts ?? defaultSorts,
      },
      allowedSorts,
      defaultSorts,
      cursorKey: { primary: 'name', tieBreaker: 'id' },
      sortResolver: this.customerSortResolver,
    });

    return result;
  }
}
