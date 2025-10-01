// test/global-setup-e2e.ts
import 'reflect-metadata';
import 'tsconfig-paths/register';

import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import databaseConfig from '../src/core/config/database.config';

/**
 * ⚠️ 注意：Jest 的 globalSetup 运行在独立上下文，
 * 这里设置的 global 变量无法直接被测试文件复用为"同一个对象"。
 * 因此这里不暴露 DataSource，不预插用户数据。
 * 仅做环境加载与一次性的全库清理。
 */

/**
 * 清理测试数据库
 * 在测试开始前清理所有测试相关的数据
 */
const cleanupTestDatabase = async (dataSource: DataSource): Promise<void> => {
  try {
    console.log('🧹 开始清理测试数据库...');

    // 统一清库（保留结构）
    const qr = dataSource.createQueryRunner();
    const tables = await qr.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    );

    if (tables.length > 0) {
      await qr.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const t of tables) {
        const name = t.table_name || t.TABLE_NAME;
        await qr.query(`TRUNCATE TABLE \`${name}\``);
      }
      await qr.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log(`✅ 已清理 ${tables.length} 个表的数据`);
    } else {
      console.log('📝 未发现需要清理的表');
    }

    await qr.release();
  } catch (e) {
    // 清库失败不阻塞后续（打印即可）
    console.error('❌ 清理测试数据库失败:', e);
  }
};

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
      entities: ['src/**/*.entity{.ts,.js}'],
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

    // 仅清库，不预插用户
    await cleanupTestDatabase(ds);

    // 用完即关，避免长连接 & 共享对象误用
    await ds.destroy();

    console.log('🚀 E2E 测试环境初始化完成');
  } catch (error) {
    console.error('❌ E2E 测试环境初始化失败:', error);
    throw error;
  }
};
