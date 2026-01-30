// src/modules/account/identities/training/learner/learner-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmSort } from '@src/infrastructure/typeorm/sort/typeorm-sort';
import { PaginationModule } from '@src/modules/common/pagination.module';
import { LearnerEntity } from './account-learner.entity';
import { LearnerService } from './account-learner.service';

/**
 * Learner Service 模块
 * 专门导出 LearnerService 供 usecases 使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([LearnerEntity]), PaginationModule],
  providers: [
    LearnerService,
    /**
     * 创建 Learner 域专用排序解析器
     */
    {
      provide: 'LEARNER_SORT_RESOLVER',
      useFactory: () =>
        new TypeOrmSort(['name', 'id', 'createdAt', 'updatedAt'], {
          name: 'learner.name',
          id: 'learner.id',
          createdAt: 'learner.createdAt',
          updatedAt: 'learner.updatedAt',
        }),
    },
  ],
  exports: [LearnerService, 'LEARNER_SORT_RESOLVER'],
})
export class LearnerServiceModule {}
