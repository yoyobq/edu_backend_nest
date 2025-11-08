// src/modules/account/identities/training/coach/coach-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmSort } from '@src/infrastructure/typeorm/sort/typeorm-sort';
import { CoachEntity } from './account-coach.entity';
import { CoachService } from './coach.service';

/**
 * Coach Service 模块
 * 专门导出 CoachService 供其他模块使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CoachEntity])],
  providers: [
    CoachService,
    // 为 Coach 领域提供专用排序解析器，字段白名单与映射
    {
      provide: 'COACH_SORT_RESOLVER',
      useFactory: () =>
        new TypeOrmSort(['name', 'id', 'createdAt', 'updatedAt'], {
          name: 'coach.name',
          id: 'coach.id',
          createdAt: 'coach.createdAt',
          updatedAt: 'coach.updatedAt',
        }),
    },
  ],
  exports: [CoachService, 'COACH_SORT_RESOLVER'],
})
export class CoachServiceModule {}
