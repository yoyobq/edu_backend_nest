// src/adapters/graphql/account/graphql/enums/identity-type.enum.ts
import { EmploymentStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { registerEnumType } from '@nestjs/graphql';

// 注册 IdentityTypeEnum 枚举类型到 GraphQL Schema
registerEnumType(IdentityTypeEnum, {
  name: 'IdentityTypeEnum',
  description: '身份类型枚举',
  valuesMap: {
    STAFF: {
      description: '教职工',
    },
    STUDENT: {
      description: '学生',
    },
    MANAGER: {
      description: '经理',
    },
    COACH: {
      description: '教练',
    },
    CUSTOMER: {
      description: '客户',
    },
    LEARNER: {
      description: '学员',
    },
    REGISTRANT: {
      description: '注册用户',
    },
  },
});

// 注册 EmploymentStatus 枚举类型到 GraphQL Schema
registerEnumType(EmploymentStatus, {
  name: 'EmploymentStatus',
  description: '就业状态',
  valuesMap: {
    ACTIVE: {
      description: '在职',
    },
    SUSPENDED: {
      description: '停职',
    },
    LEFT: {
      description: '离职',
    },
  },
});
