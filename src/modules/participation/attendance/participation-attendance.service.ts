// src/modules/participation-attendance/participation-attendance.service.ts
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { ParticipationAttendanceRecordEntity } from './participation-attendance-record.entity';

/**
 * 出勤记录写入参数（按 session + learner 定位）
 */
type UpsertSessionLearnerInput = {
  sessionId: number;
  learnerId: number;
  enrollmentId: number;
  countApplied?: string;
  status?: ParticipationAttendanceStatus;
  confirmedByCoachId?: number | null;
  confirmedAt?: Date | null;
  finalizedBy?: number | null;
  finalizedAt?: Date | null;
  remark?: string | null;
};

/**
 * 出勤记录写入参数（按 enrollment 定位）
 */
type UpsertEnrollmentInput = {
  enrollmentId: number;
  sessionId: number;
  learnerId: number;
  countApplied?: string;
  status?: ParticipationAttendanceStatus;
  confirmedByCoachId?: number | null;
  confirmedAt?: Date | null;
  finalizedBy?: number | null;
  finalizedAt?: Date | null;
  remark?: string | null;
};

type BulkUpsertDecision =
  | { action: 'insert'; data: Partial<ParticipationAttendanceRecordEntity> }
  | { action: 'update'; id: number; patch: Partial<ParticipationAttendanceRecordEntity> }
  | { action: 'unchanged' };

export type UnfinalizedAttendanceSeriesSummary = {
  readonly catalogId: number;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
};

/**
 * 出勤记录服务
 * 提供出勤记录的基础读写能力（供 usecases 编排复用）
 */
@Injectable()
export class ParticipationAttendanceService {
  constructor(
    @InjectRepository(ParticipationAttendanceRecordEntity)
    private readonly attendanceRepository: Repository<ParticipationAttendanceRecordEntity>,
  ) {}

  /**
   * 按 ID 查询出勤记录
   * @param id 记录 ID
   */
  async findById(id: number): Promise<ParticipationAttendanceRecordEntity | null> {
    return this.attendanceRepository.findOne({ where: { id } });
  }

  /**
   * 按复合唯一键查询（session_id + learner_id）
   * @param params 查询参数：sessionId 与 learnerId
   */
  async findBySessionLearner(params: {
    sessionId: number;
    learnerId: number;
  }): Promise<ParticipationAttendanceRecordEntity | null> {
    return this.attendanceRepository.findOne({
      where: {
        sessionId: params.sessionId,
        learnerId: params.learnerId,
      },
    });
  }

  /**
   * 按唯一键 enrollment_id 查询
   * @param enrollmentId 报名 ID
   */
  async findByEnrollmentId(
    enrollmentId: number,
  ): Promise<ParticipationAttendanceRecordEntity | null> {
    return this.attendanceRepository.findOne({ where: { enrollmentId } });
  }

  /**
   * 按节次查询所有出勤记录
   * @param sessionId 节次 ID
   * @returns 出勤记录实体列表
   */
  async listBySession(sessionId: number): Promise<ParticipationAttendanceRecordEntity[]> {
    return await this.attendanceRepository.find({ where: { sessionId } });
  }

  /**
   * 列出未终审出勤关联的开课班摘要
   * @returns series 摘要列表
   */
  async listUnfinalizedSeriesSummaries(): Promise<
    ReadonlyArray<UnfinalizedAttendanceSeriesSummary>
  > {
    const rows = await this.attendanceRepository
      .createQueryBuilder('a')
      .innerJoin(CourseSessionEntity, 's', 's.id = a.session_id')
      .innerJoin(CourseSeriesEntity, 'cs', 'cs.id = s.series_id')
      .where('a.finalized_at IS NULL')
      .select('cs.catalog_id', 'catalogId')
      .addSelect('cs.title', 'title')
      .addSelect('cs.start_date', 'startDate')
      .addSelect('cs.end_date', 'endDate')
      .groupBy('cs.id')
      .addGroupBy('cs.catalog_id')
      .addGroupBy('cs.title')
      .addGroupBy('cs.start_date')
      .addGroupBy('cs.end_date')
      .orderBy('cs.start_date', 'ASC')
      .addOrderBy('cs.id', 'ASC')
      .getRawMany<{
        catalogId: number;
        title: string;
        startDate: string;
        endDate: string;
      }>();

    return rows.map((row) => ({
      catalogId: Number(row.catalogId),
      title: row.title,
      startDate: row.startDate,
      endDate: row.endDate,
    }));
  }

  /**
   * 按节次查询已请假记录（EXCUSED）
   * @param params 参数对象：sessionId
   * @returns 请假明细行（含学员与原因）
   */
  async listExcusedRowsBySession(params: { readonly sessionId: number }): Promise<
    ReadonlyArray<{
      enrollmentId: number;
      learnerId: number;
      learnerName: string;
      reason: string | null;
      confirmedAt: Date | null;
    }>
  > {
    const rows = await this.attendanceRepository
      .createQueryBuilder('a')
      .innerJoin(LearnerEntity, 'l', 'l.id = a.learner_id')
      .where('a.session_id = :sessionId', { sessionId: params.sessionId })
      .andWhere('a.status = :status', { status: ParticipationAttendanceStatus.EXCUSED })
      .select('a.enrollment_id', 'enrollmentId')
      .addSelect('a.learner_id', 'learnerId')
      .addSelect('l.name', 'learnerName')
      .addSelect('a.remark', 'reason')
      .addSelect('a.confirmed_at', 'confirmedAt')
      .orderBy('a.confirmed_at', 'ASC')
      .addOrderBy('a.enrollment_id', 'ASC')
      .getRawMany<{
        enrollmentId: number;
        learnerId: number;
        learnerName: string;
        reason: string | null;
        confirmedAt: Date | null;
      }>();
    return rows.map((row) => ({
      enrollmentId: Number(row.enrollmentId),
      learnerId: Number(row.learnerId),
      learnerName: row.learnerName,
      reason: row.reason ?? null,
      confirmedAt: row.confirmedAt ? new Date(row.confirmedAt) : null,
    }));
  }

  /**
   * 按学员查询所有出勤记录
   * @param learnerId 学员 ID
   * @returns 出勤记录实体列表
   */
  async listByLearner(learnerId: number): Promise<ParticipationAttendanceRecordEntity[]> {
    return await this.attendanceRepository.find({ where: { learnerId } });
  }

  /**
   * 按系列聚合：维度为 session（含日期）
   * 使用 CASE WHEN 在数据库侧计算计费节数，避免内存循环
   * @param params seriesId、untilDate（可选）、includeNonChargeable
   * @returns 每个节次的聚合计费节数与日期
   */
  async aggregateSeriesBySession(params: {
    seriesId: number;
    untilDate?: Date;
    includeNonChargeable: boolean;
  }): Promise<ReadonlyArray<{ sessionId: number; sessionDate: Date; billableUnits: number }>> {
    const { seriesId, untilDate, includeNonChargeable } = params;
    const billableStatuses: ParticipationAttendanceStatus[] = [
      ParticipationAttendanceStatus.PRESENT,
      ParticipationAttendanceStatus.LATE_CANCEL,
      ParticipationAttendanceStatus.NO_SHOW,
    ];

    const qb = this.attendanceRepository
      .createQueryBuilder('a')
      .innerJoin(CourseSessionEntity, 's', 's.id = a.sessionId')
      .where('s.seriesId = :seriesId', { seriesId })
      .andWhere(untilDate ? 's.startTime <= :untilDate' : '1=1', { untilDate })
      .select('a.sessionId', 'sessionId')
      .addSelect('s.startTime', 'sessionDate')
      .addSelect('SUM(CASE WHEN a.status IN (:...billable) THEN 1 ELSE 0 END)', 'billableUnits')
      .groupBy('a.sessionId')
      .addGroupBy('s.startTime')
      .setParameters({ billable: billableStatuses });

    if (!includeNonChargeable) {
      qb.having('SUM(CASE WHEN a.status IN (:...billable) THEN 1 ELSE 0 END) > 0');
    }

    const raw = await qb.getRawMany<{
      sessionId: number;
      sessionDate: Date;
      billableUnits: string;
    }>();
    return raw.map((r) => ({
      sessionId: r.sessionId,
      sessionDate: new Date(r.sessionDate),
      billableUnits: Number(r.billableUnits),
    }));
  }

  /**
   * 按系列聚合：维度为 learner
   * @param params seriesId、untilDate（可选）、includeNonChargeable
   * @returns 每个学员的聚合计费节数
   */
  async aggregateSeriesByLearner(params: {
    seriesId: number;
    untilDate?: Date;
    includeNonChargeable: boolean;
  }): Promise<ReadonlyArray<{ learnerId: number; billableUnits: number }>> {
    const { seriesId, untilDate, includeNonChargeable } = params;
    const billableStatuses: ParticipationAttendanceStatus[] = [
      ParticipationAttendanceStatus.PRESENT,
      ParticipationAttendanceStatus.LATE_CANCEL,
      ParticipationAttendanceStatus.NO_SHOW,
    ];

    const qb = this.attendanceRepository
      .createQueryBuilder('a')
      .innerJoin(CourseSessionEntity, 's', 's.id = a.sessionId')
      .where('s.seriesId = :seriesId', { seriesId })
      .andWhere(untilDate ? 's.startTime <= :untilDate' : '1=1', { untilDate })
      .select('a.learnerId', 'learnerId')
      .addSelect('SUM(CASE WHEN a.status IN (:...billable) THEN 1 ELSE 0 END)', 'billableUnits')
      .groupBy('a.learnerId')
      .setParameters({ billable: billableStatuses });

    if (!includeNonChargeable) {
      qb.having('SUM(CASE WHEN a.status IN (:...billable) THEN 1 ELSE 0 END) > 0');
    }

    const raw = await qb.getRawMany<{ learnerId: number; billableUnits: string }>();
    return raw.map((r) => ({ learnerId: r.learnerId, billableUnits: Number(r.billableUnits) }));
  }

  /**
   * 系列视角：二维明细（Session × Learner）
   * 返回扁平行，便于前端按 session 或 learner 分组
   * @param params seriesId、untilDate（可选）、includeNonChargeable 控制是否包含不计费行
   */
  async listSeriesSessionLearnerRows(params: {
    seriesId: number;
    untilDate?: Date;
    includeNonChargeable: boolean;
  }): Promise<
    ReadonlyArray<{
      seriesId: number;
      seriesTitle: string;
      learnerName: string;
      sessionId: number;
      sessionDate: Date;
      learnerId: number;
      status: ParticipationAttendanceStatus;
      billableUnits: number;
      pricePerSession: string;
    }>
  > {
    const { seriesId, untilDate, includeNonChargeable } = params;
    const billableStatuses: ParticipationAttendanceStatus[] = [
      ParticipationAttendanceStatus.PRESENT,
      ParticipationAttendanceStatus.LATE_CANCEL,
      ParticipationAttendanceStatus.NO_SHOW,
    ];

    const qb = this.attendanceRepository
      .createQueryBuilder('a')
      .innerJoin(CourseSessionEntity, 's', 's.id = a.sessionId')
      .innerJoin(CourseSeriesEntity, 'cs', 'cs.id = s.seriesId')
      .innerJoin(LearnerEntity, 'learner', 'learner.id = a.learnerId')
      .where('s.seriesId = :seriesId', { seriesId })
      .andWhere(untilDate ? 's.startTime <= :untilDate' : '1=1', { untilDate })
      .select('s.seriesId', 'seriesId')
      .addSelect('cs.title', 'seriesTitle')
      .addSelect('cs.pricePerSession', 'pricePerSession')
      .addSelect('learner.name', 'learnerName')
      .addSelect('a.sessionId', 'sessionId')
      .addSelect('s.startTime', 'sessionDate')
      .addSelect('a.learnerId', 'learnerId')
      .addSelect('a.status', 'status')
      .addSelect('CASE WHEN a.status IN (:...billable) THEN 1 ELSE 0 END', 'billableUnits')
      .orderBy('s.startTime', 'ASC')
      .addOrderBy('a.sessionId', 'ASC')
      .addOrderBy('a.learnerId', 'ASC')
      .setParameters({ billable: billableStatuses });

    if (!includeNonChargeable) {
      qb.andWhere('a.status IN (:...billable)');
    }

    const raw = await qb.getRawMany<{
      seriesId: number;
      seriesTitle: string;
      pricePerSession: string | null;
      learnerName: string;
      sessionId: number;
      sessionDate: Date;
      learnerId: number;
      status: ParticipationAttendanceStatus;
      billableUnits: string;
    }>();
    return raw.map((r) => ({
      seriesId: r.seriesId,
      seriesTitle: r.seriesTitle,
      pricePerSession: r.pricePerSession ?? '0.00',
      learnerName: r.learnerName,
      sessionId: r.sessionId,
      sessionDate: new Date(r.sessionDate),
      learnerId: r.learnerId,
      status: r.status,
      billableUnits: Number(r.billableUnits),
    }));
  }

  /**
   * 学员视角：按系列聚合计费条目
   * @param params learnerId、fromDate/toDate（可选）、seriesId（可选）
   * @returns 每个系列的计费单位与价格/标题
   */
  async aggregateLearnerBySeries(params: {
    learnerId: number;
    fromDate?: Date;
    toDate?: Date;
    seriesId?: number;
  }): Promise<
    ReadonlyArray<{
      seriesId: number;
      seriesTitle: string;
      pricePerSession: string;
      billableUnits: number;
    }>
  > {
    const { learnerId, fromDate, toDate, seriesId } = params;
    const billableStatuses: ParticipationAttendanceStatus[] = [
      ParticipationAttendanceStatus.PRESENT,
      ParticipationAttendanceStatus.LATE_CANCEL,
      ParticipationAttendanceStatus.NO_SHOW,
    ];

    const qb = this.attendanceRepository
      .createQueryBuilder('a')
      .innerJoin(CourseSessionEntity, 's', 's.id = a.sessionId')
      .innerJoin(CourseSeriesEntity, 'cs', 'cs.id = s.seriesId')
      .where('a.learnerId = :learnerId', { learnerId })
      .andWhere(fromDate ? 's.startTime >= :fromDate' : '1=1', { fromDate })
      .andWhere(toDate ? 's.startTime <= :toDate' : '1=1', { toDate })
      .andWhere(seriesId ? 's.seriesId = :seriesId' : '1=1', { seriesId })
      .select('s.seriesId', 'seriesId')
      .addSelect('cs.title', 'seriesTitle')
      .addSelect('cs.pricePerSession', 'pricePerSession')
      .addSelect('SUM(CASE WHEN a.status IN (:...billable) THEN 1 ELSE 0 END)', 'billableUnits')
      .groupBy('s.seriesId')
      .addGroupBy('cs.title')
      .addGroupBy('cs.pricePerSession')
      .setParameters({ billable: billableStatuses });

    const raw = await qb.getRawMany<{
      seriesId: number;
      seriesTitle: string;
      pricePerSession: string | null;
      billableUnits: string;
    }>();
    return raw.map((r) => ({
      seriesId: r.seriesId,
      seriesTitle: r.seriesTitle,
      pricePerSession: r.pricePerSession ?? '0.00',
      billableUnits: Number(r.billableUnits),
    }));
  }

  /**
   * 学员视角：明细行（每节课一行，含日期/状态/系列标题/单价与是否计费）
   * @param params learnerId、fromDate/toDate（可选）、seriesId（可选）
   * @returns 明细记录列表
   */
  async listLearnerFinancialRows(params: {
    learnerId: number;
    fromDate?: Date;
    toDate?: Date;
    seriesId?: number;
  }): Promise<
    ReadonlyArray<{
      sessionId: number;
      date: Date;
      seriesId: number;
      seriesTitle: string;
      pricePerSession: string;
      status: ParticipationAttendanceStatus;
      billableUnits: number;
    }>
  > {
    const { learnerId, fromDate, toDate, seriesId } = params;
    const billableStatuses: ParticipationAttendanceStatus[] = [
      ParticipationAttendanceStatus.PRESENT,
      ParticipationAttendanceStatus.LATE_CANCEL,
      ParticipationAttendanceStatus.NO_SHOW,
    ];

    const qb = this.attendanceRepository
      .createQueryBuilder('a')
      .innerJoin(CourseSessionEntity, 's', 's.id = a.sessionId')
      .innerJoin(CourseSeriesEntity, 'cs', 'cs.id = s.seriesId')
      .where('a.learnerId = :learnerId', { learnerId })
      .andWhere(fromDate ? 's.startTime >= :fromDate' : '1=1', { fromDate })
      .andWhere(toDate ? 's.startTime <= :toDate' : '1=1', { toDate })
      .andWhere(seriesId ? 's.seriesId = :seriesId' : '1=1', { seriesId })
      .select('s.id', 'sessionId')
      .addSelect('s.startTime', 'date')
      .addSelect('s.seriesId', 'seriesId')
      .addSelect('cs.title', 'seriesTitle')
      .addSelect('cs.pricePerSession', 'pricePerSession')
      .addSelect('a.status', 'status')
      .addSelect('CASE WHEN a.status IN (:...billable) THEN 1 ELSE 0 END', 'billableUnits')
      .orderBy('s.startTime', 'ASC')
      .setParameters({ billable: billableStatuses });

    const raw = await qb.getRawMany<{
      sessionId: number;
      date: Date;
      seriesId: number;
      seriesTitle: string;
      pricePerSession: string | null;
      status: ParticipationAttendanceStatus;
      billableUnits: string;
    }>();
    return raw.map((r) => ({
      sessionId: r.sessionId,
      date: new Date(r.date),
      seriesId: r.seriesId,
      seriesTitle: r.seriesTitle,
      pricePerSession: r.pricePerSession ?? '0.00',
      status: r.status,
      billableUnits: Number(r.billableUnits),
    }));
  }

  /**
   * 创建或更新出勤记录（通过 session + learner 识别，幂等）
   * @param data 创建或更新数据
   */
  async upsertBySessionLearner(
    data: UpsertSessionLearnerInput,
  ): Promise<ParticipationAttendanceRecordEntity> {
    const existing = await this.findBySessionLearner({
      sessionId: data.sessionId,
      learnerId: data.learnerId,
    });
    if (existing) {
      const patch = this.buildPatchForSessionLearner(existing, data);
      return this.update(existing.id, patch);
    }
    const createData = this.buildCreateForSessionLearner(data);
    const entity = this.attendanceRepository.create(createData);
    return this.attendanceRepository.save(entity);
  }

  /**
   * 创建或更新出勤记录（通过 enrollment 识别，幂等）
   * @param data 创建或更新数据
   */
  async upsertByEnrollment(
    data: UpsertEnrollmentInput,
  ): Promise<ParticipationAttendanceRecordEntity> {
    const existing = await this.findByEnrollmentId(data.enrollmentId);
    if (existing) {
      const patch = this.buildPatchForEnrollment(existing, data);
      return this.update(existing.id, patch);
    }
    const createData = this.buildCreateForEnrollment(data);
    const entity = this.attendanceRepository.create(createData);
    return this.attendanceRepository.save(entity);
  }

  /**
   * 更新出勤记录（按 ID）
   * @param id 记录 ID
   * @param patch 部分更新字段
   */
  async update(
    id: number,
    patch: Partial<
      Pick<
        ParticipationAttendanceRecordEntity,
        | 'countApplied'
        | 'status'
        | 'confirmedByCoachId'
        | 'confirmedAt'
        | 'finalizedBy'
        | 'finalizedAt'
        | 'remark'
      >
    >,
  ): Promise<ParticipationAttendanceRecordEntity> {
    await this.attendanceRepository.update({ id }, patch);
    const fresh = await this.attendanceRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('更新后的出勤记录未找到');
    return fresh;
  }

  /**
   * 判断某节次是否已全部定稿
   * 语义：当且仅当该 session 至少存在一条出勤记录，且所有出勤记录都已写入 finalizedAt，视为已定稿；
   *      不强制 enrollment 全员都有出勤记录（允许课后补录）。
   * @param sessionId 节次 ID
   */
  async isFinalizedForSession(sessionId: number): Promise<boolean> {
    const total = await this.attendanceRepository.count({ where: { sessionId } });
    if (total === 0) return false;
    const unfinalized = await this.attendanceRepository.count({
      where: { sessionId, finalizedAt: IsNull() },
    });
    return unfinalized === 0;
  }

  /**
   * 将某节次未定稿的出勤记录一并定稿（不可逆）
   * @param params 参数对象：sessionId、finalizedBy、manager（可选事务）
   * @returns 受影响行数
   */
  async lockForSession(params: {
    sessionId: number;
    finalizedBy: number;
    manager?: EntityManager;
  }): Promise<number> {
    const repo = params.manager
      ? params.manager.getRepository(ParticipationAttendanceRecordEntity)
      : this.attendanceRepository;
    const res = await repo
      .createQueryBuilder()
      .update(ParticipationAttendanceRecordEntity)
      .set({ finalizedAt: () => 'CURRENT_TIMESTAMP', finalizedBy: params.finalizedBy })
      .where('session_id = :sid AND finalized_at IS NULL', { sid: params.sessionId })
      .execute();
    return res.affected ?? 0;
  }

  /**
   * 构建更新补丁（按 session + learner 维度）
   * @param existing 现有记录
   * @param data 写入数据
   */
  private buildPatchForSessionLearner(
    existing: ParticipationAttendanceRecordEntity,
    data: UpsertSessionLearnerInput,
  ): Partial<ParticipationAttendanceRecordEntity> {
    return {
      enrollmentId: data.enrollmentId ?? existing.enrollmentId,
      countApplied: data.countApplied ?? existing.countApplied,
      status: data.status ?? existing.status,
      confirmedByCoachId: data.confirmedByCoachId ?? existing.confirmedByCoachId,
      confirmedAt: data.confirmedAt ?? existing.confirmedAt,
      finalizedBy: data.finalizedBy ?? existing.finalizedBy,
      finalizedAt: data.finalizedAt ?? existing.finalizedAt,
      remark: data.remark ?? existing.remark,
    };
  }

  /**
   * 构建更新补丁（按 enrollment 维度）
   * @param existing 现有记录
   * @param data 写入数据
   */
  private buildPatchForEnrollment(
    existing: ParticipationAttendanceRecordEntity,
    data: UpsertEnrollmentInput,
  ): Partial<ParticipationAttendanceRecordEntity> {
    return {
      sessionId: data.sessionId ?? existing.sessionId,
      learnerId: data.learnerId ?? existing.learnerId,
      countApplied: data.countApplied ?? existing.countApplied,
      status: data.status ?? existing.status,
      confirmedByCoachId: data.confirmedByCoachId ?? existing.confirmedByCoachId,
      confirmedAt: data.confirmedAt ?? existing.confirmedAt,
      finalizedBy: data.finalizedBy ?? existing.finalizedBy,
      finalizedAt: data.finalizedAt ?? existing.finalizedAt,
      remark: data.remark ?? existing.remark,
    };
  }

  /**
   * 构建创建数据（按 session + learner 维度）
   * @param data 写入数据
   */
  private buildCreateForSessionLearner(
    data: UpsertSessionLearnerInput,
  ): Partial<ParticipationAttendanceRecordEntity> {
    return {
      sessionId: data.sessionId,
      learnerId: data.learnerId,
      enrollmentId: data.enrollmentId,
      countApplied: data.countApplied ?? '0.00',
      status: data.status ?? ParticipationAttendanceStatus.NO_SHOW,
      confirmedByCoachId: data.confirmedByCoachId ?? null,
      confirmedAt: data.confirmedAt ?? null,
      finalizedBy: data.finalizedBy ?? null,
      finalizedAt: data.finalizedAt ?? null,
      remark: data.remark ?? null,
    };
  }

  /**
   * 构建创建数据（按 enrollment 维度）
   * @param data 写入数据
   */
  private buildCreateForEnrollment(
    data: UpsertEnrollmentInput,
  ): Partial<ParticipationAttendanceRecordEntity> {
    return {
      enrollmentId: data.enrollmentId,
      sessionId: data.sessionId,
      learnerId: data.learnerId,
      countApplied: data.countApplied ?? '0.00',
      status: data.status ?? ParticipationAttendanceStatus.NO_SHOW,
      confirmedByCoachId: data.confirmedByCoachId ?? null,
      confirmedAt: data.confirmedAt ?? null,
      finalizedBy: data.finalizedBy ?? null,
      finalizedAt: data.finalizedAt ?? null,
      remark: data.remark ?? null,
    };
  }

  /**
   * 批量幂等写入出勤记录（按 enrollment 维度）
   * @param params 批量写入参数（可选事务管理器）
   * @returns 更新与未变更计数
   */
  async bulkUpsert(params: {
    readonly items: ReadonlyArray<UpsertEnrollmentInput>;
    readonly manager?: EntityManager;
  }): Promise<{ updatedCount: number; unchangedCount: number }> {
    const repo = params.manager
      ? params.manager.getRepository(ParticipationAttendanceRecordEntity)
      : this.attendanceRepository;

    const ids = Array.from(new Set(params.items.map((it) => it.enrollmentId)));
    const existingList = ids.length ? await repo.find({ where: { enrollmentId: In(ids) } }) : [];
    const existingMap = new Map<number, ParticipationAttendanceRecordEntity>();
    for (const r of existingList) existingMap.set(r.enrollmentId, r);

    let updated = 0;
    let unchanged = 0;
    const updates: { id: number; patch: Partial<ParticipationAttendanceRecordEntity> }[] = [];
    const inserts: Partial<ParticipationAttendanceRecordEntity>[] = [];

    for (const item of params.items) {
      const existing = existingMap.get(item.enrollmentId) ?? null;
      const decision = this.decideBulkUpsertForEnrollment({ existing, item });
      if (decision.action === 'insert') {
        inserts.push(decision.data);
        updated++;
      }
      if (decision.action === 'update') {
        updates.push({ id: decision.id, patch: decision.patch });
        updated++;
      }
      if (decision.action === 'unchanged') {
        unchanged++;
      }
    }

    // 批量写入：先插入，再更新（减少往返与避免二次查询）
    if (inserts.length) {
      const entities = inserts.map((p) => repo.create(p));
      await repo.save(entities);
    }
    for (const u of updates) {
      // 每条更新字段不同，逐条执行
      await repo.update({ id: u.id }, u.patch);
    }

    return { updatedCount: updated, unchangedCount: unchanged };
  }

  /**
   * 评估 enrollment 维度幂等写入的决策
   * @param params 现有记录与写入项
   */
  private decideBulkUpsertForEnrollment(params: {
    readonly existing: ParticipationAttendanceRecordEntity | null;
    readonly item: UpsertEnrollmentInput;
  }): BulkUpsertDecision {
    const { existing, item } = params;
    if (!existing) {
      return { action: 'insert', data: this.buildCreateForEnrollment(item) };
    }
    const hasMeaningfulChange =
      existing.status !== item.status ||
      existing.countApplied !== item.countApplied ||
      (existing.remark ?? null) !== (item.remark ?? null);
    const effectiveItem = hasMeaningfulChange
      ? item
      : {
          ...item,
          confirmedByCoachId: existing.confirmedByCoachId ?? null,
          confirmedAt: existing.confirmedAt ?? null,
        };
    const prevSig = this.makeSignature(existing);
    const patch = this.buildPatchForEnrollment(existing, effectiveItem);
    const nextSig = this.makeNextSignature(existing, patch);
    if (prevSig === nextSig) {
      return { action: 'unchanged' };
    }
    return { action: 'update', id: existing.id, patch };
  }

  async bulkInsertMissingByEnrollment(params: {
    readonly items: ReadonlyArray<UpsertEnrollmentInput>;
    readonly manager?: EntityManager;
  }): Promise<number> {
    const repo = params.manager
      ? params.manager.getRepository(ParticipationAttendanceRecordEntity)
      : this.attendanceRepository;
    const ids = Array.from(new Set(params.items.map((it) => it.enrollmentId)));
    if (ids.length === 0) return 0;
    const existingList = await repo.find({ where: { enrollmentId: In(ids) } });
    const existingSet = new Set<number>(existingList.map((e) => e.enrollmentId));
    const inserts = params.items
      .filter((it) => !existingSet.has(it.enrollmentId))
      .map((it) => this.buildCreateForEnrollment(it));
    if (inserts.length === 0) return 0;
    const entities = inserts.map((p) => repo.create(p));
    await repo.save(entities);
    return entities.length;
  }

  /**
   * 生成出勤记录的幂等签名（用于“是否有任何变动”的判断）
   * @param rec 出勤记录实体
   * @returns 签名字符串（稳定拼接）
   */
  private makeSignature(
    rec: Pick<
      ParticipationAttendanceRecordEntity,
      | 'status'
      | 'countApplied'
      | 'confirmedByCoachId'
      | 'confirmedAt'
      | 'finalizedBy'
      | 'finalizedAt'
      | 'remark'
    >,
  ): string {
    return [
      String(rec.status),
      String(rec.countApplied),
      String(rec.confirmedByCoachId ?? ''),
      rec.confirmedAt ? rec.confirmedAt.toISOString() : '',
      String(rec.finalizedBy ?? ''),
      rec.finalizedAt ? rec.finalizedAt.toISOString() : '',
      String(rec.remark ?? ''),
    ].join('|');
  }

  /**
   * 基于现有记录与补丁预测更新后的签名（避免二次查询）
   * @param prev 现有记录
   * @param patch 更新补丁（可能为空字段）
   * @returns 预测的下一签名
   */
  private makeNextSignature(
    prev: ParticipationAttendanceRecordEntity,
    patch: Partial<
      Pick<
        ParticipationAttendanceRecordEntity,
        | 'status'
        | 'countApplied'
        | 'confirmedByCoachId'
        | 'confirmedAt'
        | 'finalizedBy'
        | 'finalizedAt'
        | 'remark'
      >
    >,
  ): string {
    const next = {
      status: patch.status ?? prev.status,
      countApplied: patch.countApplied ?? prev.countApplied,
      confirmedByCoachId: patch.confirmedByCoachId ?? prev.confirmedByCoachId,
      confirmedAt: patch.confirmedAt ?? prev.confirmedAt,
      finalizedBy: patch.finalizedBy ?? prev.finalizedBy,
      finalizedAt: patch.finalizedAt ?? prev.finalizedAt,
      remark: patch.remark ?? prev.remark,
    };
    return this.makeSignature(next);
  }
}

/**
 * 点名表行（供 usecase 输出复用）
 * 注意：该类型仅承载最小展示字段，避免泄漏 ORM 实体
 */
export type AttendanceSheetRow = {
  enrollmentId: number;
  learnerId: number;
  attendanceStatus: ParticipationAttendanceStatus;
  countApplied: string;
  confirmedByCoachId: number | null;
  confirmedAt: Date | null;
  finalized: boolean;
  status: ParticipationEnrollmentStatus;
  statusReason: ParticipationEnrollmentStatusReason | null;
};

/**
 * 点名表（供 usecase 输出复用）
 */
export type AttendanceSheet = {
  sessionId: number;
  isFinalized: boolean;
  rows: ReadonlyArray<AttendanceSheetRow>;
};
