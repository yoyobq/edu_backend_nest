// 文件位置： src/usecases/course/workflows/list-unfinalized-attendance-series.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import {
  ParticipationAttendanceService,
  type UnfinalizedAttendanceSeriesSummary,
} from '@src/modules/participation/attendance/participation-attendance.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface ListUnfinalizedAttendanceSeriesInput {
  readonly session: UsecaseSession;
}

export interface ListUnfinalizedAttendanceSeriesOutput {
  readonly items: ReadonlyArray<UnfinalizedAttendanceSeriesSummary>;
}

@Injectable()
export class ListUnfinalizedAttendanceSeriesUsecase {
  constructor(private readonly attendanceService: ParticipationAttendanceService) {}

  /**
   * 执行未终审出勤关联的开课班列表查询
   * @param input 输入参数
   */
  async execute(
    input: ListUnfinalizedAttendanceSeriesInput,
  ): Promise<ListUnfinalizedAttendanceSeriesOutput> {
    this.ensurePermissions(input.session);
    const items = await this.attendanceService.listUnfinalizedSeriesSummaries();
    return { items };
  }

  /**
   * 校验权限：仅允许 admin / manager
   * @param session 用例会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const ok =
      hasRole(session.roles, IdentityTypeEnum.ADMIN) ||
      hasRole(session.roles, IdentityTypeEnum.MANAGER);
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看未终审出勤的开课班列表');
    }
  }
}
