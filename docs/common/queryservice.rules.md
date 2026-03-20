<!-- 文件位置: docs/common/queryservice.rules.md -->

Purpose: Define read-side access, permission, and normalization guardrails for QueryService.
Read when: You are implementing, reviewing, or refactoring modules queries and read-side output shaping.
Do not read when: Your task does not change QueryService boundaries.
Source of truth: This file defines QueryService rules; code examples elsewhere must not override it.

# QueryService 说明

## 目标与定位

- QueryService 用于读侧能力收敛。
  负责读取、权限判定与输出规范化。
- 上游仅由 usecases 调用，禁止 adapters 直接依赖 QueryService。
- QueryService 不产生副作用，不包含写入行为。
- QueryService 归属 modules(service)。
- 下游仅依赖 core。
- 或通过 DI 引入 infrastructure 实现。

## 文件结构

- 通用结构：`src/modules/<bounded-context>/queries/*.query.service.ts`。
- 一个文件聚焦一类读取职责，避免跨语义混杂。

## 命名方式

- 简单读且以 Entity 为语义中心：`<entity>.query.service.ts`。
  - 示例：`verification-record.query.service.ts`
- 单一读取语义且不等于实体名：`<semantic>.query.service.ts`。
  - 示例：`consumable.query.service.ts`
- 带鉴权或权限判定语义。
  以权限含义命名。
  - 示例：`permission.query.service.ts`

## 职责分配

- 规范化输出。
  - QueryService 负责将内部实体或聚合读取结果转换为对外 View 或 DTO。
  - 对上游禁止返回 ORM Entity 或 QueryBuilder。
- 只读与权限判断。
  - 细粒度授权与读侧校验在 QueryService 内完成。
  - 包括可见性与字段裁剪。
  - 写用例的流程级授权由 Usecase 负责。
  - QueryService 不参与写侧决策。
  - 细粒度授权可抽为同域 PermissionPolicy / AccessPolicy。
  - 可实现为纯函数或 service。
  - 供 Usecase 与 QueryService 复用。
  - Usecase 与 QueryService 二者不互调。
  - 跨域读取或跨模块读取必须提升为 usecases。
- 不做事务编排与写入。
  - 写操作与事务编排由 usecases 负责。

## 依赖方向

- adapters → usecases
- usecases → modules(service) 或 core。
- modules(service) → infrastructure 或 core。
- QueryService 归属 modules(service)。
- 上游只允许 usecases 依赖。

## 拆分原则

- 单文件单语义。
- 一类事情一文件。
- 视图映射是 QueryService 基础职责。
- 不把视图映射作为拆分理由。
- 当出现多种读取语义时，考虑拆分。
- 当出现不同权限策略时，考虑拆分。
- 当出现不同输出形态时，考虑拆分。
- 若只是几个轻量方法且语义一致，不必拆分。
