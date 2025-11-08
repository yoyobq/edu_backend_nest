// src/modules/payout-series-rule/payout-series-rule.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutSeriesRuleEntity } from './payout-series-rule.entity';
import { PayoutSeriesRuleService } from './payout-series-rule.service';

/**
 * 课程系列结算规则模块
 * 注册实体与服务，供 usecases 编排调用
 */
@Module({
  imports: [TypeOrmModule.forFeature([PayoutSeriesRuleEntity])],
  providers: [PayoutSeriesRuleService],
  exports: [TypeOrmModule, PayoutSeriesRuleService],
})
export class PayoutSeriesRuleModule {}
