import { createUnionType } from '@nestjs/graphql';
import { StaffType } from './staff.dto';
// import { StudentType } from './student.dto';
import { CoachType } from './coach.dto';
import { CustomerType } from './customer.dto';
import { LearnerType } from './learner.dto';
import { ManagerType } from './manager.dto';

/**
 * 身份联合类型的所有可能类型
 */
type IdentityTypes = StaffType | CoachType | ManagerType | CustomerType | LearnerType;

/**
 * 身份联合类型
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const IdentityUnion = createUnionType({
  name: 'IdentityUnion',
  types: () => [StaffType, CoachType, ManagerType, CustomerType, LearnerType] as const,
  resolveType(
    value: IdentityTypes,
  ):
    | typeof StaffType
    | typeof CustomerType
    | typeof CoachType
    | typeof ManagerType
    | typeof LearnerType
    | null {
    // 根据身份数据的特征字段来判断类型
    if ('managerId' in value) {
      return ManagerType;
    }
    if ('coachId' in value) {
      return CoachType;
    }
    if ('jobId' in value) {
      return StaffType;
    }
    if ('customerId' in value && 'membershipLevel' in value) {
      return CustomerType;
    }
    if ('customerId' in value && 'countPerSession' in value) {
      return LearnerType;
    }

    return null;
  },
});

/**
 * 导出身份联合类型
 */
export type IdentityUnionType = IdentityTypes;
