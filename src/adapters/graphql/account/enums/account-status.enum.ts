// src/adapters/graphql/account/graphql/enums/account-status.enum.ts
import { AccountStatus } from '@app-types/models/account.types';
import { registerEnumType } from '@nestjs/graphql';

// 注册 AccountStatus 枚举类型到 GraphQL Schema
registerEnumType(AccountStatus, {
  name: 'AccountStatus',
  description: '账号状态枚举',
  valuesMap: {
    ACTIVE: {
      description: '正常状态',
    },
    BANNED: {
      description: '封禁状态',
    },
    DELETED: {
      description: '已删除',
    },
    PENDING: {
      description: '待激活/待审核',
    },
    SUSPENDED: {
      description: '暂停使用',
    },
    INACTIVE: {
      description: '长期不活跃',
    },
  },
});
