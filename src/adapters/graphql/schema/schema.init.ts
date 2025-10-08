// src/adapters/graphql/schema/schema.init.ts

import { createHash } from 'crypto';
import { registerEnums } from './enum.registry';
import { registerScalars } from './scalar.registry';

/**
 * 模块内静态标记，确保只初始化一次
 */
let inited = false;

/**
 * 生成 Schema 指纹
 * 基于枚举值生成轻量级哈希，用于 Schema 同步检查
 * @param enums 已注册的枚举名称列表
 * @param scalars 已注册的标量名称列表
 * @returns Schema 指纹字符串
 */
function generateSchemaFingerprint(enums: string[], scalars: string[]): string {
  // 将所有注册的类型名称排序后拼接
  const allTypes = [...enums, ...scalars].sort();
  const typeString = allTypes.join('|');

  // 生成简单的 MD5 哈希作为指纹
  return createHash('md5').update(typeString).digest('hex').substring(0, 8);
}

/**
 * 初始化 GraphQL Schema
 * 单点注册所有枚举和标量类型，具有一次性守卫和指纹生成功能
 * @returns 初始化结果，包含注册统计和指纹信息
 */
export function initGraphQLSchema(): {
  success: boolean;
  enums: string[];
  scalars: string[];
  fingerprint: string;
  message: string;
} {
  // 重复调用统一处理：开发环境和生产环境都只警告并返回
  // 避免热更新、Jest/E2E 测试、并发场景误伤
  if (inited) {
    console.warn('⚠️ GraphQL Schema 重复初始化调用，已忽略');
    return {
      success: false,
      enums: [],
      scalars: [],
      fingerprint: '',
      message: 'Schema 已初始化，重复调用已忽略',
    };
  }

  try {
    // 注册枚举类型
    const enumResult = registerEnums();
    console.log(`✅ 成功注册 ${enumResult.enums.length} 个 GraphQL 枚举类型`);

    // 注册标量类型
    const scalarResult = registerScalars();
    if (scalarResult.scalars.length > 0) {
      console.log(`✅ 成功注册 ${scalarResult.scalars.length} 个 GraphQL 标量类型`);
    }

    // 生成 Schema 指纹
    const fingerprint = generateSchemaFingerprint(enumResult.enums, scalarResult.scalars);

    // 打印注册摘要
    const totalTypes = enumResult.enums.length + scalarResult.scalars.length;
    console.log(`📊 GraphQL Schema 注册完成：`);
    console.log(`   - 枚举类型: ${enumResult.enums.length} 个`);
    console.log(`   - 标量类型: ${scalarResult.scalars.length} 个`);
    console.log(`   - 总计: ${totalTypes} 个类型`);
    console.log(`🔍 GraphQL Schema fingerprint=${fingerprint}`);

    // 打印枚举清单（裁剪显示）
    if (enumResult.enums.length > 0) {
      const enumList =
        enumResult.enums.length > 5
          ? `${enumResult.enums.slice(0, 5).join(', ')}... (+${enumResult.enums.length - 5} more)`
          : enumResult.enums.join(', ');
      console.log(`📋 已注册枚举: ${enumList}`);
    }

    // 标记为已初始化
    inited = true;

    return {
      success: true,
      enums: enumResult.enums,
      scalars: scalarResult.scalars,
      fingerprint,
      message: `成功注册 ${totalTypes} 个 GraphQL 类型`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    // eslint-disable-next-line no-console
    console.error('❌ GraphQL Schema 初始化失败:', errorMessage);

    throw new Error(`GraphQL Schema 初始化失败: ${errorMessage}`);
  }
}

/**
 * 重置初始化状态（仅用于测试）
 * @internal
 */
export function resetInitState(): void {
  if (process.env.NODE_ENV === 'test') {
    inited = false;
  } else {
    throw new Error('resetInitState 只能在测试环境中使用');
  }
}
