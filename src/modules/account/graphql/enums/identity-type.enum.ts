// src/modules/account/graphql/enums/identity-type.enum.ts
import { registerEnumType } from '@nestjs/graphql';
import { IdentityTypeEnum } from '../../../../types/models/account.types';

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
    CUSTOMER: {
      description: '客户',
    },
    LEARNER: {
      description: '学员',
    },
  },
});
