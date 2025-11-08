// src/modules/member-membership-levels/member-membership-levels.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberMembershipLevelEntity } from './member-membership-level.entity';
import { MemberMembershipLevelsService } from './member-membership-levels.service';

/**
 * 会员等级模块
 * 暴露基础读写服务供 usecases 使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([MemberMembershipLevelEntity])],
  providers: [MemberMembershipLevelsService],
  exports: [MemberMembershipLevelsService],
})
export class MemberMembershipLevelsModule {}
