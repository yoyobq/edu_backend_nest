// src/modules/thirdPartyAuth/third-party-auth.service.ts
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThirdPartyProviderEnum } from '../../types/models/account.types';
import { AccountService } from '../account/account.service';
import { LoginResult } from '../account/dto/login-result.dto';
import { ThirdPartyAuthEntity } from '../account/entities/third-party-auth.entity';
import { AuthService } from '../auth/auth.service';
import { BindThirdPartyInput } from './dto/bind-third-party.input';
import { ThirdPartyLoginInput } from './dto/third-party-login.input';
import { UnbindThirdPartyInput } from './dto/unbind-third-party.input';
import { WeAppProvider, WeAppSession } from './providers/weapp.provider';

/**
 * 第三方认证服务
 * 负责第三方登录、绑定、解绑等核心业务逻辑
 */
@Injectable()
export class ThirdPartyAuthService {
  constructor(
    @InjectRepository(ThirdPartyAuthEntity)
    private readonly thirdPartyAuthRepository: Repository<ThirdPartyAuthEntity>,
    private readonly accountService: AccountService,
    private readonly authService: AuthService,
    private readonly weAppProvider: WeAppProvider,
  ) {}

  /**
   * 第三方登录统一入口
   * 根据不同平台分发到对应的登录处理方法
   * @param input 第三方登录参数
   * @returns 登录成功返回用户令牌信息
   * @throws UnauthorizedException 当第三方账户未绑定时
   * @throws HttpException 当平台不支持或未实现时
   */
  async thirdPartyLogin(input: ThirdPartyLoginInput): Promise<LoginResult> {
    switch (input.provider) {
      case ThirdPartyProviderEnum.WEAPP:
        return this.loginViaWeApp(input);

      case ThirdPartyProviderEnum.WECHAT:
      case ThirdPartyProviderEnum.QQ:
      case ThirdPartyProviderEnum.GOOGLE:
      case ThirdPartyProviderEnum.GITHUB:
        throw new HttpException(`${input.provider} 登录暂未实现`, HttpStatus.NOT_IMPLEMENTED);

      default:
        throw new HttpException('不支持的第三方登录平台', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 绑定第三方账户到现有用户
   * @param accountId 用户账户 ID
   * @param input 绑定参数
   * @returns 绑定记录实体
   * @throws HttpException 当账户已绑定该平台或第三方账户已被绑定时
   */
  async bindThirdParty(
    accountId: number,
    input: BindThirdPartyInput,
  ): Promise<ThirdPartyAuthEntity> {
    const existedByAccount = await this.thirdPartyAuthRepository.findOne({
      where: { accountId, provider: input.provider },
    });
    if (existedByAccount) {
      throw new HttpException(`该账户已绑定 ${input.provider} 平台`, HttpStatus.CONFLICT);
    }

    const existedByProvider = await this.thirdPartyAuthRepository.findOne({
      where: { provider: input.provider, providerUserId: input.providerUserId },
    });
    if (existedByProvider) {
      throw new HttpException(`该 ${input.provider} 账户已被其他用户绑定`, HttpStatus.CONFLICT);
    }

    const thirdPartyAuth = this.thirdPartyAuthRepository.create({
      accountId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      unionId: input.unionId,
      accessToken: input.accessToken,
    });

    return this.thirdPartyAuthRepository.save(thirdPartyAuth);
  }

  /**
   * 解绑第三方账户
   * @param accountId 用户账户 ID
   * @param input 解绑参数
   * @returns 解绑成功返回 true
   * @throws HttpException 当绑定记录不存在时
   * @warning 调用前应确保用户至少保留一种登录方式
   */
  async unbindThirdParty(accountId: number, input: UnbindThirdPartyInput): Promise<boolean> {
    const result = await this.thirdPartyAuthRepository.delete({
      accountId,
      provider: input.provider,
    });
    if (result.affected === 0) {
      throw new HttpException(`未找到 ${input.provider} 平台的绑定记录`, HttpStatus.NOT_FOUND);
    }
    return true;
  }

  /**
   * 获取用户的第三方绑定列表
   * @param accountId 用户账户 ID
   * @returns 第三方绑定记录列表（不包含敏感信息）
   */
  async getThirdPartyAuths(accountId: number): Promise<ThirdPartyAuthEntity[]> {
    return this.thirdPartyAuthRepository.find({
      where: { accountId },
      select: ['id', 'provider', 'providerUserId', 'unionId', 'createdAt'],
    });
  }

  /**
   * 根据第三方标识查找绑定记录
   * @param provider 第三方平台类型
   * @param providerUserId 第三方平台用户 ID
   * @returns 绑定记录（包含关联的用户信息）或 null
   */
  async findAccountByThirdParty(
    provider: ThirdPartyProviderEnum,
    providerUserId: string,
  ): Promise<ThirdPartyAuthEntity | null> {
    return this.thirdPartyAuthRepository.findOne({
      where: { provider, providerUserId },
      relations: ['account'],
    });
  }

  /**
   * 微信小程序登录处理
   * 1. 使用授权码换取微信会话信息
   * 2. 查找是否已有绑定记录
   * 3. 已绑定则发放系统令牌，未绑定则抛出异常引导注册
   * @param input 登录参数
   * @returns 登录成功返回令牌信息
   * @throws UnauthorizedException 当微信账户未绑定时
   */
  private async loginViaWeApp(input: ThirdPartyLoginInput): Promise<LoginResult> {
    const session: WeAppSession = await this.weAppProvider.exchangeCodeForSession(
      input.authCredential,
    );

    const existingAuth = await this.thirdPartyAuthRepository.findOne({
      where: {
        provider: ThirdPartyProviderEnum.WEAPP,
        providerUserId: session.openid,
      },
    });

    if (existingAuth?.accountId) {
      return this.authService.loginByAccountId({
        accountId: existingAuth.accountId,
        ip: input.ip,
        audience: input.audience,
      });
    }

    // 微信账户未绑定，抛出异常由前端处理注册流程
    throw new UnauthorizedException({
      errorCode: 'WECHAT_ACCOUNT_NOT_BOUND',
      errorMessage: '该微信账户未绑定',
    });
  }
}
