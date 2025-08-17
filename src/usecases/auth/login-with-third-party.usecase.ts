// src/usecases/auth/login-with-third-party.usecase.ts

import { HttpException, Injectable } from '@nestjs/common';

import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { LoginResultModel } from '@app-types/models/auth.types';
import { DomainError } from '@core/common/errors';

import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { LoginByAccountIdUsecase } from './login-by-account-id.usecase';

/**
 * 第三方登录用例输入
 * （纯 TS，协议无关；adapters 层的 GraphQL DTO 请勿在此引用）
 */
export interface ThirdPartyLoginParams {
  provider: ThirdPartyProviderEnum;
  credential: string; // 小程序 js_code、网页 code、id_token 等
  audience: AudienceTypeEnum | string;
  ip?: string;
}

/**
 * 第三方登录用例
 * 流程：
 *  1) 解析第三方凭证 → 标准会话
 *  2) 用 provider + providerUserId 查绑定
 *  3) 已绑定 → 按 accountId 发放令牌
 *  4) 未绑定 → 抛领域错误（统一错误码）
 *
 * 只抛 DomainError；不抛 HttpException
 */
@Injectable()
export class LoginWithThirdPartyUsecase {
  constructor(
    private readonly tpa: ThirdPartyAuthService,
    private readonly loginByAccountId: LoginByAccountIdUsecase,
  ) {}

  async execute(params: ThirdPartyLoginParams): Promise<LoginResultModel> {
    const provider = params.provider;
    const audience = String(params.audience ?? '');
    const ip = params.ip;
    const credential = (params.credential ?? '').trim();

    if (!credential) {
      // 统一的领域错误，避免把 HTTP 异常冒泡到适配层
      throw new DomainError('THIRDPARTY_CREDENTIAL_INVALID', '第三方凭证无效');
    }

    // 1) 解析第三方凭证
    const session = await this.resolveIdentitySafe({
      provider,
      credential,
      audience: audience as AudienceTypeEnum,
    });

    // 2) 查找绑定关系
    const bound = await this.tpa.findAccountByThirdParty({
      provider,
      providerUserId: session.providerUserId,
    });

    if (!bound?.accountId) {
      // 平台无关、可前端稳定识别的错误码
      throw new DomainError('THIRDPARTY_ACCOUNT_NOT_BOUND', '该第三方账户未绑定', {
        provider,
        providerUserId: session.providerUserId,
      });
    }

    // 3) 已绑定 → 按 accountId 发放令牌（复用既有用例）
    const result = await this.loginByAccountId.execute({
      accountId: bound.accountId,
      ip,
      audience,
    });

    return result; // { accessToken, refreshToken, accountId, role, identity? }
  }

  /**
   * 将 ThirdPartyAuthService 抛出的 HttpException 折叠为 DomainError
   * 这样上层（GraphQL 适配器）只需要处理一种错误形态
   */
  private async resolveIdentitySafe(args: {
    provider: ThirdPartyProviderEnum;
    credential: string;
    audience: AudienceTypeEnum;
  }) {
    try {
      return await this.tpa.resolveIdentity(args);
    } catch (e) {
      if (e instanceof HttpException) {
        const resp = e.getResponse() as
          | string
          | { errorCode?: string; errorMessage?: string; message?: string };
        const code =
          typeof resp === 'object' && resp?.errorCode
            ? String(resp.errorCode)
            : 'THIRDPARTY_CREDENTIAL_INVALID';
        const message =
          typeof resp === 'object' && (resp.errorMessage || resp.message)
            ? String(resp.errorMessage || resp.message)
            : '第三方凭证无效或已过期';
        throw new DomainError(code, message);
      }
      // 其它未知错误统一收敛
      throw new DomainError('THIRDPARTY_LOGIN_FAILED', '第三方登录失败', {
        cause: (e as Error)?.message,
      });
    }
  }
}
