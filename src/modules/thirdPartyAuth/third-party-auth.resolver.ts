// src/modules/thirdPartyAuth/third-party-auth.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtPayload } from '../../types/jwt.types';
import { ThirdPartyAuthEntity } from '../account/entities/third-party-auth.entity';
import { AuthService } from '../auth/auth.service';
import { AuthLoginResult } from '../auth/dto/auth-login-result.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { currentUser } from '../common/decorators/current-user.decorator';
import { BindThirdPartyInput } from './dto/bind-third-party.input';
import { ThirdPartyLoginInput } from './dto/third-party-login.input';
import { UnbindThirdPartyInput } from './dto/unbind-third-party.input';
import { ThirdPartyAuthService } from './third-party-auth.service';

/**
 * 第三方登录 GraphQL Resolver
 */
@Resolver()
export class ThirdPartyAuthResolver {
  constructor(
    private readonly thirdPartyAuthService: ThirdPartyAuthService,
    private readonly authService: AuthService,
  ) {}

  /**
   * 第三方登录
   * @param input 第三方登录参数
   * @returns 登录结果
   */
  @Mutation(() => AuthLoginResult, { description: '第三方登录' })
  async thirdPartyLogin(@Args('input') input: ThirdPartyLoginInput): Promise<AuthLoginResult> {
    try {
      // 1. 获取第三方用户信息
      const thirdPartyResult = await this.thirdPartyAuthService.thirdPartyLogin(input);

      // 2. 如果已有绑定账户，直接登录
      if (thirdPartyResult.existingAccount) {
        // 使用 AuthService 的统一登录逻辑
        return await this.authService.loginByAccountId({
          accountId: thirdPartyResult.existingAccount.id,
          ip: input.ip,
          audience: input.audience,
        });
      }

      // 3. 如果没有绑定账户，返回第三方用户信息，前端需要进行账户绑定或注册
      return {
        success: false,
        errorMessage: '该第三方账户未绑定，请先绑定账户或注册新账户',
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : '第三方登录失败',
      };
    }
  }

  /**
   * 绑定第三方账户
   * @param input 绑定参数
   * @param user 当前用户信息
   * @returns 绑定结果
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  @UseGuards(JwtAuthGuard)
  @Mutation(() => ThirdPartyAuthEntity, { description: '绑定第三方账户' })
  async bindThirdParty(
    @Args('input') input: BindThirdPartyInput,
    @currentUser() user: JwtPayload,
  ): Promise<ThirdPartyAuthEntity> {
    return await this.thirdPartyAuthService.bindThirdParty(user.sub, input);
  }

  /**
   * 解绑第三方账户
   * @param input 解绑参数
   * @param user 当前用户信息
   * @returns 解绑结果
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  @UseGuards(JwtAuthGuard)
  @Query(() => [ThirdPartyAuthEntity], { description: '获取我的第三方绑定列表' })
  async myThirdPartyAuths(@currentUser() user: JwtPayload): Promise<ThirdPartyAuthEntity[]> {
    return await this.thirdPartyAuthService.getThirdPartyAuths(user.sub);
  }
}
