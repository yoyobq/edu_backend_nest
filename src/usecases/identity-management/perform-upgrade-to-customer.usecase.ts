// src/usecases/identity-management/perform-upgrade-to-customer.usecase.ts

import { AudienceTypeEnum, IdentityTypeEnum } from '@app-types/models/account.types';
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
export interface PerformUpgradeToCustomerParams {
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
export interface PerformUpgradeToCustomerResult {
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
@Injectable()
export class PerformUpgradeToCustomerUsecase {
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
  async execute(params: PerformUpgradeToCustomerParams): Promise<PerformUpgradeToCustomerResult> {
    const { accountId, name, contactPhone, preferredContactTime, remark, audience } = params;

    return await this.accountService.runTransaction(async (manager: EntityManager) => {
      // 0. 显式锁定账户以避免并发覆盖 accessGroup
      await this.accountService.lockByIdForUpdate(accountId, manager);

      // 1. 检查账户是否存在
      const account = await this.accountService.findOneById(accountId, manager);
      if (!account) {
        throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
      }

      // 2. 检查是否已经是客户（幂等返回，不抛错）
      const existingCustomer = await this.customerService.findByAccountId(accountId);
      if (existingCustomer) {
        // 获取当前用户信息
        const userInfo = await this.accountService.findUserInfoByAccountId(accountId, manager);
        if (!userInfo) {
          throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
        }

        return {
          success: false,
          customerId: existingCustomer.id,
          accessToken: '',
          refreshToken: '',
          message: 'ALREADY_CUSTOMER',
          updatedAccessGroup: userInfo.accessGroup.map((item) => item.toString()),
        };
      }

      // 3. 创建客户记录
      const customerEntity = this.customerService.createCustomerEntity({
        accountId,
        name,
        contactPhone,
        preferredContactTime,
        remark,
      });
      const savedCustomer = await this.customerService.saveCustomer(customerEntity, manager);

      // 4. 获取用户信息并更新访问权限组
      const userInfo = await this.accountService.findUserInfoByAccountId(accountId, manager);
      if (!userInfo) {
        throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
      }

      // 添加客户身份到访问权限组（如果还没有的话）
      const updatedAccessGroup = [...userInfo.accessGroup];
      if (!updatedAccessGroup.includes(IdentityTypeEnum.CUSTOMER)) {
        updatedAccessGroup.push(IdentityTypeEnum.CUSTOMER);
      }

      // 更新用户信息
      userInfo.accessGroup = updatedAccessGroup;
      userInfo.metaDigest = updatedAccessGroup;
      await manager.getRepository(UserInfoEntity).save(userInfo);

      // 5. 生成新的 JWT 令牌
      const tokens = this.generateTokens(
        accountId,
        userInfo.nickname,
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
    });
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
