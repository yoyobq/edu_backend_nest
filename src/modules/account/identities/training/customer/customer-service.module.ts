// src/modules/account/identities/training/customer/customer-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from './account-customer.entity';
import { CustomerService } from './account-customer.service';

/**
 * Customer Service 模块
 * 专门导出 CustomerService 供其他模块使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity])],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerServiceModule {}
