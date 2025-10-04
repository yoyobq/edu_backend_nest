// src/usecases/verification/types/consume.types.ts

import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { AudienceTypeEnum } from '@app-types/models/account.types';
import { VerificationRecordEntity } from '@src/modules/verification-record/verification-record.entity';
import { VerificationRecordView } from '@src/modules/verification-record/services/verification-read.service';
import { EntityManager } from 'typeorm';

/**
 * 验证流程输入参数
 */
export interface ConsumeVerificationFlowParams {
  /** 验证 token */
  token: string;
  /** 消费者账号 ID（可选，某些类型允许匿名消费） */
  consumedByAccountId?: number;
  /** 期望的验证记录类型（可选但强烈建议提供） */
  expectedType?: VerificationRecordType;
  /** 客户端类型（可选，用于上下文匹配） */
  audience?: AudienceTypeEnum | null;
  /** 邮箱地址（可选，用于上下文匹配） */
  email?: string;
  /** 手机号码（可选，用于上下文匹配） */
  phone?: string;
  /** 可选的事务管理器 */
  manager?: EntityManager;
}

/**
 * 验证流程上下文
 */
export interface VerificationFlowContext {
  /** 验证记录视图 */
  recordView: VerificationRecordView;
  /** 消费者账号 ID */
  consumedByAccountId?: number;
  /** 事务管理器 */
  manager: EntityManager;
}

// TODO: 临时注释其他验证类型，专注于密码重置功能
// /**
//  * 邮箱验证结果
//  */
// export interface EmailVerificationResult {
//   /** 验证记录 */
//   record: VerificationRecordEntity;
//   /** 验证的邮箱地址 */
//   email: string;
//   /** 关联的账号 ID（如果有） */
//   accountId?: number;
// }

/**
 * 密码重置结果
 */
export interface PasswordResetResult {
  /** 验证记录 */
  record: VerificationRecordEntity;
  /** 重置密码的账号 ID */
  accountId: number;
  /** 新密码哈希 */
  newPasswordHash: string;
}

// TODO: 临时注释其他验证类型，专注于密码重置功能
// /**
//  * 魔法链接登录结果
//  */
// export interface MagicLinkLoginResult {
//   /** 验证记录 */
//   record: VerificationRecordEntity;
//   /** 登录的账号 ID */
//   accountId: number;
//   /** JWT token */
//   accessToken: string;
//   /** 刷新 token */
//   refreshToken?: string;
// }

// /**
//  * 邀请接受结果
//  */
// export interface InviteAcceptResult {
//   /** 验证记录 */
//   record: VerificationRecordEntity;
//   /** 接受邀请的账号 ID */
//   accountId: number;
//   /** 邀请类型 */
//   inviteType: 'coach' | 'manager' | 'learner';
//   /** 关联的组织或课程 ID */
//   relatedId: number;
// }

// /**
//  * 短信验证结果
//  */
// export interface SmsVerificationResult {
//   /** 验证记录 */
//   record: VerificationRecordEntity;
//   /** 验证的手机号 */
//   phone: string;
//   /** 关联的账号 ID（如果有） */
//   accountId?: number;
// }

// /**
//  * 第三方绑定结果
//  */
// export interface ThirdPartyBindResult {
//   /** 验证记录 */
//   record: VerificationRecordEntity;
//   /** 绑定的账号 ID */
//   accountId: number;
//   /** 第三方平台类型 */
//   platform: 'weapp' | 'wechat' | 'alipay';
//   /** 第三方用户 ID */
//   thirdPartyUserId: string;
// }

/**
 * 验证流程结果联合类型
 * TODO: 临时只保留密码重置结果，专注于密码重置功能
 */
export type VerificationFlowResult = PasswordResetResult;
// export type VerificationFlowResult =
//   | EmailVerificationResult
//   | PasswordResetResult
//   | MagicLinkLoginResult
//   | InviteAcceptResult
//   | SmsVerificationResult
//   | ThirdPartyBindResult;

/**
 * 验证流程处理器接口
 */
export interface VerificationFlowHandler<
  T extends VerificationFlowResult = VerificationFlowResult,
> {
  /**
   * 支持的验证记录类型
   */
  readonly supportedTypes: VerificationRecordType[];

  /**
   * 处理验证流程
   * @param context 验证流程上下文
   * @returns 处理结果
   */
  handle(context: VerificationFlowContext): Promise<T>;
}
