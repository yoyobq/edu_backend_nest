// src/utils/test/logger-mocks.ts
import { TestingModule } from '@nestjs/testing';
import { getLoggerToken, PinoLogger } from 'nestjs-pino';

/**
 * 创建 PinoLogger 的 mock 对象
 * @param context logger 的上下文名称
 * @returns mock provider 配置
 */
export function createLoggerMock(context: string) {
  return {
    provide: getLoggerToken(context),
    useValue: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
    },
  };
}

/**
 * 创建多个 logger mock
 * @param contexts logger 上下文名称数组
 * @returns mock providers 数组
 */
export function createLoggerMocks(contexts: string[]) {
  return contexts.map((context) => createLoggerMock(context));
}

/**
 * 获取 logger mock 实例，用于验证调用
 * @param module 测试模块
 * @param context logger 上下文
 * @returns mock logger 实例
 */
export function getLoggerMock(module: TestingModule, context: string): PinoLogger {
  return module.get<PinoLogger>(getLoggerToken(context));
}
