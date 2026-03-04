// 文件位置：/var/www/backend/src/modules/account/queries/manager.query.service.ts
import { UserInfoView } from '@app-types/models/auth.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { Injectable } from '@nestjs/common';
import { ManagerProfile } from '../identities/training/manager/manager.service';

export type ManagerView = ManagerProfile;

export type ManagerDetailMode = 'BASIC' | 'FULL';

export type ManagerListItem = {
  view: ManagerView;
  userState: UserState | null;
  loginHistory: { ip: string; timestamp: string; audience?: string }[] | null;
  userPhone: string | null;
  userInfo?: {
    mode: ManagerDetailMode;
    view: {
      accountId: number;
      nickname: string;
      gender: string | Gender;
      avatarUrl: string | null;
      phone: string | null;
    };
  } | null;
};

export type ManagerUserInfoView = Pick<
  UserInfoView,
  'accountId' | 'nickname' | 'gender' | 'avatarUrl' | 'phone' | 'userState'
>;

@Injectable()
export class ManagerQueryService {
  /**
   * 映射 Manager 列表项的只读视图
   * @param params 列表项拼装所需信息
   * @returns Manager 列表项视图
   */
  toListItem(params: {
    view: ManagerView;
    detailMode: ManagerDetailMode;
    loginHistory: { ip: string; timestamp: string; audience?: string }[] | null;
    userInfoView: ManagerUserInfoView | null;
  }): ManagerListItem {
    const userInfo = params.userInfoView
      ? {
          mode: params.detailMode,
          view: {
            accountId: params.userInfoView.accountId,
            nickname: params.userInfoView.nickname,
            gender: params.userInfoView.gender,
            avatarUrl: params.userInfoView.avatarUrl,
            phone: params.userInfoView.phone,
          },
        }
      : null;

    return {
      view: params.view,
      userState: params.userInfoView?.userState ?? null,
      loginHistory: params.loginHistory,
      userPhone: params.userInfoView?.phone ?? null,
      userInfo,
    };
  }
}
