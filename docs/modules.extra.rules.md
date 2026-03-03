<!-- /var/www/backend/docs/modules.extra.rules.md -->

# Modules(service) 补充说明

本说明用于记录 modules(service) 的可选能力与实践约定。属于非强制规则，需要时查阅即可。

## 统一分页服务

- 统一使用 PaginationService 进行排序白名单、默认排序、游标与页大小约束。
- 领域 service 只提供参数与查询上下文，不重复分页逻辑。

## 事务回调能力

- 可选提供 runTransaction 或事务管理器封装，供 usecase 在同域内编排。
- 仅限同域事务，禁止跨域事务聚合。

## Service 职责声明

- 建议在 service 注释中明确包含与不包含的职责范围，防止越界。

## Entity 来源约定

- Entity 以数据库结构为准，可由 DDL 驱动生成或由工具生成后人工校核。
- 无论来源如何，最终需通过评审或校验确保字段、索引、关系一致。
