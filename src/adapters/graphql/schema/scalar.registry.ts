// src/adapters/graphql/schema/scalar.registry.ts

/**
 * 注册所有 GraphQL 自定义标量类型
 * @returns 注册结果，包含已注册的标量名称列表
 */
export function registerScalars(): { scalars: string[] } {
  const registeredScalars: string[] = [];

  // 目前项目中没有自定义标量类型
  // 如果将来需要添加自定义标量（如 Date、JSON 等），可以在这里注册
  // 示例：
  // registerScalarType(GraphQLJSON, 'JSON');
  // registeredScalars.push('JSON');

  return { scalars: registeredScalars };
}
