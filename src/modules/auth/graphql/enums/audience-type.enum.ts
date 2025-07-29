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
    DESKTOP: {
      description: '桌面应用',
    },
    SSTSTEST: {
      description: '测试环境客户端',
    },
    SSTSWEB: {
      description: 'SSTS 网页端客户端',
    },
    SSTSWEAPP: {
      description: 'SSTS 微信小程序',
    },
    SJWEB: {
      description: 'SJTY 网页端客户端',
    },
    SJWEAPP: {
      description: 'SJTY 微信小程序',
    },
  },
});
