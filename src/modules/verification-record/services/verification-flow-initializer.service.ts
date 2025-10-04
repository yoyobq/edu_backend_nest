// src/modules/verification-record/services/verification-flow-initializer.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConsumeVerificationFlowUsecase } from '@src/usecases/verification/consume-verification-flow.usecase';
import { ResetPasswordHandler } from '@src/usecases/verification/password/reset-password.handler';

/**
 * 验证流程初始化服务
 * 负责在模块初始化时注册所有验证流程处理器
 */
@Injectable()
export class VerificationFlowInitializerService implements OnModuleInit {
  constructor(
    private readonly consumeVerificationFlowUsecase: ConsumeVerificationFlowUsecase,
    private readonly resetPasswordHandler: ResetPasswordHandler,
  ) {}

  /**
   * 模块初始化时注册所有验证流程处理器
   */
  onModuleInit(): void {
    // 注册重置密码处理器
    this.consumeVerificationFlowUsecase.registerHandler(this.resetPasswordHandler);
  }
}
