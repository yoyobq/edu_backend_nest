// src/modules/account/graphql/enums/third-party-provider.enum.ts
import { registerEnumType } from '@nestjs/graphql';
import { ThirdPartyProviderEnum } from '../../../../types/models/account.types';

/**
 * 注册第三方登录提供商枚举类型到 GraphQL Schema
 */
registerEnumType(ThirdPartyProviderEnum, {
  name: 'ThirdPartyProviderEnum',
  description: '第三方登录提供商枚举',
  valuesMap: {
    WECHAT: {
      description: '微信登录',
    },
    QQ: {
      description: 'QQ 登录',
    },
    GOOGLE: {
      description: 'Google 登录',
    },
    GITHUB: {
      description: 'GitHub 登录',
    },
    APPLE: {
      description: 'Apple 登录',
    },
  },
});
