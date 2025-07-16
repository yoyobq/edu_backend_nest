// src/modules/account/interfaces/account-profile-provider.interface.ts

/**
 * Account Profile Provider 接口
 * 用于定义不同身份类型的 profile 数据获取规范
 */
export interface AccountProfileProvider<T = unknown> {
  /** 身份标识符，如 'student', 'staff' */
  readonly identity: string;

  /**
   * 根据账户 ID 获取 profile 信息
   * @param accountId 账户 ID
   * @returns Promise<T | null> profile 数据或 null
   */
  getProfile(accountId: number): Promise<T | null>;

  /**
   * 批量获取 profile 信息（可选实现）
   * @param accountIds 账户 ID 数组
   * @returns Promise<Map<number, T>> 账户 ID 到 profile 的映射
   */
  getProfiles?(accountIds: number[]): Promise<Map<number, T>>;

  /**
   * 验证 profile 数据是否有效（可选实现）
   * @param profile profile 数据
   * @returns boolean 是否有效
   */
  validateProfile?(profile: T): boolean;
}
