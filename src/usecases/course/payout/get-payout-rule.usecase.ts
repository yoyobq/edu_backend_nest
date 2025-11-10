// src/usecases/course/payout/get-payout-rule.usecase.ts
import { PublisherType } from '@app-types/models/course-series.types';
import { DomainError, PAYOUT_RULE_ERROR, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 获取结算规则用例
 *
 * 根据规则 ID 或系列 ID 返回规则。系列 ID 查询仅适用于课程绑定规则。
 */
@Injectable()
export class GetPayoutRuleUsecase {
  constructor(
    private readonly ruleService: PayoutSeriesRuleService,
    private readonly seriesService: CourseSeriesService,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 按 ID 获取
   * @param args 查询参数对象
   */
  async byId(args: { readonly id: number }): Promise<PayoutSeriesRuleEntity> {
    const found = await this.ruleService.findById(args.id);
    if (!found) {
      throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '结算规则不存在');
    }
    return found;
  }

  /**
   * 按系列 ID 获取（仅课程绑定规则）
   * @param args 查询参数对象
   */
  async bySeries(args: {
    readonly seriesId: number;
    readonly session?: UsecaseSession;
  }): Promise<PayoutSeriesRuleEntity> {
    // 若为 coach 角色，校验该系列归属当前教练
    if (args.session?.roles?.some((r) => String(r).toUpperCase() === 'COACH')) {
      const series = await this.seriesService.findById(args.seriesId);
      if (!series) {
        // 避免资源探测，直接返回权限错误
        throw new DomainError(
          PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
          '仅允许查询自身课程系列的结算规则',
        );
      }
      const coach = await this.coachService.findByAccountId(args.session.accountId);
      if (!coach) {
        throw new DomainError(
          PERMISSION_ERROR.ACCESS_DENIED,
          '当前账户未绑定教练身份，无法查询系列结算规则',
        );
      }
      const ownedByCoach =
        series.publisherType === PublisherType.COACH && series.publisherId === coach.id;
      if (!ownedByCoach) {
        throw new DomainError(
          PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
          '仅允许查询自身课程系列的结算规则',
        );
      }
    }
    const found = await this.ruleService.findBySeriesId(args.seriesId);
    if (!found) {
      throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '该课程系列未绑定结算规则');
    }
    return found;
  }
}
