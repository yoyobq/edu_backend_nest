// src/usecases/account/fetch-identity-by-role.usecase.ts
import { EmploymentStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { AUTH_ERROR, DomainError } from '@core/common/errors';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachType } from '../../adapters/graphql/account/dto/identity/coach.dto';
import { CustomerType } from '../../adapters/graphql/account/dto/identity/customer.dto';
import { ManagerType } from '../../adapters/graphql/account/dto/identity/manager.dto';
import { StaffType } from '../../adapters/graphql/account/dto/identity/staff.dto';

export type RawIdentity =
  | { kind: 'STAFF'; data: StaffType & { id: string } }
  | {
      kind: 'COACH';
      data: Pick<
        CoachType,
        'accountId' | 'name' | 'remarks' | 'employmentStatus' | 'createdAt' | 'updatedAt'
      > & {
        id: number;
        specialty: string | null;
      };
    }
  | {
      kind: 'MANAGER';
      data: Pick<
        ManagerType,
        'accountId' | 'name' | 'remarks' | 'employmentStatus' | 'createdAt' | 'updatedAt'
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
        | 'remarks'
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
    'accountId' | 'name' | 'remarks' | 'employmentStatus' | 'createdAt' | 'updatedAt'
  > & {
    id: number;
    specialty: string | null;
  } {
    return {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      remarks: entity.remark,
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
    'accountId' | 'name' | 'remarks' | 'employmentStatus' | 'createdAt' | 'updatedAt'
  > & {
    id: number;
  } {
    return {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      remarks: entity.remark,
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
  }): Pick<
    CustomerType,
    'accountId' | 'name' | 'contactPhone' | 'preferredContactTime' | 'membershipLevel' | 'remarks'
  > & { id: number } {
    return {
      id: entity.id,
      accountId: entity.accountId!,
      name: entity.name,
      contactPhone: entity.contactPhone,
      preferredContactTime: entity.preferredContactTime,
      membershipLevel: entity.membershipLevel?.toString() || null,
      remarks: entity.remark,
    };
  }

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
        return entity ? { kind: 'STAFF', data: entity } : { kind: 'NONE' };
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
      default:
        return { kind: 'NONE' };
    }
  }
}
