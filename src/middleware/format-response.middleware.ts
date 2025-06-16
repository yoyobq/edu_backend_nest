/* eslint-disable no-console */
// src/middleware/format-response.middleware.ts

import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { GraphQLError } from 'graphql';
import { ApiResponse, ShowType } from '../types/response.types';

/**
 * HTTP 响应格式化中间件
 * 根据请求头条件性地格式化响应为 Ant Design Pro 约定格式
 * 拦截 res.json 方法，只对 JSON 响应进行格式化
 */
@Injectable()
export class FormatResponseMiddleware implements NestMiddleware {
  /**
   * 中间件处理函数
   */
  use(req: Request, res: Response, next: NextFunction): void {
    try {
      // 拦截原始的 res.json 方法
      const originalJson = res.json.bind(res);
      res.json = (body: unknown): Response => {
        console.log('📦 JSON 响应被中间件拦截');
        try {
          const formattedBody = this.formatToAntdProResponse(req, body);
          return originalJson(formattedBody);
        } catch (error) {
          console.error('响应格式化过程中发生错误:', error);
          return originalJson(body); // 发生错误时返回原始响应
        }
      };

      next();
    } catch (error) {
      console.error('中间件处理过程中发生错误:', error);
      next();
    }
  }

  /**
   * 格式化响应为 Ant Design Pro 格式
   */
  private formatToAntdProResponse(req: Request, body: unknown): ApiResponse {
    const traceId = this.generateTraceId();
    const host = req.headers.host || 'unknown';

    // 检查是否是错误响应
    if (this.isGraphQLErrorResponse(body)) {
      return this.wrapError(body.errors[0], traceId, host);
    }

    // 格式化成功响应
    return {
      success: true,
      data: body,
      traceId,
      host,
    };
  }

  /**
   * 检查是否是错误响应
   */
  private isGraphQLErrorResponse(body: unknown): body is { errors: GraphQLError[] } {
    return (
      typeof body === 'object' &&
      body !== null &&
      Array.isArray((body as Record<string, unknown>).errors)
    );
  }

  /**
   * 按照 ApiResponse<T> 和 ShowType 生成 error envelope
   */
  private wrapError(error: GraphQLError, traceId: string, host: string): ApiResponse {
    const { errorCode, errorMessage, showType } = this.parseErrorMessage(error.message);
    return {
      success: false,
      data: null,
      errorCode,
      errorMessage,
      showType,
      traceId,
      host,
    };
  }

  /**
   * 解析错误信息
   * 返回类型显式为 ApiResponse 的相关字段
   */
  private parseErrorMessage(message: string): {
    errorCode: string;
    errorMessage: string;
    showType: ShowType;
  } {
    const errorParts = message.split(':');
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = message;
    let showType = ShowType.ERROR_MESSAGE;

    // 错误信息被分隔成3段或以上，比如 "401:未登录:9"
    if (errorParts.length >= 3) {
      errorCode = errorParts[0].trim();
      errorMessage = errorParts[1].trim();
      const showTypeValue = parseInt(errorParts[2].trim(), 10);
      showType = Number.isNaN(showTypeValue) ? ShowType.ERROR_MESSAGE : (showTypeValue as ShowType);
    } else if (errorParts.length === 2) {
      // 错误信息被分隔成2段，比如 "401:未登录"
      errorCode = errorParts[0].trim();
      errorMessage = errorParts[1].trim();
    }

    return { errorCode, errorMessage, showType };
  }

  /**
   * 生成追踪 ID
   */
  private generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
