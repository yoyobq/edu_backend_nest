// src/modules/account/base/services/account-security.service.ts
import { AccountStatus } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { FieldEncryptionService } from '../../../../core/field-encryption/field-encryption.service';
import { AccountEntity } from '../entities/account.entity';
import { UserInfoEntity } from '../entities/user-info.entity';

@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly fieldEncryptionService: FieldEncryptionService,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AccountSecurityService.name);
  }

  /**
   * 验证 metaDigest 与 accessGroup 的一致性
   * @param account 账号实体（包含关联的用户信息）
   * @returns 验证结果和真实的 accessGroup
   */
  validateAccessGroupConsistency(account: AccountEntity & { userInfo: UserInfoEntity }): {
    isValid: boolean;
    realAccessGroup?: string[];
    shouldSuspend: boolean;
  } {
    try {
      // 确保 metaDigest 是字符串类型
      const metaDigestValue = Array.isArray(account.userInfo.metaDigest)
        ? account.userInfo.metaDigest[0]
        : account.userInfo.metaDigest;

      if (!metaDigestValue || typeof metaDigestValue !== 'string') {
        this.logger.error(
          `Invalid metaDigest format for account ${account.id}: ${typeof metaDigestValue}`,
        );
        return {
          isValid: false,
          shouldSuspend: true,
        };
      }

      // 从 metaDigest 中解密获取真实的 accessGroup（移除 await）
      const decryptedData = this.fieldEncryptionService.decrypt(metaDigestValue);

      // 安全地解析 JSON 数据
      let parsedData: { accessGroup?: string[] };
      try {
        parsedData = JSON.parse(decryptedData) as { accessGroup?: string[] };
      } catch (parseError) {
        this.logger.error(
          `Failed to parse decrypted metaDigest for account ${account.id}`,
          parseError,
        );
        return {
          isValid: false,
          shouldSuspend: true,
        };
      }

      const realAccessGroup = parsedData.accessGroup;

      if (!Array.isArray(realAccessGroup)) {
        this.logger.error(`Invalid accessGroup format in metaDigest for account ${account.id}`);
        return {
          isValid: false,
          shouldSuspend: true,
        };
      }

      // 检查一致性
      const isConsistent =
        JSON.stringify(realAccessGroup.sort()) ===
        JSON.stringify(account.userInfo.accessGroup.sort());

      if (!isConsistent) {
        // 记录严重安全错误
        this.logger.error(
          `Access group inconsistency detected for account ${account.id}: ` +
            `stored=${JSON.stringify(account.userInfo.accessGroup)}, real=${JSON.stringify(realAccessGroup)}`,
          {
            accountId: account.id,
            storedAccessGroup: account.userInfo.accessGroup,
            realAccessGroup,
            timestamp: new Date().toISOString(),
          },
        );

        return {
          isValid: false,
          realAccessGroup,
          shouldSuspend: true,
        };
      }

      return {
        isValid: true,
        realAccessGroup,
        shouldSuspend: false,
      };
    } catch (error) {
      this.logger.error(
        `Failed to validate access group consistency for account ${account.id}`,
        error,
      );

      return {
        isValid: false,
        shouldSuspend: true,
      };
    }
  }

  /**
   * 创建账号暂停数据
   * @param accountId 账号 ID
   * @param reason 暂停原因
   * @returns 暂停数据对象
   */
  createSuspensionData(accountId: number, reason: string) {
    return {
      accountId,
      reason,
      suspendedAt: new Date(),
      status: AccountStatus.SUSPENDED,
    };
  }

  /**
   * 记录安全事件
   * @param event 安全事件信息
   */
  logSecurityEvent(event: {
    accountId: number;
    eventType: string;
    details: Record<string, unknown>;
  }) {
    this.logger.error(`Security Event: ${event.eventType}`, {
      accountId: event.accountId,
      ...event.details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 暂停账号
   * @param accountId 账号 ID
   * @param reason 暂停原因
   * @returns 是否成功暂停
   */
  async suspendAccount(accountId: number, reason: string): Promise<boolean> {
    try {
      await this.accountRepository.update(accountId, {
        status: AccountStatus.SUSPENDED,
      });

      this.logSecurityEvent({
        accountId,
        eventType: 'ACCOUNT_SUSPENDED',
        details: {
          reason,
          suspendedAt: new Date().toISOString(),
        },
      });

      this.logger.warn(`Account ${accountId} has been suspended due to: ${reason}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to suspend account ${accountId}`, error);
      return false;
    }
  }

  /**
   * 检查并处理账号安全性
   * @param account 账号实体（包含 userInfo）
   * @returns 处理结果
   */
  checkAndHandleAccountSecurity(account: AccountEntity & { userInfo: UserInfoEntity }): {
    isValid: boolean;
    wasSuspended: boolean;
    realAccessGroup?: string[];
  } {
    const validationResult = this.validateAccessGroupConsistency(account);

    if (!validationResult.isValid && validationResult.shouldSuspend) {
      // 立即记录安全事件，不等待数据库操作
      this.logSecurityEvent({
        accountId: account.id,
        eventType: 'SECURITY_BREACH_DETECTED',
        details: {
          reason: 'Access group inconsistency detected - potential security breach',
          detectedAt: new Date().toISOString(),
          immediateBlock: true,
        },
      });

      // 异步尝试暂停账号，但不等待结果
      this.suspendAccount(
        account.id,
        'Access group inconsistency detected - potential security breach',
      ).catch((error) => {
        this.logger.error(
          `Failed to suspend account ${account.id} in database, but access is still blocked`,
          error,
        );
      });

      // 无论数据库操作是否成功，都立即阻断访问
      return {
        isValid: false,
        wasSuspended: true, // 强制返回 true，确保流程被阻断
        realAccessGroup: validationResult.realAccessGroup,
      };
    }

    return {
      isValid: validationResult.isValid,
      wasSuspended: false,
      realAccessGroup: validationResult.realAccessGroup,
    };
  }
}
