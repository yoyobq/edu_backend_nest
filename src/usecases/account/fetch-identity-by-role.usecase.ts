// src/usecases/account/fetch-identity-by-role.usecase.ts

import { EmploymentStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { Gender } from '@app-types/models/user-info.types';
import { parseStaffId } from '@core/account/identity/parse-staff-id';
import { AUTH_ERROR, DomainError } from '@core/common/errors';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';

type StaffIdentity = {
  id: number;
  accountId: number;
  name: string;
  departmentId: number | null;
  remark: string | null;
  jobTitle: string | null;
  employmentStatus: EmploymentStatus;
  createdAt: Date;
  updatedAt: Date;
};

type CoachIdentity = {
  id: number;
  accountId: number;
  name: string;
  remark: string | null;
  employmentStatus: EmploymentStatus;
  createdAt: Date;
  updatedAt: Date;
  specialty: string | null;
};

type ManagerIdentity = {
  id: number;
  accountId: number;
  name: string;
  remark: string | null;
  employmentStatus: EmploymentStatus;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerIdentity = {
  id: number;
  accountId: number | null;
  name: string;
  contactPhone: string | null;
  preferredContactTime: string | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LearnerIdentity = {
  id: number;
  accountId: number | null;
  customerId: number;
  name: string;
  gender: Gender;
  birthDate: string | null;
  avatarUrl: string | null;
  specialNeeds: string | null;
  countPerSession: number | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RawIdentity =
  | { kind: 'STAFF'; data: StaffIdentity }
  | { kind: 'COACH'; data: CoachIdentity }
  | { kind: 'MANAGER'; data: ManagerIdentity }
  | { kind: 'CUSTOMER'; data: CustomerIdentity }
  | { kind: 'LEARNER'; data: LearnerIdentity }
  | { kind: 'NONE' };

@Injectable()
export class FetchIdentityByRoleUsecase {
  constructor(private readonly accountService: AccountService) {}

  /**
   * 检查实体是否已被停用，如果是则抛出错误
   */
  private checkEntityDeactivation(entity: { deactivatedAt: Date | null }): void {
    if (entity.deactivatedAt !== null) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_INACTIVE, '用户账户已被停用');
    }
  }

  /**
   * 映射 Coach 实体数据
   */
  private mapCoachData(entity: {
    id: number;
    accountId: number;
    name: string;
    specialty: string | null;
    remark: string | null;
    deactivatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): CoachIdentity {
    return {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      remark: entity.remark, // 修正：直接映射 remark 字段
      specialty: entity.specialty,
      employmentStatus: entity.deactivatedAt ? EmploymentStatus.LEFT : EmploymentStatus.ACTIVE,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * 映射 Manager 实体数据
   */
  private mapManagerData(entity: {
    id: number;
    accountId: number;
    name: string;
    remark: string | null;
    deactivatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ManagerIdentity {
    return {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      remark: entity.remark, // 修正：直接映射 remark 字段
      employmentStatus: entity.deactivatedAt ? EmploymentStatus.LEFT : EmploymentStatus.ACTIVE,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * 映射 Customer 实体数据
   */
  private mapCustomerData(entity: {
    id: number;
    accountId: number | null;
    name: string;
    contactPhone: string | null;
    preferredContactTime: string | null;
    remark: string | null;
    deactivatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): CustomerIdentity {
    return {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      contactPhone: entity.contactPhone,
      preferredContactTime: entity.preferredContactTime,
      remark: entity.remark,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * 映射员工数据
   */
  private mapStaffData(entity: {
    id: string | number;
    accountId: number;
    name: string;
    departmentId: number | null;
    remark: string | null;
    jobTitle: string | null;
    employmentStatus: EmploymentStatus;
    createdAt: Date;
    updatedAt: Date;
  }): StaffIdentity {
    const parsedId = parseStaffId({ id: entity.id });
    return {
      id: parsedId,
      accountId: entity.accountId,
      name: entity.name,
      departmentId: entity.departmentId,
      remark: entity.remark,
      jobTitle: entity.jobTitle,
      employmentStatus: entity.employmentStatus,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * 映射 Learner 数据
   */
  private mapLearnerData(entity: {
    id: number;
    accountId: number | null;
    customerId: number;
    name: string;
    gender: Gender;
    birthDate: string | null;
    avatarUrl: string | null;
    specialNeeds: string | null;
    countPerSession: number | null;
    remark: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): LearnerIdentity {
    return {
      id: entity.id,
      accountId: entity.accountId,
      customerId: entity.customerId,
      name: entity.name,
      gender: entity.gender,
      birthDate: entity.birthDate,
      avatarUrl: entity.avatarUrl,
      specialNeeds: entity.specialNeeds,
      countPerSession: entity.countPerSession,
      remark: entity.remark,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * 根据账户 ID 和角色获取身份信息
   */
  async execute({
    accountId,
    role,
  }: {
    accountId: number;
    role: IdentityTypeEnum;
  }): Promise<RawIdentity> {
    switch (role) {
      case IdentityTypeEnum.REGISTRANT: {
        return { kind: 'NONE' };
      }
      case IdentityTypeEnum.STAFF: {
        const entity = await this.accountService.findStaffByAccountId(accountId);
        if (!entity) return { kind: 'NONE' };

        const mappedData = this.mapStaffData(entity);
        return { kind: 'STAFF', data: mappedData };
      }
      case IdentityTypeEnum.COACH: {
        const entity = await this.accountService.findCoachByAccountId(accountId);
        if (!entity) return { kind: 'NONE' };

        this.checkEntityDeactivation(entity);
        const mappedData = this.mapCoachData(entity);
        return { kind: 'COACH', data: mappedData };
      }
      case IdentityTypeEnum.MANAGER: {
        const entity = await this.accountService.findManagerByAccountId(accountId);
        if (!entity) return { kind: 'NONE' };

        this.checkEntityDeactivation(entity);
        const mappedData = this.mapManagerData(entity);
        return { kind: 'MANAGER', data: mappedData };
      }
      case IdentityTypeEnum.CUSTOMER: {
        const entity = await this.accountService.findCustomerByAccountId(accountId);
        if (!entity) return { kind: 'NONE' };

        this.checkEntityDeactivation(entity);
        const mappedData = this.mapCustomerData(entity);
        return { kind: 'CUSTOMER', data: mappedData };
      }
      case IdentityTypeEnum.LEARNER: {
        const entity = await this.accountService.findLearnerByAccountId(accountId);
        if (!entity) return { kind: 'NONE' };

        const mappedData = this.mapLearnerData(entity);
        return { kind: 'LEARNER', data: mappedData };
      }
      default:
        return { kind: 'NONE' };
    }
  }
}
