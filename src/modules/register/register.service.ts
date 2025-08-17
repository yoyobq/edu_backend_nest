// src/modules/register/register.service.ts

import { AccountStatus } from '@app-types/models/account.types';
import { PreparedRegisterData } from '@app-types/services/register.types';
import {
  getRealClientIp,
  isPrivateIp,
  isServerIp,
} from '@core/common/network/network-access.helper';
import { AccountService } from '@modules/account/account.service';
import { AccountEntity } from '@modules/account/entities/account.entity';
import { ConflictException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RegisterResult } from '../../adapters/graphql/registration/dto/register-result.dto';
import { RegisterInput } from '../../adapters/graphql/registration/dto/register.input';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';

/**
 * 注册服务
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly accountService: AccountService,
    private readonly createAccountUsecase: CreateAccountUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RegisterService.name);
  }

  /**
   * 用户注册
   * @param input 注册参数
   * @param request 请求对象，用于获取客户端 IP
   * @returns 注册结果
   * @throws BadRequestException 参数验证失败时抛出异常
   * @throws ConflictException 账户已存在时抛出异常
   */
  async register(
    input: RegisterInput,
    request?: {
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
      connection?: { remoteAddress?: string };
    },
  ): Promise<RegisterResult> {
    try {
      // 获取真实客户端 IP
      const clientIp = request ? getRealClientIp(request) : '';

      let account: AccountEntity;

      // 判断是否内网且服务器 ip 是 192.168.72.55，如果是走核验流程（提供校园网账号并访问校园网爬取信息）
      if (isPrivateIp(clientIp) && isServerIp('192.168.72.55')) {
        // 走校园网核验流程
        // 这是防御代码，目前不在校内部署不会进到这个分支
        // await this.verifyCampusAccount(input);
        // TODO: 实现校园网核验流程后的账户创建逻辑
        throw new Error('校园网核验流程暂未实现');
      } else {
        // 否则的话，走普通用户核验流程

        // 检查账户是否已存在
        await this.checkAccountExists(input);

        // 准备注册信息
        const preparedData = await this.prepareRegisterData(input);

        // 创建账户
        account = await this.createAccount(preparedData);
      }

      this.logger.info(
        `用户注册成功: ${account.id}，注册时 IP 为：${clientIp.replace(/^::ffff:/, '').trim()}`,
      );

      return {
        success: true,
        message: '注册成功',
        accountId: account.id,
      };
    } catch (error) {
      // 业务抛错直接冒泡
      // if (error instanceof ConflictException) {
      //   throw error;
      // }
      // 系统抛错记录失败日志
      if (error instanceof Error) {
        this.logger.error(`用户注册失败: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * 准备注册数据
   */
  private async prepareRegisterData({
    loginName = null,
    loginEmail,
    nickname,
    type: _,
    ...restInput
  }: RegisterInput): Promise<PreparedRegisterData> {
    // 生成 nickname 的优先级：input.nickname > input.loginName > input.loginEmail 的 @ 前面部分
    let finalNickname = nickname || loginName;
    if (!finalNickname && loginEmail) {
      finalNickname = loginEmail.split('@')[0];
    }
    finalNickname = finalNickname || '';

    // 直接调用 AccountService 方法检查昵称是否存在
    const nicknameExists = await this.accountService.checkNicknameExists(finalNickname);
    if (nicknameExists) {
      if (nickname) {
        throw new ConflictException(`昵称 "${nickname}" 已被使用，请选择其他昵称`);
      }
      throw new ConflictException(`自适配昵称 "${finalNickname}" 已被使用，请填写昵称字段`);
    }

    return {
      loginName,
      loginEmail,
      ...restInput,
      status: AccountStatus.PENDING,
      nickname: finalNickname,
      email: loginEmail,
      accessGroup: ['REGISTRANT'],
      identityHint: 'REGISTRANT',
      metaDigest: ['REGISTRANT'],
    };
  }

  /**
   * 检查账户是否已存在
   */
  private async checkAccountExists({ loginName = null, loginEmail }: RegisterInput): Promise<void> {
    const exists = await this.accountService.checkAccountExists({
      loginName,
      loginEmail,
    });

    if (exists) {
      throw new ConflictException('账户已存在');
    }
  }

  private async createAccount({
    loginName,
    loginEmail,
    loginPassword,
    status,
    nickname,
    email,
    accessGroup,
    identityHint,
    metaDigest,
  }: PreparedRegisterData): Promise<AccountEntity> {
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
        metaDigest,
      },
    });
  }
}
