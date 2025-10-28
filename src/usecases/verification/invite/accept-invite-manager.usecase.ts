// src/usecases/verification/invite/accept-invite-manager.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import {
  ACCOUNT_ERROR,
  DomainError,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { PinoLogger } from 'nestjs-pino';
import { EntityManager } from 'typeorm';
import { InviteManagerHandlerResult } from '../manager/invite-manager-result.types';

/**
 * 接受管理员邀请用例参数
 */
export interface AcceptInviteManagerUsecaseParams {
  recordId: number;
  consumedByAccountId: number;
  invitePayload: {
    managerName: string;
    description?: string | null;
    avatarUrl?: string | null;
    department?: string | null;
    remark?: string | null;
    orgId?: number | null;
    projectId?: number | null;
    trainingCenterId?: number | null;
  };
  manager?: EntityManager;
}

/**
 * 接受管理员邀请用例
 * 负责处理管理员邀请的接受流程，包括：
 * 1. 验证邀请记录的有效性
 * 2. 创建或更新 Manager 身份
 * 3. 更新用户的 accessGroup 权限
 * 4. 触发 metaDigest 同步
 */
@Injectable()
export class AcceptInviteManagerUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly managerService: ManagerService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AcceptInviteManagerUsecase.name);
  }

  /**
   * 执行接受管理员邀请的业务流程
   * @param params 执行参数
   * @returns 验证流程结果
   */
  async execute(params: AcceptInviteManagerUsecaseParams): Promise<InviteManagerHandlerResult> {
    const { recordId, consumedByAccountId, invitePayload, manager: externalManager } = params;

    // 优先使用外层传入的 manager，避免双重事务
    // 只有当外层没传 manager 时才兜底开事务
    const executeLogic = async (manager: EntityManager): Promise<InviteManagerHandlerResult> => {
      try {
        // 1. 验证邀请载荷
        if (!invitePayload) {
          throw new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '邀请载荷不能为空');
        }

        // 2. 检查是否已经是管理员（幂等性处理）
        const existingManager = await this.managerService.findByAccountId(
          consumedByAccountId,
          manager,
        );

        let managerId: number;
        let isNewlyCreated: boolean;

        if (existingManager) {
          // 已存在管理员身份，检查是否激活
          if (!(await this.managerService.isActiveManager(consumedByAccountId, manager))) {
            // 重新激活管理员身份
            await this.managerService.reactivateManager(
              existingManager.id,
              consumedByAccountId,
              manager,
            );
          }
          managerId = existingManager.id;
          isNewlyCreated = false;
        } else {
          // 创建新的管理员身份
          const createResult = await this.managerService.createManager(
            {
              accountId: consumedByAccountId,
              name: invitePayload.managerName || '新管理员',
              remark: invitePayload.remark || null,
              createdBy: consumedByAccountId,
            },
            manager,
          );

          managerId = createResult.manager.id;
          isNewlyCreated = createResult.isNewlyCreated;
        }

        // 3. 更新用户的 accessGroup 权限和 metaDigest 同步
        await this.updateUserPermissions(consumedByAccountId, manager);

        // 4. 返回验证流程结果
        const result = {
          accountId: consumedByAccountId,
          managerId,
          recordId,
          isNewlyCreated,
          success: true,
        };

        return result;
      } catch (error) {
        this.logger.error('AcceptInviteManagerUsecase 执行失败:', error);
        throw error;
      }
    };

    // 如果外层传入了 manager，直接使用；否则开启新事务
    if (externalManager) {
      return await executeLogic(externalManager);
    } else {
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

    // 清理 REGISTRANT，确保包含 MANAGER 权限
    const currentAccessGroup = userInfo.accessGroup || [];
    const cleanedAccessGroup = currentAccessGroup.filter(
      (item) => item !== IdentityTypeEnum.REGISTRANT,
    );
    if (!cleanedAccessGroup.includes(IdentityTypeEnum.MANAGER)) {
      cleanedAccessGroup.push(IdentityTypeEnum.MANAGER);
    }

    const needUpdate =
      cleanedAccessGroup.length !== currentAccessGroup.length ||
      !currentAccessGroup.includes(IdentityTypeEnum.MANAGER) ||
      currentAccessGroup.includes(IdentityTypeEnum.REGISTRANT);

    if (needUpdate) {
      // 更新用户信息实体并同步加密前数据
      userInfo.accessGroup = cleanedAccessGroup;
      userInfo.metaDigest = cleanedAccessGroup; // 直接传入数组，让 @EncryptedField 装饰器自动处理
      userInfo.updatedAt = new Date();

      // 使用 save 方法保存，确保 @EncryptedField 装饰器正常工作
      await userInfoRepository.save(userInfo);
    }
  }
}
