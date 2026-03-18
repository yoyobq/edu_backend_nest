// src/usecases/registration/register-with-email.usecase.ts

import { AccountStatus, IdentityTypeEnum, UserAccountView } from '@app-types/models/account.types';
import { VerificationRecordType } from '@app-types/models/verification-record.types';
import {
  ACCOUNT_ERROR,
  AUTH_ERROR,
  DomainError,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors';
import { isPrivateIp, isServerIp } from '@core/common/network/network-access.helper';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';
import { TokenFingerprintHelper } from '@modules/common/security/token-fingerprint.helper';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import { VerificationRecordService } from '@src/modules/verification-record/verification-record.service';
import {
  RegisterWithEmailParams,
  RegisterWithEmailResult,
} from '@app-types/models/registration.types';
import { PinoLogger } from 'nestjs-pino';
import { normalizeRegisterWithEmailInput } from './registration-input.normalize';

/**
 * 邮箱注册用例
 * 负责处理用户通过邮箱注册的完整业务流程
 */
@Injectable()
export class RegisterWithEmailUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly accountQueryService: AccountQueryService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly verificationRecordService: VerificationRecordService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RegisterWithEmailUsecase.name);
  }

  /**
   * 执行邮箱注册流程
   * @param params 注册参数
   * @returns 注册结果
   */
  async execute(params: RegisterWithEmailParams): Promise<RegisterWithEmailResult> {
    const {
      loginName,
      loginEmail,
      loginPassword,
      nickname,
      inviteToken,
      clientIp,
      serverNetworkInterfaces,
    } = params;
    const normalizedInput = normalizeRegisterWithEmailInput({ loginEmail, nickname });
    const normalizedLoginEmail = normalizedInput.loginEmail;
    const normalizedNickname = normalizedInput.nickname;

    try {
      const finalClientIp = clientIp ?? '';

      // 判断是否内网且服务器 ip 是 192.168.72.55，如果是走核验流程
      if (
        isPrivateIp(finalClientIp) &&
        isServerIp({ targetIp: '192.168.72.55', networkInterfaces: serverNetworkInterfaces })
      ) {
        // 校园网核验流程暂未实现
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '校园网核验流程暂未实现');
      }

      // 检查账户是否已存在
      await this.checkAccountExists({ loginName, loginEmail: normalizedLoginEmail });

      // 准备注册数据
      const preparedData = await this.prepareRegisterData({
        loginName,
        loginEmail: normalizedLoginEmail,
        loginPassword,
        nickname: normalizedNickname,
      });

      // 创建账户
      const account = await this.createAccount(preparedData);

      // 如果提供了邀请令牌，尝试消费邀请码
      if (inviteToken) {
        try {
          await this.consumeInviteToken({
            inviteToken,
            consumedByAccountId: account.id,
          });
          const tokenFp = TokenFingerprintHelper.generateTokenFingerprint({ token: inviteToken });
          this.logger.info(
            { accountId: account.id, tokenFp: tokenFp.toString('hex') },
            '注册成功并尝试消费邀请码',
          );
        } catch (error) {
          // 邀请码消费失败不影响注册成功，只记录日志
          this.logger.warn(
            `用户 ${account.id} 注册成功，但邀请码消费失败: ${error instanceof Error ? error.message : '未知错误'}`,
          );
        }
      }

      if (account.status !== AccountStatus.ACTIVE) {
        await this.accountService.updateAccount(account.id, { status: AccountStatus.ACTIVE });
      }

      this.logger.info(`用户注册成功: ${account.id}，注册时 IP 为：${finalClientIp}`);

      return {
        success: true,
        message: '注册成功',
        accountId: account.id,
      };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      if (error instanceof Error) {
        this.logger.error(`用户注册失败: ${error.message}`);
      }

      throw new DomainError(ACCOUNT_ERROR.REGISTRATION_FAILED, '注册失败');
    }
  }

  /**
   * 消费邀请 token
   * @param params 消费参数
   */
  private async consumeInviteToken(params: {
    inviteToken: string;
    consumedByAccountId: number;
  }): Promise<void> {
    const tokenFp = this.verificationRecordService.generateTokenFingerprint(params.inviteToken);
    const now = new Date();
    const result = await this.verificationRecordService.consumeRecord({
      where: { tokenFp },
      context: {
        expectedType: VerificationRecordType.INVITE_COACH,
        consumedByAccountId: params.consumedByAccountId,
        now,
        targetConstraint: {
          mode: 'MATCH_OR_NULL',
          accountId: params.consumedByAccountId,
        },
      },
    });
    if (result.affected === 0) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '邀请码不可用');
    }
  }

  /**
   * 检查账户是否已存在
   */
  private async checkAccountExists({
    loginName,
    loginEmail,
  }: {
    loginName?: string | null;
    loginEmail: string;
  }): Promise<void> {
    const exists = await this.accountService.checkAccountExists({
      loginName,
      loginEmail,
    });

    if (exists) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_ALREADY_EXISTS, '该登录名或邮箱已被注册');
    }
  }

  /**
   * 准备注册数据
   */
  private async prepareRegisterData({
    loginName,
    loginEmail,
    loginPassword,
    nickname,
  }: {
    loginName?: string | null;
    loginEmail: string;
    loginPassword: string;
    nickname?: string;
  }) {
    // 使用 AccountService 的通用昵称处理方法
    const finalNickname = await this.accountService.pickAvailableNickname({
      providedNickname: nickname,
      fallbackOptions: [loginName || '', loginEmail.split('@')[0]],
      // 注意：这里没有传入 provider 参数，表示本站注册
    });

    if (!finalNickname) {
      throw new DomainError(
        ACCOUNT_ERROR.NICKNAME_ALREADY_EXISTS,
        '昵称已被使用或不合规，请选择其他昵称',
      );
    }

    return {
      loginName,
      loginEmail,
      loginPassword,
      status: AccountStatus.PENDING,
      nickname: finalNickname,
      email: loginEmail,
      accessGroup: [IdentityTypeEnum.REGISTRANT],
      identityHint: IdentityTypeEnum.REGISTRANT,
      metaDigest: [IdentityTypeEnum.REGISTRANT],
    };
  }

  /**
   * 创建账户
   * @param preparedData 准备好的注册数据
   * @returns 创建的账户实体
   */
  private async createAccount(preparedData: {
    loginName?: string | null;
    loginEmail: string;
    loginPassword: string;
    status: AccountStatus;
    nickname: string;
    email: string;
    accessGroup: IdentityTypeEnum[];
    identityHint: IdentityTypeEnum;
    metaDigest: IdentityTypeEnum[];
  }): Promise<UserAccountView> {
    const {
      loginName,
      loginEmail,
      loginPassword,
      status,
      nickname,
      email,
      accessGroup,
      identityHint,
      metaDigest,
    } = preparedData;

    return await this.accountService.runTransaction(async (manager) => {
      const passwordValidation = this.passwordPolicyService.validatePassword(loginPassword);
      if (!passwordValidation.isValid) {
        throw new DomainError(
          AUTH_ERROR.INVALID_PASSWORD,
          `密码不符合安全要求: ${passwordValidation.errors.join(', ')}`,
        );
      }

      const account = this.accountService.createAccountEntity({
        manager,
        accountData: {
          loginName,
          loginEmail,
          loginPassword: 'temp',
          status,
          identityHint,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const savedAccount = await this.accountService.saveAccount({ account, manager });

      savedAccount.loginPassword = AccountService.hashPasswordWithTimestamp(
        loginPassword,
        savedAccount.createdAt,
      );
      await this.accountService.saveAccount({ account: savedAccount, manager });

      const userInfo = this.accountService.createUserInfoEntity({
        manager,
        userInfoData: {
          accountId: savedAccount.id,
          nickname,
          email,
          accessGroup,
          metaDigest,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await this.accountService.saveUserInfo({ userInfo, manager });

      return this.accountQueryService.toUserAccountView(savedAccount);
    });
  }
}
