// src/modules/course-session-coaches/course-session-coaches.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
   * @param params 组合键参数
   */
  async findByUnique(params: {
    sessionId: number;
    coachId: number;
  }): Promise<CourseSessionCoachEntity | null> {
    return this.sessionCoachRepository.findOne({
      where: { sessionId: params.sessionId, coachId: params.coachId },
    });
  }

  /**
   * 创建或更新结算记录（幂等）
   * @param data 创建或更新数据
   */
  async upsert(data: {
    sessionId: number;
    coachId: number;
    teachingFeeAmount?: string;
    bonusAmount?: string;
    payoutNote?: string | null;
    payoutFinalizedAt?: Date | null;
  }): Promise<CourseSessionCoachEntity> {
    const existing = await this.findByUnique({ sessionId: data.sessionId, coachId: data.coachId });
    if (existing) {
      await this.sessionCoachRepository.update(
        { id: existing.id },
        {
          teachingFeeAmount: data.teachingFeeAmount ?? existing.teachingFeeAmount,
          bonusAmount: data.bonusAmount ?? existing.bonusAmount,
          payoutNote: data.payoutNote ?? existing.payoutNote,
          payoutFinalizedAt: data.payoutFinalizedAt ?? existing.payoutFinalizedAt,
        },
      );
      const fresh = await this.sessionCoachRepository.findOne({ where: { id: existing.id } });
      if (!fresh) throw new Error('更新后的结算记录未找到');
      return fresh;
    }
    const entity = this.sessionCoachRepository.create({
      sessionId: data.sessionId,
      coachId: data.coachId,
      teachingFeeAmount: data.teachingFeeAmount ?? '0.00',
      bonusAmount: data.bonusAmount ?? '0.00',
      payoutNote: data.payoutNote ?? null,
      payoutFinalizedAt: data.payoutFinalizedAt ?? null,
    });
    return this.sessionCoachRepository.save(entity);
  }

  /**
   * 更新备注或最终确定时间
   * @param id 记录 ID
   * @param patch 部分更新
   */
  async update(
    id: number,
    patch: Partial<
      Pick<
        CourseSessionCoachEntity,
        'teachingFeeAmount' | 'bonusAmount' | 'payoutNote' | 'payoutFinalizedAt'
      >
    >,
  ): Promise<CourseSessionCoachEntity> {
    await this.sessionCoachRepository.update({ id }, patch);
    const fresh = await this.sessionCoachRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('更新后的结算记录未找到');
    return fresh;
  }
}
