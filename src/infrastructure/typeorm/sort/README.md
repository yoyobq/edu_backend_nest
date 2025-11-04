<!-- File: src/infrastructure/typeorm/sort/README.md -->

# TypeORM 排序解析器使用说明（TypeOrmSort）

本文档说明 `TypeOrmSort` 的职责、使用方式与与分页/搜索的协作关系，并提供独立使用的示例。

---

## 组件定位与依赖

- 位置：`infrastructure` 层，负责实现 `core/sort` 的端口接口 `ISortResolver`。
- 依赖规则：遵循工作区分层约束，不引入业务规则，仅做安全列解析与排序列表规范化。
- 适用场景：
  - 可与分页/搜索协作，统一排序白名单与列解析；
  - 也可独立使用，在 `QueryBuilder` 上直接应用 `ORDER BY`。

---

## 核心能力

- 白名单校验：拒绝不在 `allowed` 列表中的业务字段，避免注入与非法列。
- 列名解析：将业务字段映射为安全物理列或别名列（如 `u.created_at`）。
- 排序规范化：
  - 若外部 `sorts` 为空，则使用 `defaults`；
  - 过滤掉不在白名单中的排序项；
  - 当提供 `tieBreaker`（游标模式）时，补齐副键排序并确保前两位为 `primary` 与 `tieBreaker`。

---

## 独立使用示例（不依赖分页/搜索）

```ts
import type { SelectQueryBuilder } from 'typeorm';
import { TypeOrmSort } from '@infrastructure/typeorm/sort/typeorm-sort';

// 1) 定义白名单与字段映射
const allowed = ['createdAt', 'name', 'id'] as const;
const map = {
  createdAt: 'u.created_at',
  name: 'u.name',
  id: 'u.id',
} as const;

// 2) 初始化排序解析器
const sortResolver = new TypeOrmSort(allowed, map);

// 3) 来自外部的排序入参（例如 DTO）
const sorts = [
  { field: 'createdAt', direction: 'DESC' },
  { field: 'id', direction: 'DESC' },
] as const;
const defaults = [{ field: 'id', direction: 'ASC' }] as const;

// 4) 规范化排序（无游标模式，不提供 tieBreaker）
const ordered = sortResolver.normalizeSorts({
  sorts,
  allowed,
  defaults,
});

// 5) 应用到 QueryBuilder
function applyOrderBy(qb: SelectQueryBuilder<unknown>) {
  ordered.forEach((s, idx) => {
    const col = sortResolver.resolveColumn(s.field);
    if (!col) return; // 不在白名单的项已被过滤，这里出于安全冗余再判空
    if (idx === 0) qb.orderBy(col, s.direction);
    else qb.addOrderBy(col, s.direction);
  });
}
```

---

## 与分页/搜索的协作

- 当启用 **CURSOR** 模式时：
  - 调用方需提供 `tieBreaker: { primary, tieBreaker }`，`normalizeSorts` 会补齐副键排序；
  - 保证主键与副键位于排序前两位，并与游标边界方向一致（由上层统一约束）。
- 当与 `TypeOrmPaginator` 或 `TypeOrmSearch` 协作时：
  - 共同遵循“上层负责排序白名单与列解析”的规则；
  - 在 `before` 分支下，分页器/搜索引擎会临时反向排序并在返回前翻转结果为正序。

---

## 错误与约束

- `INVALID_CURSOR`：当 `tieBreaker.primary === tieBreaker.tieBreaker` 或排序中缺失 `primary` 时抛出（游标模式下）。
- 列解析失败：`resolveColumn(field)` 返回 `null`，表示该字段不在白名单或未提供映射。
- 类型与严格模式：遵循 TypeScript strict 模式，禁止 `any`。

---

## 设计建议

- 白名单与映射保持一一对应，开发态建议全量校验。
- 默认排序应与业务稳定字段一致，减少跨页插入/删除带来的顺序漂移。
- 使用别名列时，请在 `QueryBuilder` 中保持一致的 `JOIN` 与 `alias` 设置，避免解析列不匹配。

---

如需在具体模块中集成，请统一通过模块层的服务封装调用，避免在适配层直接拼接列名或加入副作用。