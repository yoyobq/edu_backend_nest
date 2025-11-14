// src/modules/participation-attendance/participation-attendance.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ParticipationAttendanceRecordEntity } from './participation-attendance-record.entity';

/**
 * 出勤记录写入参数（按 session + learner 定位）
 */
type UpsertSessionLearnerInput = {
  sessionId: number;
  learnerId: number;
  enrollmentId: number;
  countApplied?: string;
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
  confirmedByCoachId?: number | null;
  confirmedAt?: Date | null;
  finalizedBy?: number | null;
  finalizedAt?: Date | null;
  remark?: string | null;
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
   * 判断某节次是否已全部定稿（至少存在一条且无未定稿记录）
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
      confirmedByCoachId: data.confirmedByCoachId ?? null,
      confirmedAt: data.confirmedAt ?? null,
      finalizedBy: data.finalizedBy ?? null,
      finalizedAt: data.finalizedAt ?? null,
      remark: data.remark ?? null,
    };
  }
}
