// src/adapters/graphql/guards/roles.guard.ts

import { JwtPayload } from '@app-types/jwt.types';
import { DomainError, JWT_ERROR, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';

/**
 * GraphQL 上下文类型定义
 */
interface GraphQLContext {
  req: Request & { user?: JwtPayload };
}

// 注意：角色装饰器统一定义在 src/adapters/graphql/decorators/roles.decorator.ts
// 该守卫不再重复定义 Roles 装饰器，避免混淆与重复实现。

/**
 * 角色权限守卫
 * 验证用户是否具有指定角色权限
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = this.getRequest(context);
    const user = request.user as JwtPayload;

    // 首先检查用户是否登录，无论是否有角色要求
    if (!user) {
      // 用户未登录 - 401 语义
      throw new DomainError(JWT_ERROR.AUTHENTICATION_FAILED, '用户未登录', {
        requiredRoles: requiredRoles || [],
      });
    }

    // 如果没有角色要求，允许已登录用户通过
    if (!requiredRoles) {
      return true;
    }

    // 如果角色要求为空数组，需要检查用户权限信息
    if (requiredRoles.length === 0) {
      // 检查 accessGroup 数据格式
      if (!Array.isArray(user.accessGroup)) {
        throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '用户权限数据格式异常', {
          requiredRoles,
          accessGroupType: typeof user.accessGroup,
          accessGroupValue: user.accessGroup,
        });
      }

      const userAccessGroup = user.accessGroup;

      if (userAccessGroup.length === 0) {
        // 用户已登录但缺少角色信息 - 403 语义
        throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '用户权限信息缺失', {
          requiredRoles,
        });
      }

      // 有角色信息的用户可以访问空角色要求的端点
      return true;
    }

    // 检查 accessGroup 数据格式，如果不是数组直接抛错
    if (!Array.isArray(user.accessGroup)) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '用户权限数据格式异常', {
        requiredRoles,
        accessGroupType: typeof user.accessGroup,
        accessGroupValue: user.accessGroup,
      });
    }

    const userAccessGroup = user.accessGroup;

    if (userAccessGroup.length === 0) {
      // 用户已登录但缺少角色信息 - 403 语义
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '用户权限信息缺失', {
        requiredRoles,
      });
    }

    // 统一转换为小写进行比较
    const normalizedRequiredRoles = requiredRoles.map((role) => role.toLowerCase());
    const normalizedUserRoles = userAccessGroup.map((role) =>
      typeof role === 'string' ? role.toLowerCase() : String(role).toLowerCase(),
    );

    const hasRole = normalizedRequiredRoles.some((role) => normalizedUserRoles.includes(role));

    if (!hasRole) {
      // 用户已登录但角色不匹配 - 403 语义
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色', {
        requiredRoles,
        userRoles: userAccessGroup, // 保持原始数据用于调试
      });
    }

    return true;
  }

  /**
   * 获取请求对象（支持 GraphQL 和 REST）
   */
  private getRequest(context: ExecutionContext): Request & { user?: JwtPayload } {
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    }

    if (context.getType<GqlContextType>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const gqlContext = gqlCtx.getContext<GraphQLContext>();
      return gqlContext.req;
    }

    // 容错处理：如果既不是 http 也不是 graphql，抛出错误
    throw new DomainError(JWT_ERROR.AUTHENTICATION_FAILED, '不支持的上下文类型', {
      contextType: context.getType(),
    });
  }
}
