export interface LoginHistoryItem {
  ip: string; // 登录 IP 地址
  timestamp: string; // 登录时间（ISO 格式）
  audience?: string; // 可选：客户端类型
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE', // 正常
  BANNED = 'BANNED', // 封禁
  DELETED = 'DELETED', // 账号删除
  PENDING = 'PENDING', // 待激活/待审核
  SUSPENDED = 'SUSPENDED', // 暂停使用
  INACTIVE = 'INACTIVE', // 长期不活跃
}
