// src/modules/account/identities/training/customer/customer-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmSort } from '@src/infrastructure/typeorm/sort/typeorm-sort';
import { PaginationModule } from '@src/modules/common/pagination.module';
import { CustomerEntity } from './account-customer.entity';
import { CustomerService } from './account-customer.service';

/**
 * Customer Service 模块
 * 专门导出 CustomerService 供其他模块使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity]), PaginationModule],
  providers: [
    CustomerService,
    // Customer 域专用排序解析器（避免跨域共享默认解析器）
    {
      provide: 'CUSTOMER_SORT_RESOLVER',
      useFactory: () =>
        new TypeOrmSort(['name', 'id', 'createdAt', 'updatedAt'], {
          name: 'customer.name',
          id: 'customer.id',
          createdAt: 'customer.createdAt',
          updatedAt: 'customer.updatedAt',
        }),
    },
  ],
  exports: [CustomerService, 'CUSTOMER_SORT_RESOLVER'],
})
export class CustomerServiceModule {}
