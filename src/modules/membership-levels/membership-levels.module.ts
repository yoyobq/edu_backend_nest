// src/modules/membership-levels/membership-levels.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipLevelEntity } from './membership-level.entity';
import { MembershipLevelsService } from './membership-levels.service';

/**
 * 会员等级模块
 * 暴露基础读写服务供 usecases 使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([MembershipLevelEntity])],
  providers: [MembershipLevelsService],
  exports: [MembershipLevelsService],
})
export class MembershipLevelsModule {}
