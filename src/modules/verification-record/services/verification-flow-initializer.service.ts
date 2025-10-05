// src/modules/verification-record/services/verification-flow-initializer.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { InviteCoachHandler } from '@src/usecases/verification/coach/invite-coach.handler';
import { ConsumeVerificationFlowUsecase } from '@src/usecases/verification/consume-verification-flow.usecase';
import { ResetPasswordHandler } from '@src/usecases/verification/password/reset-password.handler';

/**
 * 验证流程初始化服务
 * 负责在模块初始化时注册所有验证流程处理器
 *
 * 使用通用的 Handler 注册机制，支持动态扩展新的验证类型
 */
@Injectable()
export class VerificationFlowInitializerService implements OnModuleInit {
  constructor(
    private readonly consumeVerificationFlowUsecase: ConsumeVerificationFlowUsecase,
    private readonly resetPasswordHandler: ResetPasswordHandler,
    private readonly inviteCoachHandler: InviteCoachHandler,
  ) {}

  /**
   * 获取所有需要注册的处理器列表
   * 使用方法返回数组，避免在构造函数前使用属性
   */
  private getHandlers() {
    return [this.resetPasswordHandler, this.inviteCoachHandler];
  }

  /**
   * 模块初始化时注册所有验证流程处理器
   * 使用循环方式替代 switch 语句，便于扩展
   */
  onModuleInit(): void {
    // 批量注册所有处理器
    for (const handler of this.getHandlers()) {
      this.consumeVerificationFlowUsecase.registerHandler(handler);
    }
  }
}
