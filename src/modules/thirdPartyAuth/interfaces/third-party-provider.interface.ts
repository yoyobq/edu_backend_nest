// src/modules/thirdPartyAuth/interfaces/third-party-provider.interface.ts
import { ThirdPartyLoginInput } from '../dto/third-party-login.input';

export interface ThirdPartyProvider {
  login(input: ThirdPartyLoginInput): unknown; //Promise<ThirdPartyLoginResult>;
}
