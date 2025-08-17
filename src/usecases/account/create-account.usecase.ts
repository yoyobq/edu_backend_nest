// src/usecases/account/create-account.usecase.ts
import { AccountService } from '@modules/account/account.service';
import { AccountEntity } from '@modules/account/entities/account.entity';
import { UserInfoEntity } from '@modules/account/entities/user-info.entity';
import { AccountStatus } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * 创建账户用例
 * 负责编排账户创建的完整业务流程
 */
@Injectable()
export class CreateAccountUsecase {
  constructor(private readonly accountService: AccountService) {}

  /**
   * 创建新账户
   * @param params 创建参数
   * @returns 创建的账户信息
   */
  async execute({
    accountData,
    userInfoData,
  }: {
    accountData: Partial<AccountEntity>;
    userInfoData: Partial<UserInfoEntity>;
  }): Promise<AccountEntity> {
    return await this.accountService.runTransaction(async (manager: EntityManager) => {
      // 先创建账户，给密码一个临时值
      const account = manager.create(AccountEntity, {
        ...accountData,
        loginPassword: 'temp', // 临时密码，稍后会更新
        status: accountData.status || AccountStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const savedAccount = await manager.save(account);

      // 使用账户创建时间作为盐值加密密码
      const hashedPassword = AccountService.hashPasswordWithTimestamp(
        accountData.loginPassword as string,
        savedAccount.createdAt,
      );

      // 更新账户密码
      savedAccount.loginPassword = hashedPassword;
      await manager.save(savedAccount);

      // 创建用户信息
      const userInfo = manager.create(UserInfoEntity, {
        ...userInfoData,
        accountId: savedAccount.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await manager.save(userInfo);

      return savedAccount;
    });
  }
}
