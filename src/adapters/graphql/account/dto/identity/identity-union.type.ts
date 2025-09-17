import { createUnionType } from '@nestjs/graphql';
import { StaffType } from './staff.dto';
// import { StudentType } from './student.dto';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { CoachType } from './coach.dto';
import { CustomerType } from './customer.dto';
import { ManagerType } from './manager.dto';

// 导入枚举注册文件以确保 GraphQL 类型系统正确识别所有枚举
import '@src/adapters/graphql/account/enums/identity-type.enum';

/**
 * 身份联合类型的所有可能类型
 */
type IdentityTypes = StaffType | CoachType | ManagerType | CustomerType;

/**
 * 身份联合类型
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const IdentityUnion = createUnionType({
  name: 'IdentityUnion',
  types: () => [StaffType, CoachType, ManagerType, CustomerType] as const,
  resolveType(
    value: IdentityTypes,
  ): typeof StaffType | typeof CustomerType | typeof CoachType | typeof ManagerType | null {
    // 假设每个身份类型都有 role 字段
    if ('role' in value) {
      switch (value.role) {
        case IdentityTypeEnum.STAFF:
          return StaffType;
        case IdentityTypeEnum.CUSTOMER:
          return CustomerType;
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
