<!-- docs/api/adapters.rules.md -->

Purpose: Define protocol adaptation guardrails for API adapters.
Read when: You are implementing, reviewing, or refactoring GraphQL/HTTP adapter entry logic.
Do not read when: Your task does not change adapter protocol boundaries.
Source of truth: This file defines adapter boundaries; code examples elsewhere must not override it.

# Adapter 说明

## 定位与职责

- Adapter 作为入口适配层。
  只做输入解析、权限接入与输出封装。
- Adapter 负责协议转换。
  将外部协议输入转换为用例参数。
- 将用例结果转换为 API 输出。

## 允许内容

- GraphQL / HTTP 的 Resolver、Controller、DTO、输入校验与装饰器。
- 入参解析、输出结构映射与错误码透传。
  包括 DomainError 的错误码透传。
- 权限守卫与身份注入。
  包括 Guard、Decorator。
- Schema 初始化与枚举、标量注册，统一通过 schema.init.ts。

## 禁止内容

- 直接依赖 modules(service) 或 infrastructure。
- 在 Adapter 中实现业务规则、事务或跨域编排。
- 返回 ORM Entity 或 QueryBuilder 给上层调用者。
- 在 DTO 或 Resolver 中注册副作用。

## 依赖方向

- 允许 adapters → usecases。
- 禁止 adapters → modules(service) / infrastructure。
- 禁止任意层 → adapters。

## 设计原则

- 输入输出最小化。
  仅做协议适配与参数组装。
- 业务含义统一由 usecases 和 QueryService 表达。

## 结构与命名

- 按 bounded context 划分目录结构，保持与 usecases 一致。
- DTO 与 Resolver 放在同一语义目录内，避免跨域引用。
- 一个 I/O 一个文件。
- 按语义拆分 DTO、Args、List、Input、Result。
- 文件命名以语义与 GraphQL 结构类型为主。
- 避免混杂多种输入输出。

## DTO 语义规范

- DTO：输出对象或领域对外视图。
  例如 UserInfoDTO、AccountResponse。
- Input：写入或筛选输入。
  例如 CreateAccountInput、UpdateAccountInput。
- Args：查询或调用参数。
  例如 AccountArgs、AccountsArgs。
- List：列表与分页响应。
  例如 AccountsListResponse、CustomersListResponse。

## GraphQL Schema 组织

- Schema 初始化只在 schema.init.ts 做一次。
- 重复调用只警告，不重复注册。
- 枚举与标量集中注册。
- 避免分散在 DTO 或 Resolver 文件中。
- GraphQL enums 仅定义，注册统一走 enum.registry.ts。

## 适配层技巧与规范

- Guard 与 Decorator 分离。
  装饰器只定义元数据。
- Guard 读取元数据执行权限校验。
- currentUser 统一从 GraphQL context 注入。
- 避免 resolver 内重复解析。
- 入参标准化用 class-transformer 与 class-validator 统一完成。
- 入参适配为用例需要的参数，适配层不做业务规则判断。
- Adapter 负责最终协议输出形态的映射。
  包括 GraphQL ObjectType / HTTP Response shape。
- 仅做 View / ReadModel 到 DTO 的薄映射或字段直通。
- 认证错误统一走错误映射与错误码。
