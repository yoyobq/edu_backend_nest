// src/modules/register/register.service.ts

import { ConflictException, Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '@app-types/models/account.types';
import { PreparedRegisterData } from '@app-types/services/register.types';
import {
  getRealClientIp,
  isPrivateIp,
  isServerIp,
} from '@core/common/network/network-access.helper';
import { AccountService } from '@modules/account/account.service';
import { AccountEntity } from '@modules/account/entities/account.entity';
import { PinoLogger } from 'nestjs-pino';
import { RegisterResult } from './dto/register-result.dto';
import { RegisterInput } from './dto/register.input';

/**
 * 注册服务
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly accountService: AccountService,
    // private readonly configService: ConfigService,
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
   * 将原始注册输入转换为包含默认值和处理后字段的完整数据
   * @param param 原始注册输入
   * @param param.loginName 登录名
   * @param param.loginEmail 登录邮箱
   * @param param.loginPassword 登录密码
   * @param param.nickname 昵称
   * @returns 准备好的注册数据
   */
  private async prepareRegisterData({
    loginName = null,
    loginEmail,
    nickname,
    type: _, // 移除之前已经处理的 type
    ...restInput
  }: RegisterInput): Promise<PreparedRegisterData> {
    // 生成 nickname 的优先级：input.nickname > input.loginName > input.loginEmail 的 @ 前面部分
    let finalNickname = nickname || loginName;
    if (!finalNickname && loginEmail) {
      finalNickname = loginEmail.split('@')[0];
    }
    // 实际上不可能是 ''，此处为避免 eslint 漏算
    finalNickname = finalNickname || '';

    // 确保 nickname 在表中不重复，
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
      status: AccountStatus.PENDING, // 实际在注册成功时会更新为 ACTIVE
      nickname: finalNickname,
      email: loginEmail,
      accessGroup: ['REGISTRANT'],
      identityHint: 'REGISTRANT',
      metaDigest: ['REGISTRANT'],
    };
  }

  /**
   * 检查账户是否已存在
   * @param input 注册参数
   * @throws ConflictException 账户已存在时抛出异常
   */
  private async checkAccountExists({ loginName = null, loginEmail }: RegisterInput): Promise<void> {
    const accountExists = await this.accountService.checkAccountExists({
      loginName,
      loginEmail,
    });

    if (accountExists) {
      if (loginName && loginEmail) {
        throw new ConflictException('该登录名或邮箱已被注册');
      } else if (loginName) {
        throw new ConflictException('该登录名已被注册');
      } else if (loginEmail) {
        throw new ConflictException('该邮箱已被注册');
      }
    }
  }

  /**
   * 创建未经过核验的 REGISTRANT 账户
   * @param PreparedRegisterData 准备好的注册数据
   * @returns 创建的账户实体
   */
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
    // 准备账户数据
    const accountData = {
      loginName,
      loginEmail,
      loginPassword,
      status,
      identityHint,
    };

    // 准备用户信息数据
    const userInfoData = {
      nickname,
      email,
      accessGroup,
      metaDigest,
    };

    return await this.accountService.createAccount(accountData, userInfoData);
  }
}
