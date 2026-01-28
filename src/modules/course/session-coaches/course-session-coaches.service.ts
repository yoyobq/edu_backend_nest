// src/modules/course-session-coaches/course-session-coaches.service.ts
import { SessionCoachRemovedReason } from '@app-types/models/course-session-coach.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { EntityManager, FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { CourseSessionCoachEntity } from './course-session-coach.entity';

/**
 * 节次-教练关联服务（结算权威）
 * 提供金额写入、备注与最终确定时间的更新
 */
@Injectable()
export class CourseSessionCoachesService {
  constructor(
    @InjectRepository(CourseSessionCoachEntity)
    private readonly sessionCoachRepository: Repository<CourseSessionCoachEntity>,
  ) {}

  /**
   * 按复合唯一键查询记录
   * @param params 组合键参数（可选 manager 支持事务内查询）
   */
  async findByUnique(params: {
    sessionId: number;
    coachId: number;
    manager?: EntityManager;
  }): Promise<CourseSessionCoachEntity | null> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionCoachEntity)
      : this.sessionCoachRepository;
    return repo.findOne({
      where: { sessionId: params.sessionId, coachId: params.coachId },
    });
  }

  /**
   * 统计某节次的教练结算记录数量（用于作为“冻结模板快照”的存在性校验）
   * @param params 参数对象：sessionId、manager（可选事务）
   */
  async countBySession(params: { sessionId: number; manager?: EntityManager }): Promise<number> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionCoachEntity)
      : this.sessionCoachRepository;
    return await repo.count({ where: { sessionId: params.sessionId } });
  }

  /**
   * 判断指定教练是否与给定开课班（series）存在任一结算关联
   * 判定规则：存在至少一条 course_session_coaches 记录，其 sessionId 关联到该 series
   * 下任一节次；无论该记录当前是否已从 roster 中移除，历史参与都会被视为绑定。
   * @param params 查询参数：seriesId 与 coachId
   */
  async existsCoachBoundToSeries(params: {
    readonly seriesId: number;
    readonly coachId: number;
  }): Promise<boolean> {
    return await this.sessionCoachRepository
      .createQueryBuilder('sc')
      .innerJoin(CourseSessionEntity, 's', 's.id = sc.sessionId')
      .where('s.seriesId = :seriesId', { seriesId: params.seriesId })
      .andWhere('sc.coachId = :coachId', { coachId: params.coachId })
      .getExists();
  }

  /**
   * 确保指定节次-教练在 roster 中处于激活状态
   * - 若不存在记录：创建一条 active 记录（removed 字段为 NULL）
   * - 若存在记录但已移出：清空 removed 字段视为“复活”
   * - 若已是 active：仅在需要时更新 updatedBy
   * @param params 参数对象：sessionId、coachId、operatorAccountId（可选）、manager（可选）
   * @returns 处理后的节次-教练记录
   */
  async ensureActive(params: {
    readonly sessionId: number;
    readonly coachId: number;
    readonly operatorAccountId?: number | null;
    readonly manager?: EntityManager;
  }): Promise<CourseSessionCoachEntity> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionCoachEntity)
      : this.sessionCoachRepository;
    const operator = params.operatorAccountId ?? null;

    const existing = await repo.findOne({
      where: { sessionId: params.sessionId, coachId: params.coachId },
    });

    if (existing) {
      const isAlreadyActive = existing.removedAt === null;

      if (isAlreadyActive) {
        if (operator !== null && existing.updatedBy !== operator) {
          await repo.update({ id: existing.id }, { updatedBy: operator });
          const fresh = await repo.findOne({
            where: { id: existing.id },
          });
          if (!fresh) throw new Error('更新后的结算记录未找到');
          return fresh;
        }
        return existing;
      }

      await repo.update(
        { id: existing.id },
        {
          removedAt: null,
          removedBy: null,
          removedReason: null,
          updatedBy: operator ?? existing.updatedBy,
        },
      );
      const fresh = await repo.findOne({
        where: { id: existing.id },
      });
      if (!fresh) throw new Error('复活后的结算记录未找到');
      return fresh;
    }

    const entity = repo.create({
      sessionId: params.sessionId,
      coachId: params.coachId,
      teachingFeeAmount: '0.00',
      bonusAmount: '0.00',
      payoutNote: null,
      payoutFinalizedAt: null,
      removedAt: null,
      removedBy: null,
      removedReason: null,
      createdBy: operator,
      updatedBy: operator,
    });

    return await repo.save(entity);
  }

  /**
   * 将指定节次-教练从 roster 中移出（标记 removed 字段）
   * - 若已有记录：更新 removed_at / removed_by / removed_reason
   * - 若不存在记录：创建一条“已移出”的历史记录，便于留痕
   * @param params 参数对象：sessionId、coachId、operatorAccountId、removedReason、manager
   * @returns 处理后的节次-教练记录
   */
  async removeFromRoster(params: {
    readonly sessionId: number;
    readonly coachId: number;
    readonly operatorAccountId?: number | null;
    readonly removedReason?: SessionCoachRemovedReason | null;
    readonly manager?: EntityManager;
  }): Promise<CourseSessionCoachEntity> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionCoachEntity)
      : this.sessionCoachRepository;
    const operator = params.operatorAccountId ?? null;
    const now = new Date();

    const existing = await repo.findOne({
      where: { sessionId: params.sessionId, coachId: params.coachId },
    });

    if (existing) {
      await repo.update(
        { id: existing.id },
        {
          removedAt: now,
          removedBy: operator,
          removedReason: params.removedReason ?? existing.removedReason ?? null,
          updatedBy: operator ?? existing.updatedBy,
        },
      );
      const fresh = await repo.findOne({
        where: { id: existing.id },
      });
      if (!fresh) throw new Error('移出后的结算记录未找到');
      return fresh;
    }

    const entity = repo.create({
      sessionId: params.sessionId,
      coachId: params.coachId,
      teachingFeeAmount: '0.00',
      bonusAmount: '0.00',
      payoutNote: null,
      payoutFinalizedAt: null,
      removedAt: now,
      removedBy: operator,
      removedReason: params.removedReason ?? null,
      createdBy: operator,
      updatedBy: operator,
    });

    return await repo.save(entity);
  }

  /**
   * 批量将节次内所有 active 教练移出 roster（标记 removed 字段）
   * @param params 参数对象：sessionId、operatorAccountId、removedReason、manager
   * @returns 本次被移出的记录数量
   */
  async removeActiveBySession(params: {
    readonly sessionId: number;
    readonly operatorAccountId?: number | null;
    readonly removedReason?: SessionCoachRemovedReason | null;
    readonly manager?: EntityManager;
  }): Promise<number> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionCoachEntity)
      : this.sessionCoachRepository;
    const operator = params.operatorAccountId ?? null;
    const now = new Date();
    const patch: Partial<CourseSessionCoachEntity> = {
      removedAt: now,
      removedBy: operator,
      removedReason: params.removedReason ?? null,
    };
    if (operator !== null) {
      patch.updatedBy = operator;
    }
    const res = await repo.update({ sessionId: params.sessionId, removedAt: IsNull() }, patch);
    return res.affected ?? 0;
  }

  /**
   * 批量恢复节次内被移出的教练（清空 removed 字段）
   * @param params 参数对象：sessionId、operatorAccountId、removedReason、manager
   * @returns 本次被恢复的记录数量
   */
  async restoreRemovedBySession(params: {
    readonly sessionId: number;
    readonly operatorAccountId?: number | null;
    readonly removedReason?: SessionCoachRemovedReason;
    readonly manager?: EntityManager;
  }): Promise<number> {
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionCoachEntity)
      : this.sessionCoachRepository;
    const operator = params.operatorAccountId ?? null;
    const patch: Partial<CourseSessionCoachEntity> = {
      removedAt: null,
      removedBy: null,
      removedReason: null,
    };
    if (operator !== null) {
      patch.updatedBy = operator;
    }
    const where: FindOptionsWhere<CourseSessionCoachEntity> = {
      sessionId: params.sessionId,
      removedAt: Not(IsNull()),
    };
    if (params.removedReason !== undefined) {
      where.removedReason = params.removedReason;
    }
    const res = await repo.update(where, patch);
    return res.affected ?? 0;
  }

  /**
   * 基于复合键更新或创建结算记录（幂等权威写入口）
   * @param params 参数对象：sessionId、coachId 以及金额字段、manager（可选）
   */
  async update(params: {
    readonly sessionId: number;
    readonly coachId: number;
    readonly teachingFeeAmount?: string;
    readonly bonusAmount?: string;
    readonly payoutNote?: string | null;
    readonly payoutFinalizedAt?: Date | null;
    readonly updatedBy?: number | null;
    readonly manager?: EntityManager;
  }): Promise<CourseSessionCoachEntity> {
    const existing = await this.findByUnique({
      sessionId: params.sessionId,
      coachId: params.coachId,
      manager: params.manager,
    });
    const repo = params.manager
      ? params.manager.getRepository(CourseSessionCoachEntity)
      : this.sessionCoachRepository;
    if (existing) {
      const patch = this.buildUpdatePatch(params);
      if (!patch) {
        return existing;
      }
      await repo.update({ id: existing.id }, patch);
      const fresh = await repo.findOne({ where: { id: existing.id } });
      if (!fresh) throw new Error('更新后的结算记录未找到');
      return fresh;
    }
    const entity = repo.create({
      sessionId: params.sessionId,
      coachId: params.coachId,
      teachingFeeAmount: params.teachingFeeAmount ?? '0.00',
      bonusAmount: params.bonusAmount ?? '0.00',
      payoutNote: params.payoutNote ?? null,
      payoutFinalizedAt: params.payoutFinalizedAt ?? null,
      createdBy: params.updatedBy ?? null,
      updatedBy: params.updatedBy ?? null,
    });
    return repo.save(entity);
  }

  /**
   * 构造已有结算记录的部分更新字段
   * @param params 更新输入参数
   * @returns 若无任何业务字段需要更新则返回 null
   */
  private buildUpdatePatch(params: {
    readonly teachingFeeAmount?: string;
    readonly bonusAmount?: string;
    readonly payoutNote?: string | null;
    readonly payoutFinalizedAt?: Date | null;
    readonly updatedBy?: number | null;
  }): Partial<CourseSessionCoachEntity> | null {
    const patch: Partial<CourseSessionCoachEntity> = {};
    let hasBusinessChange = false;

    if (params.teachingFeeAmount !== undefined) {
      patch.teachingFeeAmount = params.teachingFeeAmount;
      hasBusinessChange = true;
    }
    if (params.bonusAmount !== undefined) {
      patch.bonusAmount = params.bonusAmount;
      hasBusinessChange = true;
    }
    if (params.payoutNote !== undefined) {
      patch.payoutNote = params.payoutNote;
      hasBusinessChange = true;
    }
    if (params.payoutFinalizedAt !== undefined) {
      patch.payoutFinalizedAt = params.payoutFinalizedAt;
      hasBusinessChange = true;
    }

    if (!hasBusinessChange) {
      return null;
    }

    if (params.updatedBy !== undefined) {
      patch.updatedBy = params.updatedBy;
    }

    return patch;
  }
}
