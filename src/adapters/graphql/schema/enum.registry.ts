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
import { CourseLevel } from '@app-types/models/course.types';
import { ClassMode, CourseSeriesStatus, VenueType } from '@app-types/models/course-series.types';
// import { MembershipLevel } from '@app-types/models/training.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { RegisterTypeEnum } from '@app-types/services/register.types';
import { GqlPaginationMode, GqlSortDirection } from '@src/adapters/graphql/pagination.enums';
import {
  CoachSortField,
  CustomerSortField,
  LearnerSortField,
  ManagerSortField,
  OrderDirection,
} from '@src/types/common/sort.types';

/**
 * 枚举注册配置接口
 */
interface EnumConfig {
  /** 枚举类型 */
  enumType: object;
  /** GraphQL 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 值映射 */
  valuesMap: Record<string, { description: string }>;
}

/**
 * 枚举注册配置映射表
 * 将所有枚举的注册配置集中管理
 */
const ENUM_CONFIGS: Record<string, EnumConfig> = {
  // 账户相关枚举
  ACCOUNT_STATUS: {
    enumType: AccountStatus,
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
  },
  AUDIENCE_TYPE_ENUM: {
    enumType: AudienceTypeEnum,
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
  },
  EMPLOYMENT_STATUS: {
    enumType: EmploymentStatus,
    name: 'EmploymentStatus',
    description: '就业状态',
    valuesMap: {
      ACTIVE: { description: '在职' },
      SUSPENDED: { description: '停职' },
      LEFT: { description: '离职' },
    },
  },
  IDENTITY_TYPE_ENUM: {
    enumType: IdentityTypeEnum,
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
      ADMIN: { description: '管理员' },
      GUEST: { description: '访客' },
    },
  },
  LOGIN_TYPE_ENUM: {
    enumType: LoginTypeEnum,
    name: 'LoginTypeEnum',
    description: '登录类型枚举',
    valuesMap: {
      PASSWORD: { description: '密码登录' },
      SMS: { description: '短信验证码登录' },
      WECHAT: { description: '微信登录' },
    },
  },
  THIRD_PARTY_PROVIDER_ENUM: {
    enumType: ThirdPartyProviderEnum,
    name: 'ThirdPartyProviderEnum',
    description: '第三方登录提供商枚举',
    valuesMap: {
      WEAPP: { description: '微信小程序登录' },
      WECHAT: { description: '微信登录' },
      QQ: { description: 'QQ 登录' },
      GITHUB: { description: 'GitHub 登录' },
    },
  },

  // 注册相关枚举
  REGISTER_TYPE_ENUM: {
    enumType: RegisterTypeEnum,
    name: 'RegisterTypeEnum',
    description: '注册类型枚举',
    valuesMap: {
      STUDENT: { description: '学生' },
      STAFF: { description: '教职工' },
      REGISTRANT: { description: '注册用户' },
    },
  },

  // 用户信息相关枚举
  GENDER: {
    enumType: Gender,
    name: 'Gender',
    description: '性别枚举',
    valuesMap: {
      MALE: { description: '男性' },
      FEMALE: { description: '女性' },
      SECRET: { description: '保密' },
    },
  },
  USER_STATE: {
    enumType: UserState,
    name: 'UserState',
    description: '用户状态枚举',
    valuesMap: {
      ACTIVE: { description: '在读/在职' },
      INACTIVE: { description: '离校/离职' },
      SUSPENDED: { description: '暂离（休学/病休）' },
      PENDING: { description: '待完善' },
    },
  },

  // 课程相关枚举
  COURSE_LEVEL: {
    enumType: CourseLevel,
    name: 'CourseLevel',
    description: '课程等级枚举',
    valuesMap: {
      FITNESS: { description: '体能训练' },
      WUSHU: { description: '武术' },
      STRIKING: { description: '搏击' },
      SANDA: { description: '散打' },
      MMA: { description: '综合格斗' },
    },
  },

  // 训练相关枚举（移除固定枚举注册，改由类型字段承载动态值）

  // 验证记录相关枚举
  SUBJECT_TYPE: {
    enumType: SubjectType,
    name: 'SubjectType',
    description: '主体类型枚举',
    valuesMap: {
      ACCOUNT: { description: '账户' },
      LEARNER: { description: '学员' },
      CUSTOMER: { description: '客户' },
      COACH: { description: '教练' },
      MANAGER: { description: '管理员' },
    },
  },
  VERIFICATION_RECORD_STATUS: {
    enumType: VerificationRecordStatus,
    name: 'VerificationRecordStatus',
    description: '验证记录状态枚举',
    valuesMap: {
      ACTIVE: { description: '活跃状态' },
      CONSUMED: { description: '已消费' },
      REVOKED: { description: '已撤销' },
      EXPIRED: { description: '已过期' },
    },
  },
  VERIFICATION_RECORD_TYPE: {
    enumType: VerificationRecordType,
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
  },
  // Learner 相关枚举
  LEARNER_SORT_FIELD: {
    enumType: LearnerSortField,
    name: 'LearnerSortField',
    description: '学员排序字段',
    valuesMap: {
      CREATED_AT: { description: '创建时间' },
      UPDATED_AT: { description: '更新时间' },
      NAME: { description: '姓名' },
      BIRTH_DATE: { description: '出生日期' },
    },
  },
  // Customer 相关枚举
  CUSTOMER_SORT_FIELD: {
    enumType: CustomerSortField,
    name: 'CustomerSortField',
    description: '客户排序字段',
    valuesMap: {
      CREATED_AT: { description: '创建时间' },
      UPDATED_AT: { description: '更新时间' },
      NAME: { description: '姓名' },
    },
  },
  // Coach 相关枚举
  COACH_SORT_FIELD: {
    enumType: CoachSortField,
    name: 'CoachSortField',
    description: '教练排序字段',
    valuesMap: {
      CREATED_AT: { description: '创建时间' },
      UPDATED_AT: { description: '更新时间' },
      NAME: { description: '姓名' },
    },
  },
  // Manager 相关枚举
  MANAGER_SORT_FIELD: {
    enumType: ManagerSortField,
    name: 'ManagerSortField',
    description: '经理排序字段',
    valuesMap: {
      CREATED_AT: { description: '创建时间' },
      UPDATED_AT: { description: '更新时间' },
      NAME: { description: '姓名' },
    },
  },
  SORT_ORDER: {
    enumType: OrderDirection,
    name: 'OrderDirection',
    description: '排序方向',
    valuesMap: {
      ASC: { description: '升序' },
      DESC: { description: '降序' },
    },
  },
  // 分页相关枚举（GraphQL 层适配）
  PAGINATION_MODE: {
    enumType: GqlPaginationMode,
    name: 'PaginationMode',
    description: '分页模式（偏移或游标）',
    valuesMap: {
      OFFSET: { description: '偏移分页' },
      CURSOR: { description: '游标分页' },
    },
  },
  SORT_DIRECTION: {
    enumType: GqlSortDirection,
    name: 'SortDirection',
    description: 'GraphQL 排序方向',
    valuesMap: {
      ASC: { description: '升序' },
      DESC: { description: '降序' },
    },
  },
  // 开课班相关枚举
  COURSE_SERIES_CLASS_MODE: {
    enumType: ClassMode,
    name: 'ClassMode',
    description: '开课班班型',
    valuesMap: {
      SMALL_CLASS: { description: '小班课' },
      LARGE_CLASS: { description: '大班课' },
    },
  },
  COURSE_SERIES_VENUE_TYPE: {
    enumType: VenueType,
    name: 'VenueType',
    description: '上课地点类型',
    valuesMap: {
      SANDA_GYM: { description: '散打馆' },
      TRACK_FIELD: { description: '田径场' },
      CUSTOMER_HOME: { description: '客户家（上门）' },
    },
  },
  COURSE_SERIES_STATUS: {
    enumType: CourseSeriesStatus,
    name: 'CourseSeriesStatus',
    description: '开课班状态',
    valuesMap: {
      PLANNED: { description: '已建班未发布' },
      PUBLISHED: { description: '已发布' },
      CLOSED: { description: '封班' },
      FINISHED: { description: '已结课' },
    },
  },
};

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
  'CourseLevel',
  // MembershipLevel 枚举改为数据库驱动后不再静态注册
  'SubjectType',
  'VerificationRecordStatus',
  'VerificationRecordType',
  'LearnerSortField',
  'CustomerSortField',
  'CoachSortField',
  'ManagerSortField',
  'OrderDirection',
  'PaginationMode',
  'SortDirection',
  'ClassMode',
  'VenueType',
  'CourseSeriesStatus',
];

/**
 * 注册所有 GraphQL 枚举类型
 * 统一管理项目中的所有枚举注册
 */
export function registerEnums(): void {
  const registeredEnums: string[] = [];

  // 遍历配置映射表，批量注册枚举
  Object.values(ENUM_CONFIGS).forEach((config) => {
    registerEnumType(config.enumType, {
      name: config.name,
      description: config.description,
      valuesMap: config.valuesMap,
    });
    registeredEnums.push(config.name);
  });

  // 验证所有预期的枚举都已注册
  const missingEnums = EXPECTED_ENUMS.filter((enumName) => !registeredEnums.includes(enumName));

  if (missingEnums.length > 0) {
    throw new Error(`GraphQL 枚举注册失败：以下枚举未成功注册 - ${missingEnums.join(', ')}`);
  }
}
