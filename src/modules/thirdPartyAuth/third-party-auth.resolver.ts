// src/modules/thirdPartyAuth/third-party-auth.resolver.ts

import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtPayload } from '../../types/jwt.types';
import { LoginResult } from '../account/dto/login-result.dto'; // 更改导入
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { currentUser } from '../common/decorators/current-user.decorator';
import { BindThirdPartyInput } from './dto/bind-third-party.input';
import { ThirdPartyAuthDTO } from './dto/third-party-auth.dto';
import { ThirdPartyLoginInput } from './dto/third-party-login.input';
import { UnbindThirdPartyInput } from './dto/unbind-third-party.input';
import { ThirdPartyAuthService } from './third-party-auth.service';

/**
 * 第三方登录 GraphQL Resolver
 */
@Resolver()
export class ThirdPartyAuthResolver {
  constructor(private readonly thirdPartyAuthService: ThirdPartyAuthService) {}

  /**
   * 第三方登录
   * @param input 第三方登录参数
   * @returns 登录结果
   * @throws UnauthorizedException 登录失败时抛出异常
   */
  @Mutation(() => LoginResult, { description: '第三方登录' }) // 更改返回类型
  async thirdPartyLogin(@Args('input') input: ThirdPartyLoginInput): Promise<LoginResult> {
    // 直接调用 service 的完整登录方法，所有业务逻辑都在 service 层处理
    return await this.thirdPartyAuthService.thirdPartyLogin(input);
  }

  /**
   * 绑定第三方账户
   * @param input 绑定参数
   * @param user 当前用户信息
   * @returns 绑定结果
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => ThirdPartyAuthDTO, { description: '绑定第三方账户' })
  async bindThirdParty(
    @Args('input') input: BindThirdPartyInput,
    @currentUser() user: JwtPayload,
  ): Promise<ThirdPartyAuthDTO> {
    return await this.thirdPartyAuthService.bindThirdParty(user.sub, input);
  }

  /**
   * 解绑第三方账户
   * @param input 解绑参数
   * @param user 当前用户信息
   * @returns 解绑结果
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: '解绑第三方账户' })
  async unbindThirdParty(
    @Args('input') input: UnbindThirdPartyInput,
    @currentUser() user: JwtPayload,
  ): Promise<boolean> {
    return await this.thirdPartyAuthService.unbindThirdParty(user.sub, input);
  }

  /**
   * 获取当前用户的第三方绑定列表
   * @param user 当前用户信息
   * @returns 第三方绑定列表
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [ThirdPartyAuthDTO], { description: '获取我的第三方绑定列表' })
  async myThirdPartyAuths(@currentUser() user: JwtPayload): Promise<ThirdPartyAuthDTO[]> {
    return await this.thirdPartyAuthService.getThirdPartyAuths(user.sub);
  }
}
