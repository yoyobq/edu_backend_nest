// src/modules/third-party-auth/third-party-auth.service.ts
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import {
  BindThirdPartyInputModel,
  ThirdPartySession,
  UnbindThirdPartyInputModel,
} from '@app-types/models/third-party-auth.types';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ThirdPartyAuthEntity } from '@src/modules/account/base/entities/third-party-auth.entity';
import { Repository } from 'typeorm';
import { ThirdPartyProvider } from './interfaces/third-party-provider.interface';

/** 第三方认证提供者映射的依赖注入标识 */
export const PROVIDER_MAP = Symbol('THIRD_PARTY_PROVIDER_MAP');

/**
 * 第三方认证服务
 * 提供第三方平台认证、登录、绑定、解绑等核心业务逻辑
 */
@Injectable()
export class ThirdPartyAuthService {
  constructor(
    @InjectRepository(ThirdPartyAuthEntity)
    private readonly thirdPartyAuthRepository: Repository<ThirdPartyAuthEntity>,
    @Inject(PROVIDER_MAP)
    private readonly adapters: Map<ThirdPartyProviderEnum, ThirdPartyProvider>,
  ) {}

  /**
   * 解析第三方身份信息
   * 统一入口：凭证交换 → 外部身份 (提供横切关注点：错误处理、监控、限流等)
   * @param params 解析参数
   * @param params.provider 第三方平台类型
   * @param params.credential 第三方认证凭证
   * @param params.audience 客户端类型
   * @returns 标准化的第三方会话信息
   * @throws BadRequestException 当平台不支持时抛出异常
   * @throws UnauthorizedException 当凭证无效时抛出异常
   */
  async resolveIdentity({
    provider,
    authCredential,
    audience,
  }: {
    provider: ThirdPartyProviderEnum;
    authCredential: string;
    audience: AudienceTypeEnum;
  }): Promise<ThirdPartySession> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new BadRequestException({
        errorCode: 'THIRDPARTY_PROVIDER_NOT_SUPPORTED',
        errorMessage: `不支持的第三方平台：${provider}`,
      });
    }

    try {
      return await adapter.exchangeCredential({
        authCredential,
        audience,
      });
    } catch {
      // TODO: 在此处添加横切关注点：错误折叠、监控打点、限流重试、幂等去重等
      throw new UnauthorizedException({
        errorCode: 'THIRDPARTY_CREDENTIAL_INVALID',
        errorMessage: '第三方凭证无效或已过期',
      });
    }
  }

  /**
   * 绑定第三方账户
   * 将用户账户与第三方平台账户建立绑定关系
   * @param params 绑定参数
   * @param params.accountId 用户账户 ID
   * @param params.input 绑定输入参数
   * @returns 绑定后的第三方认证实体
   * @throws HttpException 当账户已绑定或第三方账户已被占用时抛出异常
   */
  async bindThirdParty(params: {
    accountId: number;
    input: BindThirdPartyInputModel;
  }): Promise<ThirdPartyAuthEntity> {
    const { accountId, input } = params;

    // 检查当前账户是否已绑定该平台
    const existedByAccount = await this.thirdPartyAuthRepository.findOne({
      where: { accountId, provider: input.provider },
    });
    if (existedByAccount) {
      throw new HttpException(`该账户已绑定 ${input.provider} 平台`, HttpStatus.CONFLICT);
    }

    // 检查该第三方账户是否已被其他用户绑定
    const existedByProvider = await this.thirdPartyAuthRepository.findOne({
      where: { provider: input.provider, providerUserId: input.providerUserId },
    });
    if (existedByProvider) {
      throw new HttpException(`该 ${input.provider} 账户已被其他用户绑定`, HttpStatus.CONFLICT);
    }

    // 创建新的绑定关系
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
   * 删除用户账户与第三方平台的绑定关系
   * @param params 解绑参数
   * @param params.accountId 用户账户 ID
   * @param params.input 解绑输入参数
   * @returns 解绑操作是否成功
   * @throws HttpException 当绑定记录不存在时抛出异常
   */
  async unbindThirdParty(params: {
    accountId: number;
    input: UnbindThirdPartyInputModel;
  }): Promise<boolean> {
    const { accountId, input } = params;

    const where = input?.id ? { id: input.id, accountId } : { accountId, provider: input.provider };

    const result = await this.thirdPartyAuthRepository.delete(where);
    if (result.affected === 0) {
      throw new HttpException(
        input?.id ? `未找到绑定记录 ID=${input.id}` : `未找到 ${input.provider} 平台的绑定记录`,
        HttpStatus.NOT_FOUND,
      );
    }
    return true;
  }

  /**
   * 根据第三方信息查找关联账户
   * 通过第三方平台和用户 ID 查找对应的绑定记录
   * @param params 查找参数
   * @param params.provider 第三方平台类型
   * @param params.providerUserId 第三方平台用户 ID
   * @returns 第三方认证实体 (包含关联的账户信息)
   */
  async findAccountByThirdParty(params: {
    provider: ThirdPartyProviderEnum;
    providerUserId: string;
  }): Promise<ThirdPartyAuthEntity | null> {
    const { provider, providerUserId } = params;

    return this.thirdPartyAuthRepository.findOne({
      where: { provider, providerUserId },
      relations: ['account'],
    });
  }

  /**
   * 获取用户的第三方绑定列表
   * 查询指定用户的所有第三方平台绑定记录
   * @param accountId 用户账户 ID
   * @returns 第三方认证实体列表 (仅包含必要字段)
   */
  async getThirdPartyAuths(accountId: number): Promise<ThirdPartyAuthEntity[]> {
    return this.thirdPartyAuthRepository.find({
      where: { accountId },
      select: [
        'id',
        'accountId',
        'provider',
        'providerUserId',
        'unionId',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  /**
   * 注册流程中的第三方账户绑定
   * 直接接受 ThirdPartySession 数据，适用于注册场景
   * @param params 绑定参数
   * @param params.accountId 账户 ID
   * @param params.provider 第三方平台类型
   * @param params.session 第三方会话信息
   * @returns 绑定后的第三方认证实体
   * @throws HttpException 当绑定冲突时抛出异常
   */
  async bindThirdPartyForRegistration(params: {
    accountId: number;
    provider: ThirdPartyProviderEnum;
    session: ThirdPartySession;
  }): Promise<ThirdPartyAuthEntity> {
    const { accountId, provider, session } = params;

    // 检查当前账户是否已绑定该平台
    const existedByAccount = await this.thirdPartyAuthRepository.findOne({
      where: { accountId, provider },
    });
    if (existedByAccount) {
      throw new HttpException(`该账户已绑定 ${provider} 平台`, HttpStatus.CONFLICT);
    }

    // 检查该第三方账户是否已被其他用户绑定
    const existedByProvider = await this.thirdPartyAuthRepository.findOne({
      where: { provider, providerUserId: session.providerUserId },
    });
    if (existedByProvider) {
      throw new HttpException(`该 ${provider} 账户已被其他用户绑定`, HttpStatus.CONFLICT);
    }

    // 创建新的绑定关系
    const thirdPartyAuth = this.thirdPartyAuthRepository.create({
      accountId,
      provider,
      providerUserId: session.providerUserId,
      unionId: session.unionId || null,
      accessToken: null, // ThirdPartySession 中没有 accessToken，设为 null
    });

    return this.thirdPartyAuthRepository.save(thirdPartyAuth);
  }

  /**
   * 根据账户 ID 和第三方平台类型查找第三方认证记录
   * @param accountId 账户 ID
   * @param provider 第三方平台类型
   * @returns 第三方认证记录或 null
   */
  async findThirdPartyAuthByAccountId(
    accountId: number,
    provider: ThirdPartyProviderEnum,
  ): Promise<ThirdPartyAuthEntity | null> {
    return this.thirdPartyAuthRepository.findOne({
      where: { accountId, provider },
    });
  }
}
