// src/usecases/verification/manager/invite-manager.handler.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { AcceptInviteManagerUsecase } from '../invite/accept-invite-manager.usecase';
import { VerificationFlowContext, VerificationFlowHandler } from '../types/consume.types';
import { InviteManagerHandlerResult } from './invite-manager-result.types';

/**
 * 邀请 Manager 处理器
 * 实现 VerificationFlowHandler 接口，连接验证流程和 Manager 邀请用例
 */
@Injectable()
export class InviteManagerHandler implements VerificationFlowHandler<InviteManagerHandlerResult> {
  readonly supportedTypes = [VerificationRecordType.INVITE_MANAGER];

  constructor(private readonly acceptInviteManagerUsecase: AcceptInviteManagerUsecase) {}

  /**
   * 处理 Manager 邀请验证流程
   *
   * 支持两种场景：
   * 1. 已登录用户：直接为其添加 Manager 身份（保持其他身份不变）
   * 2. 未登录用户：可选择登录现有账户或注册新账户
   *
   * @param context 验证流程上下文
   * @returns Manager 邀请处理结果
   */
  async handle(context: VerificationFlowContext): Promise<InviteManagerHandlerResult> {
    const { recordView, consumedByAccountId, manager } = context;

    // 验证必要参数
    if (!consumedByAccountId) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
        'Manager 邀请需要指定消费者账户 ID',
      );
    }

    // 获取目标账户 ID（被邀请的特定账户，可能为空）
    const targetAccountId = recordView.targetAccountId;

    // 验证邀请权限
    if (targetAccountId && consumedByAccountId !== targetAccountId) {
      // 如果邀请指定了特定账户，只有该账户可以接受邀请
      throw new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '无权使用此验证码', {
        consumedByAccountId,
        targetAccountId,
      });
    }

    // 解析邀请载荷
    const invitePayload = this.parseInvitePayload(recordView.publicPayload);

    // 调用 AcceptInviteManagerUsecase 执行业务逻辑
    // 注意：无论是否有 targetAccountId，都使用 consumedByAccountId 作为实际操作的账户
    const usecaseResult = await this.acceptInviteManagerUsecase.execute({
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
  private parseInvitePayload(payload: unknown): InviteManagerPayload {
    if (!payload || typeof payload !== 'object') {
      throw new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '邀请载荷格式无效', {
        payload,
      });
    }

    const payloadObj = payload as Record<string, unknown>;

    // 验证必要字段
    if (!payloadObj.managerName || typeof payloadObj.managerName !== 'string') {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
        '邀请载荷中缺少有效的 Manager 姓名',
        { payload },
      );
    }

    return {
      managerName: payloadObj.managerName,
      description: typeof payloadObj.description === 'string' ? payloadObj.description : null,
      avatarUrl: typeof payloadObj.avatarUrl === 'string' ? payloadObj.avatarUrl : null,
      department: typeof payloadObj.department === 'string' ? payloadObj.department : null,
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
 * Manager 邀请载荷接口
 */
export interface InviteManagerPayload {
  /** Manager 姓名 */
  managerName: string;
  /** 描述信息 */
  description?: string | null;
  /** 头像 URL */
  avatarUrl?: string | null;
  /** 部门信息 */
  department?: string | null;
  /** 备注信息 */
  remark?: string | null;
  /** 组织 ID（可选） */
  orgId?: number | null;
  /** 项目 ID（可选） */
  projectId?: number | null;
  /** 培训中心 ID（可选） */
  trainingCenterId?: number | null;
}
