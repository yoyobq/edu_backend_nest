/* eslint-disable @typescript-eslint/require-await */
// src/plugins/format-response.plugin.ts

import {
  ApolloServerPlugin,
  GraphQLRequestContextWillSendResponse,
  GraphQLRequestListener,
} from '@apollo/server';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ApiResponse, ShowType } from '../types/response.types';

/**
 * GraphQL 响应格式化插件
 * 根据请求头条件性地格式化响应为 Ant Design Pro 约定格式
 */
export class FormatResponsePlugin implements ApolloServerPlugin {
  constructor(
    @InjectPinoLogger('FormatResponsePlugin')
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext('GqlResPlugin');
  }

  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    return {
      willSendResponse: async (requestContext: GraphQLRequestContextWillSendResponse<any>) => {
        try {
          const clientType = this.getClientType(requestContext);

          if (clientType === 'sandbox') {
            this.logger.info(
              `来自 sandbox: ${requestContext.request.http?.headers?.get('X-Client-Type')}`,
            );
            return; // sandbox 客户端，保持原生 GraphQL 格式
          }

          this.formatToAntdProResponse(requestContext);
        } catch (error) {
          this.logger.error('响应格式化过程中发生错误:', error);
        }
      },
    };
  }

  private getClientType(requestContext: GraphQLRequestContextWillSendResponse<any>): string | null {
    return (
      requestContext.request.http?.headers?.get('x-client-type') ||
      requestContext.request.http?.headers?.get('X-Client-Type') ||
      null
    );
  }

  private formatToAntdProResponse(
    requestContext: GraphQLRequestContextWillSendResponse<any>,
  ): void {
    // this.logger.info('开始封装自定义 response');
    const traceId = this.generateTraceId();
    const host = requestContext.request.http?.headers?.get('host') || 'unknown';

    if (requestContext.response.body?.kind === 'single') {
      if (this.hasErrors(requestContext)) {
        this.formatErrorResponse(requestContext, traceId, host);
      } else {
        this.formatSuccessResponse(requestContext, traceId, host);
      }
    } else {
      this.logger.info('检测到非单一响应类型，跳过 Ant Design Pro 格式封装');
    }
  }

  private hasErrors(requestContext: GraphQLRequestContextWillSendResponse<any>): boolean {
    return !!(
      requestContext.response.body?.kind === 'single' &&
      requestContext.response.body.singleResult.errors &&
      requestContext.response.body.singleResult.errors.length > 0
    );
  }

  /**
   * 按照 ApiResponse<T> 和 ShowType 生成 error envelope
   */
  private formatErrorResponse(
    requestContext: GraphQLRequestContextWillSendResponse<any>,
    traceId: string,
    host: string,
  ): void {
    if (requestContext.response.body?.kind !== 'single') return;

    const firstError = requestContext.response.body.singleResult.errors![0];
    const { errorCode, errorMessage, showType } = this.parseErrorMessage(firstError.message);

    const errorResponse: ApiResponse = {
      success: false,
      data: null,
      errorCode,
      errorMessage,
      showType,
      traceId,
      host,
    };

    requestContext.response.body = {
      kind: 'single',
      singleResult: {
        data: errorResponse as unknown as Record<string, unknown>, // 类型兜底
        errors: undefined, // 清除原始 errors
      },
    };

    this.logger.info(`已封装错误响应为 Ant Design Pro 格式，错误码: ${errorCode}`);
  }

  /**
   * 按照 ApiResponse<T> 生成 success envelope
   */
  private formatSuccessResponse(
    requestContext: GraphQLRequestContextWillSendResponse<any>,
    traceId: string,
    host: string,
  ): void {
    if (requestContext.response.body?.kind !== 'single') return;

    const originalData = requestContext.response.body.singleResult.data;

    const successResponse: ApiResponse = {
      success: true,
      data: originalData,
      traceId,
      host,
    };

    requestContext.response.body = {
      kind: 'single',
      singleResult: {
        data: successResponse as unknown as Record<string, unknown>,
      },
    };

    // this.logger.info('已封装成功响应为 Ant Design Pro 格式');
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

  private generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
