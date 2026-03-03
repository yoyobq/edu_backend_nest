// 文件位置: /var/www/backend/src/modules/account/queries/learner.query.service.ts
import { Gender } from '@app-types/models/user-info.types';
import { Injectable } from '@nestjs/common';
import { LearnerEntity } from '../identities/training/learner/account-learner.entity';

export type LearnerView = {
  readonly id: number;
  readonly accountId: number | null;
  readonly customerId: number;
  readonly name: string;
  readonly gender: Gender;
  readonly birthDate: string | null;
  readonly avatarUrl: string | null;
  readonly specialNeeds: string | null;
  readonly countPerSession: number;
  readonly remark: string | null;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

@Injectable()
export class LearnerQueryService {
  /**
   * 映射 Learner 只读模型
   * @param entity Learner 实体
   * @returns Learner 只读视图
   */
  toView(entity: LearnerEntity): LearnerView {
    return {
      id: entity.id,
      accountId: entity.accountId ?? null,
      customerId: entity.customerId,
      name: entity.name,
      gender: entity.gender,
      birthDate: entity.birthDate ?? null,
      avatarUrl: entity.avatarUrl ?? null,
      specialNeeds: entity.specialNeeds ?? null,
      countPerSession: entity.countPerSession,
      remark: entity.remark ?? null,
      deactivatedAt: entity.deactivatedAt ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
