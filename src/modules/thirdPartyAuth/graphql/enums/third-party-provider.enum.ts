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
    SJWEAPP: {
      description: 'SJTY 微信小程序登录',
    },
    SSTSWEAPP: {
      description: 'SSTS 微信小程序登录',
    },
    WECHAT: {
      description: '微信登录',
    },
    QQ: {
      description: 'QQ 登录',
    },
    GITHUB: {
      description: 'GitHub 登录',
    },
  },
});
