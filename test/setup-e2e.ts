// test/setup-e2e.ts

/**
 * E2E 测试全局设置文件
 * 用于配置测试环境和数据库连接
 */

// import * as dotenv from 'dotenv';
import databaseConfig from 'src/config/database.config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Cat } from '../src/cats/entities/cat.entity';
import { StaffEntity } from '../src/modules/account/entities/account-staff.entity';
import { StudentEntity } from '../src/modules/account/entities/account-student.entity';
import { AccountEntity } from '../src/modules/account/entities/account.entity';
import { UserInfoEntity } from '../src/modules/account/entities/user-info.entity';
// dotenv.config({ path: 'env/.env.e2e' });

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
beforeAll(async () => {
  // 使用类型断言解决类型问题
  const dbConfig = databaseConfig() as { mysql: DataSourceOptions };
  const config: DataSourceOptions = {
    ...dbConfig.mysql,
    // 添加所有实体
    entities: [AccountEntity, StaffEntity, StudentEntity, UserInfoEntity, Cat],
    logging: ['query', 'error'],
  };

  const ds = new DataSource(config);

  await ds.initialize();
  setTestDataSource(ds); // 注入全局变量

  // 检查连接是否正常
  await ds.query('SELECT 1');

  // 检查关键表是否存在或有数据
  const accountCount = await ds.getRepository(AccountEntity).count();
  if (accountCount === 0) {
    throw new Error('❌ 测试数据库中不存在任何账号数据，请检查初始化状态');
  }
  // eslint-disable-next-line no-console
  console.log('🚀 E2E 测试环境初始化完成');
}, 60000);

/**
 * 清理测试数据库
 */
afterAll(async () => {
  if (testDataSource) {
    await testDataSource.destroy();
  }
  // eslint-disable-next-line no-console
  console.log('🧹 E2E 测试环境清理完成');
}, 30000);

// 导出空对象以使此文件成为模块
export {};
