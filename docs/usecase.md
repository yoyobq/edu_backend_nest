<!-- 文件位置: /var/www/backend/docs/usecase.md -->

# Usecase 说明

## 目标与定位

- Usecase 负责写操作编排与业务流程协调。
- 上游由 adapters 调用，下游只依赖 modules(service) 或 core。
- Usecase 内允许短暂使用 Entity，但对外不得暴露 ORM Entity。

## 项目视角的边界与一致性

- Usecase 只关心流程编排、事务边界、错误映射与权限组合，不承担 View / DTO 组织。
- 读侧口径统一交给 QueryService，避免多个 Usecase 各自拼装输出。
- 跨域写或跨模块写必须提升为 Usecase，由 Usecase 统一协调。
- Usecase 对外返回 View / DTO 或结果摘要，不返回 ORM Entity。

## Update 类用例规则

- 事务边界由 Usecase 统一定义与开启。
- 写操作必须放在 Usecase 内，不下沉到 QueryService。
- Usecase 不直接组织 View 或 DTO 的拼装细节。
- 写后读优先走 QueryService，输出统一的 View 或 DTO。
- 若写后读属于同域且读逻辑稳定，可复用 modules(service) 的只读方法，但输出仍以 View / DTO 为准。

## 读写协作方式

- 读逻辑集中在 QueryService，负责权限判断与输出规范化。
- Usecase 只决定何时读、读哪个 QueryService。
- 跨域读取或跨模块读取提升为 Usecase，读实现仍在 QueryService 内。

## 错误与权限

- 业务错误统一使用 domain-error 中的 error_code。
- Usecase 内完成权限组合判断，读侧细粒度权限与输出裁剪由 QueryService 负责。

## 事务与外部系统

- 事务由 Usecase 定义与开启，modules(service) 不跨域开启事务。
- 一旦跨聚合或调用外部系统，Usecase 需采用 outbox 模式。

## 依赖方向

- adapters → usecases
- usecases → modules(service) 或 core
- modules(service) → infrastructure 或 core

## 拆分原则

- 一个 Usecase 只处理一个写语义或一个业务流程。
- 当流程中出现多个独立的写语义时，拆分为多个 Usecase，由上层编排。
- 输出口径由 QueryService 统一，避免各 Usecase 各自定义 View 形态。
