<!-- /var/www/aigc-friendly-backend/docs/queue-identifiers.rules.md -->

# Queue Identifiers 说明

## 目的

* 本文定义异步任务体系中 `jobId`、`dedupKey`、`traceId`、`requestId` 的职责边界。
* 本文优先约束 AI qm-worker 链路，用于后续修改时统一判断标准。
* 本文是职责说明，不直接改变现有运行行为。

## 适用范围

* 当前优先适用于 AI GraphQL 入队、AI Queue Service、BullMQ Producer、AI Worker Adapter、AsyncTaskRecord。
* Email 链路当前不因本文自动触发代码变更。
* 如后续要统一 email 行为，应显式评估并单独迁移，不以“顺手对齐”为默认动作。

## 核心原则

* 一个字段只负责一种主语义。
* 队列幂等标识与链路追踪标识必须分离。
* Worker 不得再通过 `jobId` 反推业务 `traceId`。
* API 响应级标识与异步任务级标识必须分离命名。

## 字段职责

### `jobId`

* `jobId` 是 BullMQ 运行时任务标识。
* `jobId` 的职责是唯一标识一个队列任务实例，供队列去重、查询、消费、状态更新使用。
* `jobId` 是 AsyncTaskRecord 的主更新锚点之一，当前记录唯一键为 `(queueName, jobId)`。
* `jobId` 可以由系统生成，也可以由上层幂等策略显式指定。
* `jobId` 不是链路追踪 ID，不负责表达调用来源、请求链路或业务关联关系。

### `dedupKey`

* `dedupKey` 是调用方提供的幂等键。
* `dedupKey` 的职责是表达“这些请求应被视为同一个队列任务”。
* 当系统采用 `dedupKey` 作为 BullMQ `jobId` 时，这只是实现策略，不代表 `dedupKey` 等于 `traceId`。
* `dedupKey` 只服务于幂等，不承担排障追踪职责。
* 相同 `dedupKey` 的重复请求，系统应返回同一个真实任务标识，而不是制造新的任务语义。

### `traceId`

* `traceId` 是异步任务链路追踪标识。
* `traceId` 的职责是把 API 入队、任务记录、Worker 处理、下游调用、失败排查关联到同一条业务链路。
* `traceId` 必须独立存在，不得把“从 `jobId` 截取出来”视为正式来源。
* `traceId` 应在入队时确定，并沿任务生命周期稳定保持。
* `traceId` 可以由调用方传入；若未传入，可由系统生成。
* `traceId` 不是幂等键，不负责决定是否创建新任务。

### `requestId`

* `requestId` 表示单次 HTTP / GraphQL 请求的响应级追踪标识。
* `requestId` 的职责是定位某次接口请求与响应日志。
* `requestId` 不等于异步任务 `traceId`，除非显式设计并严格贯通。
* 若响应体继续输出当前中间件生成的请求级标识，建议字段名使用 `requestId` 或 `responseTraceId`，避免与任务 `traceId` 同名。

## 必须满足的不变量

* 同一个已创建的队列任务，在任务记录、Worker 生命周期、下游调用中应保持同一个 `traceId`。
* 相同 `dedupKey` 命中已有任务时，不应返回一个新的、不会被真实任务记录采用的 `traceId`。
* Worker 使用的 `traceId` 必须来自显式传递的任务上下文，而不是由 `jobId` 猜测。
* `jobId` 负责任务唯一性，`traceId` 负责链路关联，二者允许相等，但不能依赖“必须相等”才能工作。
* 降级场景可以生成兜底 `traceId`，但必须明确标注为降级语义，而不是作为正常链路规则。

## 推荐映射规则

* 入队请求进入系统后，先解析调用方 `dedupKey` 与 `traceId`。
* 若未传 `traceId`，系统生成一个新的稳定 `traceId`。
* 若未传 `dedupKey`，系统生成合法的 `jobId`，但不能把 `traceId` 直接拼成非法的 BullMQ `jobId`。
* 若传入 `dedupKey` 且命中已有任务，应返回已有任务的 `jobId` 与其真实 `traceId`。
* AsyncTaskRecord 仍以 `(queueName, jobId)` 作为更新锚点，但 `traceId` 必须可用于链路查询。
* Worker 收到任务时，应从显式上下文字段读取 `traceId`，并在 process / completed / failed 全链路透传。

## 禁止事项

* 禁止把 `dedupKey` 当作 `traceId` 使用。
* 禁止把 `traceId` 当作是否需要创建任务的判定键使用。
* 禁止在 Worker Mapper 中通过字符串规则从 `jobId` 反推正式 `traceId`。
* 禁止因为当前测试里 `traceId === jobId` 就默认两者天然等价。
* 禁止在成功路径使用 `jobId` 作为业务主键、失败路径又改用 `traceId` 作为业务主键，而不做显式语义说明。
* 禁止在同一个 API 响应中用同名 `traceId` 同时表达“HTTP 请求标识”和“异步任务标识”。

## 降级规则

* 仅在 Worker 事件缺失 `job`、任务上下文损坏、历史数据无法补齐等异常情况下，允许生成兜底 `traceId`。
* 兜底 `traceId` 只能用于保证可观测性，不得反向定义正常链路语义。
* 降级记录应在 `reason` 或等价字段中明确说明是 degraded / missing-job / fallback 场景。

## 对 AI 链路的直接约束

* AI GraphQL DTO 中，`dedupKey` 是否必填必须有明确结论，不能继续保持“看似可选、实际依赖实现细节”的状态。
* AI Queue Usecase 在成功、失败、重复入队三条路径上，必须使用同一套 `traceId` 规则。
* AI Worker 侧需要显式接收并透传 `traceId`，不得继续依赖 `jobId -> traceId` 的映射逻辑。
* AI 的 e2e 需要覆盖“相同 `dedupKey` + 不同 `traceId`”场景，验证返回值与落库结果一致。

## 对 email 的当前影响说明

* 本文不会自动改变 email 的现有行为。
* Email 当前已有自己的测试与映射约束，继续按现状运行。
* 若未来要让 email 也遵循本文的严格规则，应单独评估兼容性并补测试，不与 AI 改造捆绑提交。

## 修改顺序建议

1. 先确定 AI 中 `dedupKey` 是否必填。
2. 再确定重复 `dedupKey` 时返回哪一个 `traceId`。
3. 再改 Producer / Usecase 的入队与落库一致性。
4. 再改 Worker 显式透传 `traceId`。
5. 最后处理 API 响应级 `requestId` 命名与测试补齐。

