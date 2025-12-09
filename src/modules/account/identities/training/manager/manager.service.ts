// src/modules/account/identities/training/manager/manager.service.ts

import { ACCOUNT_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ManagerEntity } from './account-manager.entity';

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
   * 检查 Manager 是否对目标 Customer 有授权
   * @param managerId Manager ID
   * @param customerId Customer ID
   * @param manager 事务管理器（可选）
   * @returns 是否有权限
   */
  async hasPermissionForCustomer(
    managerId: number,
    customerId: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const me = await this.findById(managerId, manager);
    if (!me) return false;
    if (me.deactivatedAt) return false;
    return true;
  }

  /**
   * 查询全部 Manager 列表（不分页）
   * @param includeDeleted 是否包含已停用数据
   * @param manager 可选事务管理器
   * @returns 全部 Manager 实体数组
   */
  async findAll(includeDeleted: boolean, manager?: EntityManager): Promise<ManagerEntity[]> {
    const repo = manager ? manager.getRepository(ManagerEntity) : this.managerRepository;
    const qb = repo.createQueryBuilder('m');
    if (!includeDeleted) {
      qb.andWhere('m.deactivatedAt IS NULL');
    }
    qb.orderBy('m.createdAt', 'DESC').addOrderBy('m.id', 'DESC');
    return await qb.getMany();
  }
}
