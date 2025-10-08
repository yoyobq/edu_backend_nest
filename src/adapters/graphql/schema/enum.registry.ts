// src/adapters/graphql/schema/enum.registry.ts

import { registerEnumType } from '@nestjs/graphql';

// 导入所有需要注册的枚举类型（仅依赖 @app-types）
import {
  AccountStatus,
  AudienceTypeEnum,
  EmploymentStatus,
  IdentityTypeEnum,
  LoginTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { RegisterTypeEnum } from '@app-types/services/register.types';

/**
 * 应注册的枚举清单
 * 用于验证所有枚举都已成功注册
 */
const EXPECTED_ENUMS = [
  'AccountStatus',
  'AudienceTypeEnum',
  'EmploymentStatus',
  'IdentityTypeEnum',
  'LoginTypeEnum',
  'ThirdPartyProviderEnum',
  'RegisterTypeEnum',
  'Gender',
  'UserState',
  'SubjectType',
  'VerificationRecordStatus',
  'VerificationRecordType',
] as const;

/**
 * 注册所有 GraphQL 枚举类型
 * @returns 注册结果，包含已注册的枚举名称列表
 */
export function registerEnums(): { enums: string[] } {
  const registeredEnums: string[] = [];

  // 账户相关枚举
  registerEnumType(AccountStatus, {
    name: 'AccountStatus',
    description: '账号状态枚举',
    valuesMap: {
      ACTIVE: { description: '正常状态' },
      BANNED: { description: '封禁状态' },
      DELETED: { description: '已删除' },
      PENDING: { description: '待激活/待审核' },
      SUSPENDED: { description: '暂停使用' },
      INACTIVE: { description: '长期不活跃' },
    },
  });
  registeredEnums.push('AccountStatus');

  registerEnumType(AudienceTypeEnum, {
    name: 'AudienceTypeEnum',
    description: '客户端类型枚举',
    valuesMap: {
      DESKTOP: { description: '桌面应用' },
      SSTSTEST: { description: '测试环境客户端' },
      SSTSWEB: { description: 'SSTS 网页端客户端' },
      SSTSWEAPP: { description: 'SSTS 微信小程序' },
      SJWEB: { description: 'SJTY 网页端客户端' },
      SJWEAPP: { description: 'SJTY 微信小程序' },
    },
  });
  registeredEnums.push('AudienceTypeEnum');

  registerEnumType(EmploymentStatus, {
    name: 'EmploymentStatus',
    description: '就业状态',
    valuesMap: {
      ACTIVE: { description: '在职' },
      SUSPENDED: { description: '停职' },
      LEFT: { description: '离职' },
    },
  });
  registeredEnums.push('EmploymentStatus');

  registerEnumType(IdentityTypeEnum, {
    name: 'IdentityTypeEnum',
    description: '身份类型枚举',
    valuesMap: {
      STAFF: { description: '教职工' },
      STUDENT: { description: '学生' },
      MANAGER: { description: '经理' },
      COACH: { description: '教练' },
      CUSTOMER: { description: '客户' },
      LEARNER: { description: '学员' },
      REGISTRANT: { description: '注册用户' },
    },
  });
  registeredEnums.push('IdentityTypeEnum');

  registerEnumType(LoginTypeEnum, {
    name: 'LoginTypeEnum',
    description: '登录类型枚举',
    valuesMap: {
      PASSWORD: { description: '密码登录' },
      SMS: { description: '短信验证码登录' },
      WECHAT: { description: '微信登录' },
    },
  });
  registeredEnums.push('LoginTypeEnum');

  registerEnumType(ThirdPartyProviderEnum, {
    name: 'ThirdPartyProviderEnum',
    description: '第三方登录提供商枚举',
    valuesMap: {
      WEAPP: { description: '微信小程序登录' },
      WECHAT: { description: '微信登录' },
      QQ: { description: 'QQ 登录' },
      GITHUB: { description: 'GitHub 登录' },
    },
  });
  registeredEnums.push('ThirdPartyProviderEnum');

  // 注册相关枚举
  registerEnumType(RegisterTypeEnum, {
    name: 'RegisterTypeEnum',
    description: '注册类型枚举',
    valuesMap: {
      STUDENT: { description: '学生' },
      STAFF: { description: '教职工' },
      REGISTRANT: { description: '注册用户' },
    },
  });
  registeredEnums.push('RegisterTypeEnum');

  // 用户信息相关枚举
  registerEnumType(Gender, {
    name: 'Gender',
    description: '性别枚举',
    valuesMap: {
      MALE: { description: '男性' },
      FEMALE: { description: '女性' },
      SECRET: { description: '保密' },
    },
  });
  registeredEnums.push('Gender');

  registerEnumType(UserState, {
    name: 'UserState',
    description: '用户状态枚举',
    valuesMap: {
      ACTIVE: { description: '在读/在职' },
      INACTIVE: { description: '离校/离职' },
      SUSPENDED: { description: '暂离（休学/病休）' },
      PENDING: { description: '待完善' },
    },
  });
  registeredEnums.push('UserState');

  // 验证记录相关枚举
  registerEnumType(SubjectType, {
    name: 'SubjectType',
    description: '主体类型枚举',
    valuesMap: {
      ACCOUNT: { description: '账户' },
      LEARNER: { description: '学员' },
      CUSTOMER: { description: '客户' },
      COACH: { description: '教练' },
      MANAGER: { description: '管理员' },
    },
  });
  registeredEnums.push('SubjectType');

  registerEnumType(VerificationRecordStatus, {
    name: 'VerificationRecordStatus',
    description: '验证记录状态枚举',
    valuesMap: {
      ACTIVE: { description: '活跃状态' },
      CONSUMED: { description: '已消费' },
      REVOKED: { description: '已撤销' },
      EXPIRED: { description: '已过期' },
    },
  });
  registeredEnums.push('VerificationRecordStatus');

  registerEnumType(VerificationRecordType, {
    name: 'VerificationRecordType',
    description: '验证记录类型枚举',
    valuesMap: {
      INVITE_COACH: { description: '邀请教练' },
      INVITE_MANAGER: { description: '邀请管理员' },
      INVITE_LEARNER: { description: '邀请学员' },
      EMAIL_VERIFY_LINK: { description: '邮箱验证链接' },
      EMAIL_VERIFY_CODE: { description: '邮箱验证码' },
      PASSWORD_RESET: { description: '密码重置' },
      MAGIC_LINK: { description: '魔法链接' },
      WEAPP_BIND: { description: '微信小程序绑定' },
      SMS_VERIFY_CODE: { description: '短信验证码' },
    },
  });
  registeredEnums.push('VerificationRecordType');

  // 验证所有期望的枚举都已注册
  const missingEnums = EXPECTED_ENUMS.filter((enumName) => !registeredEnums.includes(enumName));
  if (missingEnums.length > 0) {
    throw new Error(`GraphQL 枚举注册失败：以下枚举未成功注册 - ${missingEnums.join(', ')}`);
  }

  return { enums: registeredEnums };
}
