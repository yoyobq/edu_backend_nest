// src/usecases/auth/enrich-login-with-identity.usecase.ts

import { LoginWarningType } from '@app-types/auth/login-flow.types';
import { EmploymentStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { Gender } from '@app-types/models/user-info.types';
import { parseStaffId } from '@core/account/identity/parse-staff-id';
import { LoginResultQueryService } from '@modules/auth/queries/login-result.query.service';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { PinoLogger } from 'nestjs-pino';
import {
  EnrichedLoginResult,
  EnrichLoginWithIdentityInput,
  IEnrichLoginWithIdentityUsecase,
} from '../../types/auth/login-flow.types';

type StaffIdentity = {
  id: number;
  accountId: number;
  name: string;
  departmentId: number | null;
  remark: string | null;
  jobTitle: string | null;
  employmentStatus: EmploymentStatus;
  createdAt: Date;
  updatedAt: Date;
};

type CoachIdentity = {
  id: number;
  accountId: number;
  name: string;
  remark: string | null;
  specialty: string | null;
  employmentStatus: EmploymentStatus;
  createdAt: Date;
  updatedAt: Date;
};

type ManagerIdentity = {
  id: number;
  accountId: number;
  name: string;
  remark: string | null;
  employmentStatus: EmploymentStatus;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerIdentity = {
  id: number;
  accountId: number | null;
  name: string;
  contactPhone: string | null;
  preferredContactTime: string | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LearnerIdentity = {
  id: number;
  accountId: number | null;
  customerId: number;
  name: string;
  gender: Gender;
  birthDate: string | null;
  avatarUrl: string | null;
  specialNeeds: string | null;
  countPerSession: number | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 登录身份装配用例
 * 职责：根据最终角色获取身份信息，构造完整的客户端响应体
 */
@Injectable()
export class EnrichLoginWithIdentityUsecase implements IEnrichLoginWithIdentityUsecase {
  constructor(
    private readonly loginResultQueryService: LoginResultQueryService,
    private readonly accountService: AccountService,
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

    const warnings: LoginWarningType[] = [];
    let identity: unknown = null;

    if (includeIdentity) {
      const identityResult = await this.queryIdentityByRole({
        accountId,
        role: finalRole,
      });
      identity = identityResult.identity;
      warnings.push(...identityResult.warnings);
    }

    const result = this.loginResultQueryService.toEnrichedLoginResult({
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
    });

    // 记录成功日志
    this.logEnrichmentCompletion(accountId, finalRole, identity, warnings);

    return result;
  }

  private async queryIdentityByRole(params: {
    accountId: number;
    role: IdentityTypeEnum;
  }): Promise<{ identity: unknown; warnings: LoginWarningType[] }> {
    const { accountId, role } = params;
    const warnings: LoginWarningType[] = [];

    if (role === IdentityTypeEnum.REGISTRANT) {
      return { identity: null, warnings };
    }

    try {
      const identityResult = await this.findIdentityByRole({ accountId, role });
      if (!identityResult.found || identityResult.identity === null) {
        warnings.push(LoginWarningType.IDENTITY_UNAVAILABLE);
        return { identity: null, warnings };
      }
      if (this.checkIdentityDisabled(identityResult.identity)) {
        warnings.push(LoginWarningType.IDENTITY_DISABLED);
        return { identity: null, warnings };
      }
      return { identity: identityResult.identity, warnings };
    } catch {
      warnings.push(LoginWarningType.IDENTITY_UNAVAILABLE);
      return { identity: null, warnings };
    }
  }

  private async findIdentityByRole(params: {
    role: IdentityTypeEnum;
    accountId: number;
  }): Promise<{ found: boolean; identity: unknown }> {
    const { role, accountId } = params;
    switch (role) {
      case IdentityTypeEnum.STAFF:
        return await this.findStaffIdentity(accountId);
      case IdentityTypeEnum.COACH:
        return await this.findCoachIdentity(accountId);
      case IdentityTypeEnum.MANAGER:
        return await this.findManagerIdentity(accountId);
      case IdentityTypeEnum.CUSTOMER:
        return await this.findCustomerIdentity(accountId);
      case IdentityTypeEnum.LEARNER:
        return await this.findLearnerIdentity(accountId);
      default:
        return { found: false, identity: null };
    }
  }

  private async findStaffIdentity(
    accountId: number,
  ): Promise<{ found: boolean; identity: unknown }> {
    const entity = await this.accountService.findStaffByAccountId(accountId);
    if (!entity) {
      return { found: false, identity: null };
    }
    const identity: StaffIdentity = {
      id: parseStaffId({ id: entity.id }),
      accountId: entity.accountId,
      name: entity.name,
      departmentId: entity.departmentId,
      remark: entity.remark,
      jobTitle: entity.jobTitle,
      employmentStatus: entity.employmentStatus,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    return { found: true, identity };
  }

  private async findCoachIdentity(
    accountId: number,
  ): Promise<{ found: boolean; identity: unknown }> {
    const entity = await this.accountService.findCoachByAccountId(accountId);
    if (!entity || entity.deactivatedAt) {
      return { found: false, identity: null };
    }
    const identity: CoachIdentity = {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      remark: entity.remark,
      specialty: entity.specialty,
      employmentStatus: EmploymentStatus.ACTIVE,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    return { found: true, identity };
  }

  private async findManagerIdentity(
    accountId: number,
  ): Promise<{ found: boolean; identity: unknown }> {
    const entity = await this.accountService.findManagerByAccountId(accountId);
    if (!entity || entity.deactivatedAt) {
      return { found: false, identity: null };
    }
    const identity: ManagerIdentity = {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      remark: entity.remark,
      employmentStatus: EmploymentStatus.ACTIVE,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    return { found: true, identity };
  }

  private async findCustomerIdentity(
    accountId: number,
  ): Promise<{ found: boolean; identity: unknown }> {
    const entity = await this.accountService.findCustomerByAccountId(accountId);
    if (!entity || entity.deactivatedAt) {
      return { found: false, identity: null };
    }
    const identity: CustomerIdentity = {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      contactPhone: entity.contactPhone,
      preferredContactTime: entity.preferredContactTime,
      remark: entity.remark,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    return { found: true, identity };
  }

  private async findLearnerIdentity(
    accountId: number,
  ): Promise<{ found: boolean; identity: unknown }> {
    const entity = await this.accountService.findLearnerByAccountId(accountId);
    if (!entity) {
      return { found: false, identity: null };
    }
    const identity: LearnerIdentity = {
      id: entity.id,
      accountId: entity.accountId,
      customerId: entity.customerId,
      name: entity.name,
      gender: entity.gender,
      birthDate: entity.birthDate,
      avatarUrl: entity.avatarUrl,
      specialNeeds: entity.specialNeeds,
      countPerSession: entity.countPerSession,
      remark: entity.remark,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    return { found: true, identity };
  }

  private checkIdentityDisabled(identityData: unknown): boolean {
    if (identityData && typeof identityData === 'object' && 'status' in identityData) {
      const status = (identityData as { status?: string }).status;
      return status === 'SUSPENDED' || status === 'LEFT' || status === 'INACTIVE';
    }
    return false;
  }

  /**
   * 记录装配完成日志
   * @param accountId 账户 ID
   * @param finalRole 最终角色
   * @param identity 身份信息
   * @param warnings 警告列表
   */
  private logEnrichmentCompletion(
    accountId: number,
    finalRole: IdentityTypeEnum,
    identity: unknown,
    warnings: LoginWarningType[],
  ): void {
    this.logger.info(
      {
        accountId,
        finalRole,
        hasIdentity: identity !== null,
        warningsCount: warnings.length,
        warnings,
      },
      `账户 ${accountId} 登录信息装配完成`,
    );
  }
}
