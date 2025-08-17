// src/usecases/account/validate-login.usecase.ts
import { AccountStatus } from '@app-types/models/account.types';
import { AuthLoginModel } from '@app-types/models/auth.types';
import { AUTH_ERROR, DomainError } from '@core/common/errors';
import { AccountService } from '@modules/account/account.service';
import { AccountEntity } from '@modules/account/entities/account.entity';
import { Injectable } from '@nestjs/common';

/**
 * 用户登录验证用例
 * 负责编排登录验证的业务流程
 */
@Injectable()
export class ValidateLoginUsecase {
  constructor(private readonly accountService: AccountService) {}

  /**
   * 执行登录验证
   * @param params 登录参数
   * @returns 验证通过的账户信息
   */
  async execute({
    loginName,
    loginPassword,
  }: Pick<AuthLoginModel, 'loginName' | 'loginPassword'>): Promise<AccountEntity> {
    // 查找账户（支持登录名或邮箱）
    const account = await this.accountService.findByLoginName(loginName);
    if (!account) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    // 检查账户状态
    if (account.status !== AccountStatus.ACTIVE) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_INACTIVE, '账户未激活或已被禁用');
    }

    // 验证密码
    const isPasswordValid = AccountService.verifyPassword(
      loginPassword,
      account.loginPassword,
      account.createdAt,
    );

    if (!isPasswordValid) {
      throw new DomainError(AUTH_ERROR.INVALID_PASSWORD, '密码错误');
    }

    return account;
  }
}
