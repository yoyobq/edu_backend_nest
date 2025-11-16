// src/usecases/course/financials/load-series-financials.usecase.ts
import { ClassMode, PublisherType } from '@app-types/models/course-series.types';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { decimalCompute } from '@core/common/numeric/decimal';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

export interface LoadSeriesFinancialsInput {
  readonly seriesId: number;
  readonly untilDate?: Date;
  readonly includeNonChargeable?: boolean;
  readonly session: UsecaseSession;
}

export interface SeriesFinancialsSummary {
  readonly seriesId: number;
  readonly seriesTitle: string;
  readonly classMode: ClassMode;
  readonly pricePerSession: string; // 两位小数的字符串表示
  readonly totalBillableUnits: number;
  readonly totalGrossAmount: string; // 两位小数的字符串表示
  readonly totalLearners: number;
}

export interface SeriesFinancialsByLearnerItem {
  readonly learnerId: number;
  readonly billableUnits: number;
  readonly grossAmount: string; // 两位小数
}

export interface SeriesFinancialsBySessionItem {
  readonly sessionId: number;
  readonly sessionDate: string; // ISO 日期字符串（仅日期部分）
  readonly billableUnits: number;
  readonly grossAmount: string; // 两位小数
}

export interface LoadSeriesFinancialsOutput {
  readonly summary: SeriesFinancialsSummary;
  readonly byLearner: ReadonlyArray<SeriesFinancialsByLearnerItem>;
  readonly bySession?: ReadonlyArray<SeriesFinancialsBySessionItem>;
  readonly detail?: ReadonlyArray<{
    seriesId: number;
    seriesTitle: string;
    learnerName: string;
    sessionId: number;
    sessionDate: string;
    learnerId: number;
    status: string;
    isBillable: boolean;
    pricePerSession: string;
    amount: string;
  }>;
}

/**
 * 加载系列收支预算视图用例
 *
 * 功能：
 * - 按系列聚合出勤与计费节数，计算总预算与明细分组
 * - 支持截止日期与是否展示不计费出勤的控制
 * - 权限：仅允许 MANAGER / FINANCE / 该系列主教练访问
 * - 额外输出二维明细 `detail`（Session × Learner）：便于前端按 session 或 learner 分组
 */
@Injectable()
export class LoadSeriesFinancialsUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 执行加载系列预算视图
   *
   * 输入参数：
   * - `seriesId`：系列 ID
   * - `untilDate?`：统计截止日期（含当天），不传则统计全部
   * - `includeNonChargeable?`：是否包含不计费出勤（默认 false）
   * - `session`：Usecase 会话（用于权限校验）
   *
   * 返回：
   * - `summary`：系列的总计费节数、总金额、学员数等汇总
   * - `byLearner`：维度为学员的聚合（每个学员的计费节数与金额）
   * - `bySession`：维度为节次的聚合（每个节次的计费节数与金额）
   * - `detail`：二维明细（Session × Learner），包含 `seriesTitle`、`learnerName`、`status`、`isBillable`、`amount`
   */
  async execute(input: LoadSeriesFinancialsInput): Promise<LoadSeriesFinancialsOutput> {
    const series = await this.loadSeries(input.seriesId);
    await this.assertAccess(series.id, series.publisherType, series.publisherId, input.session);
    const priceStr = series.pricePerSession ?? '0.00';
    const priceNum = Number(priceStr);
    const bySessionAgg = await this.attendanceService.aggregateSeriesBySession({
      seriesId: input.seriesId,
      untilDate: input.untilDate,
      includeNonChargeable: input.includeNonChargeable === true,
    });
    const byLearnerAgg = await this.attendanceService.aggregateSeriesByLearner({
      seriesId: input.seriesId,
      untilDate: input.untilDate,
      includeNonChargeable: input.includeNonChargeable === true,
    });
    const summary = this.buildSummary(
      series,
      priceStr,
      priceNum,
      byLearnerAgg.map((x) => ({ billableUnits: x.billableUnits, learnerId: x.learnerId })),
    );
    const byLearner = byLearnerAgg.map((x) => ({
      learnerId: x.learnerId,
      billableUnits: x.billableUnits,
      grossAmount: decimalCompute({
        op: 'mul',
        a: priceNum,
        b: x.billableUnits,
        outScale: 2,
      }).toFixed(2),
    }));
    const bySession = bySessionAgg.map((x) => ({
      sessionId: x.sessionId,
      sessionDate: x.sessionDate.toISOString().slice(0, 10),
      billableUnits: x.billableUnits,
      grossAmount: decimalCompute({
        op: 'mul',
        a: priceNum,
        b: x.billableUnits,
        outScale: 2,
      }).toFixed(2),
    }));
    const rawRows = await this.attendanceService.listSeriesSessionLearnerRows({
      seriesId: input.seriesId,
      untilDate: input.untilDate,
      includeNonChargeable: input.includeNonChargeable === true,
    });
    const detail = rawRows.map((r) => ({
      seriesId: r.seriesId,
      seriesTitle: r.seriesTitle,
      learnerName: r.learnerName,
      sessionId: r.sessionId,
      sessionDate: r.sessionDate.toISOString().slice(0, 10),
      learnerId: r.learnerId,
      status: String(r.status),
      isBillable: r.billableUnits > 0,
      pricePerSession: r.pricePerSession,
      amount: decimalCompute({
        op: 'mul',
        a: Number(r.pricePerSession),
        b: r.billableUnits,
        outScale: 2,
      }).toFixed(2),
    }));
    return { summary, byLearner, bySession, detail };
  }

  /**
   * 加载系列实体并校验存在性
   * @param seriesId 系列 ID
   * @returns 系列实体
   * @throws DomainError 当系列不存在或不可访问
   */
  private async loadSeries(seriesId: number) {
    const series = await this.seriesService.findById(seriesId);
    if (!series) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '系列不存在或不可访问');
    }
    return series;
  }

  /**
   * 构建系列预算汇总信息
   * @param series 系列实体
   * @param priceStr 每节价格的字符串（两位小数）
   * @param priceNum 每节价格的数值形式
   * @param rows 按学员聚合的计费节数（仅用于计算与统计学员数）
   * @returns 系列预算汇总视图
   */
  private buildSummary(
    series: Awaited<ReturnType<typeof this.loadSeries>>,
    priceStr: string,
    priceNum: number,
    rows: ReadonlyArray<{ billableUnits: number; learnerId: number }>,
  ): SeriesFinancialsSummary {
    const totalBillableUnits = rows.reduce((acc, x) => acc + x.billableUnits, 0);
    const totalGrossNumber = decimalCompute({
      op: 'mul',
      a: priceNum,
      b: totalBillableUnits,
      outScale: 2,
    });
    const totalGrossAmount = totalGrossNumber.toFixed(2);
    const learnerSet = new Set<number>();
    for (const x of rows) {
      if (x.billableUnits > 0) learnerSet.add(x.learnerId);
    }
    return {
      seriesId: series.id,
      seriesTitle: series.title,
      classMode: series.classMode,
      pricePerSession: priceStr,
      totalBillableUnits,
      totalGrossAmount,
      totalLearners: learnerSet.size,
    };
  }

  /**
   * 权限校验：允许 MANAGER / FINANCE / 该系列主教练访问
   * @param seriesId 系列 ID
   * @param publisherType 发布者类型
   * @param publisherId 发布者在身份表的 ID
   * @param session Usecase 会话
   * @throws DomainError 当权限不足或教练身份不匹配
   */
  private async assertAccess(
    seriesId: number,
    publisherType: PublisherType,
    publisherId: number,
    session: UsecaseSession,
  ): Promise<void> {
    const rolesUpper = (session.roles ?? []).map((r) => String(r).toUpperCase());
    const isManager = rolesUpper.includes('MANAGER');
    const isFinance = rolesUpper.includes('FINANCE');
    if (isManager || isFinance) return;

    const isCoach = rolesUpper.includes('COACH');
    if (!isCoach) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '无权限查看系列预算');
    }

    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定教练身份');
    }

    const ownedByCoach = publisherType === PublisherType.COACH && publisherId === coach.id;
    if (!ownedByCoach) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '仅允许查看自身系列的预算');
    }
  }
}
