import { createUnionType } from '@nestjs/graphql';
import { StaffType } from './staff.dto';
// import { StudentType } from './student.dto';
import { CoachType } from './coach.dto';
import { ManagerType } from './manager.dto';
// import { CustomerType } from './customer.dto';
import { IdentityTypeEnum } from '../../../../types/models/account.types';

// 导入枚举注册文件以确保 GraphQL 类型系统正确识别所有枚举
import '../../graphql/enums/identity-type.enum';

/**
 * 身份联合类型的所有可能类型
 */
type IdentityTypes = StaffType | CoachType | ManagerType;

/**
 * 身份联合类型
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const IdentityUnion = createUnionType({
  name: 'IdentityUnion',
  types: () => [StaffType, CoachType, ManagerType] as const,
  resolveType(
    value: IdentityTypes,
  ): typeof StaffType | typeof CoachType | typeof ManagerType | null {
    // 假设每个身份类型都有 role 字段
    if ('role' in value) {
      switch (value.role) {
        case IdentityTypeEnum.STAFF:
          return StaffType;
        case IdentityTypeEnum.COACH:
          return CoachType;
        case IdentityTypeEnum.MANAGER:
          return ManagerType;
        case IdentityTypeEnum.REGISTRANT:
        default:
          return null;
      }
    }
    return null;
  },
});

/**
 * 导出身份联合类型
 */
export type IdentityUnionType = IdentityTypes;
