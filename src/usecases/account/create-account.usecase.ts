// src/usecases/account/create-account.usecase.ts
import { AccountStatus } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { EntityManager } from 'typeorm';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';
import { DomainError, AUTH_ERROR } from '../../core/common/errors/domain-error';

/**
 * 创建账户用例
 * 负责编排账户创建的完整业务流程
 */
@Injectable()
export class CreateAccountUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly passwordPolicyService: PasswordPolicyService,
  ) {}

  /**
   * 创建新账户
   * @param params 创建参数
   * @returns 创建的账户信息
   */
  async execute({
    accountData,
    userInfoData,
    manager,
  }: {
    accountData: Partial<AccountEntity>;
    userInfoData: Partial<UserInfoEntity>;
    manager?: EntityManager; // manager 为可选参数
  }): Promise<AccountEntity> {
    const run = async (m: EntityManager) => this.doCreate(m, accountData, userInfoData);

    // 有外部事务则复用；否则自己开
    return manager ? run(manager) : this.accountService.runTransaction(run);
  }

  /**
   * 实际创建账户的方法
   * @param manager 实体管理器
   * @param accountData 账户数据
   * @param userInfoData 用户信息数据
   * @returns 创建的账户实体
   */
  private async doCreate(
    manager: EntityManager,
    accountData: Partial<AccountEntity>,
    userInfoData: Partial<UserInfoEntity>,
  ): Promise<AccountEntity> {
    // 验证密码是否符合安全策略
    if (accountData.loginPassword) {
      const passwordValidation = this.passwordPolicyService.validatePassword(
        String(accountData.loginPassword),
      );
      if (!passwordValidation.isValid) {
        throw new DomainError(
          AUTH_ERROR.INVALID_PASSWORD,
          `密码不符合安全要求: ${passwordValidation.errors.join(', ')}`,
        );
      }
    }

    // 1) 创建账户（先写临时密码拿到 createdAt）
    const account = manager.create(AccountEntity, {
      ...accountData,
      loginPassword: 'temp',
      status: accountData.status || AccountStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const savedAccount = await manager.save(account);

    // 2) 依据 createdAt 生成最终哈希密码并更新
    const hashedPassword = AccountService.hashPasswordWithTimestamp(
      String(accountData.loginPassword),
      savedAccount.createdAt,
    );
    savedAccount.loginPassword = hashedPassword;
    await manager.save(savedAccount);

    // 3) 写入 UserInfo
    const userInfo = manager.create(UserInfoEntity, {
      ...userInfoData,
      accountId: savedAccount.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await manager.save(userInfo);

    return savedAccount;
  }
}
