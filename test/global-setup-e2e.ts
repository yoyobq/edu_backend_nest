// test/global-setup-e2e.ts
import 'reflect-metadata';
import 'tsconfig-paths/register';

// 将路径别名改为相对路径
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import databaseConfig from '../src/core/config/database.config';

/**
 * 全局类型定义
 * 为 E2E 测试环境扩展 global 对象类型
 */
declare global {
  /**
   * 全局测试数据源
   * 在 global-setup-e2e.ts 中初始化，在测试文件中使用
   */
  var testDataSource: DataSource | undefined;
}

export default async (): Promise<void> => {
  try {
    console.log('🔧 开始初始化 E2E 测试环境...');

    // 加载 E2E 测试环境变量
    dotenv.config({ path: path.resolve(__dirname, '../env/.env.e2e') });

    // 确保关键环境变量已设置
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'U5p!rKb6$8+dmXZ3@Fjw7zT#G^Rh4jWt';
    }

    console.log('🔑 JWT_SECRET 已设置:', process.env.JWT_SECRET ? '✅' : '❌');

    const dbConfig = databaseConfig() as { mysql: DataSourceOptions };

    const config: DataSourceOptions = {
      ...dbConfig.mysql,
      // 使用 TypeORM 原生的 entities 配置，而不是 NestJS 的 autoLoadEntities
      entities: ['src/**/*.entity{.ts,.js}'],
      // logging: ['query', 'error'],
    };

    console.log('📊 数据库配置:', config);

    const ds = new DataSource(config);
    await ds.initialize();

    // 检查连接是否正常
    await ds.query('SELECT 1');
    console.log('✅ 数据库连接测试成功');

    // 验证实体元数据是否正确加载
    const entities = ds.entityMetadatas;
    console.log(
      `✅ 成功加载 ${entities.length} 个实体:`,
      entities.map((e) => e.name),
    );

    global.testDataSource = ds;

    console.log('🚀 E2E 测试环境初始化完成');
  } catch (error) {
    console.error('❌ E2E 测试环境初始化失败:', error);
    throw error;
  }
};
