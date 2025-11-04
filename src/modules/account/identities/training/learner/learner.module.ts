// src/modules/account/identities/training/learner/learner.module.ts

// src/modules/account/identities/training/learner/learner.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmSortResolver } from '@src/infrastructure/typeorm/sort/typeorm-sort';
import { PaginationModule } from '@src/modules/common/pagination.module';
import { PROFILE_PROVIDER_TOKEN } from '../../../base/constants/provider-tokens';
import { LearnerEntity } from './account-learner.entity';
import { LearnerService } from './account-learner.service';
import { LearnerProfileProvider } from './learner-profile.provider';

/**
 * Learner 身份包
 * - 提供 LearnerEntity 的 repository
 * - 提供 LearnerService 服务
 * - 使用"唯一身份 token"注册 Provider
 */
@Module({
  imports: [TypeOrmModule.forFeature([LearnerEntity]), PaginationModule],
  providers: [
    // Learner 域服务
    LearnerService,
    // Learner 身份 Profile Provider（唯一身份 token 注册）
    { provide: PROFILE_PROVIDER_TOKEN.LEARNER, useClass: LearnerProfileProvider },
    // Learner 域专用排序解析器（避免跨域共享默认解析器）
    {
      provide: 'LEARNER_SORT_RESOLVER',
      useFactory: () =>
        new TypeOrmSortResolver(['name', 'id', 'createdAt', 'updatedAt'], {
          name: 'learner.name',
          id: 'learner.id',
          createdAt: 'learner.createdAt',
          updatedAt: 'learner.updatedAt',
        }),
    },
  ],
  exports: [TypeOrmModule, LearnerService, PROFILE_PROVIDER_TOKEN.LEARNER, 'LEARNER_SORT_RESOLVER'],
})
export class LearnerIdentityModule {}
