// src/adapters/graphql/auth/auth.resolver.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { AuthLoginModel, LoginResultModel } from '@app-types/models/auth.types';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { FetchIdentityByRoleUsecase } from '@usecases/account/fetch-identity-by-role.usecase';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';
import { CoachType } from '../account/dto/identity/coach.dto';
import { IdentityUnionType } from '../account/dto/identity/identity-union.type';
import { ManagerType } from '../account/dto/identity/manager.dto';
import { StaffType } from '../account/dto/identity/staff.dto';
import { LoginResult } from '../account/dto/login-result.dto';
import { AuthLoginInput } from './dto/auth-login.input';

/**
 * 认证相关的 GraphQL Resolver
 */
@Resolver()
export class AuthResolver {
  constructor(
    private readonly loginWithPasswordUsecase: LoginWithPasswordUsecase,
    private readonly fetchIdentityByRole: FetchIdentityByRoleUsecase,
  ) {}

  /**
   * 用户登录
   */
  @Mutation(() => LoginResult)
  async login(@Args('input') input: AuthLoginInput): Promise<LoginResult> {
    // 将 DTO 转换为领域模型
    const authLoginModel: AuthLoginModel = {
      loginName: input.loginName,
      loginPassword: input.loginPassword,
      type: input.type,
      ip: input.ip,
      audience: input.audience,
    };

    // 调用 usecase
    const result: LoginResultModel = await this.loginWithPasswordUsecase.execute(authLoginModel);

    // 获取身份信息，让 IdentityUnion 自动处理类型解析
    const identity = await this.getIdentityForGraphQL(result.accountId, result.role);

    // 将领域模型转换回 DTO
    const loginResult: LoginResult = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accountId: result.accountId,
      role: result.role,
      identity, // 直接返回原始数据，GraphQL 会自动处理类型解析
    };

    return loginResult;
  }

  /**
   * 根据角色获取身份信息
   */
  private async getIdentityForGraphQL(
    accountId: number,
    role: IdentityTypeEnum,
  ): Promise<IdentityUnionType | null> {
    const raw = await this.fetchIdentityByRole.execute(accountId, role);
    switch (raw.kind) {
      case 'STAFF':
        return { ...raw.data, jobId: raw.data.id } as StaffType;
      case 'COACH':
        return { ...raw.data, coachId: raw.data.id } as CoachType;
      case 'MANAGER':
        return { ...raw.data, managerId: raw.data.id } as ManagerType;
      default:
        return null;
    }
  }
}
