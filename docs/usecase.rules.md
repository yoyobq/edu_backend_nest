# Usecase 说明

## 目标与定位

- Usecase 负责写操作编排与业务流程协调。
- 上游由 adapters 调用，下游只依赖 modules(service) 或 core。
- 写语义（C/U/D 的编排、校验、权限与错误映射）一律在 Usecase 内完成，modules(service) 仅提供细粒度写操作供 Usecase 编排。
- Usecase 内允许短暂使用 Entity，但对外不得暴露 ORM Entity。

## 边界与依赖

- adapters → usecases
- usecases → modules(service) / core
- usecases → usecases（仅限编排型依赖）
- modules(service) → infrastructure / core
- 禁止 usecases 直接依赖 infrastructure
- 禁止 adapters 依赖 modules(service) 或 infrastructure
- ORM Entity 仅在 modules(service) 内部使用，上游不得直接暴露
- 适配层不得返回 ORM Entity 或 QueryBuilder
- Usecase 模块必须显式 imports 其依赖的 modules(service) 或 usecases 模块
- 禁止依赖 AppModule 的隐式可见性或适配层转发

## Usecase 依赖细则

- 仅允许依赖同域的编排型 Usecase，不允许跨域依赖
- 仅允许依赖 1 层，不允许链式多跳依赖
- 若确需 A → B → C，则必须新增一个上层 Usecase 统一编排，由它直接调用 B 与 C（或底层 service），禁止由 B 再调用 C
- 不允许为获取某个 Service 而绕道依赖 Usecase
- 禁止形成循环依赖

## 职责与输出

- Usecase 只关心流程编排、事务边界、错误映射与权限组合，不承担 View / DTO 组织。
- 读侧口径统一交给 QueryService，避免多个 Usecase 各自拼装输出。
- Usecase 对外返回 View / DTO 或结果摘要，不返回 ORM Entity。
- QueryService 上游只允许 Usecase 调用。

## 读写协作方式

- 纯读放在 modules(service) 的读服务，便于复用。
- modules(service) 可提供基础写方法，但不得包含完整写语义或流程编排。
- 跨域读取或跨模块读取提升为 Usecase，读实现仍在 QueryService 内。
- 写后读优先走 QueryService，输出统一的 View / DTO。
- 若写后读属于同域且读逻辑稳定，可复用 modules(service) 的只读方法，但输出仍以 View / DTO 为准。

## 错误与权限

- 业务错误统一使用 domain-error 中的 error_code。
- Usecase 内完成权限组合判断，读侧细粒度权限与输出裁剪由 QueryService 负责。

## 事务与外部系统

- 事务由 Usecase 定义与开启，modules(service) 不跨域开启事务。
- 一旦跨聚合或调用外部系统，Usecase 需采用 outbox 模式。

## 拆分原则

- 一个 Usecase 只处理一个写语义或一个业务流程。
- 当流程中出现多个独立的写语义时，拆分为多个 Usecase，由上层编排。
- 输出口径由 QueryService 统一，避免各 Usecase 各自定义 View 形态。
