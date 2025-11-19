// src/usecases/identity-management/customer/upgrade-to-customer.usecase.ts

import { AccountStatus, AudienceTypeEnum, IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { ACCOUNT_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import { TokenHelper } from '@src/core/common/token/token.helper';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { EntityManager } from 'typeorm';

/**
 * 升级到客户用例的输入参数
 */
/**
 * 升级到客户用例的输入参数
 */
export interface UpgradeToCustomerParams {
  /** 账户 ID */
  accountId: number;
  /** 客户姓名 */
  name: string;
  /** 联系电话 */
  contactPhone: string;
  /** 偏好联系时间 */
  preferredContactTime?: string;
  /** 备注 */
  remark?: string;
  /** 客户端类型 */
  audience: AudienceTypeEnum;
}

/**
 * 升级到客户用例的返回结果
 */
/**
 * 升级到客户用例的返回结果
 */
export interface UpgradeToCustomerResult {
  /** 操作是否成功 */
  success: boolean;
  /** 客户 ID */
  customerId: number;
  /** 新的访问令牌 */
  accessToken: string;
  /** 新的刷新令牌 */
  refreshToken: string;
  /** 消息 */
  message: string;
  /** 更新后的访问权限组 */
  updatedAccessGroup: string[];
}

/**
 * 升级到客户用例
 *
 * 负责将普通用户升级为客户身份，包括：
 * 1. 检查用户是否已经是客户
 * 2. 创建客户记录
 * 3. 更新用户访问权限组
 * 4. 生成新的 JWT 令牌
 */
/**
 * 升级到客户身份用例
 *
 * 负责将普通用户升级为客户身份，包括：
 * 1. 检查用户是否已经是客户
 * 2. 创建客户记录
 * 3. 更新用户访问权限组
 * 4. 生成新的 JWT 令牌
 */
@Injectable()
export class UpgradeToCustomerUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly customerService: CustomerService,
    private readonly tokenHelper: TokenHelper,
  ) {}

  /**
   * 执行升级到客户的操作
   * @param params 升级参数
   * @returns 升级结果
   */
  /**
   * 执行升级到客户的操作
   * @param params 升级参数
   * @returns 升级结果
   */
  async execute(params: UpgradeToCustomerParams): Promise<UpgradeToCustomerResult> {
    const { accountId, name, contactPhone, preferredContactTime, remark, audience } = params;
    return await this.accountService.runTransaction((manager: EntityManager) =>
      this.executeInTransaction({
        accountId,
        name,
        contactPhone,
        preferredContactTime,
        remark,
        audience,
        manager,
      }),
    );
  }

  /**
   * 在同一事务中执行升级逻辑，拆分以降低 execute 的行数与复杂度
   */
  /**
   * 在同一事务中执行升级逻辑，拆分以降低 execute 的行数与复杂度
   */
  private async executeInTransaction({
    accountId,
    name,
    contactPhone,
    preferredContactTime,
    remark,
    audience,
    manager,
  }: UpgradeToCustomerParams & {
    manager: EntityManager;
  }): Promise<UpgradeToCustomerResult> {
    // 0. 显式锁定账户以避免并发覆盖 accessGroup
    await this.accountService.lockByIdForUpdate(accountId, manager);

    // 1. 检查账户是否存在
    const account = await this.accountService.findOneById(accountId, manager);
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    // 2. 幂等分支：若已是客户则清理并返回
    const idempotentResult = await this.handleIdempotentBranch(accountId, manager);
    if (idempotentResult) return idempotentResult;

    // 3. 创建客户记录
    const savedCustomer = await this.createCustomer(
      { accountId, name, contactPhone, preferredContactTime, remark },
      manager,
    );

    // 4. 更新用户信息（移除 REGISTRANT 并确保包含 CUSTOMER）
    const updatedAccessGroup = await this.updateUserInfoAccessGroup(accountId, manager);

    // 同步更新账户身份提示为 CUSTOMER，并激活账户状态
    await this.accountService.updateAccount(
      accountId,
      { identityHint: IdentityTypeEnum.CUSTOMER, status: AccountStatus.ACTIVE },
      manager,
    );

    // 5. 生成新的 JWT 令牌
    const tokens = this.generateTokens(
      accountId,
      (await this.accountService.findUserInfoByAccountId(accountId, manager))!.nickname,
      account.loginEmail,
      updatedAccessGroup,
      audience,
    );

    return {
      success: true,
      customerId: savedCustomer.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      message: 'UPGRADE_SUCCESS',
      updatedAccessGroup: updatedAccessGroup.map((item) => item.toString()),
    };
  }

  /**
   * 幂等分支：若已是客户则清理 REGISTRANT 并返回
   */
  private async handleIdempotentBranch(
    accountId: number,
    manager: EntityManager,
  ): Promise<UpgradeToCustomerResult | null> {
    const existingCustomer = await this.customerService.findByAccountId(accountId, manager);
    if (!existingCustomer) return null;

    const userInfo = await this.accountService.findUserInfoByAccountId(accountId, manager);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    const cleanedAccessGroup = userInfo.accessGroup.filter(
      (item) => item !== IdentityTypeEnum.REGISTRANT,
    );
    if (!cleanedAccessGroup.includes(IdentityTypeEnum.CUSTOMER))
      cleanedAccessGroup.push(IdentityTypeEnum.CUSTOMER);

    const needCleanup =
      cleanedAccessGroup.length !== userInfo.accessGroup.length ||
      userInfo.accessGroup.some((item) => item === IdentityTypeEnum.REGISTRANT);
    if (needCleanup) {
      userInfo.accessGroup = cleanedAccessGroup;
      userInfo.metaDigest = cleanedAccessGroup;
      await manager.getRepository(UserInfoEntity).save(userInfo);
    }

    // 幂等情况下也确保账户状态为 ACTIVE，以允许正常登录
    await this.accountService.updateAccount(accountId, { status: AccountStatus.ACTIVE }, manager);

    return {
      success: false,
      customerId: existingCustomer.id,
      accessToken: '',
      refreshToken: '',
      message: 'ALREADY_CUSTOMER',
      updatedAccessGroup: (needCleanup ? cleanedAccessGroup : userInfo.accessGroup).map((item) =>
        item.toString(),
      ),
    };
  }

  private async createCustomer(
    data: {
      accountId: number;
      name: string;
      contactPhone: string;
      preferredContactTime?: string;
      remark?: string;
    },
    manager: EntityManager,
  ) {
    const customerEntity = this.customerService.createCustomerEntity(data);
    return await this.customerService.saveCustomer(customerEntity, manager);
  }

  /**
   * 更新 UserInfo 的 accessGroup，加入 CUSTOMER 并移除 REGISTRANT
   */
  private async updateUserInfoAccessGroup(
    accountId: number,
    manager: EntityManager,
  ): Promise<IdentityTypeEnum[]> {
    const userInfo = await this.accountService.findUserInfoByAccountId(accountId, manager);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    const updatedAccessGroup = userInfo.accessGroup.filter(
      (item) => item !== IdentityTypeEnum.REGISTRANT,
    );
    if (!updatedAccessGroup.includes(IdentityTypeEnum.CUSTOMER))
      updatedAccessGroup.push(IdentityTypeEnum.CUSTOMER);

    userInfo.accessGroup = updatedAccessGroup;
    userInfo.metaDigest = updatedAccessGroup;
    await manager.getRepository(UserInfoEntity).save(userInfo);

    return updatedAccessGroup;
  }

  /**
   * 生成新的访问令牌和刷新令牌
   * @param accountId 账户 ID
   * @param nickname 用户昵称
   * @param loginEmail 登录邮箱
   * @param accessGroup 访问权限组
   * @param audience 客户端类型
   * @returns 令牌对象
   */
  /**
   * 生成新的访问令牌和刷新令牌
   * @param accountId 账户 ID
   * @param nickname 用户昵称
   * @param loginEmail 登录邮箱
   * @param accessGroup 访问权限组
   * @param audience 客户端类型
   * @returns 令牌对象
   */
  private generateTokens(
    accountId: number,
    nickname: string,
    loginEmail: string | null,
    accessGroup: IdentityTypeEnum[],
    audience: AudienceTypeEnum,
  ): { accessToken: string; refreshToken: string } {
    // 使用 TokenHelper 的 createPayloadFromUser 方法创建 payload
    const jwtPayload = this.tokenHelper.createPayloadFromUser({
      id: accountId,
      nickname,
      loginEmail,
      accessGroup: accessGroup.map((item) => item.toString()),
    });

    // 生成访问令牌
    const accessToken = this.tokenHelper.generateAccessToken({
      payload: jwtPayload,
      audience,
    });

    // 生成刷新令牌
    const refreshToken = this.tokenHelper.generateRefreshToken({
      payload: { sub: jwtPayload.sub },
      audience,
    });

    return { accessToken, refreshToken };
  }
}
