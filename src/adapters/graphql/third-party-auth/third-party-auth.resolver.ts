// src/adapters/graphql/third-party-auth/third-party-auth.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { LoginResultModel } from '@app-types/models/auth.types';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { IdentityUnionType } from '@src/adapters/graphql/account/dto/identity/identity-union.type';
import { LoginResult } from '@src/adapters/graphql/account/dto/login-result.dto';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { BindThirdPartyInput } from '@src/adapters/graphql/third-party-auth/dto/bind-third-party.input';
import { GetWeappPhoneInput } from '@src/adapters/graphql/third-party-auth/dto/get-weapp-phone.input';
import { ThirdPartyAuthDTO } from '@src/adapters/graphql/third-party-auth/dto/third-party-auth.dto';
import { ThirdPartyLoginInput } from '@src/adapters/graphql/third-party-auth/dto/third-party-login.input';
import { UnbindThirdPartyInput } from '@src/adapters/graphql/third-party-auth/dto/unbind-third-party.input';
import { WeappPhoneResultDTO } from '@src/adapters/graphql/third-party-auth/dto/weapp-phone-result.dto';
import {
  LoginWithThirdPartyUsecase,
  ThirdPartyLoginParams,
} from '@usecases/auth/login-with-third-party.usecase';
import {
  GetWeappPhoneParams,
  GetWeappPhoneUsecase,
} from '@usecases/third-party-accounts/get-weapp-phone.usecase';

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
      audience: String(input.audience),
      ip: input.ip,
    };

    const result: LoginResultModel = await this.loginWithThirdPartyUsecase.execute(params);

    // 用例结果 -> GraphQL DTO 的薄映射
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accountId: result.accountId,
      role: result.role,
      identity: result.identity as IdentityUnionType | null,
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
    return await this.thirdPartyAuthService.bindThirdParty({
      accountId: user.sub,
      input,
    });
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
    return await this.thirdPartyAuthService.unbindThirdParty({
      accountId: user.sub,
      input,
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
}
