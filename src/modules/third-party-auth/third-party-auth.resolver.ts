// src/modules/thirdPartyAuth/third-party-auth.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { LoginResult } from '@modules/account/dto/login-result.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '../common/decorators/current-user.decorator';
import { BindThirdPartyInput } from './dto/bind-third-party.input';
import { ThirdPartyAuthDTO } from './dto/third-party-auth.dto';
import { ThirdPartyLoginInput } from './dto/third-party-login.input';
import { UnbindThirdPartyInput } from './dto/unbind-third-party.input';
import { ThirdPartyAuthService } from './third-party-auth.service';

/**
 * 第三方认证 GraphQL 解析器
 * 提供第三方登录、绑定、解绑等 GraphQL 接口
 */
@Resolver()
export class ThirdPartyAuthResolver {
  constructor(private readonly thirdPartyAuthService: ThirdPartyAuthService) {}

  /**
   * 第三方平台登录
   * 使用第三方平台凭证进行用户登录认证
   * @param input 第三方登录参数 (包含平台类型、凭证、客户端信息等)
   * @returns 登录结果 (包含访问令牌、用户信息等)
   * @throws UnauthorizedException 当凭证无效或账户未绑定时抛出异常
   */
  @Mutation(() => LoginResult, { description: '第三方登录' })
  async thirdPartyLogin(@Args('input') input: ThirdPartyLoginInput): Promise<LoginResult> {
    // 委托给服务层处理完整的登录业务逻辑
    return await this.thirdPartyAuthService.thirdPartyLogin(input);
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
}
