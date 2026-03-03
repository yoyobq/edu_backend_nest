import { ThirdPartyAuthView } from '@app-types/models/third-party-auth.types';
import { Injectable } from '@nestjs/common';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';

@Injectable()
export class GetThirdPartyAuthsUsecase {
  constructor(private readonly thirdPartyAuthService: ThirdPartyAuthService) {}

  async execute(params: { accountId: number }): Promise<ThirdPartyAuthView[]> {
    return await this.thirdPartyAuthService.getThirdPartyAuths(params.accountId);
  }
}
