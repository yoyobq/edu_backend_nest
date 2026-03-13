<!-- /var/www/worker-backend/docs/worker/qm-worker-integration.rules.md -->

# QM Worker 接入规则

## 目标与适用范围

- 本文定义基于当前 QM Worker 基座新增队列时的统一接入规则。
- 本文覆盖 API 入队、Worker 消费、第三方调用、审计记录与测试落位。
- 本文用于统一命名、职责边界与可观测语义，避免各业务线重复发明模式。
- 若与分层规则冲突，以 `adapters -> usecases -> modules(service) -> infrastructure` 依赖方向为最高优先级。

## 接入前置定义（编码前必须明确）

- 新增队列前必须先定义以下 6 个字段与语义：
  - `queueName`
  - `jobName`
  - `payload contract`
  - `bizType`
  - `dedupKey` 语义（复用旧任务 / 允许重新入队）
  - 成功 / 失败返回结构
- 若上述任一项未明确，不进入编码阶段。

## 强制规则

1. 先定领域边界，再落代码
   - 先完成任务标识、业务锚点、失败语义定义，再开始实现入队与消费逻辑。
2. 所有队列入口必须先过 Usecase
   - Resolver / Controller 仅做鉴权、校验、提取 actor。
   - 入队、审计记录、失败回退统一放在 Usecase。
3. 所有入队必须具备 `traceId` 与可选 `dedupKey`
   - 未显式传入时由基础设施生成稳定标识。
   - 传入 `dedupKey` 时，必须先定义“命中复用”或“允许重入队”策略。
4. 所有队列必须写 Async Task Record
   - 至少覆盖 `enqueued`、`started`、`finished(succeeded/failed)` 三段状态。
   - 禁止出现只有 BullMQ Job、没有审计记录的链路。
5. Worker 失败必须归类
   - 禁止裸透传第三方异常。
   - 失败必须沉淀为稳定错误码或稳定前缀，支持重试、告警、统计复用。
6. Provider / 第三方调用必须在 Worker Service 或 Provider 层
   - Processor / Handler 仅做路由与映射。
   - 业务执行必须放在 Usecase / Provider。
7. 新队列必须具备 3 级测试
   - 入队 E2E。
   - Worker Consume E2E。
   - 涉及真实第三方时补受控 Live Smoke。
8. 公共行为优先复用现有模式
   - 不为单一业务重造命名、审计、错误语义。
   - 需要例外时，必须先说明现有模式为何不适用。

## 落位规范

- 入口层（Resolver / Controller）
  - 目录：`src/adapters/api/graphql/...` 或 `src/adapters/api/http/...`
  - 参考：`src/adapters/api/graphql/ai/ai.resolver.ts`
- 入队 Usecase
  - 目录：`src/usecases/<queue-domain>/`
  - 参考：`src/usecases/ai-queue/queue-ai.usecase.ts`
- 队列服务
  - 目录：`src/modules/common/<queue-domain>/`
  - 参考：`src/modules/common/ai-queue/ai-queue.service.ts`
- Worker Consume Usecase
  - 目录：`src/usecases/<worker-domain>/`
  - 参考：`src/usecases/ai-worker/consume-ai-job.usecase.ts`
- Processor / Handler / Mapper
  - 目录：`src/adapters/worker/<domain>/`
  - 参考：`src/adapters/worker/ai/ai-job.processor.ts`
- Provider Registry / Third-party Client
  - 目录：`src/modules/common/<worker-domain>/providers/`
  - 参考：`src/modules/common/ai-worker/providers/ai-provider-registry.ts`
  - 参考：`src/modules/common/ai-worker/providers/qwen/qwen-generate.provider.ts`
- BullMQ 注册与 Contract
  - 目录：基础设施注册层
  - 参考：`src/infrastructure/bullmq/bullmq.constants.ts`
  - 参考：`src/infrastructure/bullmq/contracts/job-contract.registry.ts`
  - 参考：`src/infrastructure/bullmq/queue-registry.ts`
- 审计记录
  - 统一走 Async Task Record Service，不单独造表。
  - 参考：`src/usecases/ai-queue/queue-ai.usecase.ts`
  - 参考：`src/usecases/ai-worker/consume-ai-job.usecase.ts`

## 模块装配规范

- API 入口模块放在 Adapter Module。
- Worker 消费模块放在 Worker Adapter Module。
- 公共能力放在 Common Module / Usecases Module。
- 参考：
  - `src/adapters/worker/ai/ai-worker-adapter.module.ts`
  - `src/bootstraps/worker/worker.module.ts`

## 测试落位规范

- 普通 E2E：`test/08-qm-worker/`
- 真实第三方 Smoke：`test/99-third-party-live-smoke/`
- 参考：
  - `test/08-qm-worker/ai-graphql-queue.e2e-spec.ts`
  - `test/99-third-party-live-smoke/ai-qwen-generate-real.e2e-spec.ts`

## 新增一个队列的最短清单

1. 增加 `queueName` / `jobName` 常量与 `payload contract`。
2. 增加 Queue Service 与 Enqueue Usecase。
3. 增加 API 入口。
4. 增加 Worker Consume Usecase。
5. 增加 Processor / Handler / Mapper。
6. 接入 Provider 或内部执行器。
7. 接入 Async Task Record 三段状态。
8. 补齐入队 E2E、消费 E2E，必要时补 Live Smoke。
