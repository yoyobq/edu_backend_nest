// src/usecases/account/fetch-identity-by-role.usecase.ts
import { EmploymentStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachType } from '../../adapters/graphql/account/dto/identity/coach.dto';
import { ManagerType } from '../../adapters/graphql/account/dto/identity/manager.dto';
import { StaffType } from '../../adapters/graphql/account/dto/identity/staff.dto';

export type RawIdentity =
  | { kind: 'STAFF'; data: StaffType & { id: string } }
  | { kind: 'COACH'; data: CoachType & { id: number } }
  | { kind: 'MANAGER'; data: ManagerType & { id: number } }
  | { kind: 'NONE' };

@Injectable()
export class FetchIdentityByRoleUsecase {
  constructor(private readonly accountService: AccountService) {}

  async execute(accountId: number, role: IdentityTypeEnum): Promise<RawIdentity> {
    switch (role) {
      case IdentityTypeEnum.STAFF: {
        const entity = await this.accountService.findStaffByAccountId(accountId);
        return entity ? { kind: 'STAFF', data: entity } : { kind: 'NONE' };
      }
      case IdentityTypeEnum.COACH: {
        const entity = await this.accountService.findCoachByAccountId(accountId);
        if (!entity) return { kind: 'NONE' };

        // 将 CoachEntity 字段映射到 CoachType 格式
        const mappedData: CoachType & { id: number } = {
          id: entity.id,
          accountId: entity.accountId,
          name: entity.name,
          departmentId: null, // CoachEntity 没有 departmentId 字段
          remarks: entity.remark, // 映射 remark -> remarks
          jobTitle: null, // CoachEntity 没有 jobTitle 字段
          employmentStatus: entity.deactivatedAt ? EmploymentStatus.LEFT : EmploymentStatus.ACTIVE,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
        };

        return { kind: 'COACH', data: mappedData };
      }
      case IdentityTypeEnum.MANAGER: {
        const entity = await this.accountService.findManagerByAccountId(accountId);
        if (!entity) return { kind: 'NONE' };

        // 将 ManagerEntity 字段映射到 ManagerType 格式
        const mappedData: ManagerType & { id: number } = {
          id: entity.id,
          accountId: entity.accountId,
          name: entity.name,
          departmentId: null, // ManagerEntity 没有 departmentId 字段
          remarks: entity.remark, // 映射 remark -> remarks
          jobTitle: null, // ManagerEntity 没有 jobTitle 字段
          employmentStatus: entity.deactivatedAt ? EmploymentStatus.LEFT : EmploymentStatus.ACTIVE,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
        };

        return { kind: 'MANAGER', data: mappedData };
      }
      default:
        return { kind: 'NONE' };
    }
  }
}
