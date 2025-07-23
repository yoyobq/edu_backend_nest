// test/global-setup-e2e.ts

/**
 * E2E 测试全局设置文件
 * 用于配置测试环境和数据库连接
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Cat } from '../src/cats/entities/cat.entity';
import databaseConfig from '../src/config/database.config';
import { StaffEntity } from '../src/modules/account/entities/account-staff.entity';
import { StudentEntity } from '../src/modules/account/entities/account-student.entity';
import { AccountEntity } from '../src/modules/account/entities/account.entity';
import { UserInfoEntity } from '../src/modules/account/entities/user-info.entity';

/**
 * 扩展全局对象类型定义
 */
declare global {
  var testDataSource: DataSource | undefined;
}

/**
 * Jest globalSetup 函数
 * 在所有测试开始前执行一次
 */
export default async (): Promise<void> => {
  try {
    dotenv.config({ path: path.resolve(__dirname, '../env/.env.e2e') });
    // 使用类型断言解决类型问题
    const dbConfig = databaseConfig() as { mysql: DataSourceOptions };
    // console.log(dbConfig.mysql);
    const config: DataSourceOptions = {
      ...dbConfig.mysql,
      // 添加所有实体
      entities: [AccountEntity, StaffEntity, StudentEntity, UserInfoEntity, Cat],
      logging: ['query', 'error'],
    };

    const ds = new DataSource(config);
    await ds.initialize();

    // 检查连接是否正常
    await ds.query('SELECT 1');

    // 检查关键表是否存在或有数据
    const accountCount = await ds.getRepository(AccountEntity).count();
    if (accountCount === 0) {
      throw new Error('❌ 测试数据库中不存在任何账号数据，请检查初始化状态');
    }

    // 将数据源保存到全局变量（类型安全）
    global.testDataSource = ds;

    console.log('🚀 E2E 测试环境初始化完成');
  } catch (error) {
    console.error('❌ E2E 测试环境初始化失败:', error);
    throw error;
  }
};
