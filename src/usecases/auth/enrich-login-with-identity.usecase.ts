// src/usecases/auth/enrich-login-with-identity.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { IdentityUnionType } from '../../adapters/graphql/account/dto/identity/identity-union.type';
import {
  EnrichedLoginResult,
  EnrichLoginWithIdentityInput,
  IEnrichLoginWithIdentityUsecase,
  LoginWarningType,
  MinimalAccountInfo,
  MinimalUserInfo,
} from '../../types/auth/login-flow.types';
import { FetchIdentityByRoleUsecase, RawIdentity } from '../account/fetch-identity-by-role.usecase';

/**
 * 登录身份装配用例
 * 职责：根据最终角色获取身份信息，构造完整的客户端响应体
 */
@Injectable()
export class EnrichLoginWithIdentityUsecase implements IEnrichLoginWithIdentityUsecase {
  constructor(
    private readonly fetchIdentityByRoleUsecase: FetchIdentityByRoleUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EnrichLoginWithIdentityUsecase.name);
  }

  /**
   * 执行身份装配逻辑
   * @param input 身份装配输入参数
   * @returns 增强的登录结果
   */
  async execute(input: EnrichLoginWithIdentityInput): Promise<EnrichedLoginResult> {
    const { tokens, accountId, finalRole, accessGroup, account, userInfo, options = {} } = input;

    // 设置默认选项
    const { includeIdentity = true, includeAccount = true, includeUserInfo = true } = options;

    const warnings: string[] = [];
    // 修复：将 identity 类型从 unknown 改为 IdentityUnionType | null
    let identity: IdentityUnionType | null = null;

    // 身份装配逻辑
    if (includeIdentity) {
      const identityProcessingResult = await this.processIdentityByRole(
        finalRole,
        accountId,
        warnings,
      );
      identity = identityProcessingResult.identity as IdentityUnionType | null;
      warnings.push(...identityProcessingResult.warnings);
    }

    // 构造完整的客户端响应体
    const result = this.buildEnrichedResult({
      tokens,
      accountId,
      finalRole,
      accessGroup: accessGroup.map((group) => group), // 修复：转换 string[] 为 IdentityTypeEnum[]
      account,
      userInfo,
      identity,
      warnings,
      includeAccount,
      includeUserInfo,
    });

    // 记录成功日志
    this.logEnrichmentCompletion(accountId, finalRole, identity, warnings);

    return result;
  }

  /**
   * 根据角色处理身份信息
   * @param finalRole 最终角色
   * @param accountId 账户ID
   * @param warnings 警告列表
   * @returns 身份处理结果
   */
  private async processIdentityByRole(
    finalRole: IdentityTypeEnum,
    accountId: number,
    warnings: string[],
  ): Promise<{ identity: unknown; warnings: string[] }> {
    if (finalRole === IdentityTypeEnum.REGISTRANT) {
      // REGISTRANT 角色不需要查询身份信息
      return { identity: null, warnings };
    }

    // 其他角色需要查询身份信息
    try {
      const identityResult = await this.fetchIdentityByRoleUsecase.execute({
        accountId,
        role: finalRole,
      });

      return this.handleIdentityResult(identityResult, accountId, finalRole, warnings);
    } catch (error) {
      // 身份查询失败
      warnings.push(LoginWarningType.IDENTITY_UNAVAILABLE);
      this.logger.error(
        {
          accountId,
          finalRole,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to fetch identity for account ${accountId} with role ${finalRole}`,
      );
      return { identity: null, warnings };
    }
  }

  /**
   * 处理身份查询结果
   * @param identityResult 身份查询结果
   * @param accountId 账户ID
   * @param finalRole 最终角色
   * @param warnings 警告列表
   * @returns 处理后的身份信息和警告
   */
  private handleIdentityResult(
    identityResult: RawIdentity,
    accountId: number,
    finalRole: IdentityTypeEnum,
    warnings: string[],
  ): { identity: unknown; warnings: string[] } {
    // 修复：正确处理 RawIdentity 类型，检查是否有 data 属性
    if (identityResult.kind === 'NONE') {
      // 查无身份信息
      warnings.push(LoginWarningType.IDENTITY_UNAVAILABLE);
      this.logger.warn(
        {
          accountId,
          finalRole,
        },
        `Identity not found for account ${accountId} with role ${finalRole}`,
      );
      return { identity: null, warnings };
    }

    // 有身份信息的情况，检查是否被停用
    const identityData = identityResult.data;
    const isDisabled = this.checkIdentityDisabled(identityData);

    if (isDisabled) {
      warnings.push(LoginWarningType.IDENTITY_DISABLED);
      this.logger.warn(
        {
          accountId,
          finalRole,
          identityStatus: 'disabled',
        },
        `Identity disabled for account ${accountId} with role ${finalRole}`,
      );
      return { identity: null, warnings };
    }

    return { identity: identityData, warnings };
  }

  /**
   * 检查身份是否被停用
   * @param identityData 身份数据
   * @returns 是否被停用
   */
  private checkIdentityDisabled(identityData: unknown): boolean {
    if (identityData && typeof identityData === 'object' && 'status' in identityData) {
      const status = (identityData as { status?: string }).status;
      return status === 'SUSPENDED' || status === 'LEFT' || status === 'INACTIVE';
    }
    return false;
  }

  /**
   * 构建增强的登录结果
   * @param params 构建参数
   * @returns 增强的登录结果
   */
  private buildEnrichedResult(params: {
    tokens: { accessToken: string; refreshToken: string };
    accountId: number;
    finalRole: IdentityTypeEnum;
    accessGroup: IdentityTypeEnum[];
    account: MinimalAccountInfo;
    userInfo: MinimalUserInfo;
    identity: IdentityUnionType | null;
    warnings: string[];
    includeAccount: boolean;
    includeUserInfo: boolean;
  }): EnrichedLoginResult {
    const {
      tokens,
      accountId,
      finalRole,
      accessGroup,
      account,
      userInfo,
      identity,
      warnings,
      includeAccount,
      includeUserInfo,
    } = params;

    const result: EnrichedLoginResult = {
      // 认证信息
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accountId,

      // 角色和身份
      role: finalRole,
      identity,
      accessGroup,

      // 警告信息（仅在有警告时包含）
      ...(warnings.length > 0 && { warnings }),
    };

    // 只在需要时添加可选字段
    if (includeAccount) {
      result.account = account;
    }

    if (includeUserInfo) {
      result.userInfo = userInfo;
    }

    return result;
  }

  /**
   * 记录装配完成日志
   * @param accountId 账户ID
   * @param finalRole 最终角色
   * @param identity 身份信息
   * @param warnings 警告列表
   */
  private logEnrichmentCompletion(
    accountId: number,
    finalRole: IdentityTypeEnum,
    identity: unknown,
    warnings: string[],
  ): void {
    this.logger.info(
      {
        accountId,
        finalRole,
        hasIdentity: identity !== null,
        warningsCount: warnings.length,
        warnings,
      },
      `Login enrichment completed for account ${accountId}`,
    );
  }

  // 删除这两个方法，因为不再需要创建空对象占位
  // private createEmptyAccountInfo(): MinimalAccountInfo {
  // return {
  //   id: 0,
  //   loginName: null,
  //   loginEmail: null,
  //   status: '',
  //   identityHint: null,
  //   createdAt: new Date(0),
  //   updatedAt: new Date(0),
  // };
  // }

  // private createEmptyUserInfo(): MinimalUserInfo {
  // return {
  //   id: 0,
  //   accountId: 0,
  //   nickname: '',
  //   avatarUrl: null,
  //   createdAt: new Date(0),
  //   updatedAt: new Date(0),
  // };
  // }
}
