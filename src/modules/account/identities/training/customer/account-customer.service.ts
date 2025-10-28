// src/modules/account/identities/training/customer/customer.service.ts

import { ACCOUNT_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
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
}
