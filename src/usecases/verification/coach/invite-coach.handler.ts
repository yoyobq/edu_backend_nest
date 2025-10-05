// src/usecases/verification/coach/invite-coach.handler.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { AcceptInviteCoachUsecase } from '../invite/accept-invite-coach.usecase';
import { VerificationFlowContext, VerificationFlowHandler } from '../types/consume.types';
import { InviteCoachHandlerResult } from './invite-coach-result.types';

/**
 * 邀请 Coach 处理器
 * 实现 VerificationFlowHandler 接口，连接验证流程和 Coach 邀请用例
 */
@Injectable()
export class InviteCoachHandler implements VerificationFlowHandler<InviteCoachHandlerResult> {
  readonly supportedTypes = [VerificationRecordType.INVITE_COACH];

  constructor(private readonly acceptInviteCoachUsecase: AcceptInviteCoachUsecase) {}

  /**
   * 处理 Coach 邀请验证流程
   *
   * 支持两种场景：
   * 1. 已登录用户：直接为其添加 Coach 身份（保持其他身份不变）
   * 2. 未登录用户：可选择登录现有账户或注册新账户
   *
   * @param context 验证流程上下文
   * @returns Coach 邀请处理结果
   */
  async handle(context: VerificationFlowContext): Promise<InviteCoachHandlerResult> {
    const { recordView, consumedByAccountId, manager } = context;

    // 验证必要参数
    if (!consumedByAccountId) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
        'Coach 邀请需要指定消费者账户 ID',
      );
    }

    // 获取目标账户 ID（被邀请的特定账户，可能为空）
    const targetAccountId = recordView.targetAccountId;

    // 验证邀请权限
    if (targetAccountId && consumedByAccountId !== targetAccountId) {
      // 如果邀请指定了特定账户，只有该账户可以接受邀请
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
        '此邀请仅限指定账户使用',
        {
          consumedByAccountId,
          targetAccountId,
        },
      );
    }

    // 解析邀请载荷
    const invitePayload = this.parseInvitePayload(recordView.publicPayload);

    // 调用 AcceptInviteCoachUsecase 执行业务逻辑
    // 注意：无论是否有 targetAccountId，都使用 consumedByAccountId 作为实际操作的账户
    const usecaseResult = await this.acceptInviteCoachUsecase.execute({
      recordId: recordView.id,
      consumedByAccountId,
      invitePayload,
      manager,
    });

    // 返回处理结果
    return usecaseResult;
  }

  /**
   * 解析邀请载荷
   * @param payload 原始载荷数据
   * @returns 解析后的邀请载荷
   */
  private parseInvitePayload(payload: unknown): InviteCoachPayload {
    if (!payload || typeof payload !== 'object') {
      throw new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '邀请载荷格式无效', {
        payload,
      });
    }

    const payloadObj = payload as Record<string, unknown>;

    // 验证必要字段
    if (!payloadObj.coachName || typeof payloadObj.coachName !== 'string') {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
        '邀请载荷中缺少有效的 Coach 姓名',
        { payload },
      );
    }

    return {
      coachName: payloadObj.coachName,
      coachLevel: typeof payloadObj.coachLevel === 'number' ? payloadObj.coachLevel : 1,
      description: typeof payloadObj.description === 'string' ? payloadObj.description : null,
      avatarUrl: typeof payloadObj.avatarUrl === 'string' ? payloadObj.avatarUrl : null,
      specialty: typeof payloadObj.specialty === 'string' ? payloadObj.specialty : null,
      remark: typeof payloadObj.remark === 'string' ? payloadObj.remark : null,
      // 可选的租户/组织范围字段（为未来扩展预留）
      orgId: typeof payloadObj.orgId === 'number' ? payloadObj.orgId : null,
      projectId: typeof payloadObj.projectId === 'number' ? payloadObj.projectId : null,
      trainingCenterId:
        typeof payloadObj.trainingCenterId === 'number' ? payloadObj.trainingCenterId : null,
    };
  }
}

/**
 * Coach 邀请载荷接口
 */
export interface InviteCoachPayload {
  /** Coach 姓名 */
  coachName: string;
  /** Coach 等级，默认为 1 */
  coachLevel?: number;
  /** 对外展示的简介/推介 */
  description?: string | null;
  /** Coach 头像 URL */
  avatarUrl?: string | null;
  /** Coach 专长，如篮球/游泳/体能 */
  specialty?: string | null;
  /** 内部备注，不对外展示 */
  remark?: string | null;
  /** 可选的组织 ID（为未来扩展预留） */
  orgId?: number | null;
  /** 可选的项目 ID（为未来扩展预留） */
  projectId?: number | null;
  /** 可选的培训中心 ID（为未来扩展预留） */
  trainingCenterId?: number | null;
}
