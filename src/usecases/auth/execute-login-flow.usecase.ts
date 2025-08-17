// src/usecases/auth/execute-login-flow.usecase.ts
import { IdentityUnionType } from '@adapters/graphql/account/dto/identity/identity-union.type';
import { LoginResult } from '@adapters/graphql/account/dto/login-result.dto';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '@core/common/errors';
import { TokenHelper } from '@core/common/token/token.helper';
import { AccountService } from '@modules/account/account.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

/**
 * 执行登录流程用例
 * 负责编排通用登录流程的业务逻辑
 */
@Injectable()
export class ExecuteLoginFlowUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly tokenHelper: TokenHelper,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExecuteLoginFlowUsecase.name);
  }

  /**
   * 执行通用登录流程
   * @param params 登录参数
   * @returns 登录结果
   */
  async execute({
    accountId,
    ip,
    audience,
  }: {
    accountId: number;
    ip?: string;
    audience?: string;
  }): Promise<LoginResult> {
    // 验证 audience 是否有效
    if (audience) {
      const configAudience = this.configService.get<string>('jwt.audience');
      if (!this.tokenHelper.validateAudience(audience, configAudience!)) {
        throw new DomainError(AUTH_ERROR.INVALID_AUDIENCE, `无效的客户端类型: ${audience}`);
      }
    }

    // 获取用户完整信息（包括 accessGroup）
    const userInfo = await this.accountService.findUserInfoByAccountId(accountId);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    // 验证必要字段
    if (!userInfo.account.loginName) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_NOT_FOUND, '用户登录名不存在');
    }

    // 构建用户完整信息对象
    const userWithAccessGroup = {
      id: accountId,
      loginName: userInfo.account.loginName,
      loginEmail: userInfo.account.loginEmail,
      accessGroup: userInfo.accessGroup,
    };

    // 获取账户信息以获取 identityHint
    const account = await this.accountService.findOneById(accountId);

    // 记录登录历史
    const timestamp = new Date().toISOString();
    await this.accountService.recordLoginHistory(accountId, timestamp, ip, audience);

    // 创建 JWT payload
    const payload = this.tokenHelper.createPayloadFromUser(userWithAccessGroup);

    // 生成 access token
    const accessToken = this.tokenHelper.generateAccessToken({ payload });

    // 生成 refresh token
    const refreshToken = this.tokenHelper.generateRefreshToken({ payload });

    // 确定用户角色（从 identityHint 获取，默认为 REGISTRANT）
    const role = (account?.identityHint as IdentityTypeEnum) || IdentityTypeEnum.REGISTRANT;

    // 获取用户身份信息（暂时设为 undefined，需要根据实际业务逻辑实现）
    const identity: IdentityUnionType | undefined = undefined; // TODO: 根据 role 获取具体的身份信息

    // 记录成功日志
    this.logger.info(
      {
        accountId,
        loginName: userWithAccessGroup.loginName,
        accessGroup: userWithAccessGroup.accessGroup,
        role,
        ip,
        audience,
      },
      `从 ${audience} 登录成功`,
    );

    return {
      accessToken,
      refreshToken,
      accountId,
      role,
      identity,
    };
  }
}
