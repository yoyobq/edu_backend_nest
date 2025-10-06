// src/usecases/verification/manager/invite-manager-result.types.ts

/**
 * Manager 邀请处理结果
 */
export interface InviteManagerHandlerResult {
  /** 账户 ID */
  accountId: number;
  /** Manager ID */
  managerId: number;
  /** 验证记录 ID */
  recordId: number;
  /** 是否为新创建的 Manager */
  isNewlyCreated: boolean;
  /** 操作是否成功 */
  success: boolean;
}
