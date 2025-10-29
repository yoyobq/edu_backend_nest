<!-- src/infrastructure/typeorm/pagination/README.md -->

# TypeORM 分页实现详解（Offset & Cursor）

本说明文档全面介绍 `src/infrastructure/typeorm/pagination` 目录下的分页实现，包括功能、依赖关系、边界条件、错误处理、性能与安全考量、最佳实践及使用示例。该实现遵循项目的分层架构与依赖规则，确保在严格模式下的类型安全与稳定性。

## 架构定位与依赖方向

- 位置：`infrastructure` 层，负责实现 `core` 层定义的端口接口（`IPaginator`）。
- 依赖规则：
  - 允许：`modules(service) → infrastructure | core`，`usecases → modules(service) | core`，`adapters → usecases`。
  - 禁止：`usecases → infrastructure` 直接依赖实现；`任意层 → adapters`；`adapters → modules(service)/infrastructure` 直接依赖具体实现。
- 设计原则：
  - `core` 定义抽象与纯规则；`infrastructure` 只承载外部依赖的具体实现（TypeORM），不编写业务规则或用例编排。
  - 所有外部配置通过配置模块注入，禁止硬编码密钥。

## 文件结构与职责

- `typeorm-paginator.ts`：`IPaginator` 的 TypeORM 实现，支持 `OFFSET` 与 `CURSOR` 两种分页模式；提供排序解析、稳定排序（tie breaker）、游标边界处理、总数统计优化等能力。
- `sort-mapper.ts`：排序字段到安全列名的映射器，避免非法排序与 SQL 注入；供 `TypeOrmPaginator` 在无法通过调用方 `resolveColumn` 显式解析列时回退使用。

## 关键类型与端口

- `IPaginator`（core 端口）：
  - 方法：`paginate<T>({ qb, params, options }): Promise<PaginatedResult<T>>`
  - 参数：
    - `qb`: Black-box 查询构建器（在 `core` 层为 `unknown`，具体在 `infrastructure` 层适配为 `SelectQueryBuilder`）。
    - `params`: `PaginationParams`（`OFFSET` 或 `CURSOR`）。
    - `options`: `{ allowedSorts, defaultSorts, cursorKey?, countDistinctBy?, resolveColumn }`。
- `PaginationParams`：
  - `OFFSET`：`{ mode: 'OFFSET', page, pageSize, sorts?, withTotal? }`
  - `CURSOR`：`{ mode: 'CURSOR', limit, after?, sorts? }`
- `SortParam`：`{ field: string; direction: 'ASC' | 'DESC' }`
- `PaginatedResult<T>`：`{ items, total?, page?, pageSize?, pageInfo? }`
- `CursorToken`：`{ key: string; value: string | number; id: string | number }`

## 功能详解

### paginate()

- 统一入口，按 `params.mode` 分派到 `paginateOffset()` 或 `paginateCursor()`。
- 核心步骤：
  1. `resolveSorts()`：将用户排序与白名单、默认排序融合；当用户传空或全被过滤时回退到默认排序。
  2. `ensureTieBreakerSort()`（游标模式）：确保稳定排序包含 `tieBreaker`（例如主键 `id`），避免跨页重复或漏行；其方向与主排序保持一致（若未显式提供则沿用第一排序方向或 `ASC`）。
  3. `applyOrderBy()`：依次应用 `ORDER BY`，优先使用调用方提供的 `resolveColumn(field)` 映射安全列名；若返回 `null` 则回退到 `mapSortColumn(field)`；两者都无效则抛 `DomainError(PAGINATION_ERROR.SORT_FIELD_NOT_ALLOWED)`。

### OFFSET 模式：paginateOffset()

- 逻辑：
  - 基于 `page` 与 `pageSize` 计算 `skip`，构建 `pageQb = builder.clone().skip(skip).take(pageSize)`。
  - 执行 `getMany()` 返回当前页数据。
  - 若 `withTotal`：执行总数统计，做性能与准确性优化：
    - 克隆查询为 `countQb` 并清空 `orderBy()`，避免 `ORDER BY` 影响 `COUNT` 性能与结果。
    - 若提供 `countDistinctBy`：使用 `COUNT(DISTINCT <column>)` 统计唯一实体数，避免 `JOIN` 或一对多场景下的总数膨胀；使用驱动安全转义 `driver.escape()` 与命名别名。
    - 否则使用 `getCount()`。
- 返回：`{ items, total?, page, pageSize }`。

### CURSOR 模式：paginateCursor()

- 逻辑：
  - 若 `after` 存在：通过 `ICursorSigner.verify(cursor)` 验证并解析游标令牌，得到 `{ key, value, id }`。
  - 强一致性校验：比较 `token.key` 与当前查询的 `cursorKey.primary`，不一致时抛出 `DomainError(PAGINATION_ERROR.INVALID_CURSOR)`，防止跨端点/跨列表复用游标导致边界错乱。
  - 根据当前排序 `sorts`，提取主排序与 tie breaker 的方向，用于游标边界比较符选择。
  - 应用边界 `applyCursorBoundary()`：
    - 典型边界表达式：
      - `(primary > value) OR (primary = value AND id > token.id)`（升序）
      - `(primary < value) OR (primary = value AND id < token.id)`（降序）
    - 比较操作符由排序方向动态决定，避免 `DESC` 场景下的重复或漏行。
    - 使用参数化变量（`:cursorPrimary`, `:cursorId`）避免注入风险。
    - 边界列解析与排序一致：优先使用调用方提供的 `resolveColumn`，回退到注入的 `mapSortColumn`；两者都无法解析时抛错。
  - 拉取 `limit + 1` 行，判断 `hasNext = rows.length > limit`，`items = hasNext ? rows.slice(0, limit) : rows`。
  - 计算 `nextCursor`：取当前页最后一项作为来源，通过 `buildNextCursor()` 使用 `{ primary, tieBreaker }` 两字段签名生成；避免跳过一项的问题。
- 返回：`{ items, pageInfo: { hasNext, nextCursor? } }`。

### buildNextCursor()

- 来源：当前页最后一项的 `cursorKey.primary` 与 `cursorKey.tieBreaker` 字段值。
- 约束：
  - 值类型要求为 `string | number`（严格模式下禁止 `any`）。
  - 若字段类型为 `Date`，建议查询层归一化为 ISO 字符串或数值时间戳，以避免不同驱动或序列化差异造成比较不一致。
- 输出：经 `ICursorSigner.sign({ key, value, id })` 加密签名的游标字符串。
- 说明：读取时已强制校验 `token.key === cursorKey.primary`；签名时使用 `cursorKey.primary`，两者保持一致，防止跨列表游标复用。

### resolveSorts()

- 目标：将用户排序（可能为空或包含非法字段）与白名单、默认排序融合，返回最终安全的排序列表。
- 规则：
  - 对 `allowedSorts` 以集合过滤字段；
  - 当过滤后为空时，若存在默认排序 `defaults`，回退使用；
  - 保持输入顺序并避免“空排序”导致不稳定。

### applyOrderBy()

- 优先使用调用方提供的 `resolveColumn(field: string): string | null`，将业务字段名映射成查询中的安全列（含表/别名前缀）。
- 若 `resolveColumn` 返回 `null`，回退使用注入的 `mapSortColumn(field)`（`SortColumnMapper`）。
- 若两者都无法解析安全列，为防止注入与非法列访问，抛 `DomainError(PAGINATION_ERROR.SORT_FIELD_NOT_ALLOWED)`。

### ensureTieBreakerSort()

- 在游标模式下，确保稳定排序包含 `cursorKey.tieBreaker`，避免跨页重复或漏行。
- `tieBreaker` 的方向与主排序保持一致；若主排序未提供则沿用第一排序方向或回退为 `ASC`。

### applyCursorBoundary()

- 将游标令牌与动态比较符组合成参数化 `WHERE` 子句，兼容 `ASC/DESC` 两种场景：
  - `primaryOp = (primaryDir === 'DESC' ? '<' : '>')`
  - `tieBreakerOp = (tieBreakerDir === 'DESC' ? '<' : '>')`
- 防注入：使用命名参数绑定实际值（`:cursorPrimary`, `:cursorId`）。

## 错误处理与错误码

- 使用 `DomainError` 与 `PAGINATION_ERROR` 映射表（位于 `src/core/common/errors/domain-error`）。分页器抛出的典型错误码：
  - `INVALID_CURSOR`：游标缺失（游标模式）、游标键值不可提取、游标主键不匹配、游标边界列非法等。
  - `SORT_FIELD_NOT_ALLOWED`：排序字段不在白名单内或无法解析为安全列。
  - `DB_QUERY_FAILED`：底层数据库查询或构造失败（包含原始错误信息）。

## 安全性与合规性

- 排序安全：`allowedSorts` 白名单 + `resolveColumn/mapSortColumn` 双重保障，拒绝非法列名与注入风险。
- 参数化查询：游标边界使用命名参数，避免字符串拼接引入注入。
- HMAC 游标：`ICursorSigner`（如 `HmacCursorSigner`）对游标令牌签名/验证，防止客户端篡改。
- 严格模式类型：所有输入/输出遵循 `strict` TypeScript 模式，禁止 `any` 类型。
- 配置注入：生产环境强制要求 `pagination.hmacSecret`，不存在则拒绝启动（开发环境有安全兜底）。

## 性能与稳定性

- COUNT 优化：`countQb.orderBy()` 清理排序，减少 COUNT 的排序代价；支持 `COUNT(DISTINCT ...)` 保证复杂查询下的总数准确。
- COUNT 使用准则：仅当查询存在 `JOIN` 或一对多放大导致总数膨胀时才启用 `countDistinctBy`；否则保持默认 `getCount()`（不使用 DISTINCT）通常更快。
- 稳定排序：游标模式自动补位 `tieBreaker`，并与主排序方向一致，保证跨页稳定性。
- 游标边界：按方向选择比较符，避免 `DESC` 下的重复或漏行。
- 预取一条：`limit + 1` 策略判断是否存在下一页，避免额外 COUNT。

## 事务与一致性

- 分页器本身不负责开启事务，严格遵循架构规则（事务由 `usecases` 定义与开启）。
- 若业务需要强一致快照（例如同一请求内 `list + count` 希望对同一数据视图一致），请在上层用例中于同一事务或一致性读上下文下构建 `qb`，将该事务上下文传递到所有细粒度读方法。
- 模块（service）层仅提供细粒度方法与复用的读服务，由用例将这些调用编排到同一事务上下文内；禁止在各自模块内部开启跨域事务。
- 对常见数据库（如 MySQL/InnoDB）：建议在合适的隔离级别（如 `READ COMMITTED` 或更高）下进行一致性读；`OFFSET` 分页与 `COUNT` 建议在同一事务中执行以获得一致结果。
- `CURSOR` 模式依赖稳定排序字段（主排序 + `tieBreaker`）；若这些字段在同一事务内被并发更新，可能出现下一页滑动或边界变化。必要时通过隔离级别、时间点快照或业务锁确保一致性。

## 与上层的协作

- `PaginationService`（`modules` 层）：
  - 应用默认规则（`applyDefaults`）、页大小上限（`enforceMaxPageSize`）、排序白名单过滤（`whitelistSorts`）。
  - 强制游标模式必须提供 `cursorKey`。
  - 通过 `IPaginator.paginate()` 调用本实现，传入 `qb/params/options`。
  - 默认 DI 策略：`PaginationModule` 将 `mapSortColumn` 绑定为返回 `null` 的实现，更安全地强制上层提供 `resolveColumn`；否则无法解析的排序/边界列会抛出 `SORT_FIELD_NOT_ALLOWED`。
- GraphQL 适配：
  - 入参 DTO：`PaginationArgs` 使用枚举 `PaginationMode` 与 `SortDirection`。
  - 转换工具：`mapGqlToCoreParams()`（位于 `src/adapters/graphql/pagination.mapper.ts`）将 GraphQL 入参转换为 `core` 的 `PaginationParams`。
  - 枚举注册：集中在 `src/adapters/graphql/schema/enum.registry.ts`，通过 `schema.init.ts` 初始化一次；避免在 DTO 文件中直接注册枚举。

## 使用示例

> 说明：以下示例为伪代码，请根据具体实体与查询构建器替换。

```ts
// modules 层内某服务/Resolver 中
const qb = dataSource
  .getRepository(Entity)
  .createQueryBuilder('e')
  .leftJoin('e.relation', 'r')
  .where('e.status = :status', { status: 'ACTIVE' });

const allowedSorts = ['createdAt', 'name', 'id'] as const;
const defaultSorts = [{ field: 'id', direction: 'ASC' }] as const;

// 将 GraphQL 入参转换为 core 参数
const params = mapGqlToCoreParams(paginationArgs);

// 将业务字段映射为查询列（含别名），非法字段返回 null
const resolveColumn = (field: string): string | null => {
  switch (field) {
    case 'createdAt':
      return 'e.created_at';
    case 'name':
      return 'e.name';
    case 'id':
      return 'e.id';
    default:
      return null;
  }
};

// 游标稳定键：主排序字段与副键（例如主键 id）
const cursorKey = { primary: 'name', tieBreaker: 'id' } as const;

const result = await paginationService.paginateQuery({
  qb,
  params,
  allowedSorts,
  defaultSorts,
  cursorKey,
  // 在 join 或一对多场景下建议开启，确保总数准确
  countDistinctBy: 'e.id',
  resolveColumn,
});
```

## 边界与注意事项（必读）

- 游标模式必须保证排序稳定（主排序 + `tieBreaker`），否则会出现重复或漏行；当前实现会自动补位 `tieBreaker`。
- `resolveColumn` 必须严谨映射真实列名或别名；非法字段返回 `null`，交由分页器抛错，避免“宽松兜底”。
- `COUNT(DISTINCT ...)` 仅用于总数统计，不影响当前页数据；复杂查询下建议设置为主实体唯一键（如主键）。
- Date 类型字段参与排序或游标时，建议在查询层转为 ISO 字符串或时间戳，避免不同驱动/序列化差异导致比较不一致。
- 生产环境必须注入 `pagination.hmacSecret`；开发环境有占位密钥，但不建议用于真实数据场景。
- 当前实现未强制校验 `token.key === cursorKey.primary`；如需更严格校验，可在 `verify()` 结果后增加一致性检查（未来可作为增强特性加入）。

## 常见问题（FAQ）

- 为什么 `nextCursor` 使用当前页最后一项？
  - 这样可以确保下一页边界正确衔接，避免跳过一项；同时配合 `limit + 1` 检测是否存在下一页。
- `DESC` 排序时如何避免重复/漏行？
  - 游标边界比较符依据排序方向动态选择（`<`/`>`），确保 `ASC/DESC` 下均正确衔接。
- 总数统计与大量 `JOIN` 导致的膨胀怎么办？
  - 使用 `countDistinctBy` 启用 `COUNT(DISTINCT ...)`，统计唯一实体数量，保证总数准确。
- 复合主键或多列排序如何支持？
  - 推荐将主排序设为业务稳定字段，`tieBreaker` 设为单列主键；更复杂的复合键可在未来扩展游标令牌结构与边界表达式。
- 如何修改默认的 `page/pageSize/limit`？
  - 在 `modules` 层的 `PaginationService` 使用 `applyDefaults`、`enforceMaxPageSize` 配置默认与上限，所有 resolver 共享统一策略。

## 测试与验证

- 已有 E2E 测试覆盖：
  - `OFFSET` 模式返回正确分页与总数。
  - `CURSOR` 模式与 `nextCursor` 正确衔接（按 `name ASC, id ASC`）。
  - 非法排序字段将被忽略并回退到默认排序。
  - 非法游标签名被拒绝。
  - 游标主键一致性校验：跨端点/跨列表复用游标会被拒绝（抛 `INVALID_CURSOR`）。
- 建议增补：
  - `DESC` 排序的游标模式跨页稳定性用例。
  - `COUNT(DISTINCT ...)` 在复杂查询下的准确性验证用例。

## 变更与扩展建议

- 已实现优化：
  - 游标边界支持 `ASC/DESC` 动态比较符。
  - `OFFSET` 计数查询清理 `ORDER BY` 并支持 `COUNT(DISTINCT ...)`。
  - 集中注册 GraphQL 枚举，统一初始化与校验。
  - GraphQL→core 的入参转换工具，避免各 Resolver 重复逻辑。
  - 游标主键一致性校验：在 `paginateCursor()` 中校验 `token.key === cursorKey.primary`，防止跨列表游标复用导致边界错乱。
- 可选增强：
  - 支持 `COUNT(DISTINCT <表达式>)` 更灵活的表达式场景。
  - 为 `DESC` 排序补充 E2E 用例与边界数据集。

---

如需在具体模块中接入或扩展该分页器，请遵循上述依赖方向与安全约束，并优先通过 `PaginationService.paginateQuery` 进行编排与复用，以保持全局一致的分页策略与行为。