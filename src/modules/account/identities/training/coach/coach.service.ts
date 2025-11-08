// src/modules/account/identities/training/coach/coach.service.ts

import { ACCOUNT_ERROR, DomainError } from '@core/common/errors/domain-error';
import type { ISortResolver } from '@core/sort/sort.ports';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { CoachEntity } from './account-coach.entity';

/**
 * 创建 Coach 的参数
 */
export interface CreateCoachParams {
  /** 关联的账户 ID */
  accountId: number;
  /** 教练姓名 */
  name: string;
  /** 教练等级，默认为 1 */
  level?: number;
  /** 对外展示的简介/推介 */
  description?: string | null;
  /** 教练头像 URL */
  avatarUrl?: string | null;
  /** 教练专长，如篮球/游泳/体能 */
  specialty?: string | null;
  /** 内部备注，不对外展示 */
  remark?: string | null;
  /** 创建者 ID */
  createdBy?: number | null;
}

/**
 * Coach 服务层
 * 提供 Coach 实体的 CRUD 操作和业务逻辑
 */
@Injectable()
export class CoachService {
  constructor(
    @InjectRepository(CoachEntity)
    private readonly coachRepository: Repository<CoachEntity>,
    // Coach 域专用排序解析器（供分页使用）
    @Inject('COACH_SORT_RESOLVER') private readonly coachSortResolver: ISortResolver,
  ) {}

  /**
   * 根据账户 ID 查找 Coach
   * @param accountId 账户 ID
   * @param manager 可选的事务管理器
   * @returns Coach 实体或 null
   */
  async findByAccountId(accountId: number, manager?: EntityManager): Promise<CoachEntity | null> {
    const repo = manager ? manager.getRepository(CoachEntity) : this.coachRepository;
    return await repo.findOne({ where: { accountId } });
  }

  /**
   * 根据 ID 查找 Coach
   * @param id Coach ID
   * @param manager 可选的事务管理器
   * @returns Coach 实体或 null
   */
  async findById(id: number, manager?: EntityManager): Promise<CoachEntity | null> {
    const repo = manager ? manager.getRepository(CoachEntity) : this.coachRepository;
    return await repo.findOne({ where: { id } });
  }

  /**
   * 创建 Coach 实体（幂等操作）
   * 如果已存在则返回现有实体，不会重复创建
   * @param params 创建参数
   * @param manager 可选的事务管理器
   * @returns 创建或已存在的 Coach 实体和是否为新创建的标识
   */
  async createCoach(
    params: CreateCoachParams,
    manager?: EntityManager,
  ): Promise<{ coach: CoachEntity; isNewlyCreated: boolean }> {
    const repo = manager ? manager.getRepository(CoachEntity) : this.coachRepository;

    // 幂等性检查：如果已存在则直接返回
    const existingCoach = await repo.findOne({ where: { accountId: params.accountId } });
    if (existingCoach) {
      return { coach: existingCoach, isNewlyCreated: false };
    }

    // 创建新的 Coach 实体
    const coachEntity = repo.create({
      accountId: params.accountId,
      name: params.name,
      level: params.level ?? 1,
      description: params.description ?? null,
      avatarUrl: params.avatarUrl ?? null,
      specialty: params.specialty ?? null,
      remark: params.remark ?? null,
      deactivatedAt: null, // 新创建的 Coach 默认为激活状态
      createdBy: params.createdBy ?? null,
      updatedBy: params.createdBy ?? null,
    });

    try {
      const savedCoach = await repo.save(coachEntity);
      return { coach: savedCoach, isNewlyCreated: true };
    } catch (error) {
      // 处理并发创建的情况
      if (error instanceof Error && error.message.includes('Duplicate entry')) {
        // 重新查询已存在的实体
        const existingCoach = await repo.findOne({ where: { accountId: params.accountId } });
        if (existingCoach) {
          return { coach: existingCoach, isNewlyCreated: false };
        }
      }

      throw new DomainError(
        ACCOUNT_ERROR.REGISTRATION_FAILED,
        `创建 Coach 实体失败: ${error instanceof Error ? error.message : '未知错误'}`,
        { accountId: params.accountId },
        error,
      );
    }
  }

  /**
   * 更新 Coach 实体
   * @param id Coach ID
   * @param updateData 更新数据
   * @param manager 可选的事务管理器
   * @returns 更新后的 Coach 实体
   */
  async updateCoach(
    id: number,
    updateData: Partial<Omit<CoachEntity, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>>,
    manager?: EntityManager,
  ): Promise<CoachEntity> {
    const repo = manager ? manager.getRepository(CoachEntity) : this.coachRepository;

    const coach = await repo.findOne({ where: { id } });
    if (!coach) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, `Coach 不存在: ID=${id}`);
    }

    // 合并更新数据
    Object.assign(coach, updateData);

    try {
      return await repo.save(coach);
    } catch (error) {
      throw new DomainError(
        ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
        `更新 Coach 实体失败: ${error instanceof Error ? error.message : '未知错误'}`,
        { id, updateData },
        error,
      );
    }
  }

  /**
   * 软删除 Coach（设置 deactivatedAt）
   * @param id Coach ID
   * @param deactivatedBy 操作者 ID
   * @param manager 可选的事务管理器
   * @returns 更新后的 Coach 实体
   */
  async deactivateCoach(
    id: number,
    deactivatedBy: number,
    manager?: EntityManager,
  ): Promise<CoachEntity> {
    return await this.updateCoach(
      id,
      {
        deactivatedAt: new Date(),
        updatedBy: deactivatedBy,
      },
      manager,
    );
  }

  /**
   * 重新激活 Coach（清除 deactivatedAt）
   * @param id Coach ID
   * @param reactivatedBy 操作者 ID
   * @param manager 可选的事务管理器
   * @returns 更新后的 Coach 实体
   */
  async reactivateCoach(
    id: number,
    reactivatedBy: number,
    manager?: EntityManager,
  ): Promise<CoachEntity> {
    return await this.updateCoach(
      id,
      {
        deactivatedAt: null,
        updatedBy: reactivatedBy,
      },
      manager,
    );
  }

  /**
   * 检查 Coach 是否存在且激活
   * @param accountId 账户 ID
   * @param manager 可选的事务管理器
   * @returns 是否存在且激活
   */
  async isActiveCoach(accountId: number, manager?: EntityManager): Promise<boolean> {
    const coach = await this.findByAccountId(accountId, manager);
    return coach !== null && coach.deactivatedAt === null;
  }

  /**
   * 获取 Coach 的统计信息
   * @param manager 可选的事务管理器
   * @returns 统计信息
   */
  async getCoachStats(manager?: EntityManager): Promise<{
    total: number;
    active: number;
    deactivated: number;
  }> {
    const repo = manager ? manager.getRepository(CoachEntity) : this.coachRepository;

    const [total, active] = await Promise.all([
      repo.count(),
      repo.count({ where: { deactivatedAt: IsNull() } }),
    ]);

    return {
      total,
      active,
      deactivated: total - active,
    };
  }

  /**
   * 分页查询教练列表（OFFSET 模式，兼容现有 GraphQL 列表返回）
   * @param params 分页查询参数对象
   * @returns 分页查询结果对象
   */
  async findPaginated(params: {
    readonly page?: number;
    readonly limit?: number;
    readonly sortBy?: 'createdAt' | 'updatedAt' | 'name';
    readonly sortOrder?: 'ASC' | 'DESC';
    readonly includeDeleted?: boolean;
  }): Promise<{
    readonly coaches: CoachEntity[];
    readonly total: number;
    readonly page: number;
    readonly limit: number;
    readonly totalPages: number;
  }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      includeDeleted = false,
    } = params;

    const actualLimit = Math.min(limit, 100);
    const qb = this.coachRepository.createQueryBuilder('coach');

    // 过滤停用记录
    if (!includeDeleted) {
      qb.where('coach.deactivatedAt IS NULL');
    }

    // 排序（使用域解析器，防注入；并补充稳定副键）
    const primaryColumn =
      this.coachSortResolver.resolveColumn(sortBy) ??
      this.coachSortResolver.resolveColumn('createdAt');
    if (primaryColumn) qb.orderBy(primaryColumn, sortOrder);
    const tieBreaker = this.coachSortResolver.resolveColumn('id');
    if (tieBreaker) qb.addOrderBy(tieBreaker, sortOrder);

    // 统计总数（克隆一个用于 COUNT 的查询，避免 ORDER BY 干扰）
    const countQb = qb.clone();
    const total = await countQb.getCount();

    // 应用分页
    qb.take(actualLimit).skip((page - 1) * actualLimit);
    const coaches = await qb.getMany();

    const totalPages = Math.ceil(total / actualLimit) || 1;
    return { coaches, total, page, limit: actualLimit, totalPages };
  }
}
