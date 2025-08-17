// src/types/models/registration.types.ts

/**
 * 邮箱注册用例参数
 */
export interface RegisterWithEmailParams {
  loginName?: string | null;
  loginEmail: string;
  loginPassword: string;
  nickname?: string;
  request?: {
    headers: Record<string, string | string[] | undefined>;
    ip?: string;
    connection?: { remoteAddress?: string };
  };
}

/**
 * 邮箱注册结果
 */
export interface RegisterWithEmailResult {
  success: boolean;
  message: string;
  accountId: number;
}
