// src/modules/course/payout-series-rule/payout-series-rule-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutSeriesRuleEntity } from './payout-series-rule.entity';
import { PayoutSeriesRuleService } from './payout-series-rule.service';

/**
 * Payout Series Rule Service 模块
 * 专门导出 PayoutSeriesRuleService 供 usecases 使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([PayoutSeriesRuleEntity])],
  providers: [PayoutSeriesRuleService],
  exports: [PayoutSeriesRuleService],
})
export class PayoutSeriesRuleServiceModule {}
