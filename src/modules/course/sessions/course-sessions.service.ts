// src/modules/course-sessions/course-sessions.service.ts
import { SessionStatus } from '@app-types/models/course-session.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CourseSessionEntity } from './course-session.entity';

/**
 * 课程节次服务
 * 提供节次的基础读写、状态与出勤更新能力
 */
@Injectable()
export class CourseSessionsService {
  constructor(
    @InjectRepository(CourseSessionEntity)
    private readonly sessionRepository: Repository<CourseSessionEntity>,
  ) {}

  /**
   * 按 ID 查询节次
   * @param id 节次 ID
   */
  async findById(id: number): Promise<CourseSessionEntity | null> {
    return this.sessionRepository.findOne({ where: { id } });
  }

  /**
   * 按系列与截止日期列出节次（按开始时间升序）
   * @param params 查询参数：seriesId、untilDate（可选）
   */
  async listBySeriesAndUntilDate(params: {
    readonly seriesId: number;
    readonly untilDate?: Date;
  }): Promise<CourseSessionEntity[]> {
    const qb = this.sessionRepository
      .createQueryBuilder('s')
      .select('s')
      .where('s.seriesId = :seriesId', { seriesId: params.seriesId })
      .orderBy('s.startTime', 'ASC');
    if (params.untilDate) {
      qb.andWhere('s.startTime <= :untilDate', { untilDate: params.untilDate });
    }
    return await qb.getMany();
  }

  /**
   * 按系列获取“近期窗口”节次列表（以基准时间 baseTime 为中心）
   *
   * 口径（固定，避免前后端对不齐）：
   * - 过去侧：取 startTime < baseTime 的最近 pastLimit 条（按 startTime DESC 取 limit）
   * - 未来侧：取 startTime >= baseTime 的最近 futureLimit 条（按 startTime ASC 取 limit）
   * - 最终返回：将两侧结果合并后按 startTime ASC 排序输出
   *
   * 说明：
   * - 返回条数最多为 pastLimit + futureLimit
   * - 适用于二级列表默认展开展示（近期前后优先），避免一次性拉全量
   * - 若需要只展示特定状态，可通过可选 statusFilter 进一步筛选（建议在 SQL 层做）
   *
   * @param params.seriesId 课程系列 ID
   * @param params.baseTime 基准时间（以此时间为中心取前后窗口，通常传 new Date()）
   * @param params.pastLimit 过去侧最多返回条数
   * @param params.futureLimit 未来侧最多返回条数
   * @param params.statusFilter 可选：按节次状态筛选（如仅 SCHEDULED）
   * @returns 节次实体列表（按 startTime 升序）
   */
  async listRecentWindowBySeries(params: {
    readonly seriesId: number;
    readonly baseTime: Date;
    readonly pastLimit: number;
    readonly futureLimit: number;
    readonly statusFilter?: ReadonlyArray<SessionStatus>;
  }): Promise<CourseSessionEntity[]> {
    const HARD_MAX_WINDOW = 5; // 每侧最多返回条数（硬上限）
    const safePast = Number.isFinite(params.pastLimit) ? Math.floor(params.pastLimit) : 0;
    const safeFuture = Number.isFinite(params.futureLimit) ? Math.floor(params.futureLimit) : 0;
    const pastLimit = Math.max(0, Math.min(safePast, HARD_MAX_WINDOW));
    const futureLimit = Math.max(0, Math.min(safeFuture, HARD_MAX_WINDOW));

    let pastPromise: Promise<CourseSessionEntity[]> = Promise.resolve([]);
    if (pastLimit > 0) {
      const pastQb = this.sessionRepository
        .createQueryBuilder('s')
        .select('s')
        .where('s.seriesId = :seriesId', { seriesId: params.seriesId })
        .andWhere('s.startTime < :baseTime', { baseTime: params.baseTime });
      if (params.statusFilter && params.statusFilter.length > 0) {
        pastQb.andWhere('s.status IN (:...statuses)', { statuses: params.statusFilter });
      }
      pastQb.orderBy('s.startTime', 'DESC').addOrderBy('s.id', 'DESC').limit(pastLimit);
      pastPromise = pastQb.getMany();
    }

    let futurePromise: Promise<CourseSessionEntity[]> = Promise.resolve([]);
    if (futureLimit > 0) {
      const futureQb = this.sessionRepository
        .createQueryBuilder('s')
        .select('s')
        .where('s.seriesId = :seriesId', { seriesId: params.seriesId })
        .andWhere('s.startTime >= :baseTime', { baseTime: params.baseTime });
      if (params.statusFilter && params.statusFilter.length > 0) {
        futureQb.andWhere('s.status IN (:...statuses)', { statuses: params.statusFilter });
      }
      futureQb.orderBy('s.startTime', 'ASC').addOrderBy('s.id', 'ASC').limit(futureLimit);
      futurePromise = futureQb.getMany();
    }

    const [past, future] = await Promise.all([pastPromise, futurePromise]);

    const combined = [...past, ...future];
    combined.sort((a, b) => {
      const t = a.startTime.getTime() - b.startTime.getTime();
      return t !== 0 ? t : a.id - b.id;
    });
    return combined;
  }

  /**
   * 按系列获取“全量模式”节次列表（受最大返回条数限制）
   *
   * 口径：
   * - 按 startTime ASC 返回该 series 下的节次
   * - 返回条数最多为 maxSessions（硬上限），防止单系列历史过长导致接口超时/响应过大
   *
   * 说明：
   * - 对应二级列表的“查看全部”按钮触发
   * - 建议对 maxSessions 做保护，避免误传极大值
   *
   * @param params.seriesId 课程系列 ID
   * @param params.maxSessions 最大返回节次数（硬上限，例如 200）
   * @param params.statusFilter 可选：按节次状态筛选
   * @returns 节次实体列表（按 startTime 升序，最多 maxSessions 条）
   */
  async listAllBySeries(params: {
    readonly seriesId: number;
    readonly maxSessions: number;
    readonly statusFilter?: ReadonlyArray<SessionStatus>;
  }): Promise<CourseSessionEntity[]> {
    const HARD_MAX_SESSIONS = 200;
    const safeMax = Number.isFinite(params.maxSessions) ? Math.floor(params.maxSessions) : 0;
    const limit = Math.max(0, Math.min(safeMax, HARD_MAX_SESSIONS));
    if (limit <= 0) return [];
    const qb = this.sessionRepository
      .createQueryBuilder('s')
      .select('s')
      .where('s.seriesId = :seriesId', { seriesId: params.seriesId });
    if (params.statusFilter && params.statusFilter.length > 0) {
      qb.andWhere('s.status IN (:...statuses)', { statuses: params.statusFilter });
    }
    qb.orderBy('s.startTime', 'ASC').addOrderBy('s.id', 'ASC').limit(limit);
    return await qb.getMany();
  }

  /**
   * 按系列统计节次数量
   * @param seriesId 课程系列 ID
   * @returns 对应系列下的节次数量
   */
  async countBySeries(seriesId: number): Promise<number> {
    const qb = this.sessionRepository
      .createQueryBuilder('s')
      .select('COUNT(1)', 'cnt')
      .where('s.seriesId = :seriesId', { seriesId });
    const row = (await qb.getRawOne()) as { cnt?: string | number } | null;
    const raw = row?.cnt;
    if (typeof raw === 'number') {
      return raw;
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  /**
   * 按教练与时间段查询已排期的节次（仅 SCHEDULED）
   * @param params 查询参数对象：coachId / rangeStart / rangeEnd
   * @returns 重叠时间段内的节次列表，按开始时间升序
   */
  async findScheduledByCoachAndRange(params: {
    readonly coachId: number;
    readonly rangeStart: Date;
    readonly rangeEnd: Date;
  }): Promise<CourseSessionEntity[]> {
    return await this.sessionRepository
      .createQueryBuilder('s')
      .select('s')
      .where('s.leadCoachId = :coachId', { coachId: params.coachId })
      .andWhere('s.status = :status', { status: SessionStatus.SCHEDULED })
      .andWhere('s.startTime < :rangeEnd', { rangeEnd: params.rangeEnd })
      .andWhere('s.endTime > :rangeStart', { rangeStart: params.rangeStart })
      .orderBy('s.startTime', 'ASC')
      .getMany();
  }

  /**
   * 创建节次
   * @param data 创建数据
   */
  async create(data: {
    seriesId: number;
    startTime: Date;
    endTime: Date;
    leadCoachId: number;
    locationText: string;
    extraCoachesJson?: CourseSessionEntity['extraCoachesJson'];
    remark?: string | null;
  }): Promise<CourseSessionEntity> {
    const entity = this.sessionRepository.create({
      seriesId: data.seriesId,
      startTime: data.startTime,
      endTime: data.endTime,
      leadCoachId: data.leadCoachId,
      locationText: data.locationText,
      extraCoachesJson: data.extraCoachesJson ?? null,
      status: SessionStatus.SCHEDULED,
      remark: data.remark ?? null,
    });
    return this.sessionRepository.save(entity);
  }

  /**
   * 批量创建节次（幂等）：
   * - 依赖唯一约束 `uk_session_series_start` 去重；
   * - 返回成功创建数与跳过数；
   * - 可选事务管理器。
   */
  async bulkCreate(input: {
    readonly items: ReadonlyArray<{
      readonly seriesId: number;
      readonly startTime: Date;
      readonly endTime: Date;
      readonly leadCoachId: number;
      readonly locationText: string;
      readonly leaveCutoffHoursOverride?: number | null;
      readonly remark?: string | null;
    }>;
    readonly manager?: EntityManager;
  }): Promise<{ created: number; skipped: number }> {
    const repo = input.manager
      ? input.manager.getRepository(CourseSessionEntity)
      : this.sessionRepository;
    let created = 0;
    let skipped = 0;
    for (const it of input.items) {
      try {
        const entity = repo.create({
          seriesId: it.seriesId,
          startTime: it.startTime,
          endTime: it.endTime,
          leadCoachId: it.leadCoachId,
          locationText: it.locationText,
          leaveCutoffHoursOverride: it.leaveCutoffHoursOverride ?? null,
          status: SessionStatus.SCHEDULED,
          remark: it.remark ?? null,
        });
        await repo.save(entity);
        created++;
      } catch {
        // 依赖唯一约束：视为跳过
        skipped++;
      }
    }
    return { created, skipped };
  }

  /**
   * 更新节次基本信息（可选事务管理）
   * @param params.id 节次 ID
   * @param params.patch 部分更新数据
   * @param params.manager 可选事务管理器
   */
  async updateWithManager(params: {
    readonly id: number;
    readonly patch: Partial<
      Pick<
        CourseSessionEntity,
        'startTime' | 'endTime' | 'leadCoachId' | 'locationText' | 'extraCoachesJson' | 'remark'
      >
    >;
    readonly manager?: EntityManager;
  }): Promise<CourseSessionEntity> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionEntity)
      : this.sessionRepository;
    await repo.update({ id: params.id }, params.patch);
    const fresh = await repo.findOne({ where: { id: params.id } });
    if (!fresh) throw new Error('更新后的节次未找到');
    return fresh;
  }

  /**
   * 更新节次基本信息
   * @param id 节次 ID
   * @param patch 部分更新数据
   */
  async update(
    id: number,
    patch: Partial<
      Pick<
        CourseSessionEntity,
        'startTime' | 'endTime' | 'leadCoachId' | 'locationText' | 'extraCoachesJson' | 'remark'
      >
    >,
  ): Promise<CourseSessionEntity> {
    return this.updateWithManager({ id, patch });
  }

  /**
   * 切换节次状态
   * 管理员可将 CANCELED / FINISHED 回滚到 SCHEDULED
   * @param id 节次 ID
   * @param status 目标状态
   */
  async setStatus(params: {
    id: number;
    status: SessionStatus;
    manager?: EntityManager;
  }): Promise<CourseSessionEntity> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionEntity)
      : this.sessionRepository;
    await repo.update({ id: params.id }, { status: params.status });
    const fresh = await repo.findOne({ where: { id: params.id } });
    if (!fresh) throw new Error('状态更新后的节次未找到');
    return fresh;
  }

  /**
   * 将节次标记为 FINISHED（条件更新，防止非法状态切换）
   * 仅允许从 SCHEDULED 切换到 FINISHED
   * @param params 参数对象：id、manager（可选事务）
   */
  async markCompleted(params: { id: number; manager?: EntityManager }): Promise<boolean> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionEntity)
      : this.sessionRepository;
    const res = await repo
      .createQueryBuilder()
      .update(CourseSessionEntity)
      .set({ status: SessionStatus.FINISHED })
      .where('id = :id AND status = :from', { id: params.id, from: SessionStatus.SCHEDULED })
      .execute();
    return (res.affected ?? 0) > 0;
  }

  /**
   * 更新出勤确认信息
   * @param id 节次 ID
   * @param data 出勤确认信息
   */
  async updateAttendance(
    id: number,
    data: { attendanceConfirmedAt: Date | null; attendanceConfirmedBy: number | null },
  ): Promise<CourseSessionEntity> {
    await this.sessionRepository.update(
      { id },
      {
        attendanceConfirmedAt: data.attendanceConfirmedAt,
        attendanceConfirmedBy: data.attendanceConfirmedBy,
      },
    );
    const fresh = await this.sessionRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('出勤更新后的节次未找到');
    return fresh;
  }
}
