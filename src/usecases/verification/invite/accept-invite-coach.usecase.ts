// src/usecases/verification/invite/accept-invite-coach.usecase.ts

import { Injectable } from '@nestjs/common';
import { VerificationFlowResult } from '../types/consume.types';

/**
 * 接受教练邀请用例参数
 */
export interface AcceptInviteCoachUsecaseParams {
  /** 验证记录 ID */
  recordId: number;
  /** 消费者账号 ID */
  consumedByAccountId: number;
  /** 其他参数 */
  [key: string]: unknown;
}

/**
 * 接受教练邀请用例
 *
 * 负责处理教练邀请的接受流程，包括：
 * - 验证邀请的有效性
 * - 检查用户权限
 * - 建立教练关系
 * - 更新相关状态
 */
@Injectable()
export class AcceptInviteCoachUsecase {
  /**
   * 执行接受教练邀请流程
   *
   * @param params 用例参数
   * @returns 邀请接受结果
   */
  execute(_params: AcceptInviteCoachUsecaseParams): Promise<VerificationFlowResult> {
    // TODO: 实现接受教练邀请逻辑
    throw new Error('接受教练邀请功能暂未实现');
  }
}
