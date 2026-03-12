<!-- /var/www/worker-backend/docs/common/ai-task-lifecycle-audit.rules.md -->

# AI 任务生命周期审计补充规则

## 目标

- 本文仅定义 AI 任务生命周期审计，不定义请求内容审计。
- 本文用于串联 AI GraphQL 入队、AI Queue Usecase、AI Worker Adapter、AI Worker Usecase、AsyncTaskRecord 写入语义。
- 本文不改数据库结构，仅约束字段写入与语义一致性。

## 明确范围

- 只做任务生命周期审计：
  - 是否成功入队
  - 是否命中已有任务
  - worker 是否开始 / 完成 / 失败
  - 失败原因、发生时间、重试次数、最终失败尝试
  - 正常任务与降级任务区分
- 明确不做：
  - 不写入 prompt、text、metadata、outputText、vector
  - 不将 AsyncTaskRecord 升级为 AI 内容审计表
  - 不改 email
  - 不先改共享 producer，除非 AI 独占需求明确触发

## 本轮审计字段

- 标识字段：queueName、jobName、jobId、traceId、dedupKey
- 业务锚点：bizType、bizKey
- 生命周期字段：status、attemptCount、maxAttempts
- 时间字段：occurredAt、enqueuedAt、startedAt、finishedAt
- 审计说明字段：source、reason

## 固定语义规则

- AI 统一 bizKey = traceId。
- jobId 只负责队列任务唯一性，不承担链路语义。
- traceId 只负责链路关联，不承担幂等判定。
- dedupKey 只负责幂等，不承担追踪语义。
- AsyncTaskRecord 仍以 (queueName, jobId) 作为更新锚点。
- AI 正常链路 source：
  - API 入队写 user_action
  - Worker 生命周期写 system
- reason 必须是可检索、可读的稳定语义，不依赖日志上下文。

## AI 任务类型

- generate：bizType = ai_generation
- embed：bizType = ai_embedding
- 降级 worker 记录：bizType = ai_worker

## 入库映射矩阵

| 场景 | status | source | reason | bizType | bizKey |
|---|---|---|---|---|---|
| 入队成功 | queued | user_action | enqueue_accepted | ai_generation / ai_embedding | traceId |
| 入队失败 | failed | user_action | enqueue_failed:<summary> | ai_generation / ai_embedding | traceId |
| worker 开始处理 | processing | system | worker_processing | ai_generation / ai_embedding | traceId |
| worker 完成 | succeeded | system | worker_completed | ai_generation / ai_embedding | traceId |
| worker 失败 | failed | system | worker_failed:<summary> | ai_generation / ai_embedding | traceId |
| payload 缺失 traceId 降级 | failed | system | 含 missing_payload_trace_id | 原 job 对应 bizType | 降级 traceId |
| failed 事件缺失 job | failed | system | worker_event_job_missing:* | ai_worker | fallback traceId |
| failed 事件未知 jobName | failed | system | unsupported_ai_job:* | ai_worker | 该任务 traceId |

### 重复命中已有任务规则

- 重复命中不是新的写库事件。
- 仅返回已有任务真实 jobId / traceId。
- 记录字段全部沿用已有记录，不新增记录，不重写已有 status / reason / source / occurredAt / enqueuedAt / startedAt / finishedAt。

## 时间字段规则

- occurredAt：当前事件发生时间。
- enqueuedAt：任务被系统接受入队时间。
- startedAt：worker 开始处理时间。
- finishedAt：worker 完成或失败时间。
- 重复入队命中规则以“重复命中已有任务规则”章节为准。

## attempt 规则

- queued：attemptCount = 0
- processing：attemptCount = attemptsMade + 1
- succeeded / failed：attemptCount = 最终执行次数
- maxAttempts：取 BullMQ job 配置值

## 降级规则

- 仅允许以下三类降级：
  - enqueue-failed
  - worker failed 事件缺失 job
  - worker 遇到 payload 缺失 traceId、未知 jobName 或上下文字段损坏
- 降级生成的 jobId / traceId 必须可检索、可区分。
- 降级记录不能反向定义正常链路语义。

## reason 稳定性约束

- reason 采用“稳定前缀 + 可读摘要”格式，摘要允许截断。
- 统一规则：
  - 入队失败：enqueue_failed:<summary>
  - worker 普通失败：worker_failed:<summary>
- 其余稳定语义：
  - enqueue_accepted
  - worker_processing
  - worker_completed
  - missing_payload_trace_id
  - worker_event_job_missing:*
  - unsupported_ai_job:*

## 与现有标识规则文档关系

- 本文是 [queue-identifiers.rules.md](queue-identifiers.rules.md) 在 AI 生命周期审计上的补充。
- 当两文档存在冲突时，以“字段职责单一、幂等与追踪分离、降级不反定义正常语义”为最高优先级。
