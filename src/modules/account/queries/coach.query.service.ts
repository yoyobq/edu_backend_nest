import { UserState } from '@app-types/models/user-info.types';
import { Injectable } from '@nestjs/common';
import { AccountService } from '../base/services/account.service';
import { CoachProfile } from '../identities/training/coach/coach.service';

export type CoachView = CoachProfile;

export type CoachListItem = {
  view: CoachView;
  userState: UserState | null;
  loginHistory: { ip: string; timestamp: string; audience?: string }[] | null;
  userPhone: string | null;
};

@Injectable()
export class CoachQueryService {
  constructor(private readonly accountService: AccountService) {}

  async toListItem(params: { view: CoachView }): Promise<CoachListItem> {
    const accountId = params.view.accountId;
    if (!accountId) {
      return {
        view: params.view,
        userState: null,
        loginHistory: null,
        userPhone: null,
      };
    }

    const [userInfo, account] = await Promise.all([
      this.accountService.findUserInfoByAccountId(accountId),
      this.accountService.findOneById(accountId),
    ]);

    return {
      view: params.view,
      userState: userInfo?.userState ?? null,
      loginHistory: account?.recentLoginHistory ?? null,
      userPhone: userInfo?.phone ?? null,
    };
  }
}
