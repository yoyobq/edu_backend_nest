// src/modules/register/register.service.ts

import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { NetworkAccessHelper } from '../../core/common/network/network-access.helper';
import { AccountStatus } from '../../types/models/account.types';
import { PreparedRegisterData } from '../../types/services/prepared-register-data.type';
import { AccountService } from '../account/account.service';
import { AccountEntity } from '../account/entities/account.entity';
import { RegisterResult } from './dto/register-result.dto';
import { RegisterInput } from './dto/register.input';

/**
 * 注册服务
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly accountService: AccountService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly networkAccessHelper: NetworkAccessHelper,
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
      const clientIp = request ? this.networkAccessHelper.getRealClientIp(request) : '';

      let account: AccountEntity;

      // 判断是否内网且服务器 ip 是 192.168.72.55，如果是走核验流程（提供校园网账号并访问校园网爬取信息）
      if (
        this.networkAccessHelper.isPrivateIp(clientIp) &&
        this.networkAccessHelper.isServerIp('192.168.72.55')
      ) {
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

      this.logger.info(`用户注册成功: ${account.id}，注册时 IP 为：${clientIp}`);

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
   * 将原始注册输入转换为包含默认值和处理后字段的完整数据
   * @param input 原始注册输入
   * @returns 准备好的注册数据
   */
  private async prepareRegisterData(input: RegisterInput): Promise<PreparedRegisterData> {
    // 生成 nickname 的优先级：input.nickname > input.loginName > input.loginEmail 的 @ 前面部分
    let nickname = input.nickname || input.loginName;
    if (!nickname && input.loginEmail) {
      nickname = input.loginEmail.split('@')[0];
    }
    // 实际上不可能是 ''，此处为避免 eslint 漏算
    const finalNickname = nickname || '';

    // 确保 nickname 在表中不重复，
    const nicknameExists = await this.accountService.checkNicknameExists(finalNickname);
    if (nicknameExists) {
      if (input.nickname) {
        throw new ConflictException(`昵称 "${input.nickname}" 已被使用，请选择其他昵称`);
      }
      throw new ConflictException(`自适配昵称 "${finalNickname}" 已被使用，请填写昵称字段`);
    }

    return {
      ...input,
      status: AccountStatus.PENDING,
      nickname: finalNickname,
      email: input.loginEmail,
      accessGroup: ['REGISTRANT'],
      hint: 'REGISTRANT',
    };
  }

  /**
   * 检查账户是否已存在
   * @param input 注册参数
   * @throws ConflictException 账户已存在时抛出异常
   */
  private async checkAccountExists(input: RegisterInput): Promise<void> {
    const accountExists = await this.accountService.checkAccountExists(
      input.loginName,
      input.loginEmail,
    );

    if (accountExists) {
      if (input.loginName && input.loginEmail) {
        throw new ConflictException('该登录名或邮箱已被注册');
      } else if (input.loginName) {
        throw new ConflictException('该登录名已被注册');
      } else if (input.loginEmail) {
        throw new ConflictException('该邮箱已被注册');
      }
    }
  }

  /**
   * 创建未经过核验的 REGISTRANT 账户
   * @param preparedData 准备好的注册数据
   * @returns 创建的账户实体
   */
  private async createAccount(preparedData: PreparedRegisterData): Promise<AccountEntity> {
    // 准备账户数据
    const accountData = {
      loginName: preparedData.loginName,
      loginEmail: preparedData.loginEmail,
      loginPassword: preparedData.loginPassword,
      status: preparedData.status,
      identityHint: preparedData.hint,
    };

    // 准备用户信息数据
    const userInfoData = {
      nickname: preparedData.nickname,
      email: preparedData.email,
      accessGroup: preparedData.accessGroup,
    };

    return await this.accountService.createAccount(accountData, userInfoData);
  }
}
