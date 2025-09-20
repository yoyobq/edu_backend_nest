// src/adapters/graphql/auth/auth.resolver.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { AuthLoginModel, LoginResultModel, UserInfoView } from '@app-types/models/auth.types';
import { AccountService } from '@modules/account/base/services/account.service';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { FetchIdentityByRoleUsecase } from '@usecases/account/fetch-identity-by-role.usecase';
import { FetchUserInfoUsecase } from '@usecases/account/fetch-user-info.usecase';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';
import { CoachType } from '../account/dto/identity/coach.dto';
import { CustomerType } from '../account/dto/identity/customer.dto';
import { IdentityUnionType } from '../account/dto/identity/identity-union.type';
import { ManagerType } from '../account/dto/identity/manager.dto';
import { StaffType } from '../account/dto/identity/staff.dto';
import { LoginResult } from '../account/dto/login-result.dto';
import { UserInfoDTO } from '../account/dto/user-info.dto';
import { AuthLoginInput } from './dto/auth-login.input';

/**
 * 认证相关的 GraphQL Resolver
 */
@Resolver()
export class AuthResolver {
  constructor(
    private readonly loginWithPasswordUsecase: LoginWithPasswordUsecase,
    private readonly fetchIdentityByRole: FetchIdentityByRoleUsecase,
    private readonly accountService: AccountService,
    private readonly fetchUserInfoUsecase: FetchUserInfoUsecase,
  ) {}

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

    // 获取用户信息
    const userInfo = await this.getUserInfoForGraphQL(result.accountId);

    // 将领域模型转换回 DTO
    const loginResult: LoginResult = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accountId: result.accountId,
      role: result.role,
      identity, // 直接返回原始数据，GraphQL 会自动处理类型解析
      userInfo,
    };

    return loginResult;
  }

  /**
   * 获取用于 GraphQL 响应的用户信息
   * 如果用户信息不存在，抛出错误中止登录流程
   */
  /**
   * 获取用于 GraphQL 响应的用户信息
   * 使用现有的安全验证流程，确保 accessGroup 和 metaDigest 已完成比对
   */
  private async getUserInfoForGraphQL(accountId: number): Promise<UserInfoDTO> {
    // 使用现有的 executeForLoginFlow 方法，它已经包含了安全验证
    const completeUserData = await this.fetchUserInfoUsecase.executeForLoginFlow({
      accountId,
    });

    // 安全验证已在 executeForLoginFlow 中完成
    // 现在将 userInfoView 转换为安全的 DTO（移除 metaDigest）
    return this.mapUserInfoViewToSecureDTO(completeUserData.userInfoView);
  }

  /**
   * 将 UserInfoView 映射为安全的 UserInfoDTO
   * 移除敏感字段（如 metaDigest），确保不会泄露给前端
   */
  private mapUserInfoViewToSecureDTO(userInfoView: UserInfoView): UserInfoDTO {
    return {
      // 基础字段映射
      id: userInfoView.accountId,
      accountId: userInfoView.accountId,
      nickname: userInfoView.nickname,
      gender: userInfoView.gender,
      birthDate: userInfoView.birthDate,
      avatarUrl: userInfoView.avatarUrl,
      email: userInfoView.email,
      signature: userInfoView.signature,

      // 联系方式字段
      address: userInfoView.address,
      phone: userInfoView.phone,

      // 扩展字段
      tags: userInfoView.tags,
      geographic: userInfoView.geographic ? JSON.stringify(userInfoView.geographic) : null,

      // 系统字段（已经过安全验证的 accessGroup）
      accessGroup: userInfoView.accessGroup,
      notifyCount: userInfoView.notifyCount,
      unreadCount: userInfoView.unreadCount,
      userState: userInfoView.userState,

      // 时间字段
      createdAt: userInfoView.createdAt,
      updatedAt: userInfoView.updatedAt,

      // 注意：metaDigest 字段被故意省略，不会暴露给前端
    };
  }

  /**
   * 根据角色获取身份信息
   */
  private async getIdentityForGraphQL(
    accountId: number,
    role: IdentityTypeEnum,
  ): Promise<IdentityUnionType | null> {
    const raw = await this.fetchIdentityByRole.execute({ accountId, role });
    if (!raw) return null;

    switch (raw.kind) {
      case 'STAFF':
        return { ...raw.data, jobId: raw.data.id } as StaffType;
      case 'COACH':
        return {
          ...raw.data,
          coachId: raw.data.id,
          // 为 DTO 中存在但实体中不存在的字段提供默认值
          departmentId: null,
          jobTitle: null,
        } as CoachType;
      case 'MANAGER':
        return {
          ...raw.data,
          managerId: raw.data.id,
          // 为 DTO 中存在但实体中不存在的字段提供默认值
          departmentId: null,
          jobTitle: null,
        } as ManagerType;
      case 'CUSTOMER':
        return {
          ...raw.data,
          customerId: raw.data.id,
          // 为 DTO 中存在但 usecase 返回数据中不存在的字段提供默认值
          deactivatedAt: null,
        } as CustomerType;
      default:
        return null;
    }
  }
}
