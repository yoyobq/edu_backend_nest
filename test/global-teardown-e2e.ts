// test/global-teardown-e2e.ts

/**
 * E2E 测试全局清理文件
 * 用于关闭数据库连接和清理资源
 * 注意：不再清理数据库数据，数据清理已移至 global-setup-e2e.ts
 */

/**
 * Jest globalTeardown 函数
 * 在所有测试结束后执行一次
 */
export default async (): Promise<void> => {
  try {
    // 检查全局数据源是否存在
    if (global.testDataSource) {
      // 检查连接是否仍然活跃
      if (global.testDataSource.isInitialized) {
        console.log('🔌 开始关闭 E2E 测试数据库连接...');

        // 关闭数据库连接
        await global.testDataSource.destroy();

        console.log('✅ 数据库连接已关闭');
      }

      // 清理全局变量（默认不清理）
      global.testDataSource = undefined;

      // console.log('🏁 E2E 测试环境清理完成');
    } else {
      console.log('📝 未发现活跃的测试数据源，跳过清理');
    }

    // 如果仍有进程挂起，强制清理可能的挂起句柄
    process.nextTick(() => {
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ E2E 测试环境清理失败:', error);
    // 即使清理失败也不抛出错误，避免影响测试结果
    // 但会记录错误信息供调试使用
  }
};
