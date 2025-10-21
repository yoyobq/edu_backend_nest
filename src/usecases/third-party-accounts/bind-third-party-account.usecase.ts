// src/usecases/third-party-accounts/bind-third-party-account.usecase.ts

import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { BindThirdPartyInput } from '@src/adapters/graphql/third-party-auth/dto/bind-third-party.input';
import { HttpException, Injectable } from '@nestjs/common';
import { ThirdPartyAuthEntity } from '@src/modules/account/base/entities/third-party-auth.entity';

/** 绑定第三方账户输入参数（协议无关） */
export interface BindThirdPartyAccountParams {
  accountId: number;
  provider: ThirdPartyProviderEnum;
  providerUserId: string;
  unionId?: string;
  accessToken?: string;
}

@Injectable()
export class BindThirdPartyAccountUsecase {
  constructor(private readonly tpa: ThirdPartyAuthService) {}

  async execute(params: BindThirdPartyAccountParams): Promise<ThirdPartyAuthEntity> {
    const { accountId, provider, providerUserId } = params;
    if (!accountId || !provider || !providerUserId) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, '绑定参数不完整');
    }

    try {
      // 将纯 TS 参数转换为服务层使用的输入结构
      const input: BindThirdPartyInput = {
        provider,
        providerUserId,
        // 服务层 GraphQL DTO 允许 null，因此将缺省值标准化为 null
        unionId: params.unionId ?? null,
        accessToken: params.accessToken ?? null,
      };

      const result = await this.tpa.bindThirdParty({
        accountId,
        input,
      });

      return result;
    } catch (e) {
      if (e instanceof HttpException) {
        const resp = e.getResponse() as
          | string
          | { errorCode?: string; errorMessage?: string; message?: string };
        const code =
          typeof resp === 'object' && resp?.errorCode
            ? String(resp.errorCode)
            : THIRDPARTY_ERROR.BIND_FAILED;
        const message =
          typeof resp === 'object' && (resp.errorMessage || resp.message)
            ? String(resp.errorMessage || resp.message)
            : '绑定第三方账户失败';
        throw new DomainError(code, message);
      }
      throw new DomainError(THIRDPARTY_ERROR.BIND_FAILED, '绑定第三方账户失败', {
        cause: (e as Error)?.message,
      });
    }
  }
}
