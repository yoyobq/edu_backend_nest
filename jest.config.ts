// jest.config.ts

import type { Config } from 'jest';

/**
 * Jest 配置文件
 * 基于并替换 nest 默认在 package.json 中的配置，适用于 NestJS TypeScript 项目
 */
const config: Config = {
  // 保留原有配置：测试环境
  testEnvironment: 'node',

  // 根目录设置
  rootDir: './',

  // 模块文件扩展名
  moduleFileExtensions: ['js', 'json', 'ts'],

  // 模块路径映射
  moduleNameMapper: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^src/(.*)$': '<rootDir>/src/$1',
  },

  // 测试文件匹配规则
  testRegex: '.*\\.spec\\.ts$',

  // TypeScript 转换
  transform: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^.+\\.(t|j)s$': 'ts-jest',
  },

  // 覆盖率收集
  collectCoverageFrom: [
    '**/*.(t|j)s',
    // 排除不需要测试覆盖率的文件
    '!**/*.spec.ts',
    '!**/*.e2e-spec.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/*.interface.ts',
    '!**/*.dto.ts',
    '!**/*.entity.ts',
    '!**/*.enum.ts',
    '!**/*.types.ts',
    '!**/main.ts',
  ],

  // 覆盖率输出目录
  coverageDirectory: '../coverage',

  // 覆盖率报告格式
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // 覆盖率阈值
  // coverageThreshold: {
  //   global: {
  //     branches: 70,
  //     functions: 70,
  //     lines: 70,
  //     statements: 70,
  //   },
  // },

  // 测试设置文件
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],

  // 清除模拟调用和实例
  clearMocks: true,

  // 每次测试后恢复模拟状态
  restoreMocks: true,

  // 测试超时时间（毫秒）
  testTimeout: 10000,

  // 详细输出
  verbose: true,

  // 错误时显示堆栈跟踪
  errorOnDeprecated: true,

  // 检测打开的句柄
  detectOpenHandles: true,

  // 强制退出
  forceExit: true,

  // 最大工作进程数
  maxWorkers: '50%',

  // 预设配置
  preset: 'ts-jest',

  // 新增：TypeScript 配置
  globals: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },

  // 忽略路径模式
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // 监听忽略模式
  watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],
};

export default config;
