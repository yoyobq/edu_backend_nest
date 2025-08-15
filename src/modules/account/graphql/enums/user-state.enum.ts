// src/modules/account/graphql/enums/user-state.enum.ts
import { UserState } from '@app-types/models/user-info.types';
import { registerEnumType } from '@nestjs/graphql';

// 注册 UserState 枚举类型到 GraphQL Schema
registerEnumType(UserState, {
  name: 'UserState',
  description: '用户状态枚举',
  valuesMap: {
    ACTIVE: {
      description: '在读/在职',
    },
    INACTIVE: {
      description: '离校/离职',
    },
    SUSPENDED: {
      description: '暂离（休学/病休）',
    },
    PENDING: {
      description: '待完善',
    },
  },
});
