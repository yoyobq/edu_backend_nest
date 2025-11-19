// src/usecases/account/fetch-identity-by-role.usecase.ts

import { EmploymentStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { Gender } from '@app-types/models/user-info.types';
import { AUTH_ERROR, DomainError } from '@core/common/errors';
import { parseStaffId } from '@core/account/identity/parse-staff-id';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachType } from '../../adapters/graphql/account/dto/identity/coach.dto';
import { CustomerType } from '../../adapters/graphql/account/dto/identity/customer.dto';
import { LearnerType } from '../../adapters/graphql/account/dto/identity/learner.dto';
import { ManagerType } from '../../adapters/graphql/account/dto/identity/manager.dto';
import { StaffType } from '../../adapters/graphql/account/dto/identity/staff.dto';

export type RawIdentity =
  | { kind: 'STAFF'; data: StaffType & { id: number } }
  | {
      kind: 'COACH';
      data: Pick<
        CoachType,
        'accountId' | 'name' | 'remark' | 'employmentStatus' | 'createdAt' | 'updatedAt'
      > & {
        id: number;
        specialty: string | null;
      };
    }
  | {
      kind: 'MANAGER';
      data: Pick<
        ManagerType,
        'accountId' | 'name' | 'remark' | 'employmentStatus' | 'createdAt' | 'updatedAt'
      > & {
        id: number;
      };
    }
  | {
      kind: 'CUSTOMER';
      data: Pick<
        CustomerType,
        | 'accountId'
        | 'name'
        | 'contactPhone'
        | 'preferredContactTime'
        | 'membershipLevel'
        | 'remark'
        | 'createdAt'
        | 'updatedAt'
        | 'remainingSessions'
      > & { id: number };
    }
  | {
      kind: 'LEARNER';
      data: Pick<
        LearnerType,
        | 'accountId'
        | 'customerId'
        | 'name'
        | 'gender'
        | 'birthDate'
        | 'avatarUrl'
        | 'specialNeeds'
        | 'countPerSession'
        | 'remark'
        | 'createdAt'
        | 'updatedAt'
      > & { id: number };
    }
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
  }): Pick<
    CoachType,
    'accountId' | 'name' | 'remark' | 'employmentStatus' | 'createdAt' | 'updatedAt'
  > & {
    id: number;
    specialty: string | null;
  } {
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
  }): Pick<
    ManagerType,
    'accountId' | 'name' | 'remark' | 'employmentStatus' | 'createdAt' | 'updatedAt'
  > & {
    id: number;
  } {
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
    membershipLevel: number | null;
    remark: string | null;
    deactivatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    remainingSessions: number;
  }): Pick<
    CustomerType,
    | 'accountId'
    | 'name'
    | 'contactPhone'
    | 'preferredContactTime'
    | 'membershipLevel'
    | 'remark'
    | 'createdAt'
    | 'updatedAt'
    | 'remainingSessions'
  > & { id: number } {
    return {
      id: entity.id,
      accountId: entity.accountId!,
      name: entity.name,
      contactPhone: entity.contactPhone,
      preferredContactTime: entity.preferredContactTime,
      membershipLevel: entity.membershipLevel || null,
      remark: entity.remark,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      remainingSessions: entity.remainingSessions,
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
  }): StaffType & { id: number } {
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
    countPerSession: number;
    remark: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Pick<
    LearnerType,
    | 'accountId'
    | 'customerId'
    | 'name'
    | 'gender'
    | 'birthDate'
    | 'avatarUrl'
    | 'specialNeeds'
    | 'countPerSession'
    | 'remark'
    | 'createdAt'
    | 'updatedAt'
  > & { id: number } {
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
