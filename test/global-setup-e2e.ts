// test/global-setup-e2e.ts
import 'reflect-metadata';
import 'tsconfig-paths/register';

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import databaseConfig from '../src/core/config/database.config';

/**
 * ⚠️ 注意：Jest 的 globalSetup 运行在独立上下文，
 * 这里设置的 global 变量无法直接被测试文件复用为「同一个对象」。
 * 因此这里不暴露 DataSource，也不预插用户数据。
 * 仅做：环境变量加载 + 一次性的全库清理。
 */

/**
 * 清理测试数据库（保留结构）
 * 在测试开始前清理所有测试相关的数据
 */
const cleanupTestDatabase = async (dataSource: DataSource): Promise<void> => {
  try {
    console.log('🧹 开始清理测试数据库...');

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

/**
 * 加载 E2E 环境变量
 * - 优先 E2E_DOTENV 指定的路径
 * - 其次 .env.e2e / .ev.e2e
 * - 其次 .env.${NODE_ENV} / .ev.${NODE_ENV}
 */
function loadE2EEnv(): void {
  const candidates: string[] = [];

  if (process.env.E2E_DOTENV) {
    // 允许相对项目根路径的写法
    candidates.push(path.resolve(process.cwd(), process.env.E2E_DOTENV));
  }

  const envName = process.env.NODE_ENV || 'e2e';
  candidates.push(
    path.resolve(__dirname, '../env/.env.e2e'),
    path.resolve(__dirname, '../env/.ev.e2e'),
    path.resolve(__dirname, `../env/.env.${envName}`),
    path.resolve(__dirname, `../env/.ev.${envName}`),
  );

  const envFile = candidates.find((p) => fs.existsSync(p));
  if (envFile) {
    dotenv.config({ path: envFile });
    console.log('🌱 已加载 E2E env 文件:', envFile);
  } else {
    console.log('🌱 未找到匹配的 E2E env 文件，使用现有的 process.env');
  }

  // 兜底：确保关键变量存在
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'U5p!rKb6$8+dmXZ3@Fjw7zT#G^Rh4jWt';
    console.log('🔑 JWT_SECRET 未设置，已使用默认测试值');
  } else {
    console.log('🔑 JWT_SECRET 已设置: ✅');
  }
}

export default async (): Promise<void> => {
  try {
    console.log('🔧 开始初始化 E2E 测试环境...');

    // 1) 加载环境变量
    loadE2EEnv();

    // 2) 初始化数据库连接（一次性清库后关闭）
    const dbConfig = databaseConfig() as { mysql: DataSourceOptions };
    const config: DataSourceOptions = {
      ...dbConfig.mysql,
      // 使用 TypeORM 原生的 entities 配置，而不是 NestJS 的 autoLoadEntities
      entities: ['src/**/*.entity{.ts,.js}'],
      // 如需调试 SQL，可开启：
      // logging: ['query', 'error'],
    };

    console.log('📊 数据库配置（关键字段预览）:', {
      type: (config as any).type,
      host: (config as any).host,
      port: (config as any).port,
      database: (config as any).database,
      username: (config as any).username,
    });

    const ds = new DataSource(config);
    await ds.initialize();

    // 3) 连接测试
    await ds.query('SELECT 1');
    console.log('✅ 数据库连接测试成功');

    // 4) 实体元数据加载情况
    const entities = ds.entityMetadatas;
    console.log(
      `✅ 成功加载 ${entities.length} 个实体:`,
      entities.map((e) => e.name),
    );

    // 5) 仅清库，不预插用户
    await cleanupTestDatabase(ds);

    // 6) 用完即关，避免长连接 & 共享对象误用
    await ds.destroy();

    console.log('🚀 E2E 测试环境初始化完成');
  } catch (error) {
    console.error('❌ E2E 测试环境初始化失败:', error);
    throw error;
  }
};
