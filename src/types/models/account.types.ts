// export interface LoginHistoryItem {
//   ip: string; // 登录 IP 地址
//   timestamp: string; // 登录时间（ISO 格式）
//   audience?: string; // 可选：客户端类型
// }

export enum AccountStatus {
  ACTIVE = 'ACTIVE', // 正常
  BANNED = 'BANNED', // 封禁
  DELETED = 'DELETED', // 账号删除
  PENDING = 'PENDING', // 待激活/待审核
  SUSPENDED = 'SUSPENDED', // 暂停使用
  INACTIVE = 'INACTIVE', // 长期不活跃
}

// 实际上 SSTS 的后台只需要 staff, student，因为这些只是记录信息，而不分配权限
// 权限由 user_info 表的 access_group 定义
// 这里提供了更多的枚举项，如 customer 和 learner 是为了展示设计，
// 比如说一个培训机构除了 staff 还可以增加 customer 和 learner 表用于记录信息
export enum IdentityTypeEnum {
  STAFF = 'STAFF',
  STUDENT = 'STUDENT',
  MANAGER = 'MANAGER',
  COACH = 'COACH',
  CUSTOMER = 'CUSTOMER',
  LEARNER = 'LEARNER',
  REGISTRANT = 'REGISTRANT',
}

export enum LoginTypeEnum {
  PASSWORD = 'PASSWORD',
  SMS = 'SMS',
  WECHAT = 'WECHAT',
}

/**
 * 第三方登录提供商枚举
 */
export enum ThirdPartyProviderEnum {
  WEAPP = 'WEAPP',
  WECHAT = 'WECHAT',
  QQ = 'QQ',
  GOOGLE = 'GOOGLE',
  GITHUB = 'GITHUB',
}

/**
 * 包含访问组的账户信息
 */
export type AccountWithAccessGroup = {
  id: number;
  loginName: string;
  loginEmail: string;
  accessGroup: string[];
};

export enum AudienceTypeEnum {
  DESKTOP = 'DESKTOP',
  SSTSTEST = 'SSTSTEST',
  SSTSWEB = 'SSTSWEB',
  SSTSWEAPP = 'SSTSWEAPP',
  SJWEB = 'SJWEB',
  SJWEAPP = 'SJWEAPP',
}

/**
 * 就业状态枚举
 * 适用于所有员工类型（教职工、教练、经理等）
 */
export enum EmploymentStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  LEFT = 'LEFT',
}

/**
 * 用户信息（包含昵称）
 */
export type UserWithAccessGroup = {
  id: number;
  nickname: string; // 使用昵称作为用户名
  loginEmail: string;
  accessGroup: string[];
};
