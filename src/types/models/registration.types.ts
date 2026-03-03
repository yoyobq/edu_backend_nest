// src/types/models/registration.types.ts

/**
 * 邮箱注册用例参数
 */
export interface RegisterWithEmailParams {
  loginName?: string | null;
  loginEmail: string;
  loginPassword: string;
  nickname?: string;
  inviteToken?: string;
  clientIp?: string;
  serverNetworkInterfaces?: Record<
    string,
    ReadonlyArray<{ address: string; family: string | number }> | undefined
  >;
}

/**
 * 邮箱注册结果
 */
export interface RegisterWithEmailResult {
  success: boolean;
  message: string;
  accountId: number;
}
