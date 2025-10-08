// src/adapters/graphql/identity-management/identity-management.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { IdentityTypeEnum, AudienceTypeEnum } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { PerformUpgradeToCustomerUsecase } from '@src/usecases/identity-management/perform-upgrade-to-customer.usecase';
import { DecideLoginRoleUsecase } from '@src/usecases/auth/decide-login-role.usecase';
import { UpgradeToCustomerInput } from './dto/upgrade-to-customer.input';
import { UpgradeToCustomerResult } from './dto/upgrade-to-customer.result';

/**
 * 身份管理 GraphQL 解析器
 * 提供身份升级、转换等相关功能
 */
@Resolver()
export class IdentityManagementResolver {
  constructor(
    private readonly performUpgradeToCustomerUsecase: PerformUpgradeToCustomerUsecase,
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
    const result = await this.performUpgradeToCustomerUsecase.execute({
      accountId: user.sub,
      name: '客户', // 默认名称，因为当前 GraphQL input 没有 name 字段
      contactPhone: '未提供', // 默认电话，因为当前 GraphQL input 没有 contactPhone 字段
      audience: input.audience,
    });

    // 将 usecase 结果转换为 GraphQL DTO
    return {
      upgraded: result.success,
      customerId: result.customerId,
      accessGroup: result.updatedAccessGroup, // 使用 usecase 返回的 updatedAccessGroup
      role: result.success
        ? IdentityTypeEnum.CUSTOMER // 成功时固定返回 CUSTOMER
        : result.updatedAccessGroup.includes('CUSTOMER')
          ? IdentityTypeEnum.CUSTOMER // 幂等情况下，如果包含 CUSTOMER 则返回 CUSTOMER
          : this.determineRoleFromAccessGroup(result.updatedAccessGroup), // 使用角色决策逻辑
      tokens: result.success
        ? {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          }
        : null,
    };
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
}
