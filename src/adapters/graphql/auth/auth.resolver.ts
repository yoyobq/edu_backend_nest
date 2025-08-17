// src/adapters/graphql/auth/auth.resolver.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { AuthLoginModel, LoginResultModel } from '@app-types/models/auth.types';
import { AccountService } from '@modules/account/account.service';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';
import { IdentityUnionType } from '../account/dto/identity/identity-union.type';
import { LoginResult } from '../account/dto/login-result.dto';
import { AuthLoginInput } from './dto/auth-login.input';
import { StaffType } from '../account/dto/identity/staff.dto';
import { CoachType } from '../account/dto/identity/coach.dto';
import { ManagerType } from '../account/dto/identity/manager.dto';

/**
 * 认证相关的 GraphQL Resolver
 */
@Resolver()
export class AuthResolver {
  constructor(
    private readonly loginWithPasswordUsecase: LoginWithPasswordUsecase,
    private readonly accountService: AccountService,
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
    const identity = await this.getIdentityByRole(result.accountId, result.role);

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
  private async getIdentityByRole(
    accountId: number,
    role: IdentityTypeEnum,
  ): Promise<IdentityUnionType | null> {
    try {
      switch (role) {
        case IdentityTypeEnum.STAFF: {
          const entity = await this.accountService.findStaffByAccountId(accountId);
          return entity ? ({ ...entity, staffId: entity.id } as StaffType) : null;
        }

        case IdentityTypeEnum.COACH: {
          const entity = await this.accountService.findCoachByAccountId(accountId);
          return entity ? ({ ...entity, coachId: entity.id } as CoachType) : null;
        }

        case IdentityTypeEnum.MANAGER: {
          const entity = await this.accountService.findManagerByAccountId(accountId);
          return entity ? ({ ...entity, managerId: entity.id } as ManagerType) : null;
        }

        default:
          return null;
      }
    } catch (error) {
      console.error('Error fetching identity:', error);
      return null;
    }
  }
}
