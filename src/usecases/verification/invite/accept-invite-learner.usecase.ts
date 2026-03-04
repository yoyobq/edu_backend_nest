// src/usecases/verification/invite/accept-invite-learner.usecase.ts

import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationFlowResult } from '../types/consume.types';

/**
 * 接受学员邀请用例参数
 */
export interface AcceptInviteLearnerUsecaseParams {
  /** 验证记录 ID */
  recordId: number;
  /** 消费者账号 ID */
  consumedByAccountId: number;
  /** 其他参数 */
  [key: string]: unknown;
}

/**
 * 接受学员邀请用例
 *
 * 负责处理学员邀请的接受流程，包括：
 * - 验证邀请的有效性
 * - 检查用户权限
 * - 建立学员关系
 * - 更新相关状态
 */
@Injectable()
export class AcceptInviteLearnerUsecase {
  /**
   * 执行接受学员邀请流程
   *
   * @param params 用例参数
   * @returns 邀请接受结果
   */
  execute(_params: AcceptInviteLearnerUsecaseParams): Promise<VerificationFlowResult> {
    // TODO: 实现接受学员邀请逻辑
    throw new DomainError(
      VERIFICATION_RECORD_ERROR.OPERATION_NOT_SUPPORTED,
      '接受学员邀请功能暂未实现',
    );
  }
}
