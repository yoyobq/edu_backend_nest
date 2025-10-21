// src/usecases/third-party-accounts/unbind-third-party-account.usecase.ts

import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { HttpException, Injectable } from '@nestjs/common';

/** 解绑第三方账户输入参数（协议无关） */
export interface UnbindThirdPartyAccountParams {
  accountId: number;
  id?: number;
  provider?: ThirdPartyProviderEnum;
}

@Injectable()
export class UnbindThirdPartyAccountUsecase {
  constructor(private readonly tpa: ThirdPartyAuthService) {}

  async execute(params: UnbindThirdPartyAccountParams): Promise<boolean> {
    const { accountId, id, provider } = params;
    if (!accountId || (!id && !provider)) {
      throw new DomainError(
        THIRDPARTY_ERROR.INVALID_PARAMS,
        '解绑参数不完整：需要提供 id 或 provider',
      );
    }

    try {
      const ok = await this.tpa.unbindThirdParty({
        accountId,
        input: { id, provider },
      });
      return ok;
    } catch (e) {
      if (e instanceof HttpException) {
        const resp = e.getResponse() as
          | string
          | { errorCode?: string; errorMessage?: string; message?: string };
        const code =
          typeof resp === 'object' && resp?.errorCode
            ? String(resp.errorCode)
            : THIRDPARTY_ERROR.UNBIND_FAILED;
        const message =
          typeof resp === 'object' && (resp.errorMessage || resp.message)
            ? String(resp.errorMessage || resp.message)
            : '解绑第三方账户失败';
        throw new DomainError(code, message);
      }
      throw new DomainError(THIRDPARTY_ERROR.UNBIND_FAILED, '解绑第三方账户失败', {
        cause: (e as Error)?.message,
      });
    }
  }
}
