// src/usecases/verification/coach/invite-coach-result.types.ts

/**
 * Coach 邀请处理结果
 */
export interface InviteCoachHandlerResult {
  /** 账户 ID */
  accountId: number;
  /** Coach ID */
  coachId: number;
  /** 验证记录 ID */
  recordId: number;
  /** 是否为新创建的 Coach */
  isNewlyCreated: boolean;
  /** 操作是否成功 */
  success: boolean;
}
