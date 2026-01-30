// src/modules/payout-series-rule/payout-series-rule.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutSeriesRuleEntity } from './payout-series-rule.entity';
import { PayoutSeriesRuleService } from './payout-series-rule.service';
import { CourseSeriesModule } from '../series/course-series.module';
import { CoachServiceModule } from '@src/modules/account/identities/training/coach/coach-service.module';
import { PaginationModule } from '@src/modules/common/pagination.module';
import { SearchModule } from '@src/modules/common/search.module';

/**
 * 课程系列结算规则模块
 * 注册实体与服务，供 usecases 编排调用
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PayoutSeriesRuleEntity]),
    CourseSeriesModule,
    CoachServiceModule,
    // 提供 CURSOR_SIGNER 与 PAGINATOR 的绑定（用于 ListPayoutRulesUsecase 注入）
    PaginationModule,
    SearchModule,
  ],
  providers: [PayoutSeriesRuleService],
  exports: [TypeOrmModule, PayoutSeriesRuleService],
})
export class PayoutSeriesRuleModule {}
