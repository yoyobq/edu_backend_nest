// src/modules/account/identities/training/customer/customer.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  async findByAccountId(accountId: number): Promise<CustomerEntity | null> {
    return await this.customerRepository.findOne({
      where: { accountId },
    });
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
   * 保存客户信息
   * @param customer 客户实体
   * @returns 保存后的客户实体
   */
  async saveCustomer(customer: CustomerEntity): Promise<CustomerEntity> {
    return await this.customerRepository.save(customer);
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
