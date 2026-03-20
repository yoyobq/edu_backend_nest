<!-- file: docs/common/usecase-write-flow-boundaries.rules.md -->

Purpose: Define write-flow decomposition and transaction-root guardrails for usecases.
Read when: You are designing, reviewing, or refactoring multi-entity write orchestration in usecases.
Do not read when: Your task does not change write-flow boundaries or transaction ownership.
Source of truth: This file defines usecase write-flow boundaries; code examples elsewhere must not override it.

# 多实体写流程与事务根规则

## 1. 同域多实体写流程

以下条件同时满足时，允许由一个 Usecase 统一编排。

- 它们属于同一业务目标。
- 需要在同一事务内完成。
- 下游只调用细粒度 service 方法。
- 该 Usecase 仍然表达单一业务流程。
- 不得把多个独立流程临时拼接到一个 Usecase。

## 2. 多个独立写语义

如果流程中包含多个独立写语义，应拆分为多个 Usecase。
再由上层 Flow Usecase 统一编排。

常见判断信号：

- 任一步骤可单独复用。
- 任一步骤本身已可独立命名。
- 任一步骤未来可能被不同入口复用。
- 任一步骤失败后需要单独补偿、重试或审计。

## 3. 跨 bounded context 读取

跨域读取不能直接在 adapters 或 modules(service) 中完成。
必须提升到上层 Usecase。
并通过被读域的 QueryService 获取只读结果。

## 4. 跨 bounded context 写入

跨域写入不得下沉到 modules(service)。
必须由上层 Usecase 显式编排。

若涉及多个事务边界或外部系统，必须明确：

- 是否要求强一致。
- 是否接受最终一致。
- 是否需要补偿。
- 是否需要失败记录或后续重试入口。

## 5. Transaction Root Service

Transaction Root Service 是写流程中负责开启事务边界的 service。
它负责向下游参与方传递同一个事务管理器。
下游参与方包括 services 与 repositories。

只有 Transaction Root Service 可以为该写流程开启新事务。
除非规则显式允许，下游 service 不得静默开启新的独立事务。

## 6. QueryService 的角色

QueryService 只负责：

- 读侧读取。
- 细粒度可见性判断。
- 输出规范化。

QueryService 不负责：

- 写流程编排。
- 事务组织。
- 跨步骤业务决策。
