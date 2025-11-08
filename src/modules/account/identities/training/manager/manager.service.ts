// src/modules/account/identities/training/manager/manager.service.ts

import { ACCOUNT_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ManagerEntity } from './account-manager.entity';
import { OrderDirection } from '@src/types/common/sort.types';

/**
 * Manager 服务层
 * 提供 Manager 实体的 CRUD 操作和业务逻辑
 */
@Injectable()
export class ManagerService {
  constructor(
    @InjectRepository(ManagerEntity)
    private readonly managerRepository: Repository<ManagerEntity>,
  ) {}

  /**
   * 根据账户 ID 查找 Manager
   * @param accountId 账户 ID
   * @param manager 可选的事务管理器
   * @returns Manager 实体或 null
   */
  async findByAccountId(accountId: number, manager?: EntityManager): Promise<ManagerEntity | null> {
    const repo = manager ? manager.getRepository(ManagerEntity) : this.managerRepository;
    return await repo.findOne({ where: { accountId } });
  }

  /**
   * 根据 ID 查找 Manager
   * @param id Manager ID
   * @param manager 可选的事务管理器
   * @returns Manager 实体或 null
   */
  async findById(id: number, manager?: EntityManager): Promise<ManagerEntity | null> {
    const repo = manager ? manager.getRepository(ManagerEntity) : this.managerRepository;
    return await repo.findOne({ where: { id } });
  }

  /**
   * 检查是否为活跃的 Manager
   * @param accountId 账户 ID
   * @param manager 可选的事务管理器
   * @returns 是否为活跃的 Manager
   */
  async isActiveManager(accountId: number, manager?: EntityManager): Promise<boolean> {
    const managerEntity = await this.findByAccountId(accountId, manager);
    return managerEntity !== null && managerEntity.deactivatedAt === null;
  }

  /**
   * 创建 Manager 实体（幂等操作）
   * 如果已存在则返回现有实体，不会重复创建
   * @param managerData Manager 数据
   * @param manager 可选的事务管理器
   * @returns 创建或已存在的 Manager 实体和是否为新创建的标识
   */
  async createManager(
    managerData: {
      accountId: number;
      name: string;
      remark?: string | null;
      createdBy?: number | null;
    },
    manager?: EntityManager,
  ): Promise<{ manager: ManagerEntity; isNewlyCreated: boolean }> {
    const repo = manager ? manager.getRepository(ManagerEntity) : this.managerRepository;

    // 幂等性检查：如果已存在则直接返回
    const existingManager = await this.findByAccountId(managerData.accountId, manager);
    if (existingManager) {
      return { manager: existingManager, isNewlyCreated: false };
    }

    // 创建新的 Manager 实体
    const newManager = repo.create({
      accountId: managerData.accountId,
      name: managerData.name,
      deactivatedAt: null,
      remark: managerData.remark || null,
      createdBy: managerData.createdBy || null,
      updatedBy: null,
    });

    try {
      const savedManager = await repo.save(newManager);
      return { manager: savedManager, isNewlyCreated: true };
    } catch (error) {
      // 处理并发创建的情况
      if (error instanceof Error && error.message.includes('Duplicate entry')) {
        // 重新查询已存在的实体
        const existingManager = await this.findByAccountId(managerData.accountId, manager);
        if (existingManager) {
          return { manager: existingManager, isNewlyCreated: false };
        }
      }

      throw new DomainError(
        ACCOUNT_ERROR.REGISTRATION_FAILED,
        `创建 Manager 实体失败: ${error instanceof Error ? error.message : '未知错误'}`,
        { accountId: managerData.accountId },
        error,
      );
    }
  }

  /**
   * 重新激活 Manager
   * @param managerId Manager ID
   * @param updatedBy 更新者 ID
   * @param manager 可选的事务管理器
   */
  async reactivateManager(
    managerId: number,
    updatedBy: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(ManagerEntity) : this.managerRepository;
    await repo.update(managerId, {
      deactivatedAt: null,
      updatedBy,
      updatedAt: new Date(),
    });
  }

  /**
   * 停用 Manager
   * @param managerId Manager ID
   * @param updatedBy 更新者 ID
   * @param manager 可选的事务管理器
   */
  async deactivateManager(
    managerId: number,
    updatedBy: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(ManagerEntity) : this.managerRepository;
    await repo.update(managerId, {
      deactivatedAt: new Date(),
      updatedBy,
      updatedAt: new Date(),
    });
  }

  /**
   * 更新 Manager 信息
   * @param managerId Manager ID
   * @param updateData 更新数据
   * @param manager 可选的事务管理器
   */
  async updateManager(
    managerId: number,
    updateData: {
      name?: string;
      remark?: string | null;
      updatedBy?: number | null;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(ManagerEntity) : this.managerRepository;
    await repo.update(managerId, {
      ...updateData,
      updatedAt: new Date(),
    });
  }

  /**
   * 分页查询 Manager 列表
   * @param params 查询参数
   * @param params.page 页码，从 1 开始
   * @param params.limit 每页数量，默认 10，最大 100
   * @param params.sortBy 排序字段（createdAt / updatedAt / name）
   * @param params.sortOrder 排序方向（ASC / DESC）
   * @param params.includeDeleted 是否包含已停用数据
   * @param manager 可选事务管理器
   * @returns 分页结果（列表、总数、页码、每页、总页数）
   */
  async findPaginated(
    params: {
      page: number;
      limit: number;
      sortBy: 'createdAt' | 'updatedAt' | 'name';
      sortOrder: OrderDirection;
      includeDeleted: boolean;
    },
    manager?: EntityManager,
  ): Promise<{
    managers: ManagerEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const repo = manager ? manager.getRepository(ManagerEntity) : this.managerRepository;

    const page = Math.max(1, params.page);
    const limit = Math.min(Math.max(1, params.limit), 100);

    const qb = repo.createQueryBuilder('m');

    if (!params.includeDeleted) {
      qb.andWhere('m.deactivatedAt IS NULL');
    }

    const sortField = params.sortBy;
    const sortOrder = params.sortOrder === OrderDirection.ASC ? 'ASC' : 'DESC';
    qb.orderBy(`m.${sortField}`, sortOrder);

    qb.skip((page - 1) * limit).take(limit);

    const [entities, total] = await qb.getManyAndCount();

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      managers: entities,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
