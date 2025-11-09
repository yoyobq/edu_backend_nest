// src/modules/payout-series-rule/payout-series-rule.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutSeriesRuleEntity } from './payout-series-rule.entity';
import { PayoutSeriesRuleService } from './payout-series-rule.service';
import { CreatePayoutRuleUsecase } from '@src/usecases/course/payout/create-payout-rule.usecase';
import { UpdatePayoutRuleUsecase } from '@src/usecases/course/payout/update-payout-rule.usecase';
import { DeletePayoutRuleUsecase } from '@src/usecases/course/payout/delete-payout-rule.usecase';
import { GetPayoutRuleUsecase } from '@src/usecases/course/payout/get-payout-rule.usecase';
import { ListPayoutRulesUsecase } from '@src/usecases/course/payout/list-payout-rules.usecase';
import { ReactivatePayoutRuleUsecase } from '@src/usecases/course/payout/reactivate-payout-rule.usecase';
import { DeactivatePayoutRuleUsecase } from '@src/usecases/course/payout/deactivate-payout-rule.usecase';
import { BindPayoutRuleUsecase } from '@src/usecases/course/payout/bind-payout-rule.usecase';
import { UnbindPayoutRuleUsecase } from '@src/usecases/course/payout/unbind-payout-rule.usecase';
import { CourseSeriesModule } from '../series/course-series.module';
import { SearchModule } from '@src/modules/common/search.module';

/**
 * 课程系列结算规则模块
 * 注册实体与服务，供 usecases 编排调用
 */
@Module({
  imports: [TypeOrmModule.forFeature([PayoutSeriesRuleEntity]), CourseSeriesModule, SearchModule],
  providers: [
    PayoutSeriesRuleService,
    // CRUD & 操作用例
    CreatePayoutRuleUsecase,
    UpdatePayoutRuleUsecase,
    DeletePayoutRuleUsecase,
    GetPayoutRuleUsecase,
    ListPayoutRulesUsecase,
    ReactivatePayoutRuleUsecase,
    DeactivatePayoutRuleUsecase,
    BindPayoutRuleUsecase,
    UnbindPayoutRuleUsecase,
  ],
  exports: [
    TypeOrmModule,
    PayoutSeriesRuleService,
    CreatePayoutRuleUsecase,
    UpdatePayoutRuleUsecase,
    DeletePayoutRuleUsecase,
    GetPayoutRuleUsecase,
    ListPayoutRulesUsecase,
    ReactivatePayoutRuleUsecase,
    DeactivatePayoutRuleUsecase,
    BindPayoutRuleUsecase,
    UnbindPayoutRuleUsecase,
  ],
})
export class PayoutSeriesRuleModule {}
