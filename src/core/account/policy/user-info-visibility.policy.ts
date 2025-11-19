// 文件位置：src/core/account/policy/user-info-visibility.policy.ts

export type VisibilityFacts = {
  readonly isSelf: boolean;
  readonly targetIsCustomer: boolean;
  readonly targetIsLearner: boolean;
  readonly targetIsCoach?: boolean;
  readonly customerOwnsTargetLearner: boolean;
};

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from './role-access.policy';

export function canViewUserInfo(roles: readonly string[], facts: VisibilityFacts): boolean {
  if (hasRole(roles, IdentityTypeEnum.ADMIN)) return true;
  if (facts.isSelf) return true;

  if (hasRole(roles, IdentityTypeEnum.COACH)) {
    if (facts.targetIsCustomer) return true;
    if (facts.targetIsLearner) return true;
    return false;
  }

  if (hasRole(roles, IdentityTypeEnum.CUSTOMER)) {
    if (facts.targetIsLearner && facts.customerOwnsTargetLearner) return true;
    return false;
  }

  if (hasRole(roles, IdentityTypeEnum.MANAGER)) {
    if (facts.targetIsCoach) return true;
    if (facts.targetIsCustomer) return true;
    if (facts.targetIsLearner) return true;
    return false;
  }

  if (hasRole(roles, IdentityTypeEnum.LEARNER)) {
    return false;
  }

  return false;
}
