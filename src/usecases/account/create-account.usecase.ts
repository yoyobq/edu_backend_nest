// src/usecases/account/create-account.usecase.ts
import { AccountStatus } from '@app-types/models/account.types';
import { AccountService } from '@modules/account/account.service';
import { AccountEntity } from '@modules/account/entities/account.entity';
import { UserInfoEntity } from '@modules/account/entities/user-info.entity';
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
