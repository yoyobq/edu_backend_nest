// src/modules/participation-enrollment/participation-enrollment.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ParticipationEnrollmentEntity } from './participation-enrollment.entity';

/**
 * 节次报名服务
 * 提供报名的基础读写能力：查询、创建、取消与恢复
 */
@Injectable()
export class ParticipationEnrollmentService {
  constructor(
    @InjectRepository(ParticipationEnrollmentEntity)
    private readonly enrollmentRepository: Repository<ParticipationEnrollmentEntity>,
  ) {}

  /**
   * 按 ID 查询报名
   * @param id 报名 ID
   */
  async findById(id: number): Promise<ParticipationEnrollmentEntity | null> {
    return this.enrollmentRepository.findOne({ where: { id } });
  }

  /**
   * 按 ID 列表批量查询报名
   * @param params 查询参数对象：ids（唯一 ID 列表）、manager（可选事务管理器）
   * @returns 报名实体列表
   */
  async findManyByIds(params: {
    readonly ids: ReadonlyArray<number>;
    readonly manager?: EntityManager;
  }): Promise<ParticipationEnrollmentEntity[]> {
    const repo = params.manager
      ? params.manager.getRepository(ParticipationEnrollmentEntity)
      : this.enrollmentRepository;
    if (params.ids.length === 0) return [];
    return await repo.find({ where: { id: In(params.ids) } });
  }

  /**
   * 按节次查询报名列表（含取消项）
   * @param params 查询参数对象：sessionId
   */
  async findBySession(params: { sessionId: number }): Promise<ParticipationEnrollmentEntity[]> {
    const { sessionId } = params;
    return await this.enrollmentRepository.find({ where: { sessionId } });
  }

  /**
   * 按复合唯一键查询报名（sessionId + learnerId）
   * @param params 查询参数
   */
  async findByUnique(params: {
    sessionId: number;
    learnerId: number;
  }): Promise<ParticipationEnrollmentEntity | null> {
    return this.enrollmentRepository.findOne({
      where: {
        sessionId: params.sessionId,
        learnerId: params.learnerId,
      },
    });
  }

  /**
   * 创建报名（若存在则直接返回）
   * @param data 创建数据
   */
  async create(data: {
    sessionId: number;
    learnerId: number;
    customerId: number;
    remark?: string | null;
    createdBy?: number | null;
  }): Promise<ParticipationEnrollmentEntity> {
    const existing = await this.findByUnique({
      sessionId: data.sessionId,
      learnerId: data.learnerId,
    });
    if (existing) return existing;
    const entity = this.enrollmentRepository.create({
      sessionId: data.sessionId,
      learnerId: data.learnerId,
      customerId: data.customerId,
      isCanceled: 0,
      canceledAt: null,
      canceledBy: null,
      cancelReason: null,
      remark: data.remark ?? null,
      createdBy: data.createdBy ?? null,
      updatedBy: data.createdBy ?? null,
    });
    return this.enrollmentRepository.save(entity);
  }

  /**
   * 取消报名
   * @param id 报名 ID
   * @param params 取消参数
   */
  async cancel(
    id: number,
    params: { canceledBy?: number | null; cancelReason?: string | null },
  ): Promise<ParticipationEnrollmentEntity> {
    await this.enrollmentRepository.update(
      { id },
      {
        isCanceled: 1,
        canceledAt: new Date(),
        canceledBy: params.canceledBy ?? null,
        cancelReason: params.cancelReason ?? null,
      },
    );
    const fresh = await this.enrollmentRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('取消后的报名未找到');
    return fresh;
  }

  /**
   * 恢复报名（撤销取消）
   * @param id 报名 ID
   * @param params 操作人
   */
  async restore(
    id: number,
    params: { updatedBy?: number | null },
  ): Promise<ParticipationEnrollmentEntity> {
    await this.enrollmentRepository.update(
      { id },
      {
        isCanceled: 0,
        canceledAt: null,
        canceledBy: null,
        cancelReason: null,
        updatedBy: params.updatedBy ?? null,
      },
    );
    const fresh = await this.enrollmentRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('恢复后的报名未找到');
    return fresh;
  }

  /**
   * 更新备注
   * @param id 报名 ID
   * @param remark 备注
   */
  async updateRemark(id: number, remark: string | null): Promise<ParticipationEnrollmentEntity> {
    await this.enrollmentRepository.update({ id }, { remark });
    const fresh = await this.enrollmentRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('更新备注后的报名未找到');
    return fresh;
  }

  /**
   * 统计某节次的有效报名人数
   * 有效报名定义：`isCanceled = 0`
   * @param params 统计参数对象
   * @returns 有效报名计数
   */
  async countEffectiveBySession(params: { sessionId: number }): Promise<number> {
    const { sessionId } = params;
    return await this.enrollmentRepository.count({ where: { sessionId, isCanceled: 0 } });
  }

  /**
   * 按学员查询其有效报名列表
   * 有效报名定义：`isCanceled = 0`
   * @param params 查询参数对象
   * @returns 该学员的有效报名列表
   */
  async findActiveByLearnerId(params: {
    learnerId: number;
  }): Promise<ParticipationEnrollmentEntity[]> {
    const { learnerId } = params;
    return await this.enrollmentRepository.find({ where: { learnerId, isCanceled: 0 } });
  }
}
