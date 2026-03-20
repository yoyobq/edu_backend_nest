<!-- docs/common/modules.rules.md -->

Purpose: Define service reuse, dependency, and exposure guardrails for modules(service).
Read when: You are implementing, reviewing, or refactoring modules(service) or QueryService placement.
Do not read when: Your task does not change modules(service) responsibility boundaries.
Source of truth: This file defines modules(service) boundaries; code examples elsewhere must not override it.

# Modules(service) 说明

## 定位与职责

- Modules(service) 承载同域内可复用的读写服务。
  通过 DI 承接 infrastructure 实现。
- Modules(service) 聚焦单一 bounded context 的能力复用，不做跨域编排。
- Modules(service) 对上游提供 DTO 或只读模型，不直接暴露 ORM Entity。

## 允许内容

- 同域读服务与细粒度写服务。
- ORM Entity 与 Repository 的内部使用与封装。
- QueryService 归属 modules(service)。
  只读与规范化输出在此完成。
- 与 core 端口交互的适配逻辑。
- 通用能力模块化。
  通过 DI token 绑定 infrastructure 实现。
- 对外只导出 service 与 DI token。
- 领域专用排序解析器。
  只负责排序白名单与列解析。
- 不引入业务规则。

## 禁止内容

- 跨域读写编排与事务边界控制。
- 直接被 adapters 依赖。
- 在 service 内部开启跨域事务。
- 对上游返回 ORM Entity 或 QueryBuilder。

## 依赖方向

- 允许 modules(service) → infrastructure | core。
- 禁止 modules(service) → adapters。
- 上游依赖方向为 usecases → modules(service) | core。

## 设计原则

- 读写分离。
  纯读放在 QueryService。
- 写操作由 usecases 统一编排。
- 细粒度服务。
  单方法单语义，便于用例复用与事务编排。
- 输出规范化。
  对外输出去敏感字段的视图与只读 DTO / View。

## 结构与命名

- 按 bounded context 划分模块目录。
- 模块内部再区分 service、queries、entities。
- 读服务命名以 query.service.ts 结尾。
- 写服务命名以 service.ts 结尾。
- QueryService 放在 src/modules/<bounded-context>/queries/ 目录。
- 涉及多进程运行时按进程职责拆分模块。
- API 入队能力与 worker 消费能力必须拆分为独立模块。
