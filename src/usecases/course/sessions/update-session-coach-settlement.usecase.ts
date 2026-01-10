// src/usecases/course/sessions/update-session-coach-settlement.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CourseSessionCoachEntity } from '@src/modules/course/session-coaches/course-session-coach.entity';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { DataSource, EntityManager } from 'typeorm';

export interface SetSessionCoachPayoutInput {
  readonly session: UsecaseSession;
  readonly sessionId: number;
  readonly coachId: number;
  readonly teachingFeeAmount?: string;
  readonly bonusAmount?: string;
  readonly payoutNote?: string | null;
  readonly payoutFinalizedAt?: Date | null;
  readonly manager?: EntityManager;
}

@Injectable()
export class SetSessionCoachPayoutUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 按节次-教练设置课酬结算信息
   * - 权限：仅 manager / admin 允许调用（通过角色层级扩展判定）
   * - 约束：已被移出 roster 的记录禁止修改；已最终确认的记录禁止修改金额
   * - 审计：统一写入 updatedBy
   * - 事务：若外部未传入 manager，则在本用例内开启事务
   * @param input 用例输入参数
   * @returns 更新后的结算记录
   */
  async execute(input: SetSessionCoachPayoutInput): Promise<CourseSessionCoachEntity> {
    const { session } = input;

    if (!hasRole(session.roles, IdentityTypeEnum.MANAGER)) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅 manager / admin 可以设置教练课酬', {
        sessionId: input.sessionId,
        coachId: input.coachId,
      });
    }

    const run = async (manager: EntityManager): Promise<CourseSessionCoachEntity> => {
      const existing = await this.sessionCoachesService.findByUnique({
        sessionId: input.sessionId,
        coachId: input.coachId,
        manager,
      });

      if (existing && existing.removedAt !== null) {
        throw new DomainError(
          SESSION_ERROR.SESSION_STATUS_INVALID,
          '该教练已从本节次 roster 移除，无法编辑课酬',
          {
            sessionId: input.sessionId,
            coachId: input.coachId,
          },
        );
      }

      if (existing && existing.payoutFinalizedAt !== null) {
        const teachingChanged =
          input.teachingFeeAmount !== undefined &&
          input.teachingFeeAmount !== existing.teachingFeeAmount;
        const bonusChanged =
          input.bonusAmount !== undefined && input.bonusAmount !== existing.bonusAmount;
        const finalizedChanged =
          input.payoutFinalizedAt !== undefined &&
          input.payoutFinalizedAt?.getTime() !== existing.payoutFinalizedAt.getTime();

        if (teachingChanged || bonusChanged) {
          throw new DomainError(
            SESSION_ERROR.SESSION_STATUS_INVALID,
            '该教练课酬已最终确认，无法修改金额',
            {
              sessionId: input.sessionId,
              coachId: input.coachId,
            },
          );
        }

        if (finalizedChanged) {
          throw new DomainError(
            SESSION_ERROR.SESSION_STATUS_INVALID,
            '该教练课酬已最终确认，无法修改最终确认时间',
            {
              sessionId: input.sessionId,
              coachId: input.coachId,
            },
          );
        }
      }

      const entity = await this.sessionCoachesService.update({
        sessionId: input.sessionId,
        coachId: input.coachId,
        teachingFeeAmount: input.teachingFeeAmount,
        bonusAmount: input.bonusAmount,
        payoutNote: input.payoutNote,
        payoutFinalizedAt: input.payoutFinalizedAt,
        updatedBy: session.accountId,
        manager,
      });

      return entity;
    };

    if (input.manager !== undefined) {
      return await run(input.manager);
    }

    return await this.dataSource.transaction(async (manager) => run(manager));
  }
}
