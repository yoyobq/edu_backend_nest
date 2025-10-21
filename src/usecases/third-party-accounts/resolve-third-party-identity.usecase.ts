// src/usecases/third-party-accounts/resolve-third-party-identity.usecase.ts

import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { ThirdPartySession } from '@app-types/models/third-party-auth.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { HttpException, Injectable } from '@nestjs/common';

/** 解析第三方身份输入参数（协议无关） */
export interface ResolveThirdPartyIdentityParams {
  provider: ThirdPartyProviderEnum;
  authCredential: string;
  audience: AudienceTypeEnum;
}

@Injectable()
export class ResolveThirdPartyIdentityUsecase {
  constructor(private readonly tpa: ThirdPartyAuthService) {}

  async execute(params: ResolveThirdPartyIdentityParams): Promise<ThirdPartySession> {
    const credential = (params.authCredential ?? '').trim();
    if (!credential) {
      throw new DomainError(THIRDPARTY_ERROR.CREDENTIAL_INVALID, '第三方凭证无效');
    }

    try {
      return await this.tpa.resolveIdentity({
        provider: params.provider,
        authCredential: credential,
        audience: params.audience,
      });
    } catch (e) {
      if (e instanceof HttpException) {
        const resp = e.getResponse() as
          | string
          | { errorCode?: string; errorMessage?: string; message?: string };
        const code =
          typeof resp === 'object' && resp?.errorCode
            ? String(resp.errorCode)
            : THIRDPARTY_ERROR.CREDENTIAL_INVALID;
        const message =
          typeof resp === 'object' && (resp.errorMessage || resp.message)
            ? String(resp.errorMessage || resp.message)
            : '第三方凭证无效或已过期';
        throw new DomainError(code, message);
      }
      throw new DomainError(THIRDPARTY_ERROR.UNKNOWN_ERROR, '解析第三方身份失败', {
        cause: (e as Error)?.message,
      });
    }
  }
}
