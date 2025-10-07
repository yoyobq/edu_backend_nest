// src/adapters/graphql/identity-management/identity-management.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { PerformUpgradeToCustomerUsecase } from '@src/usecases/identity-management/perform-upgrade-to-customer.usecase';
import { UpgradeToCustomerInput } from './dto/upgrade-to-customer.input';
import { UpgradeToCustomerResult } from './dto/upgrade-to-customer.result';

/**
 * 身份管理 GraphQL 解析器
 * 提供身份升级、转换等相关功能
 */
@Resolver()
export class IdentityManagementResolver {
  constructor(private readonly performUpgradeToCustomerUsecase: PerformUpgradeToCustomerUsecase) {}

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
      weappOpenId: input.weappOpenId,
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
          : IdentityTypeEnum.LEARNER, // 否则返回 LEARNER
      tokens:
        result.success || result.message === 'ALREADY_CUSTOMER'
          ? {
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
            }
          : null,
    };
  }
}
