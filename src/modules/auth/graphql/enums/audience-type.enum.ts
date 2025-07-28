// src/modules/auth/graphql/enums/audience-type.enum.ts

import { registerEnumType } from '@nestjs/graphql';
import { AudienceTypeEnum } from '../../../../types/models/account.types';

/**
 * 注册客户端类型枚举到 GraphQL Schema
 */
registerEnumType(AudienceTypeEnum, {
  name: 'AudienceTypeEnum',
  description: '客户端类型枚举',
  valuesMap: {
    WECHAT: {
      description: '微信客户端',
    },
    MOBILE: {
      description: '移动端应用',
    },
    DESKTOP: {
      description: '桌面应用',
    },
    API: {
      description: 'API 客户端',
    },
  },
});
