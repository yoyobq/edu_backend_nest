// src/modules/thirdPartyAuth/providers/weapp.provider.ts

import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountService } from '../../account/account.service';
import { ThirdPartyLoginInput } from '../dto/third-party-login.input';
// import { ThirdPartyLoginResult } from '../dto/third-party-login.result';
import { ThirdPartyProvider } from '../interfaces/third-party-provider.interface';

@Injectable()
export class WeAppProvider implements ThirdPartyProvider {
  constructor(
    private readonly accountService: AccountService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  login(_input: ThirdPartyLoginInput): void {
    // Promise<ThirdPartyLoginResult> {
    // ...weAppLogin 拆过来的逻辑
  }
}
