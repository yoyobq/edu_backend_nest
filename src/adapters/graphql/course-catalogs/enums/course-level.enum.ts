// src/adapters/graphql/course-catalogs/enums/course-level.enum.ts

import { CourseLevel } from '@app-types/models/course.types';
import { registerEnumType } from '@nestjs/graphql';

/**
 * 注册 CourseLevel 枚举类型到 GraphQL Schema
 */
registerEnumType(CourseLevel, {
  name: 'CourseLevel',
  description: '课程等级枚举',
  valuesMap: {
    FITNESS: {
      description: '体能训练',
    },
    WUSHU: {
      description: '武术',
    },
    STRIKING: {
      description: '搏击',
    },
    SANDA: {
      description: '散打',
    },
    MMA: {
      description: '综合格斗',
    },
  },
});
