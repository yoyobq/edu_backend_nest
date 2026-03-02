import { Injectable } from '@nestjs/common';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';

type ThirdPartyAuthView = Awaited<ReturnType<ThirdPartyAuthService['getThirdPartyAuths']>>;

@Injectable()
export class GetThirdPartyAuthsUsecase {
  constructor(private readonly thirdPartyAuthService: ThirdPartyAuthService) {}

  async execute(params: { accountId: number }): Promise<ThirdPartyAuthView> {
    return await this.thirdPartyAuthService.getThirdPartyAuths(params.accountId);
  }
}
