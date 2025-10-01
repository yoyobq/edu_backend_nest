// test/global-teardown-e2e.ts

/**
 * E2E 测试全局清理：
 * - 只负责关闭全局 DataSource（如果存在）
 * - 不做数据清理（清库在各测试用例的 beforeEach 内完成）
 */

import 'reflect-metadata';
import type { DataSource } from 'typeorm';

// 声明合并：为 global 增加 testDataSource（避免 TS7017）
declare global {
  var testDataSource: DataSource | undefined;
}
export {}; // 确保这是一个模块

export default async (): Promise<void> => {
  try {
    const ds = global.testDataSource;

    if (ds?.isInitialized) {
      console.log('🔌 正在关闭 E2E 测试数据库连接...');
      await ds.destroy();
      console.log('✅ 数据库连接已关闭');
    } else {
      console.log('📝 未发现全局 DataSource，跳过全局连接关闭（各用例自行管理 DataSource）');
    }

    // 清理全局引用
    global.testDataSource = undefined;

    // ⚠️ 不要强制 process.exit(0)，否则可能掩盖资源泄漏
  } catch (error) {
    console.error('❌ E2E 测试环境清理失败:', error);
    // 不向外抛，让测试正常结束
  }
};
