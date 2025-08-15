// src/modules/account/graphql/enums/gender.enum.ts
import { Gender } from '@app-types/models/user-info.types';
import { registerEnumType } from '@nestjs/graphql';

// 注册 Gender 枚举类型到 GraphQL Schema
registerEnumType(Gender, {
  name: 'Gender',
  description: '性别枚举',
  valuesMap: {
    MALE: {
      description: '男性',
    },
    FEMALE: {
      description: '女性',
    },
    SECRET: {
      description: '保密',
    },
  },
});
