// src/core/common/filters/graphql-exception.filter.ts
import { ExceptionPayload } from '@app-types/errors/exception-payload';
import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlArgumentsHost } from '@nestjs/graphql';
import { GraphQLError, GraphQLResolveInfo } from 'graphql';

/** 将 HTTP 状态码映射为 GraphQL 标准错误类别代码（extensions.code）
 *  注意：这是 GraphQL/Apollo 通用的大类，不是业务 errorCode（业务码放在 extensions.errorCode）
 */
function mapHttpToGqlCode(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return 'BAD_USER_INPUT';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

/** 从异常响应中提取错误信息 */
function extractPayload(resp: string | ExceptionPayload): {
  code?: string;
  errorCode?: string;
  errorMessage?: string;
  fallbackMsg?: string;
} {
  if (typeof resp === 'string') {
    return { errorMessage: resp };
  }
  const code = typeof resp.code === 'string' ? resp.code : undefined;
  const errorCode = typeof resp.errorCode === 'string' ? resp.errorCode : undefined;
  const explicitMsg = typeof resp.errorMessage === 'string' ? resp.errorMessage : undefined;

  let fallbackMsg: string | undefined;
  const msg = resp.message;
  if (Array.isArray(msg)) fallbackMsg = msg.join(', ');
  else if (typeof msg === 'string') fallbackMsg = msg;

  return { code, errorCode, errorMessage: explicitMsg, fallbackMsg };
}

/** 获取 GraphQL 字段路径 */
function getGqlPath(host: ArgumentsHost): string[] | undefined {
  const gqlHost = GqlArgumentsHost.create(host);
  const info = gqlHost.getInfo<GraphQLResolveInfo>();
  const field = info?.fieldName;
  return field ? [field] : undefined;
}

/** 根据 HttpException 构建 GraphQL 错误对象
 * - extensions.code：GraphQL 错误大类（默认由 HTTP 状态码映射；也可在异常响应体里传 code 覆盖）
 * - extensions.errorCode：业务细分错误码（来自异常响应体）
 * - extensions.errorMessage：业务错误描述（来自异常响应体）
 */
function buildGraphQLErrorFromHttpException(
  exception: HttpException,
  host: ArgumentsHost,
): GraphQLError {
  const status = exception.getStatus();
  const resp = exception.getResponse() as string | ExceptionPayload; // ← 统一用公共类型
  const { code, errorCode, errorMessage, fallbackMsg } = extractPayload(resp);
  const finalMessage =
    errorMessage ??
    fallbackMsg ??
    (typeof exception.message === 'string' ? exception.message : 'Request failed');

  return new GraphQLError(finalMessage, {
    path: getGqlPath(host),
    extensions: {
      code: code ?? mapHttpToGqlCode(status),
      httpStatus: status,
      ...(errorCode ? { errorCode } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    },
  });
}

/** 从未知异常构建 GraphQL 错误 */
function buildGraphQLErrorFromUnknown(exception: unknown, host: ArgumentsHost): GraphQLError {
  const msg =
    typeof (exception as { message?: unknown }).message === 'string'
      ? (exception as { message: string }).message
      : 'Internal server error';

  return new GraphQLError(msg, {
    path: getGqlPath(host),
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
      errorCode: 'INTERNAL_ERROR',
    },
  });
}

/** GraphQL 全局异常过滤器 */
@Catch()
export class GqlAllExceptionsFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    // HTTP 请求仍用默认处理；其余（GraphQL/RPC/WS）走下方分支
    if (host.getType() === 'http') {
      return super.catch(exception, host);
    }
    if (exception instanceof HttpException) {
      return buildGraphQLErrorFromHttpException(exception, host);
    }
    return buildGraphQLErrorFromUnknown(exception, host);
  }
}
