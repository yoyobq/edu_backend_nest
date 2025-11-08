// src/usecases/identity-management/coach/perform-upgrade-to-coach.usecase.ts
import { AudienceTypeEnum, IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { ACCOUNT_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import { TokenHelper } from '@src/core/common/token/token.helper';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { EntityManager } from 'typeorm';

/**
 * 升级到教练用例的输入参数
 */
export interface PerformUpgradeToCoachParams {
  /** 账户 ID */
  accountId: number;
  /** 教练姓名 */
  name: string;
  /** 教练等级（1/2/3） */
  level?: number;
  /** 简介/推介 */
  description?: string | null;
  /** 头像 URL */
  avatarUrl?: string | null;
  /** 教练专长 */
  specialty?: string | null;
  /** 备注 */
  remark?: string | null;
  /** 客户端类型 */
  audience: AudienceTypeEnum;
}

/**
 * 升级到教练用例的返回结果
 */
export interface PerformUpgradeToCoachResult {
  /** 操作是否成功（幂等：已是 Coach 则为 false） */
  success: boolean;
  /** 教练 ID */
  coachId: number;
  /** 新的访问令牌 */
  accessToken: string;
  /** 新的刷新令牌 */
  refreshToken: string;
  /** 更新后的访问权限组 */
  updatedAccessGroup: string[];
}

/**
 * 升级为教练身份用例
 *
 * 负责将普通用户升级为教练身份，包括：
 * 1. 幂等检查：若已是教练，清理 accessGroup 中的 REGISTRANT 并返回
 * 2. 创建教练记录（由 CoachService 保证幂等）
 * 3. 更新用户访问权限组（加入 COACH，移除 REGISTRANT），同步 metaDigest
 * 4. 生成新的 JWT 令牌
 */
@Injectable()
export class PerformUpgradeToCoachUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly coachService: CoachService,
    private readonly tokenHelper: TokenHelper,
  ) {}

  /**
   * 执行升级到教练的操作
   * @param params 升级参数
   * @returns 升级结果
   */
  async execute(params: PerformUpgradeToCoachParams): Promise<PerformUpgradeToCoachResult> {
    const { accountId, name, level, description, avatarUrl, specialty, remark, audience } = params;
    return await this.accountService.runTransaction((manager: EntityManager) =>
      this.executeInTransaction({
        accountId,
        name,
        level,
        description,
        avatarUrl,
        specialty,
        remark,
        audience,
        manager,
      }),
    );
  }

  /**
   * 在同一事务中执行升级逻辑
   */
  private async executeInTransaction({
    accountId,
    name,
    level,
    description,
    avatarUrl,
    specialty,
    remark,
    audience,
    manager,
  }: PerformUpgradeToCoachParams & {
    manager: EntityManager;
  }): Promise<PerformUpgradeToCoachResult> {
    // 0. 显式锁定账户避免并发覆盖 accessGroup
    await this.accountService.lockByIdForUpdate(accountId, manager);

    // 1. 检查账户是否存在
    const account = await this.accountService.findOneById(accountId, manager);
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    // 2. 幂等分支：若已是教练则清理并返回
    const idempotent = await this.handleIdempotentBranch(accountId, manager);
    if (idempotent) return idempotent;

    // 3. 创建教练记录（CoachService 幂等）
    const { coach } = await this.coachService.createCoach(
      {
        accountId,
        name,
        level,
        description,
        avatarUrl,
        specialty,
        remark,
        createdBy: accountId,
      },
      manager,
    );

    // 4. 更新用户信息（移除 REGISTRANT 并确保包含 COACH）
    const updatedAccessGroup = await this.updateUserInfoAccessGroup(accountId, manager);

    // 同步更新账户的身份提示为 COACH
    await this.accountService.updateAccount(
      accountId,
      { identityHint: IdentityTypeEnum.COACH },
      manager,
    );

    // 5. 生成新的 JWT 令牌
    const userInfo = await this.accountService.findUserInfoByAccountId(accountId, manager);
    const tokens = this.generateTokens(
      accountId,
      userInfo ? userInfo.nickname : account.loginEmail || 'coach',
      account.loginEmail,
      updatedAccessGroup,
      audience,
    );

    return {
      success: true,
      coachId: coach.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      updatedAccessGroup: updatedAccessGroup.map((x) => x.toString()),
    };
  }

  /**
   * 幂等分支：已是教练则清理 REGISTRANT 并返回
   */
  private async handleIdempotentBranch(
    accountId: number,
    manager: EntityManager,
  ): Promise<PerformUpgradeToCoachResult | null> {
    const existingCoach = await this.coachService.findByAccountId(accountId, manager);
    if (!existingCoach) return null;

    const userInfo = await this.accountService.findUserInfoByAccountId(accountId, manager);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    const cleanedAccessGroup = userInfo.accessGroup.filter(
      (item) => item !== IdentityTypeEnum.REGISTRANT,
    );
    if (!cleanedAccessGroup.includes(IdentityTypeEnum.COACH))
      cleanedAccessGroup.push(IdentityTypeEnum.COACH);

    const needCleanup =
      cleanedAccessGroup.length !== userInfo.accessGroup.length ||
      userInfo.accessGroup.some((item) => item === IdentityTypeEnum.REGISTRANT);
    if (needCleanup) {
      userInfo.accessGroup = cleanedAccessGroup;
      userInfo.metaDigest = cleanedAccessGroup;
      await manager.getRepository(UserInfoEntity).save(userInfo);
    }

    return {
      success: false,
      coachId: existingCoach.id,
      accessToken: '',
      refreshToken: '',
      updatedAccessGroup: (needCleanup ? cleanedAccessGroup : userInfo.accessGroup).map((x) =>
        x.toString(),
      ),
    };
  }

  /**
   * 更新 UserInfo 的 accessGroup，加入 COACH 并移除 REGISTRANT
   */
  private async updateUserInfoAccessGroup(
    accountId: number,
    manager: EntityManager,
  ): Promise<IdentityTypeEnum[]> {
    const userInfo = await this.accountService.findUserInfoByAccountId(accountId, manager);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    const updatedAccessGroup = userInfo.accessGroup.filter(
      (item) => item !== IdentityTypeEnum.REGISTRANT,
    );
    if (!updatedAccessGroup.includes(IdentityTypeEnum.COACH))
      updatedAccessGroup.push(IdentityTypeEnum.COACH);

    userInfo.accessGroup = updatedAccessGroup;
    userInfo.metaDigest = updatedAccessGroup;
    await manager.getRepository(UserInfoEntity).save(userInfo);

    return updatedAccessGroup;
  }

  /**
   * 生成新的访问令牌和刷新令牌
   */
  private generateTokens(
    accountId: number,
    nickname: string,
    loginEmail: string | null,
    accessGroup: IdentityTypeEnum[],
    audience: AudienceTypeEnum,
  ): { accessToken: string; refreshToken: string } {
    // 组装标准化的 JWT Payload（与 customer 升级保持一致）
    const jwtPayload = this.tokenHelper.createPayloadFromUser({
      id: accountId,
      nickname,
      loginEmail,
      accessGroup: accessGroup.map((x) => x.toString()),
    });

    const accessToken = this.tokenHelper.generateAccessToken({ payload: jwtPayload, audience });
    const refreshToken = this.tokenHelper.generateRefreshToken({ payload: jwtPayload, audience });

    return { accessToken, refreshToken };
  }
}
