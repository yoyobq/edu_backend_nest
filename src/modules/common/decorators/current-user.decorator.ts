// src/modules/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtPayload } from '../../../types/jwt.types';

/**
 * 获取当前用户信息的参数装饰器
 * 从 GraphQL 上下文中提取 JWT 用户信息
 */
export const currentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const gqlCtx = GqlExecutionContext.create(context);
    const graphqlContext = gqlCtx.getContext<{ req: { user: JwtPayload } }>();
    return graphqlContext.req.user;
  },
);
