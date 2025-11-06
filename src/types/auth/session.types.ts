// src/types/auth/session.types.ts
import { JwtPayload } from '../jwt.types';

/**
 * Usecase 层统一会话类型
 * 从 GraphQL 层的 `JwtPayload` 中抽取必要字段，避免在各 usecase 重复定义。
 */
export interface UsecaseSession {
  /** 当前账户 ID */
  accountId: number;
  /** 角色访问组（与 JWT `accessGroup` 对齐） */
  roles: string[];
}

/**
 * 从 JWT Payload 映射到 UsecaseSession 的辅助函数
 * 防止不同调用方手动拼装导致字段不一致。
 */
export function mapJwtToUsecaseSession(jwt: JwtPayload): UsecaseSession {
  return {
    accountId: jwt.sub,
    roles: jwt.accessGroup,
  };
}
