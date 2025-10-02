// src/adapters/graphql/verification-record/enums/verification-record-type.enum.ts

import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { registerEnumType } from '@nestjs/graphql';

/**
 * 注册验证记录类型枚举到 GraphQL Schema
 */
registerEnumType(VerificationRecordType, {
  name: 'VerificationRecordType',
  description: '验证记录类型枚举',
  valuesMap: {
    INVITE_COACH: {
      description: '邀请教练',
    },
    INVITE_MANAGER: {
      description: '邀请管理员',
    },
    INVITE_LEARNER: {
      description: '邀请学员',
    },
    EMAIL_VERIFY_LINK: {
      description: '邮箱验证链接',
    },
    EMAIL_VERIFY_CODE: {
      description: '邮箱验证码',
    },
    PASSWORD_RESET: {
      description: '密码重置',
    },
    MAGIC_LINK: {
      description: '魔法链接',
    },
    WEAPP_BIND: {
      description: '微信小程序绑定',
    },
    SMS_VERIFY_CODE: {
      description: '短信验证码',
    },
  },
});

/**
 * 注册验证记录状态枚举到 GraphQL Schema
 */
registerEnumType(VerificationRecordStatus, {
  name: 'VerificationRecordStatus',
  description: '验证记录状态枚举',
  valuesMap: {
    ACTIVE: {
      description: '活跃状态',
    },
    CONSUMED: {
      description: '已消费',
    },
    REVOKED: {
      description: '已撤销',
    },
    EXPIRED: {
      description: '已过期',
    },
  },
});

/**
 * 注册主体类型枚举到 GraphQL Schema
 */
registerEnumType(SubjectType, {
  name: 'SubjectType',
  description: '主体类型枚举',
  valuesMap: {
    ACCOUNT: {
      description: '账户',
    },
    LEARNER: {
      description: '学员',
    },
    CUSTOMER: {
      description: '客户',
    },
    COACH: {
      description: '教练',
    },
    MANAGER: {
      description: '管理员',
    },
  },
});
