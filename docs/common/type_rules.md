<!-- file: /var/www/worker-backend/docs/common/type_rules.md -->

# Type 管理规则（NestJS + TypeScript + GraphQL）

本文用于统一 `src` 内 TypeScript type / enum / GraphQL type 的放置、复用与演进规则，目标是降低分叉与重复定义。

## 1. 目标与原则

- 单一真源：同一业务语义只允许一个权威定义。
- 就近优先：默认 colocate（和 usecase / resolver / service 放一起）。
- 稳定上收：只有稳定且跨域复用的类型才进入 `src/types`。
- 分层一致：type 的依赖方向必须服从项目分层规则。
- 先可演进后抽象：禁止“提前抽象”造成全局污染。

## 2. 三层类型模型

### L1：全局共享类型（`src/types`）

适用条件（必须同时满足）：

- 跨 2 个及以上 bounded context 复用；
- 语义稳定（未来 2~3 个迭代不会频繁改字段）；
- 不含 adapter 细节（如 GraphQL 装饰器、HTTP 协议字段）。

典型内容：

- 领域 enum（如账户状态、身份、验证记录类型）；
- 跨层输入输出契约（不绑定框架）；
- 通用响应结构与安全可复用类型。

### L2：领域内类型（usecases / modules / core 内 colocate）

适用条件（命中任意一项即可）：

- 仅服务于单个业务流程；
- 字段仍在快速变化；
- 只被同一模块内少量调用方使用。

典型位置：

- `src/usecases/**/types/*.ts`
- `src/modules/**/**.types.ts`
- `src/core/**/**.types.ts`

### L3：适配层类型（GraphQL DTO / 输入输出）

规则：

- 仅放在 `src/adapters/graphql/**/dto`（或同层语义目录）；
- 不进入 `src/types`；
- 不作为领域模型向下游传播。

典型内容：

- `@ObjectType` / `@InputType` class；
- GraphQL union / result type；
- 仅前端展示相关字段组合。

## 3. enum 管理规则

### 3.1 领域 enum

- 业务状态、角色、流程类型等领域 enum 放在 `src/types`（或 `core` 的纯领域位置）；
- 在 GraphQL 侧通过集中注册暴露，禁止在业务目录分散注册。

### 3.2 GraphQL 专用 enum

- 仅 GraphQL 展示语义的 enum（如分页模式）保留在 adapter 层；
- 统一在 `src/adapters/graphql/schema/enum.registry.ts` 注册。

### 3.3 禁止项

- 禁止同语义 enum 在多个目录重复定义；
- 禁止“名字相同但值域不同”的隐式冲突；
- 禁止在 resolver 内临时定义可复用 enum。

## 4. import 与依赖方向（类型同样受限）

- adapters 可依赖 usecases / core / `src/types`；
- usecases 可依赖 modules(service) / core / `src/types`；
- modules(service) 可依赖 infrastructure / core / `src/types`；
- core 禁止依赖 adapters / usecases / framework 细节；
- 任何层禁止反向依赖 adapters。
- L1 共享类型统一通过 `@app-types/*` 引用，禁止使用 `@src/types/*` 混用入口。

说明：type 文件不因为“只是类型”而豁免依赖方向。

## 5. `src/types` 入库门槛（Checklist）

新增类型前必须通过以下检查：

- 是否跨域复用？若否，放本地 colocate；
- 是否稳定？若否，放本地 colocate；
- 是否含 GraphQL / HTTP / ORM 细节？若是，禁止入 `src/types`；
- 是否已有同义类型？若是，先合并再新增；
- 是否会引入反向依赖？若是，禁止入库。

全部满足才可进入 `src/types`。

## 6. 命名与文件组织

- 文件名统一 `*.types.ts`（除已约定的 `*.enum.ts`）；
- enum 命名优先业务语义名，避免 `Common` / `Base` 等泛名；
- 输入参数优先对象参数（单一简单值除外）；
- 同一目录内命名风格保持一致，不混用缩写与全称。

## 7. 错误码类型约定

- 业务错误码单一真源：`src/core/common/errors/domain-error.ts`；
- `src/types/errors` 仅放对外响应 payload 结构；
- 禁止维护第二套并行业务错误码集合。

## 8. 迁移策略（增量，不大爆炸）

- Step 1：先标注重复类型与冲突点（尤其 enum）；
- Step 2：确定 canonical source，保留一份权威定义；
- Step 3：批量替换 import，引入兼容导出过渡；
- Step 4：移除旧定义，补充最小回归测试；
- Step 5：在 Code Review 中启用本规则作为检查项。

## 9. Code Review 必查项（简版）

- 新增 type 是否遵循 L1 / L2 / L3 归位；
- 是否出现重复语义定义；
- 是否把 adapter DTO 泄漏到 usecase / core；
- enum 是否统一注册；
- import 方向是否满足分层约束。

## 10. 适用于当前仓库的落地建议

- 优先清理重复排序 enum，保留单一来源；
- 将 resolver 内可复用本地 type 迁移到同域 `*.types.ts`；
- 保持 GraphQL 枚举集中注册，不在 resolver 分散注册；
- 将 type 选址规则纳入 PR 模板与团队约定。
