// src/usecases/verification/consume-verification-flow.usecase.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import { VerificationRecordType } from '@app-types/models/verification-record.types';
import {
  DomainError,
  PERMISSION_ERROR,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import {
  VerificationReadService,
  VerificationRecordView,
} from '@src/modules/verification-record/services/verification-read.service';
import { VerificationRecordService } from '@src/modules/verification-record/verification-record.service';
import { ConsumeVerificationRecordUsecase } from '@src/usecases/verification-record/consume-verification-record.usecase';
import {
  ConsumeVerificationFlowParams,
  VerificationFlowContext,
  VerificationFlowHandler,
  VerificationFlowResult,
} from './types/consume.types';

/**
 * 验证流程消费用例
 * 负责协调验证码的预读、分发到具体业务用例、以及最终的状态落账
 *
 * 工作流程：
 * 1. 预读验证记录（不消费）
 * 2. 根据验证记录类型分发到对应的业务处理器
 * 3. 在同一事务中执行业务逻辑和验证码消费
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
        throw new Error(`Handler for verification type ${type} is already registered`);
      }
      this.handlers.set(type, handler);
    }
  }

  /**
   * 执行验证流程
   * @param params 流程参数
   * @returns 验证流程结果
   */
  async execute(params: ConsumeVerificationFlowParams): Promise<VerificationFlowResult> {
    const {
      token,
      consumedByAccountId,
      expectedType,
      audience,
      email,
      phone,
      manager,
      resetPassword,
    } = params;

    return this.verificationRecordService.runTransaction(async (transactionManager) => {
      const activeManager = manager || transactionManager;

      // 第一步：预读验证记录视图（不消费，仅验证有效性）
      const recordView = await this.preReadRecordView({
        token,
        consumedByAccountId,
        expectedType,
        audience,
        email,
        phone,
      });

      // 第二步：获取对应的业务处理器
      const handler = this.getHandler(recordView.type);

      // 第三步：构建验证流程上下文
      const context: VerificationFlowContext = {
        recordView,
        consumedByAccountId,
        manager: activeManager,
        resetPassword, // 传递密码重置载荷
      };

      // 第四步：执行业务逻辑
      const businessResult = await handler.handle(context);

      // 第五步：消费验证记录（在同一事务中）
      await this.consumeVerificationRecordUsecase.consumeByToken({
        token,
        consumedByAccountId,
        expectedType: recordView.type,
        manager: activeManager,
      });

      return businessResult;
    });
  }

  /**
   * 预读验证记录视图
   * 验证记录的有效性但不消费，返回去敏的记录视图
   *
   * 使用专门的 VerificationReadService.findConsumableRecord 进行统一的校验逻辑
   */
  private async preReadRecordView(params: {
    token: string;
    consumedByAccountId?: number;
    expectedType?: VerificationRecordType;
    audience?: AudienceTypeEnum | null;
    email?: string;
    phone?: string;
  }): Promise<VerificationRecordView> {
    const { token, consumedByAccountId, expectedType, audience, email, phone } = params;

    try {
      // 使用专门的读取服务进行统一校验，透传上下文参数
      const recordView = await this.verificationReadService.findConsumableRecord(
        token,
        audience,
        email,
        phone,
      );

      // 验证类型匹配
      if (expectedType && recordView.type !== expectedType) {
        throw new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '验证码类型不匹配', {
          expected: expectedType,
          actual: recordView.type,
        });
      }

      // 验证权限
      if (recordView.targetAccountId && !consumedByAccountId) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '此验证码需要登录后使用');
      }

      if (
        recordView.targetAccountId &&
        consumedByAccountId &&
        recordView.targetAccountId !== consumedByAccountId
      ) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '您无权使用此验证码', {
          targetAccountId: recordView.targetAccountId,
          consumedByAccountId,
        });
      }

      // 直接返回记录视图，避免二次查询
      return recordView;
    } catch (error) {
      // 如果是 DomainError，直接抛出
      if (error instanceof DomainError) {
        throw error;
      }

      // 其他错误转换为统一的错误格式
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.INVALID_TOKEN,
        '验证记录查找失败',
        { consumedByAccountId, expectedType, audience, email, phone },
        error,
      );
    }
  }

  /**
   * 获取验证类型对应的处理器
   */
  private getHandler(type: VerificationRecordType): VerificationFlowHandler {
    // TODO: 临时限制，只支持密码重置类型
    if (type !== VerificationRecordType.PASSWORD_RESET) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.INVALID_TYPE,
        `暂时只支持密码重置功能，不支持的验证记录类型: ${type}`,
        {
          type,
          supportedTypes: [VerificationRecordType.PASSWORD_RESET],
        },
      );
    }

    const handler = this.handlers.get(type);
    if (!handler) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.INVALID_TYPE,
        `未注册的验证记录类型处理器: ${type}`,
        {
          type,
          supportedTypes: this.getSupportedTypes(),
        },
      );
    }
    return handler;
  }

  /**
   * 获取所有已注册的处理器类型
   */
  getSupportedTypes(): VerificationRecordType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 检查是否支持指定的验证类型
   */
  isTypeSupported(type: VerificationRecordType): boolean {
    return this.handlers.has(type);
  }
}
