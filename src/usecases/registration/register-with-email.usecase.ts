// src/usecases/registration/register-with-email.usecase.ts

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { ACCOUNT_ERROR, DomainError } from '@core/common/errors';
import {
  getRealClientIp,
  isPrivateIp,
  isServerIp,
} from '@core/common/network/network-access.helper';
import { Injectable } from '@nestjs/common';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import {
  RegisterWithEmailParams,
  RegisterWithEmailResult,
} from '@src/types/models/registration.types';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { PinoLogger } from 'nestjs-pino';

/**
 * 邮箱注册用例
 * 负责处理用户通过邮箱注册的完整业务流程
 */
@Injectable()
export class RegisterWithEmailUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly createAccountUsecase: CreateAccountUsecase,
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
    const { loginName, loginEmail, loginPassword, nickname, request } = params;

    try {
      // 获取真实客户端 IP
      const clientIp = request ? getRealClientIp(request) : '';

      // 判断是否内网且服务器 ip 是 192.168.72.55，如果是走核验流程
      if (isPrivateIp(clientIp) && isServerIp('192.168.72.55')) {
        // 校园网核验流程暂未实现
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '校园网核验流程暂未实现');
      }

      // 检查账户是否已存在
      await this.checkAccountExists({ loginName, loginEmail });

      // 准备注册数据
      const preparedData = await this.prepareRegisterData({
        loginName,
        loginEmail,
        loginPassword,
        nickname,
      });

      // 创建账户
      const account = await this.createAccount(preparedData);

      this.logger.info(
        `用户注册成功: ${account.id}，注册时 IP 为：${clientIp.replace(/^::ffff:/, '').trim()}`,
      );

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
  }): Promise<AccountEntity> {
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

    // 调用 CreateAccountUsecase 处理复杂的账户创建逻辑
    return await this.createAccountUsecase.execute({
      accountData: {
        loginName,
        loginEmail,
        loginPassword,
        status,
        identityHint,
      },
      userInfoData: {
        nickname,
        email,
        accessGroup,
        metaDigest, // 修复：直接传入数组，让装饰器自动处理
      },
      // 添加 manager 参数，传入 undefined 让 CreateAccountUsecase 自己管理事务
      // TODO: 本地注册还可传入更多身份数据
      manager: undefined,
    });
  }
}
