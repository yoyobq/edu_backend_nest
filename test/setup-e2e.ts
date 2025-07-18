// test/setup-e2e.ts

/**
 * E2E 测试全局设置文件
 * 用于配置测试环境和数据库连接
 */

import { DataSource } from 'typeorm';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USERNAME = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_DATABASE = 'nest_test_e2e';
process.env.JWT_SECRET = 'test-jwt-secret-e2e';

// 全局测试数据源
let testDataSource: DataSource | undefined;

/**
 * 获取测试数据源
 */
export const getTestDataSource = (): DataSource | undefined => testDataSource;

/**
 * 设置测试数据源
 */
export const setTestDataSource = (dataSource: DataSource): void => {
  testDataSource = dataSource;
};

/**
 * 初始化测试数据库
 */
beforeAll(() => {
  // 这里可以添加测试数据库的初始化逻辑
  // eslint-disable-next-line no-console
  console.log('🚀 E2E 测试环境初始化完成');
}, 60000);

/**
 * 清理测试数据库
 */
afterAll(() => {
  if (testDataSource && testDataSource.isInitialized) {
    void testDataSource.destroy();
  }
  // eslint-disable-next-line no-console
  console.log('🧹 E2E 测试环境清理完成');
}, 30000);

// 导出空对象以使此文件成为模块
export {};
