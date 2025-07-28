// src/modules/auth/graphql/enums/login-type.enum.ts

import { registerEnumType } from '@nestjs/graphql';
import { LoginTypeEnum } from '../../../../types/models/account.types';

/**
 * 注册登录类型枚举到 GraphQL Schema
 */
registerEnumType(LoginTypeEnum, {
  name: 'LoginTypeEnum',
  description: '登录类型枚举',
  valuesMap: {
    PASSWORD: {
      description: '密码登录',
    },
    SMS: {
      description: '短信验证码登录',
    },
    WECHAT: {
      description: '微信登录',
    },
  },
});
