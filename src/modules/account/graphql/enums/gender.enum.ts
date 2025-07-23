// src/modules/account/graphql/enums/gender.enum.ts
import { registerEnumType } from '@nestjs/graphql';
import { Gender } from '../../../../types/models/user-info.types';

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
