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
   * @param params 查询参数
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
    await this.sessionRepository.update({ id }, patch);
    const fresh = await this.sessionRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('更新后的节次未找到');
    return fresh;
  }

  /**
   * 切换节次状态
   * 管理员可将 CANCELED / FINISHED 回滚到 SCHEDULED
   * @param id 节次 ID
   * @param status 目标状态
   */
  async setStatus(params: { id: number; status: SessionStatus }): Promise<CourseSessionEntity> {
    await this.sessionRepository.update({ id: params.id }, { status: params.status });
    const fresh = await this.sessionRepository.findOne({ where: { id: params.id } });
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
