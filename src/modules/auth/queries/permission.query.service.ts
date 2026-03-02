// 文件位置：/var/www/backend/src/modules/auth/queries/permission.query.service.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { expandRoles, hasRole } from '@core/account/policy/role-access.policy';
import { AccountService } from '@modules/account/base/services/account.service';
import { Injectable } from '@nestjs/common';

export interface PermissionQueryParams {
  accountId: number;
  requiredRole: IdentityTypeEnum;
  includeHierarchy?: boolean;
}

export interface PermissionQueryResult {
  accountId: number;
  requiredRole: IdentityTypeEnum;
  accessGroup: IdentityTypeEnum[];
  expandedRoles: IdentityTypeEnum[];
  allowed: boolean;
}

@Injectable()
export class PermissionQueryService {
  constructor(private readonly accountService: AccountService) {}

  /**
   * 判断账号是否具备指定权限（支持角色层级）
   * @param params 查询参数
   * @returns 规范化后的权限判定结果
   */
  async hasPermission(params: PermissionQueryParams): Promise<PermissionQueryResult> {
    const { accountId, requiredRole, includeHierarchy = true } = params;
    const user = await this.accountService.getUserWithAccessGroup(accountId);
    const accessGroup = user.accessGroup;
    const expandedRoles = includeHierarchy ? expandRoles(accessGroup) : [...accessGroup];
    const allowed = includeHierarchy
      ? hasRole(accessGroup, requiredRole)
      : accessGroup.includes(requiredRole);

    return {
      accountId,
      requiredRole,
      accessGroup,
      expandedRoles,
      allowed,
    };
  }
}
