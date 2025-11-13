<!-- File: src/core/common/integration-events/README.md -->

# Integration Events（内存 Outbox + 巡检补偿）设计说明

> 目标：**不建新表**、保持现有分层（adapters → usecases → modules(service)｜core 抽象）、在**单库**里先实现“**最终一致**”的异步副作用投递（通知/对账/统计等）。同时**立好抽象**，未来可无痛切换到“同库 Outbox 表”。

---

## 0. 适用范围与不做什么

* ✅ 做：事件抽象、内存 outbox、调度与重试、幂等、巡检补偿任务、用例接入规范、监控指标。
* ❌ 不做：新建数据库表、外部 MQ、分布式事务/CDC、跨库分布式两阶段提交。

---

## 1. 目录结构与命名（对齐项目规约）

```
src/
├─ core/
│  └─ common/integration-events/
│     ├─ events.types.ts                # IntegrationEventType / Envelope / JsonValue / 工厂函数
│     └─ outbox.port.ts                 # IOutboxWriterPort / IOutboxDispatcherPort / TxRef
├─ modules/
│  └─ common/integration-events/
│     ├─ outbox.memory.service.ts       # IOutboxWriterPort 的“内存实现”（忽略 tx）
│     ├─ outbox.dispatcher.ts           # 内存队列的调度器（轮询、重试、退避）
│     ├─ handlers/                      # 事件处理器（幂等，副作用）
│     │  ├─ enrollment-created.handler.ts
│     │  └─ session-closed.handler.ts（规划中）
│     └─ events.tokens.ts               # DI Tokens（如 INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT）
└─ usecases/
   └─ course/workflows/...              # 在用例事务闭包末尾调用 outbox.enqueue(...)
```

> 依赖方向不变：usecases 仅依赖 core 抽象 + 通过 modules 注入实现；ORM 实体不外泄。

---

## 2. 端口与核心类型（摘要）

* `IOutboxWriterPort`

  * `enqueue({ tx?: TxRef, envelope })`
  * `enqueueMany({ tx?: TxRef, envelopes })`

  > **内存实现忽略 tx**；预留签名，为未来 DB 版“同事务入箱”铺路。

* `IOutboxDispatcherPort`

  * `start()` / `stop()` 启停调度器。

* `IntegrationEventEnvelope<T>`（在 `events.types.ts`）

  * 字段：`type`、`aggregateType`、`aggregateId`、`schemaVersion`、`payload`、`dedupKey?`、`occurredAt`、`deliverAfter?`、`priority?`、`correlationId?`、`causationId?`
  * `payload` 受 `JsonValue` 约束（可序列化）。
  * `occurredAt/deliverAfter` 使用品牌类型 `ISO8601String`；`dedupKey` 使用品牌类型 `DedupKey`。

* 工厂函数

  * 推荐使用 **`makeEnvelope(...)`**：提供 `schemaVersion=1`、`occurredAt` 默认值并返回 `Object.freeze` 的不可变对象（不自动生成 `dedupKey`）。
  * `buildEnvelope(...)`：提供 `schemaVersion=1`、`occurredAt`/`deliverAfter` 的序列化与默认 **`dedupKey`**（`${type}:${aggregateId}:${schemaVersion}`），但不冻结对象、`priority` 默认不填充（排序时按空值当作 0 处理）。

---

## 3. 事件命名与载荷约定

* **命名使用过去式**：`EnrollmentCreated`、`EnrollmentCancelled`、`SessionClosed`、`PayoutGenerated`、`PricingApproved`、`WaitlistPromoted`。
* **只承载副作用**：事件用于通知、对账、统计等**后置动作**；**不**承载业务不变量（名额、唯一性、余额等必须在同步事务内完成）。
* **payload 最小化**：仅放必需字段（如 id、外键、状态）。可从主表推导的冗余尽量不放，避免漂移。
* （可选）逐步引入**按事件名收窄的 payload 映射**，提升类型安全：

  * `PayloadOf<'EnrollmentCreated'> = { enrollmentId: number; sessionId: number; learnerId: number }`
  * …（可在后续迭代补全）

---

## 4. 幂等与 `dedupKey` 策略

* **所有 handler 必须幂等**：以 `dedupKey` 去重；重复投递不得产生重复副作用。
* `dedupKey` 推荐生成法（三选一，按业务选择）：

  1. **自然键**（首选，一事一键）：`enrollment:<id>`
  2. **版本键**（可重跑场景）：`${type}:${aggregateId}:${businessVersion}`
  3. **时间窗口键**（允许周期性再投）：`${type}:${aggregateId}:${yyyyMMddHH}`
* 默认 `dedupKey`：`buildEnvelope(...)` 生成 `${type}:${aggregateId}:${schemaVersion}`；`makeEnvelope(...)` 不自动生成，需按业务传入。

---

## 5. 用例接入规范（Usecase 内调用）

* 仍由 **usecase** 负责开启事务（单库本地事务）。
* 在**完成同步写**（名额扣减/唯一性/状态流转）后，**最后一步**调用 outbox：

```ts
// 伪代码
await uow.withTransaction(async (tx) => {
  // 1) 同步校验 + 同步写（均在 tx 中）
  // 2) 末尾入箱（内存实现会忽略 tx，但签名先立住）
  // 选项 A：需要默认 dedupKey → 使用 buildEnvelope
  await outbox.enqueue({
    tx,
    envelope: buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'enrollment',
      aggregateId: String(enrollment.id),
      payload: { enrollmentId: enrollment.id, sessionId, learnerId },
    }),
  });
  // 选项 B：需要不可变对象或自定义 dedupKey → 使用 makeEnvelope
  await outbox.enqueue({
    tx,
    envelope: makeEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'enrollment',
      aggregateId: String(enrollment.id),
      payload: { enrollmentId: enrollment.id, sessionId, learnerId },
      dedupKey: `enrollment:${enrollment.id}` as DedupKey,
    }),
  });
});
```

---

## 6. 调度器（Dispatcher）行为

* **拉取策略**：固定间隔轮询（默认 `1000–3000ms`），每批处理 `N=100`；可按 `priority`、`deliverAfter` 简单排序。
* **退避重试**：指数退避序列（默认 `[1s, 5s, 30s, 2m, 10m]`），超过最大次数记为失败并记录错误（内存版仅日志）。
* **可观测性**：记录 `type、dedupKey、attempt、latency、correlationId` 等。

> 内存版队列存活于进程内；`kill -9` 可能丢事件，**靠巡检补偿兜底**（见下一节）。

---

## 7. 巡检/补偿任务（最终一致的安全网）

> 目的：即便发生“**业务已提交但内存 outbox 丢事件**”，也能从**数据库真相表**反查并补齐副作用。

* **统一规范**：

  * **数据来源**：主表 + 目标副作用痕迹（通知/对账/课酬记录）。
  * **检测条件**：近 N 分钟内满足触发条件但缺少对应痕迹。
  * **补偿动作**：优先“**补发事件**”，路径一致、幂等友好。
  * **频率**：每 1–5 分钟（按域设置）。

* **首批建议**：

  1. `enrollment-reconcile.job`

     * 条件：`participation_enrollment` 新增且未取消，但缺少“报名通知/对账痕迹”。
     * 动作：补发 `EnrollmentCreated`（`dedupKey` 使用自然键 `enrollment:<id>`）。
  2. `session-payout-reconcile.job`

     * 条件：`course_sessions.status=FINISHED` 且缺少课酬记录。
     * 动作：补发 `SessionClosed` 或直接调用结算 usecase（若已有幂等）。

---

## 8. 配置项（ConfigService）

* `INTEV_ENABLED`（默认 `true`）
* `INTEV_DISPATCH_INTERVAL_MS`（默认 `1000–3000`）
* `INTEV_BATCH_SIZE`（默认 `100`）
* `INTEV_MAX_ATTEMPTS`（默认 `5`）
* `INTEV_BACKOFF_SERIES`（默认 `[1000,5000,30000,120000,600000]`）
* 各巡检任务 CRON：`RECONCILE_ENROLLMENT_CRON`、`RECONCILE_SESSION_PAYOUT_CRON`

---

## 9. 监控与日志（先打日志，后续可接 Prometheus）

* 计数指标：

  * `events_enqueued_total`
  * `events_dispatched_total`
  * `events_retry_total`
  * `events_failed_total`
  * `events_in_memory_queue_gauge`
  * `reconcile_fixed_total`（按任务维度）
* 关键日志字段：`type`、`dedupKey`、`aggregateType`、`aggregateId`、`attempt`、`latency`、`error`、`correlationId`。

---

## 10. 测试与验收清单

**单元**

* 工厂函数：默认值/品牌化/不可变。
* Handler 幂等：相同 `dedupKey` 重放不产生重复副作用。
* Dispatcher 退避：失败次数 → 下一调度时间符合策略。

**E2E**

1. 并发报名不超额（与 Outbox 无关，但同批验收）。
2. **“丢事件”补偿**：模拟成功报名但不入箱 → 巡检在 T+Δ 内补发并触发 handler。
3. 重复提交：重复报名返回 `ALREADY_EXISTS`，事件幂等只执行一次。
4. 停机恢复：重启后巡检补偿生效，日志可见“补偿发生”。

---

## 11. 迁移到“同库 Outbox 表”的零痛路径（未来需要时，暂不执行）

> 保持 **端口不变**，仅替换实现与 DI 绑定。

1. 新增表（示意字段）：`integration_event_outbox`

   * `id (bigint pk)`、`type`、`aggregate_type`、`aggregate_id (varchar)`、`schema_version`
   * `payload (json)`、`dedup_key (varchar unique)`、`status enum(NEW,PENDING,PUBLISHED,FAILED)`
   * `attempts`、`next_attempt_at`、`priority`、`occurred_at`、`deliver_after`、`created_at`、`updated_at`
   * 索引：`(status, next_attempt_at)`、`(priority desc, next_attempt_at)`、`(dedup_key unique)`

2. 新实现 `outbox.typeorm.service.ts`（在**同一 tx** 插入 outbox 行）。

3. Dispatcher 改为“从表拉取”并更新状态/重试。

4. 替换 DI：`INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT` → TypeORM 实现。

5. 巡检任务可保留（双保险）或按域逐步下线。

---

## 12. 风险与边界（必须知情）

* **内存版**在 `COMMIT` 后到“入队/投递”之间若 `kill -9`，可能丢事件；依赖**巡检补偿** → **最终一致**而非强一致。
* 多实例下，内存队列不共享：可能多投/漏投 → **务必幂等**；如需严肃可靠性，尽早切 DB Outbox。
* 任何**业务不变量**（名额、唯一性、余额）必须在**同步事务**内完成，不可依赖事件最终一致。

---

## 13. FAQ（快答）

* **为啥不用 Nest 的 event-emitter？** 同进程同步事件≠可靠投递；进程崩溃不可恢复，且不与 DB 事务绑定。
* **为什么保留 `tx` 参数？** 为未来 DB Outbox 的“**同事务入箱**”铺路，usecase 代码不需要重写。
* **`aggregateId` 用 number 还是 string？** 建议在 Envelope 内部统一成 **string**，避免跨边界 64 位精度问题。
* **`priority` 语义？** 数值越大优先，默认 0；内存版可按 `priority` 简单排序。

---

## 14. 版本约定与 TODO

* v0（当前）：内存 outbox + 调度器 + `EnrollmentCreated` handler。巡检任务与其他 handler 规划中。
* v1（可选）：补全 `IntegrationEventPayloads` 映射，逐步替换 `payload` 的松散类型。

