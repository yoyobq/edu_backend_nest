// src/usecases/verification/password/reset-password.usecase.ts

// TODO: 临时注释掉整个文件内容以避免 ESLint 错误
// 这个文件包含密码重置的业务逻辑，需要在后续开发中重新实现

import { Injectable } from '@nestjs/common';
import { PasswordResetResult } from '../types/consume.types';

/**
 * 密码重置用例参数
 */
export interface ResetPasswordUsecaseParams {
  /** 验证记录 ID */
  recordId: number;
  /** 消费者账号 ID（可选，密码重置可以匿名进行） */
  consumedByAccountId?: number;
  /** 验证记录实体 */
  record: unknown;
}

/**
 * 密码重置用例
 * 处理密码重置验证的具体业务逻辑
 */
@Injectable()
export class ResetPasswordUsecase {
  /**
   * 执行密码重置
   *
   * @param _params 重置参数
   * @returns 重置结果
   */
  execute(_params: ResetPasswordUsecaseParams): Promise<PasswordResetResult> {
    // TODO: 实现密码重置逻辑
    throw new Error('密码重置功能暂未实现');
  }
}
