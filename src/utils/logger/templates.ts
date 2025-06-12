// src/utils/logger/templates.ts
import { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';

/**
 * 常见日志格式模板函数
 */
export const logTemplates = {
  /**
   * 输出请求主体相关内容（泛型支持）
   */
  requestBody: <T = unknown>(req: Request): { url: string; method: string; body: T } => ({
    url: req.url,
    method: req.method,
    body: req.body as T,
  }),

  /**
   * 精简请求信息
   */
  minimalRequest: (req: Request): { url: string; method: string } => ({
    url: req.url,
    method: req.method,
  }),

  /**
   * 带查询和参数的请求（泛型支持）
   */
  fullRequest: <T = unknown>(
    req: Request,
  ): {
    url: string;
    method: string;
    query: unknown;
    params: unknown;
    body: T;
  } => ({
    url: req.url,
    method: req.method,
    query: req.query,
    params: req.params,
    body: req.body as T,
  }),
};

/**
 * 输出 debug 日志（带上下文标记）
 */
export function debugLog(
  logger: PinoLogger,
  message: string,
  payload?: unknown,
  context?: string,
): void {
  if (context) logger.setContext(context);
  logger.debug(payload ?? {}, message);
}

/**
 * 输出 error 日志（带上下文标记）
 */
export function errorLog(
  logger: PinoLogger,
  message: string,
  payload?: unknown,
  context?: string,
): void {
  if (context) logger.setContext(context);
  logger.error(payload ?? {}, message);
}

/**
 * 带错误堆栈的 error 日志
 */
export function errorLogWithStack(
  logger: PinoLogger,
  message: string,
  error: Error,
  payload?: Record<string, unknown>,
  context?: string,
): void {
  if (context) logger.setContext(context);
  logger.error(
    {
      ...payload,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    },
    message,
  );
}
