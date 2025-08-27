// src/usecases/account/fetch-identity-by-role.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachType } from '../../adapters/graphql/account/dto/identity/coach.dto';
import { ManagerType } from '../../adapters/graphql/account/dto/identity/manager.dto';
import { StaffType } from '../../adapters/graphql/account/dto/identity/staff.dto';

export type RawIdentity =
  | { kind: 'STAFF'; data: StaffType & { id: string } } // 这里可以换成真实的 TS 接口
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
        return entity ? { kind: 'COACH', data: entity } : { kind: 'NONE' };
      }
      case IdentityTypeEnum.MANAGER: {
        const entity = await this.accountService.findManagerByAccountId(accountId);
        return entity ? { kind: 'MANAGER', data: entity } : { kind: 'NONE' };
      }
      default:
        return { kind: 'NONE' };
    }
  }
}
