// 文件位置：src/usecases/identity-management/coach/get-my-coach.usecase.ts
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CoachEntity } from '@modules/account/identities/training/coach/account-coach.entity';
import { CoachService } from '@modules/account/identities/training/coach/coach.service';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { UserState } from '@app-types/models/user-info.types';

export interface GetMyCoachParams {
  /** 当前用户账户 ID */
  currentAccountId: number;
}

export interface GetMyCoachResult {
  entity: CoachEntity;
  userState: UserState | null;
  loginHistory: { ip: string; timestamp: string; audience?: string }[] | null;
  userPhone: string | null;
}

@Injectable()
export class GetMyCoachUsecase {
  constructor(
    private readonly coachService: CoachService,
    private readonly accountService: AccountService,
  ) {}

  /**
   * 读取当前登录教练的个人信息
   * - 仅活跃的教练可读取
   * - 若不存在教练身份或已停用，抛出权限错误
   */
  async execute(params: GetMyCoachParams): Promise<GetMyCoachResult> {
    const { currentAccountId } = params;

    const isActive = await this.coachService.isActiveCoach(currentAccountId);
    if (!isActive) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 coach 可查看个人教练信息');
    }

    const entity = await this.coachService.findByAccountId(currentAccountId);
    if (!entity) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 coach 可查看个人教练信息');
    }

    const ui = await this.accountService.findUserInfoByAccountId(currentAccountId);
    const acc = await this.accountService.findOneById(currentAccountId);
    const userState: UserState | null = ui?.userState ?? null;
    const userPhone: string | null = ui?.phone ?? null;
    const loginHistory = acc?.recentLoginHistory ?? null;

    return { entity, userState, loginHistory, userPhone };
  }
}
