// src/modules/auth/guards/jwt-auth.guard.ts

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import { JwtPayload } from '../../../types/jwt.types';

/**
 * JWT 认证守卫
 * 支持 GraphQL 和 REST API 的 JWT 认证
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor() {
    super();
  }

  /**
   * 获取请求对象（支持 GraphQL 和 REST）
   * @param context 执行上下文
   * @returns 请求对象
   */
  getRequest(context: ExecutionContext): Request {
    if (context.getType() === 'http') {
      // REST 请求
      return context.switchToHttp().getRequest();
    }

    // GraphQL 请求
    const gqlCtx = GqlExecutionContext.create(context);
    const graphqlContext = gqlCtx.getContext<{ req: Request }>();
    return graphqlContext.req;
  }

  /**
   * 处理请求验证结果
   * @param err 认证过程中的错误
   * @param user 认证成功后的用户信息
   * @param info 额外信息
   * @param context 执行上下文
   * @returns 用户信息
   */
  handleRequest<TUser = JwtPayload>(
    err: Error | null,
    user: TUser | false,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    // 如果有错误或用户信息为空，则认证失败
    if (err || !user) {
      // 抛出具体的错误或默认的认证失败错误
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException('JWT 自动验证认证失败');
    }
    return user;
  }
}
