// src/usecases/verification/password/reset-password.usecase.ts

import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import {
  ACCOUNT_ERROR,
  DomainError,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';
import { EntityManager } from 'typeorm';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';

/**
 * 密码重置用例参数
 */
export interface ResetPasswordUsecaseParams {
  /** 验证记录 ID */
  recordId: number;
  /** 目标账户 ID */
  targetAccountId: number;
  /** 新密码 */
  newPassword: string;
  /** 可选的事务管理器 */
  manager?: EntityManager;
}

/**
 * 密码重置用例结果
 */
export interface ResetPasswordUsecaseResult {
  /** 重置密码的账户 ID */
  accountId: number;
  /** 验证记录 ID */
  recordId: number;
}

/**
 * 密码重置用例
 * 处理密码重置验证的具体业务逻辑
 */
@Injectable()
export class ResetPasswordUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly passwordPolicyService: PasswordPolicyService,
  ) {}

  /**
   * 执行密码重置
   *
   * @param params 重置参数
   * @returns 重置结果
   */
  async execute(params: ResetPasswordUsecaseParams): Promise<ResetPasswordUsecaseResult> {
    const { recordId, targetAccountId, newPassword, manager } = params;

    try {
      // 验证新密码是否符合安全策略
      const passwordValidation = this.passwordPolicyService.validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
          `密码不符合安全要求: ${passwordValidation.errors.join(', ')}`,
        );
      }

      // 查找目标账户
      const account = await this.accountService.findOneById(targetAccountId);
      if (!account) {
        throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '目标账户不存在');
      }

      // 使用账户创建时间作为盐值生成新密码哈希
      const hashedPassword = AccountService.hashPasswordWithTimestamp(
        newPassword,
        account.createdAt,
      );

      // 更新账户密码，使用传入的 manager（如果有）
      await this.accountService.updateAccount(
        targetAccountId,
        {
          loginPassword: hashedPassword,
          updatedAt: new Date(),
        },
        manager,
      );

      return {
        accountId: targetAccountId,
        recordId: recordId,
      };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CONSUMPTION_FAILED,
        `密码重置失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }
}
