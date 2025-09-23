// src/adapters/graphql/auth/auth.resolver.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { AuthLoginModel, LoginResultModel, UserInfoView } from '@app-types/models/auth.types';
import { GeographicInfo } from '@app-types/models/user-info.types';
import { StaffEntity } from '@modules/account/identities/school/staff/account-staff.entity';
import { CoachEntity } from '@modules/account/identities/training/coach/account-coach.entity';
import { CustomerEntity } from '@modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@modules/account/identities/training/manager/account-manager.entity';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CompleteUserData, FetchUserInfoUsecase } from '@usecases/account/fetch-user-info.usecase';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';
import { CoachType } from '../account/dto/identity/coach.dto';
import { CustomerType } from '../account/dto/identity/customer.dto';
import { IdentityUnionType } from '../account/dto/identity/identity-union.type';
import { LearnerType } from '../account/dto/identity/learner.dto';
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

    // 处理身份信息转换
    let identity: IdentityUnionType | null = null;
    if (result.identity && this.isValidIdentityEntity(result.identity)) {
      identity = this.convertIdentityForGraphQL(result.identity, result.role);
    }

    // 获取用户信息
    const userInfo = await this.getUserInfoForGraphQL(result.accountId);

    // 将领域模型转换回 DTO
    const loginResult: LoginResult = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accountId: result.accountId,
      role: result.role,
      identity,
      userInfo,
    };

    return loginResult;
  }

  /**
   * 验证身份实体是否有效
   */
  private isValidIdentityEntity(
    obj: unknown,
  ): obj is ManagerEntity | CoachEntity | StaffEntity | CustomerEntity | LearnerEntity {
    return obj !== null && typeof obj === 'object' && 'id' in obj && 'accountId' in obj;
  }

  /**
   * 获取用于 GraphQL 响应的用户信息
   * 使用现有的安全验证流程，确保 accessGroup 和 metaDigest 已完成比对
   */
  private async getUserInfoForGraphQL(accountId: number): Promise<UserInfoDTO> {
    // 使用现有的 executeForLoginFlow 方法，它已经包含了安全验证
    const completeUserData: CompleteUserData = await this.fetchUserInfoUsecase.executeForLoginFlow({
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

      // 标签和地理位置 - 需要序列化为字符串
      tags: userInfoView.tags,
      geographic: this.serializeGeographic(userInfoView.geographic),

      // 访问组和通知
      accessGroup: userInfoView.accessGroup,
      notifyCount: userInfoView.notifyCount,
      unreadCount: userInfoView.unreadCount,

      // 状态和时间戳
      userState: userInfoView.userState,
      createdAt: userInfoView.createdAt,
      updatedAt: userInfoView.updatedAt,
    };
  }

  /**
   * 将 GeographicInfo 对象序列化为字符串
   * @param geographic 地理位置信息对象
   * @returns 序列化后的字符串或 null
   */
  private serializeGeographic(geographic: GeographicInfo | null): string | null {
    if (!geographic) return null;

    const parts: string[] = [];
    if (geographic.province) parts.push(geographic.province);
    if (geographic.city) parts.push(geographic.city);

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * 将身份信息转换为 GraphQL 格式
   * @param identity 身份实体
   * @param role 角色类型
   * @returns 转换后的身份信息
   */
  private convertIdentityForGraphQL(
    identity: ManagerEntity | CoachEntity | StaffEntity | CustomerEntity | LearnerEntity,
    role: IdentityTypeEnum,
  ): IdentityUnionType {
    // 根据角色返回对应的 DTO 类型
    switch (role) {
      case IdentityTypeEnum.MANAGER: {
        const manager = identity as ManagerEntity;
        return {
          id: manager.id,
          accountId: manager.accountId,
          name: manager.name,
          departmentId: null, // Manager 实体没有 departmentId
          remark: manager.remark,
          jobTitle: null, // Manager 实体没有 jobTitle
          employmentStatus: 'ACTIVE', // Manager 实体没有 employmentStatus
          createdAt: manager.createdAt,
          updatedAt: manager.updatedAt,
          managerId: manager.id, // Union 类型解析标识符
          deactivatedAt: manager.deactivatedAt,
        } as ManagerType;
      }

      case IdentityTypeEnum.COACH: {
        const coach = identity as CoachEntity;
        return {
          id: coach.id,
          accountId: coach.accountId,
          name: coach.name,
          departmentId: null, // Coach 实体没有 departmentId
          remark: coach.remark,
          jobTitle: null, // Coach 实体没有 jobTitle
          employmentStatus: 'ACTIVE', // Coach 实体没有 employmentStatus
          createdAt: coach.createdAt,
          updatedAt: coach.updatedAt,
          coachId: coach.id, // Union 类型解析标识符
          level: coach.level,
          description: coach.description,
          avatarUrl: coach.avatarUrl,
          specialty: coach.specialty,
          deactivatedAt: coach.deactivatedAt,
        } as CoachType;
      }

      case IdentityTypeEnum.STAFF: {
        const staff = identity as StaffEntity;
        return {
          id: staff.id,
          accountId: staff.accountId,
          name: staff.name,
          departmentId: staff.departmentId,
          remark: staff.remark,
          jobTitle: staff.jobTitle,
          employmentStatus: staff.employmentStatus,
          createdAt: staff.createdAt,
          updatedAt: staff.updatedAt,
          jobId: staff.id, // Union 类型解析标识符
        } as StaffType;
      }

      case IdentityTypeEnum.CUSTOMER: {
        const customer = identity as CustomerEntity;
        return {
          id: customer.id,
          accountId: customer.accountId,
          name: customer.name,
          contactPhone: customer.contactPhone,
          preferredContactTime: customer.preferredContactTime,
          membershipLevel: customer.membershipLevel,
          remark: customer.remark,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          deactivatedAt: customer.deactivatedAt,
          customerId: customer.id, // Union 类型解析标识符
        } as CustomerType;
      }

      case IdentityTypeEnum.LEARNER: {
        const learner = identity as LearnerEntity;
        return {
          id: learner.id,
          accountId: learner.accountId,
          customerId: learner.customerId,
          name: learner.name,
          gender: learner.gender,
          birthDate: learner.birthDate,
          avatarUrl: learner.avatarUrl,
          specialNeeds: learner.specialNeeds,
          countPerSession: learner.countPerSession,
          remark: learner.remark,
          createdAt: learner.createdAt,
          updatedAt: learner.updatedAt,
          deactivatedAt: learner.deactivatedAt,
        } as LearnerType;
      }

      default:
        throw new Error(`不支持的身份类型: ${role}`);
    }
  }
}
