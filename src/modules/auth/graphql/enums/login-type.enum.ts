// src/modules/auth/graphql/enums/login-type.enum.ts

import { LoginTypeEnum } from '@app-types/models/account.types';
import { registerEnumType } from '@nestjs/graphql';

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
