// src/usecases/verification/consume-verification-flow.usecase.ts

import { VerificationRecordType, SubjectType } from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationReadService } from '@src/modules/verification-record/services/verification-read.service';
import { VerificationRecordService } from '@src/modules/verification-record/verification-record.service';
import { ConsumeVerificationRecordUsecase } from '@src/usecases/verification-record/consume-verification-record.usecase';
import { InviteCoachHandlerResult } from './coach/invite-coach-result.types';
import {
  ConsumeVerificationFlowParams,
  VerificationFlowContext,
  VerificationFlowHandler,
  VerificationFlowResult,
} from './types/consume.types';

/**
 * 验证流程消费用例
 * 负责协调验证码的分发到具体业务用例、以及最终的状态落账
 *
 * 工作流程：
 * 1. 前端先调用 findVerificationRecord 预读验证记录（不在事务中）
 * 2. 前端收集必要数据后调用此用例进行消费
 * 3. 在事务中执行业务逻辑和验证码消费
 *
 * 注意：此用例不再包含预读步骤，预读应该通过独立的 findVerificationRecord GraphQL 查询完成
 */
@Injectable()
export class ConsumeVerificationFlowUsecase {
  /**
   * 注册的验证流程处理器映射
   */
  private readonly handlers = new Map<VerificationRecordType, VerificationFlowHandler>();

  constructor(
    private readonly consumeVerificationRecordUsecase: ConsumeVerificationRecordUsecase,
    private readonly verificationRecordService: VerificationRecordService,
    private readonly verificationReadService: VerificationReadService,
  ) {}

  /**
   * 注册验证流程处理器
   * @param handler 处理器实例
   */
  registerHandler(handler: VerificationFlowHandler): void {
    for (const type of handler.supportedTypes) {
      if (this.handlers.has(type)) {
        throw new Error(`验证流程处理器冲突: ${type} 已被注册`);
      }
      this.handlers.set(type, handler);
    }
  }

  /**
   * 执行验证流程
   *
   * 注意：此方法假设前端已经通过 findVerificationRecord 预读了验证记录
   * 并收集了必要的数据，现在直接进行消费操作
   *
   * @param params 流程参数
   * @returns 验证流程结果
   */
  async execute(params: ConsumeVerificationFlowParams): Promise<VerificationFlowResult> {
    const { token, consumedByAccountId, expectedType, manager, resetPassword } = params;

    return this.verificationRecordService.runTransaction(async (transactionManager) => {
      const activeManager = manager || transactionManager;

      // 第一步：在事务中重新验证并获取验证记录视图
      // 这里需要重新验证是因为从预读到消费之间可能有状态变化
      const recordView = await this.verificationReadService.findConsumableRecord(token);

      if (!recordView) {
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
          '验证码已被使用或已失效',
          { token, expectedType },
        );
      }

      // 第二步：验证 expectedType（如果提供）
      if (expectedType && recordView.type !== expectedType) {
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
          `验证记录类型不匹配，期望: ${expectedType}，实际: ${recordView.type}`,
          { expectedType, actualType: recordView.type },
        );
      }

      // 第三步：获取对应的业务处理器
      const handler = this.getHandler(recordView.type);

      // 第四步：构建验证流程上下文
      const context: VerificationFlowContext = {
        recordView,
        consumedByAccountId,
        manager: activeManager,
        resetPassword, // 传递密码重置载荷
      };

      // 第五步：执行业务逻辑
      const businessResult = await handler.handle(context);

      // 第六步：从业务结果中提取主体信息
      let subjectType: SubjectType | undefined;
      let subjectId: number | undefined;

      // 根据验证记录类型和业务结果提取主体信息
      if (recordView.type === VerificationRecordType.INVITE_COACH && businessResult) {
        // 对于 INVITE_COACH 类型，从 InviteCoachHandlerResult 中提取 coachId
        const coachResult = businessResult as InviteCoachHandlerResult;
        if (coachResult.coachId) {
          subjectType = SubjectType.COACH;
          subjectId = coachResult.coachId;
        }
      }

      // 第七步：消费验证记录（在同一事务中）
      await this.consumeVerificationRecordUsecase.consumeByToken({
        token,
        consumedByAccountId,
        expectedType: recordView.type,
        manager: activeManager,
        subjectType,
        subjectId,
      });

      return businessResult;
    });
  }

  /**
   * 获取指定类型的处理器
   * @param type 验证记录类型
   * @returns 对应的处理器
   */
  private getHandler(type: VerificationRecordType): VerificationFlowHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
        `不支持的验证记录类型: ${type}`,
        { type },
      );
    }
    return handler;
  }

  /**
   * 获取所有支持的验证记录类型
   * @returns 支持的类型数组
   */
  getSupportedTypes(): VerificationRecordType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 检查是否支持指定类型
   * @param type 验证记录类型
   * @returns 是否支持
   */
  isTypeSupported(type: VerificationRecordType): boolean {
    return this.handlers.has(type);
  }
}
