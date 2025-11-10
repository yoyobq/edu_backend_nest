// src/adapters/graphql/identity-management/identity-management.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { AudienceTypeEnum, IdentityTypeEnum } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { DecideLoginRoleUsecase } from '@src/usecases/auth/decide-login-role.usecase';
import { UpgradeToCoachUsecase } from '@src/usecases/identity-management/coach/upgrade-to-coach.usecase';
import { UpgradeToCustomerUsecase } from '@src/usecases/identity-management/customer/upgrade-to-customer.usecase';
import { UpgradeToCoachInput } from './dto/upgrade-to-coach.input';
import { UpgradeToCoachResult } from './dto/upgrade-to-coach.result';
import { UpgradeToCustomerInput } from './dto/upgrade-to-customer.input';
import { UpgradeToCustomerResult } from './dto/upgrade-to-customer.result';

/**
 * 身份管理 GraphQL 解析器
 * 提供身份升级、转换等相关功能
 */
@Resolver()
export class IdentityManagementResolver {
  constructor(
    private readonly upgradeToCustomerUsecase: UpgradeToCustomerUsecase,
    private readonly upgradeToCoachUsecase: UpgradeToCoachUsecase,
    private readonly decideLoginRoleUsecase: DecideLoginRoleUsecase,
  ) {}

  /**
   * 升级为客户身份
   * @param input 升级参数
   * @param user 当前登录用户信息
   * @returns 升级结果
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => UpgradeToCustomerResult, { description: '升级为客户身份' })
  async upgradeToCustomer(
    @Args('input') input: UpgradeToCustomerInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpgradeToCustomerResult> {
    // 调用 usecase 执行升级逻辑
    const result: import('@src/usecases/identity-management/customer/upgrade-to-customer.usecase').UpgradeToCustomerResult =
      await this.upgradeToCustomerUsecase.execute({
        accountId: user.sub,
        name: input.name,
        contactPhone: input.contactPhone || '',
        preferredContactTime: input.preferredContactTime,
        remark: input.remark,
        audience: input.audience,
      });

    // 将 usecase 结果转换为 GraphQL DTO（通过工厂函数构造纯对象）
    const tokensForCustomer: { accessToken: string; refreshToken: string } | null = result.success
      ? { accessToken: result.accessToken, refreshToken: result.refreshToken }
      : null;
    const outputCustomer: UpgradeToCustomerResult = this.buildUpgradeToCustomerResult({
      upgraded: result.success,
      customerId: result.customerId,
      accessGroup: result.updatedAccessGroup,
      role: result.success
        ? IdentityTypeEnum.CUSTOMER
        : result.updatedAccessGroup.includes('CUSTOMER')
          ? IdentityTypeEnum.CUSTOMER
          : this.determineRoleFromAccessGroup(result.updatedAccessGroup),
      tokens: tokensForCustomer,
    });
    return outputCustomer;
  }

  /**
   * 升级为教练身份
   * @param input 升级参数
   * @param user 当前登录用户信息
   * @returns 升级结果
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => UpgradeToCoachResult, { description: '升级为教练身份' })
  async upgradeToCoach(
    @Args('input') input: UpgradeToCoachInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpgradeToCoachResult> {
    // 使用安全的输入规整，避免对可能为 unknown 的值进行不安全访问
    const safe = this.sanitizeUpgradeToCoachInput(input);
    const result: import('@src/usecases/identity-management/coach/upgrade-to-coach.usecase').UpgradeToCoachResult =
      await this.upgradeToCoachUsecase.execute({
        accountId: Number(user.sub),
        name: safe.name,
        level: safe.level,
        description: safe.description ?? null,
        avatarUrl: safe.avatarUrl ?? null,
        specialty: safe.specialty ?? null,
        remark: safe.remark ?? null,
        audience: safe.audience,
      });

    const tokensForCoach: { accessToken: string; refreshToken: string } | null = result.success
      ? { accessToken: result.accessToken, refreshToken: result.refreshToken }
      : null;
    const outputCoach: UpgradeToCoachResult = this.buildUpgradeToCoachResult({
      upgraded: result.success,
      coachId: result.coachId,
      accessGroup: result.updatedAccessGroup,
      role: result.success
        ? IdentityTypeEnum.COACH
        : result.updatedAccessGroup.includes('COACH')
          ? IdentityTypeEnum.COACH
          : this.determineRoleFromAccessGroup(result.updatedAccessGroup),
      tokens: tokensForCoach,
    });
    return outputCoach;
  }

  /**
   * 从 accessGroup 中决策用户角色
   * @param accessGroup 用户的访问组
   * @returns 决策后的角色
   */
  private determineRoleFromAccessGroup(accessGroup: string[]): IdentityTypeEnum {
    // 将 string[] 转换为 IdentityTypeEnum[]
    const accessGroupEnum = accessGroup
      .map((role) => role as IdentityTypeEnum)
      .filter((role) => Object.values(IdentityTypeEnum).includes(role));

    // 使用 DecideLoginRoleUsecase 进行角色决策（同步调用）
    const { finalRole } = this.decideLoginRoleUsecase.execute(
      {
        roleFromHint: null, // 没有 hint，让决策逻辑使用 fallback
        accessGroup: accessGroupEnum,
      },
      {
        accountId: 0, // 这里不需要真实的 accountId，因为只是为了角色决策
        ip: '',
        userAgent: '',
        audience: AudienceTypeEnum.DESKTOP,
      },
    );

    return finalRole;
  }

  /**
   * 构造 UpgradeToCustomerResult 的安全返回对象
   * @param params 返回字段集合
   * @returns UpgradeToCustomerResult 返回对象
   */
  private buildUpgradeToCustomerResult(params: {
    upgraded: boolean;
    customerId: number | null;
    accessGroup: string[];
    role: IdentityTypeEnum;
    tokens: { accessToken: string; refreshToken: string } | null;
  }): UpgradeToCustomerResult {
    return {
      upgraded: params.upgraded,
      customerId: params.customerId,
      accessGroup: params.accessGroup,
      role: params.role,
      tokens: params.tokens ? { ...params.tokens } : null,
    };
  }

  /**
   * 构造 UpgradeToCoachResult 的安全返回对象
   * @param params 返回字段集合
   * @returns UpgradeToCoachResult 返回对象
   */
  private buildUpgradeToCoachResult(params: {
    upgraded: boolean;
    coachId: number | null;
    accessGroup: string[];
    role: IdentityTypeEnum;
    tokens: { accessToken: string; refreshToken: string } | null;
  }): UpgradeToCoachResult {
    return {
      upgraded: params.upgraded,
      coachId: params.coachId,
      accessGroup: params.accessGroup,
      role: params.role,
      tokens: params.tokens ? { ...params.tokens } : null,
    };
  }

  /**
   * 对 UpgradeToCoachInput 做安全规整
   * 说明：避免直接读取可能为 unknown 的成员，统一做类型收敛与默认值处理
   */
  private sanitizeUpgradeToCoachInput(input: unknown): {
    name: string;
    level?: number;
    description?: string | null;
    avatarUrl?: string | null;
    specialty?: string | null;
    remark?: string | null;
    audience: AudienceTypeEnum;
  } {
    const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

    const name = typeof o.name === 'string' ? o.name : '';
    const level = typeof o.level === 'number' ? o.level : undefined;
    const description = typeof o.description === 'string' ? o.description : null;
    const avatarUrl = typeof o.avatarUrl === 'string' ? o.avatarUrl : null;
    const specialty = typeof o.specialty === 'string' ? o.specialty : null;
    const remark = typeof o.remark === 'string' ? o.remark : null;

    let audience: AudienceTypeEnum = AudienceTypeEnum.DESKTOP;
    const audienceRaw = o.audience;
    if (typeof audienceRaw === 'string') {
      const candidate = audienceRaw as AudienceTypeEnum;
      if (Object.values(AudienceTypeEnum).includes(candidate)) {
        audience = candidate;
      }
    }

    return {
      name,
      level,
      description,
      avatarUrl,
      specialty,
      remark,
      audience,
    };
  }
}
