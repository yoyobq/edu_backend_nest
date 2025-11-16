// src/usecases/course/financials/load-learner-financials.usecase.ts
/**
 * 学员消费视图用例
 *
 * 功能：
 * - 按系列聚合学员的出勤计费条目，计算各系列金额与总金额
 * - 返回明细行（可下钻到具体节次），便于前端按系列或节次分组
 * - 权限：允许 MANAGER / FINANCE / 学员本人访问
 */
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
// import { ClassMode } from '@app-types/models/course-series.types';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { decimalCompute } from '@core/common/numeric/decimal';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';

import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

export interface LoadLearnerFinancialsInput {
  readonly learnerId: number;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly seriesId?: number;
  readonly session: UsecaseSession;
}

export interface LearnerFinancialsBySeriesItem {
  readonly seriesId: number;
  readonly seriesTitle: string;
  readonly billableUnits: number;
  readonly grossAmount: string;
}

export interface LearnerFinancialsDetailItem {
  readonly sessionId: number;
  readonly date: string;
  readonly seriesId: number;
  readonly seriesTitle: string;
  readonly status: ParticipationAttendanceStatus;
  readonly isBillable: boolean;
  readonly amount: string;
}

export interface LoadLearnerFinancialsOutput {
  readonly learnerId: number;
  readonly learnerName: string;
  readonly totalGrossAmount: string;
  readonly bySeries: ReadonlyArray<LearnerFinancialsBySeriesItem>;
  readonly detail?: ReadonlyArray<LearnerFinancialsDetailItem>;
}

@Injectable()
export class LoadLearnerFinancialsUsecase {
  constructor(
    private readonly learnerService: LearnerService,
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 执行加载学员消费汇总
   *
   * 输入参数：
   * - `learnerId`：学员 ID
   * - `fromDate?` / `toDate?`：统计时间范围（闭区间），不传统计全部
   * - `seriesId?`：限定某个系列（可选）
   * - `session`：Usecase 会话（用于权限校验）
   *
   * 返回：
   * - `bySeries`：维度为系列的聚合（计费单位与金额）
   * - `detail`：明细行（含 `sessionId`、`date`、`seriesTitle`、`status`、`isBillable`、`amount`）
   * - `totalGrossAmount`：总金额（按 `bySeries` 汇总）
   */
  async execute(input: LoadLearnerFinancialsInput): Promise<LoadLearnerFinancialsOutput> {
    const learner = await this.loadLearner(input.learnerId);
    await this.assertAccess(learner.id, input.session);
    const bySeriesAgg = await this.attendanceService.aggregateLearnerBySeries({
      learnerId: learner.id,
      fromDate: input.fromDate,
      toDate: input.toDate,
      seriesId: input.seriesId,
    });
    const bySeries = bySeriesAgg.map((r) => ({
      seriesId: r.seriesId,
      seriesTitle: r.seriesTitle,
      billableUnits: r.billableUnits,
      grossAmount: decimalCompute({
        op: 'mul',
        a: Number(r.pricePerSession),
        b: r.billableUnits,
        outScale: 2,
      }).toFixed(2),
    }));
    const totalGrossAmount = this.computeTotal(bySeries);
    const detailRows = await this.attendanceService.listLearnerFinancialRows({
      learnerId: learner.id,
      fromDate: input.fromDate,
      toDate: input.toDate,
      seriesId: input.seriesId,
    });
    const detail = this.buildDetailRowsToDto(detailRows);
    return { learnerId: learner.id, learnerName: learner.name, totalGrossAmount, bySeries, detail };
  }

  /**
   * 加载学员实体并校验存在性
   * @param learnerId 学员 ID
   * @returns 学员实体
   * @throws DomainError 当学员不存在或不可访问
   */
  private async loadLearner(learnerId: number) {
    const learner = await this.learnerService.findById(learnerId);
    if (!learner) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '学员不存在或不可访问');
    }
    return learner;
  }

  /**
   * 计算总金额（基于系列聚合的金额字段）
   * @param bySeries 系列聚合结果
   * @returns 两位小数字符串
   */
  private computeTotal(bySeries: ReadonlyArray<{ grossAmount: string }>): string {
    return bySeries.reduce((acc, x) => acc + Number(x.grossAmount), 0).toFixed(2);
  }

  /**
   * 将查询到的明细行转换为 DTO
   * @param rows 明细行（含价格与计费单位）
   * @returns 前端展示的明细 DTO
   */
  private buildDetailRowsToDto(
    rows: ReadonlyArray<{
      sessionId: number;
      date: Date;
      seriesId: number;
      seriesTitle: string;
      pricePerSession: string;
      status: ParticipationAttendanceStatus;
      billableUnits: number;
    }>,
  ): LearnerFinancialsDetailItem[] {
    return rows.map((r) => ({
      sessionId: r.sessionId,
      date: r.date.toISOString().slice(0, 10),
      seriesId: r.seriesId,
      seriesTitle: r.seriesTitle,
      status: r.status,
      isBillable: r.billableUnits > 0,
      amount: decimalCompute({
        op: 'mul',
        a: Number(r.pricePerSession),
        b: r.billableUnits,
        outScale: 2,
      }).toFixed(2),
    }));
  }

  /**
   * 权限校验：允许 MANAGER / FINANCE / 学员本人访问
   * @param learnerId 学员 ID
   * @param session Usecase 会话
   * @throws DomainError 当权限不足时抛出
   */
  private async assertAccess(learnerId: number, session: UsecaseSession): Promise<void> {
    const rolesUpper = (session.roles ?? []).map((r) => String(r).toUpperCase());
    if (rolesUpper.includes('MANAGER') || rolesUpper.includes('FINANCE')) return;
    // 学员本人
    const learner = await this.learnerService.findByAccountId(session.accountId);
    if (learner && learner.id === learnerId) return;
    // 相关教练：基于系列归属判断需要额外 context，这里简化为拒绝，由上层提供教练视角接口
    throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '无权限查看该学员消费');
  }
}
