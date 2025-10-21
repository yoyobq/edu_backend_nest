// src/adapters/graphql/third-party-auth/third-party-auth.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { LoginResultModel, UserInfoView } from '@app-types/models/auth.types';
import { GeographicInfo } from '@app-types/models/user-info.types';
import { StaffEntity } from '@modules/account/identities/school/staff/account-staff.entity';
import { CoachEntity } from '@modules/account/identities/training/coach/account-coach.entity';
import { CustomerEntity } from '@modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@modules/account/identities/training/manager/account-manager.entity';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { IdentityUnionType } from '@src/adapters/graphql/account/dto/identity/identity-union.type';
import { LoginResult } from '@src/adapters/graphql/account/dto/login-result.dto';
import { UserInfoDTO } from '@src/adapters/graphql/account/dto/user-info.dto';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { BindThirdPartyInput } from '@src/adapters/graphql/third-party-auth/dto/bind-third-party.input';
import { GetWeappPhoneInput } from '@src/adapters/graphql/third-party-auth/dto/get-weapp-phone.input';
import { ThirdPartyAuthDTO } from '@src/adapters/graphql/third-party-auth/dto/third-party-auth.dto';
import { ThirdPartyLoginInput } from '@src/adapters/graphql/third-party-auth/dto/third-party-login.input';
import { UnbindThirdPartyInput } from '@src/adapters/graphql/third-party-auth/dto/unbind-third-party.input';
import { WeappPhoneResultDTO } from '@src/adapters/graphql/third-party-auth/dto/weapp-phone-result.dto';
import { CompleteUserData, FetchUserInfoUsecase } from '@usecases/account/fetch-user-info.usecase';
import {
  LoginWithThirdPartyUsecase,
  ThirdPartyLoginParams,
} from '@usecases/auth/login-with-third-party.usecase';
import { BindThirdPartyAccountUsecase } from '@usecases/third-party-accounts/bind-third-party-account.usecase';
import {
  GetWeappPhoneParams,
  GetWeappPhoneUsecase,
} from '@usecases/third-party-accounts/get-weapp-phone.usecase';
import { UnbindThirdPartyAccountUsecase } from '@usecases/third-party-accounts/unbind-third-party-account.usecase';
import { CoachType } from '../account/dto/identity/coach.dto';
import { CustomerType } from '../account/dto/identity/customer.dto';
import { LearnerType } from '../account/dto/identity/learner.dto';
import { ManagerType } from '../account/dto/identity/manager.dto';
import { StaffType } from '../account/dto/identity/staff.dto';

/**
 * 第三方认证 GraphQL 解析器
 * 提供第三方登录、绑定、解绑等 GraphQL 接口
 */
@Resolver()
export class ThirdPartyAuthResolver {
  constructor(
    private readonly thirdPartyAuthService: ThirdPartyAuthService,
    private readonly loginWithThirdPartyUsecase: LoginWithThirdPartyUsecase,
    private readonly getWeappPhoneUsecase: GetWeappPhoneUsecase, // 注入新的 usecase
    private readonly fetchUserInfoUsecase: FetchUserInfoUsecase,
    private readonly bindThirdPartyAccountUsecase: BindThirdPartyAccountUsecase,
    private readonly unbindThirdPartyAccountUsecase: UnbindThirdPartyAccountUsecase,
  ) {}

  /**
   * 第三方平台登录
   * - DTO -> 用例输入的薄映射
   * - 用例只抛 DomainError；全局 GQL Filter 统一映射为 GraphQL 错误
   */
  @Mutation(() => LoginResult, { description: '第三方登录' })
  async thirdPartyLogin(@Args('input') input: ThirdPartyLoginInput): Promise<LoginResult> {
    const params: ThirdPartyLoginParams = {
      provider: input.provider,
      authCredential: input.authCredential,
      audience: input.audience,
      ip: input.ip,
    };

    const result: LoginResultModel = await this.loginWithThirdPartyUsecase.execute(params);

    // 身份信息转换（与密码登录保持一致）
    let identity: IdentityUnionType | null = null;
    if (result.identity && this.isValidIdentityEntity(result.identity)) {
      identity = this.convertIdentityForGraphQL(result.identity, result.role);
    }

    // 获取用户信息（与密码登录保持一致，包含安全验证）
    const userInfo = await this.getUserInfoForGraphQL(result.accountId);

    // 用例结果 -> GraphQL DTO 的薄映射（补齐 userInfo 与 identity 转换）
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accountId: result.accountId,
      role: result.role,
      identity,
      userInfo,
    };
  }

  /**
   * 绑定第三方账户
   * 将当前登录用户与第三方平台账户建立绑定关系
   * @param input 绑定参数 (包含第三方平台信息)
   * @param user 当前登录用户信息 (通过 JWT 认证获取)
   * @returns 绑定后的第三方认证信息
   * @throws HttpException 当绑定冲突时抛出异常
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => ThirdPartyAuthDTO, { description: '绑定第三方账户' })
  async bindThirdParty(
    @Args('input') input: BindThirdPartyInput,
    @currentUser() user: JwtPayload,
  ): Promise<ThirdPartyAuthDTO> {
    const result = await this.bindThirdPartyAccountUsecase.execute({
      accountId: user.sub,
      provider: input.provider,
      providerUserId: input.providerUserId,
      unionId: input.unionId || undefined,
      accessToken: input.accessToken || undefined,
    });
    return result as unknown as ThirdPartyAuthDTO;
  }

  /**
   * 解绑第三方账户
   * 删除当前登录用户与指定第三方平台的绑定关系
   * @param input 解绑参数 (包含要解绑的第三方平台类型)
   * @param user 当前登录用户信息 (通过 JWT 认证获取)
   * @returns 解绑操作是否成功
   * @throws HttpException 当绑定记录不存在时抛出异常
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: '解绑第三方账户' })
  async unbindThirdParty(
    @Args('input') input: UnbindThirdPartyInput,
    @currentUser() user: JwtPayload,
  ): Promise<boolean> {
    return await this.unbindThirdPartyAccountUsecase.execute({
      accountId: user.sub,
      id: input.id,
      provider: input.provider,
    });
  }

  /**
   * 获取我的第三方绑定列表
   * 查询当前登录用户的所有第三方平台绑定记录
   * @param user 当前登录用户信息 (通过 JWT 认证获取)
   * @returns 第三方绑定列表
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [ThirdPartyAuthDTO], { description: '获取我的第三方绑定列表' })
  async myThirdPartyAuths(@currentUser() user: JwtPayload): Promise<ThirdPartyAuthDTO[]> {
    return await this.thirdPartyAuthService.getThirdPartyAuths(user.sub);
  }

  /**
   * 获取微信小程序手机号
   * 通过微信小程序的 phoneCode 获取用户手机号信息
   * @param input 包含 phoneCode 和 audience 的输入参数
   * @returns 手机号信息
   */
  @Mutation(() => WeappPhoneResultDTO, { description: '获取微信小程序手机号' })
  async getWeappPhone(@Args('input') input: GetWeappPhoneInput): Promise<WeappPhoneResultDTO> {
    const params: GetWeappPhoneParams = {
      phoneCode: input.phoneCode,
      audience: input.audience,
    };

    const result = await this.getWeappPhoneUsecase.execute(params);

    // 用例结果 -> GraphQL DTO 的薄映射
    return {
      phoneNumber: result.phoneInfo.phoneNumber,
      purePhoneNumber: result.phoneInfo.purePhoneNumber,
      countryCode: result.phoneInfo.countryCode,
    };
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
    const completeUserData: CompleteUserData = await this.fetchUserInfoUsecase.executeForLoginFlow({
      accountId,
    });
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

      // 标签和地理位置
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
   */
  private serializeGeographic(geographic: GeographicInfo | null): string | null {
    if (!geographic) return null;
    const parts: string[] = [];
    if (geographic.province) parts.push(geographic.province);
    if (geographic.city) parts.push(geographic.city);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * 将身份信息转换为 GraphQL 格式（与密码登录保持一致）
   */
  private convertIdentityForGraphQL(
    identity: ManagerEntity | CoachEntity | StaffEntity | CustomerEntity | LearnerEntity,
    role: IdentityTypeEnum,
  ): IdentityUnionType {
    switch (role) {
      case IdentityTypeEnum.MANAGER: {
        const manager = identity as ManagerEntity;
        return {
          id: manager.id,
          accountId: manager.accountId,
          name: manager.name,
          departmentId: null,
          remark: manager.remark,
          jobTitle: null,
          employmentStatus: 'ACTIVE',
          createdAt: manager.createdAt,
          updatedAt: manager.updatedAt,
          managerId: manager.id,
          deactivatedAt: manager.deactivatedAt,
        } as ManagerType;
      }

      case IdentityTypeEnum.COACH: {
        const coach = identity as CoachEntity;
        return {
          id: coach.id,
          accountId: coach.accountId,
          name: coach.name,
          departmentId: null,
          remark: coach.remark,
          jobTitle: null,
          employmentStatus: 'ACTIVE',
          createdAt: coach.createdAt,
          updatedAt: coach.updatedAt,
          coachId: coach.id,
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
          jobId: staff.id,
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
          customerId: customer.id,
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
