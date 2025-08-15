// src/modules/register/graphql/enums/register-type.enum.ts

import { RegisterTypeEnum } from '@app-types/services/register.types';
import { registerEnumType } from '@nestjs/graphql';
/**
 * 注册类型枚举
 */
registerEnumType(RegisterTypeEnum, {
  name: 'RegisterTypeEnum',
  description: '注册类型枚举',
  valuesMap: {
    STUDENT: { description: '学生' },
    STAFF: { description: '教职工' },
    REGISTRANT: { description: '注册用户' },
    // 以下是设计用户，但无法在注册时直接认定
    // MANAGER: { description: '管理用户注册' },
    // CUSTOMER: { description: '客户注册' },
    // LEARNER: { description: '学员注册' },
    // COACH: { description: '教练注册' },
  },
});
