// 文件位置： src/usecases/course/workflows/list-attendance-records-by-customer.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  ACCOUNT_ERROR,
  ATTENDANCE_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface ListAttendanceRecordsByCustomerInput {
  readonly session: UsecaseSession;
  readonly customerId: number;
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
}

export interface ListAttendanceRecordsByCustomerOutput {
  readonly items: ReadonlyArray<AttendanceRecordByCustomerItem>;
}

export type AttendanceRecordByCustomerItem = {
  readonly attendanceId: number;
  readonly sessionId: number;
  readonly sessionStartTime: Date;
  readonly sessionEndTime: Date;
  readonly sessionStatus: SessionStatus;
  readonly locationText: string;
  readonly learnerId: number;
  readonly learnerName: string;
  readonly customerId: number;
  readonly customerName: string;
  readonly attendanceStatus: ParticipationAttendanceStatus;
  readonly countApplied: string;
};

@Injectable()
export class ListAttendanceRecordsByCustomerUsecase {
  constructor(
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly sessionsService: CourseSessionsService,
    private readonly learnerService: LearnerService,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
  ) {}

  async execute(
    input: ListAttendanceRecordsByCustomerInput,
  ): Promise<ListAttendanceRecordsByCustomerOutput> {
    this.ensureRangeValid({ rangeStart: input.rangeStart, rangeEnd: input.rangeEnd });
    await this.ensurePermissions({ session: input.session, customerId: input.customerId });

    const customer = await this.customerService.findById(input.customerId);
    if (!customer || customer.deactivatedAt) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '客户不存在或已被删除');
    }

    const learners = await this.learnerService.findByCustomerId(customer.id);
    const activeLearners = learners.filter((learner) => !learner.deactivatedAt);
    if (activeLearners.length === 0) {
      return { items: [] };
    }

    const learnerNameMap = new Map(activeLearners.map((learner) => [learner.id, learner.name]));
    const attendanceLists = await Promise.all(
      activeLearners.map((learner) => this.attendanceService.listByLearner(learner.id)),
    );
    const records = attendanceLists.flat();
    if (records.length === 0) {
      return { items: [] };
    }

    const sessionIds = Array.from(new Set(records.map((record) => record.sessionId)));
    const sessions = await this.sessionsService.listByIds({ ids: sessionIds });
    const sessionMap = new Map(sessions.map((session) => [session.id, session]));

    const items: AttendanceRecordByCustomerItem[] = [];
    for (const record of records) {
      const session = sessionMap.get(record.sessionId);
      if (!session) continue;
      if (session.startTime < input.rangeStart || session.startTime > input.rangeEnd) continue;

      items.push({
        attendanceId: record.id,
        sessionId: record.sessionId,
        sessionStartTime: session.startTime,
        sessionEndTime: session.endTime,
        sessionStatus: session.status,
        locationText: session.locationText,
        learnerId: record.learnerId,
        learnerName: learnerNameMap.get(record.learnerId) ?? '',
        customerId: customer.id,
        customerName: customer.name,
        attendanceStatus: record.status,
        countApplied: String(record.countApplied ?? '0.00'),
      });
    }

    items.sort((a, b) => {
      const timeDiff = a.sessionStartTime.getTime() - b.sessionStartTime.getTime();
      if (timeDiff !== 0) return timeDiff;
      if (a.sessionId !== b.sessionId) return a.sessionId - b.sessionId;
      return a.attendanceId - b.attendanceId;
    });
    return { items };
  }

  private ensureRangeValid(params: { readonly rangeStart: Date; readonly rangeEnd: Date }): void {
    if (params.rangeStart.getTime() > params.rangeEnd.getTime()) {
      throw new DomainError(ATTENDANCE_ERROR.ATTENDANCE_INVALID_PARAMS, '时间范围不合法', {
        rangeStart: params.rangeStart,
        rangeEnd: params.rangeEnd,
      });
    }
  }

  private async ensurePermissions(params: {
    readonly session: UsecaseSession;
    readonly customerId: number;
  }): Promise<void> {
    const isCustomer = hasRole(params.session.roles, IdentityTypeEnum.CUSTOMER);
    const isManager = hasRole(params.session.roles, IdentityTypeEnum.MANAGER);
    const isAdmin = hasRole(params.session.roles, IdentityTypeEnum.ADMIN);

    if (!isCustomer && !isManager && !isAdmin) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色', {
        requiredRoles: [
          IdentityTypeEnum.ADMIN,
          IdentityTypeEnum.MANAGER,
          IdentityTypeEnum.CUSTOMER,
        ],
        userRoles: params.session.roles,
      });
    }

    if (isAdmin) return;

    if (isManager) {
      const manager = await this.managerService.findByAccountId(params.session.accountId);
      if (!manager) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Manager 身份');
      }
      const ok = await this.managerService.hasPermissionForCustomer(manager.id, params.customerId);
      if (!ok) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 无权限管理该客户');
      }
      return;
    }

    const customer = await this.customerService.findByAccountId(params.session.accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Customer 身份');
    }
    if (customer.id !== params.customerId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问其他客户');
    }
  }
}
