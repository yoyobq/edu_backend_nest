// src/usecases/verification/invite/accept-invite-coach.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import {
  ACCOUNT_ERROR,
  DomainError,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { VerificationRecordService } from '@src/modules/verification-record/verification-record.service';
import { EntityManager } from 'typeorm';
import { InviteCoachHandlerResult } from '../coach/invite-coach-result.types';

/**
 * 接受教练邀请用例参数
 */
export interface AcceptInviteCoachUsecaseParams {
  recordId: number;
  consumedByAccountId: number;
  invitePayload?: {
    coachName: string;
    coachLevel?: number;
    description?: string | null;
    avatarUrl?: string | null;
    specialty?: string | null;
    remark?: string | null;
    orgId?: number | null;
    projectId?: number | null;
    trainingCenterId?: number | null;
  };
  manager?: EntityManager;
}

/**
 * 接受教练邀请用例
 * 负责处理教练邀请的接受流程，包括：
 * 1. 验证邀请记录的有效性
 * 2. 创建或更新 Coach 身份
 * 3. 更新用户的 accessGroup 权限
 * 4. 触发 metaDigest 同步
 */
@Injectable()
export class AcceptInviteCoachUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly coachService: CoachService,
    private readonly verificationRecordService: VerificationRecordService,
  ) {}

  /**
   * 执行接受教练邀请的业务流程
   * @param params 执行参数
   * @returns 验证流程结果
   */
  async execute(params: AcceptInviteCoachUsecaseParams): Promise<InviteCoachHandlerResult> {
    const { recordId, consumedByAccountId, manager: externalManager } = params;

    // 优先使用外层传入的 manager，避免双重事务
    // 只有当外层没传 manager 时才兜底开事务
    const executeLogic = async (manager: EntityManager): Promise<InviteCoachHandlerResult> => {
      console.log('AcceptInviteCoachUsecase 开始执行:', { recordId, consumedByAccountId });

      try {
        // 1. 获取并验证邀请记录
        const record = await this.verificationRecordService.findById(recordId);
        if (!record) {
          throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '邀请记录不存在');
        }
        console.log('找到邀请记录:', record.id);

        // 2. 解析邀请载荷
        const payload = record.payload as {
          coachName?: string;
          coachLevel?: string;
          description?: string;
          avatarUrl?: string;
          specialty?: string;
          remark?: string;
          orgId?: number;
          projectId?: number;
          trainingCenterId?: number;
        };
        console.log('解析载荷:', payload);

        // 3. 检查是否已经是教练（幂等性处理）
        const existingCoach = await this.coachService.findByAccountId(consumedByAccountId, manager);
        console.log('检查现有 Coach:', existingCoach?.id || 'null');

        let coachId: number;
        let isNewlyCreated: boolean;

        if (existingCoach) {
          // 已存在教练身份，检查是否激活
          if (!(await this.coachService.isActiveCoach(consumedByAccountId, manager))) {
            // 重新激活教练身份
            await this.coachService.reactivateCoach(existingCoach.id, consumedByAccountId, manager);
            console.log('重新激活 Coach:', existingCoach.id);
          }
          coachId = existingCoach.id;
          isNewlyCreated = false;
        } else {
          // 创建新的教练身份
          console.log('开始创建新 Coach...');
          const createResult = await this.coachService.createCoach(
            {
              accountId: consumedByAccountId,
              name: payload.coachName || '新教练',
              level: payload.coachLevel ? parseInt(payload.coachLevel, 10) : 1,
              description: payload.description || null,
              avatarUrl: payload.avatarUrl || null,
              specialty: payload.specialty || null,
              remark: payload.remark || null,
              createdBy: consumedByAccountId,
            },
            manager,
          );
          console.log('创建 Coach 结果:', {
            coachId: createResult.coach.id,
            isNewlyCreated: createResult.isNewlyCreated,
          });
          coachId = createResult.coach.id;
          isNewlyCreated = createResult.isNewlyCreated;
        }

        // 4. 更新用户的 accessGroup 权限和 metaDigest 同步
        console.log('开始更新用户权限...');
        await this.updateUserPermissions(consumedByAccountId, manager);
        console.log('用户权限更新完成');

        // 5. 返回验证流程结果
        const result = {
          accountId: consumedByAccountId,
          coachId,
          recordId,
          isNewlyCreated,
          success: true,
        };
        console.log('AcceptInviteCoachUsecase 执行完成:', result);
        return result;
      } catch (error) {
        console.error('AcceptInviteCoachUsecase 执行失败:', error);
        throw error;
      }
    };

    // 如果外层传入了 manager，直接使用；否则开启新事务
    if (externalManager) {
      console.log('使用外部事务管理器');
      return await executeLogic(externalManager);
    } else {
      console.log('开启新事务');
      return await this.accountService.runTransaction(executeLogic);
    }
  }

  /**
   * 更新用户权限和同步 metaDigest
   * @param accountId 账户 ID
   * @param manager 事务管理器
   */
  private async updateUserPermissions(accountId: number, manager: EntityManager): Promise<void> {
    const userInfoRepository = manager.getRepository(UserInfoEntity);

    // 获取当前用户信息
    const userInfo = await userInfoRepository.findOne({ where: { accountId } });
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    // 检查是否已经包含 COACH 权限
    const currentAccessGroup = userInfo.accessGroup || [];
    if (!currentAccessGroup.includes(IdentityTypeEnum.COACH)) {
      // 添加 COACH 权限到 accessGroup
      const updatedAccessGroup = [...currentAccessGroup, IdentityTypeEnum.COACH];

      // 更新用户信息实体
      userInfo.accessGroup = updatedAccessGroup;
      userInfo.metaDigest = updatedAccessGroup; // 直接传入数组，让 @EncryptedField 装饰器自动处理
      userInfo.updatedAt = new Date();

      // 使用 save 方法保存，确保 @EncryptedField 装饰器正常工作
      await userInfoRepository.save(userInfo);
    }
  }
}
