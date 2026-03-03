// src/usecases/verification/password/reset-password.handler.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { Injectable } from '@nestjs/common';
import { VerificationRecordService } from '@src/modules/verification-record/verification-record.service';
import { VerificationFlowContext, VerificationFlowHandler } from '../types/consume.types';
import { PasswordResetHandlerResult } from '@src/usecases/verification/password/reset-password-result.types';
import { ResetPasswordUsecase, ResetPasswordUsecaseResult } from './reset-password.usecase';
import {
  ACCOUNT_ERROR,
  DomainError,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';

/**
 * 密码重置处理器
 * 实现 VerificationFlowHandler 接口，连接验证流程和密码重置用例
 */
@Injectable()
export class ResetPasswordHandler implements VerificationFlowHandler<PasswordResetHandlerResult> {
  readonly supportedTypes = [VerificationRecordType.PASSWORD_RESET];

  constructor(
    private readonly resetPasswordUsecase: ResetPasswordUsecase,
    private readonly verificationRecordService: VerificationRecordService,
  ) {}

  /**
   * 处理密码重置验证流程
   *
   * @param context 验证流程上下文
   * @returns 密码重置结果
   */
  async handle(context: VerificationFlowContext): Promise<PasswordResetHandlerResult> {
    const { recordView, resetPassword, manager } = context;

    // 从上下文载荷中获取新密码
    const newPassword = resetPassword?.newPassword;
    if (!newPassword) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '未提供新密码信息');
    }

    // 获取目标账户 ID
    let targetAccountId: number;
    if (recordView.targetAccountId) {
      targetAccountId = recordView.targetAccountId;
    } else {
      const recordTargetAccountId =
        await this.verificationRecordService.getTargetAccountIdByRecordId({
          recordId: recordView.id,
          manager,
        });
      if (!recordTargetAccountId) {
        throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '验证记录中未找到目标账户');
      }
      targetAccountId = recordTargetAccountId;
    }

    // 调用密码重置用例，传递事务管理器
    const usecaseResult: ResetPasswordUsecaseResult = await this.resetPasswordUsecase.execute({
      recordId: recordView.id,
      targetAccountId,
      newPassword,
      manager, // 传递事务管理器
    });

    // 返回明确的结果结构，使用 usecase 返回的 recordId
    return {
      accountId: usecaseResult.accountId,
      recordId: usecaseResult.recordId,
      success: true,
    };
  }
}
