---
name: 'e2e-spec-toggle'
description: 'Runs E2E specs one by one via test/jest-e2e.js list. Invoke when toggling individual E2E files and executing them sequentially.'
---

# E2E Spec Toggle

## 何时使用

- 需要逐条运行 E2E 测试时
- 需要控制单个用例的开关并多次执行时

## 关键位置

- 列表位置： /var/www/backend/test/jest-e2e.js#L5-L25
- 列表含义： 只运行 ENABLED_SPECS 中列出的文件

## 操作步骤

1. 打开 test/jest-e2e.js，定位 ENABLED_SPECS。
2. 只保留一个目标文件为启用状态，其它保持注释。
3. 执行 npm run test:e2e 并记录结果。
4. 切换到下一个文件，重复步骤 2 与 3。
5. 全部文件执行完成后，恢复到原始开关状态。

## 示例

逐条执行示例：

```text
const ENABLED_SPECS = [
  '07-pagination-sort-search/search.e2e-spec.ts',
  // '07-pagination-sort-search/sort.e2e-spec.ts',
];
```

切换下一条：

```text
const ENABLED_SPECS = [
  // '07-pagination-sort-search/search.e2e-spec.ts',
  '07-pagination-sort-search/sort.e2e-spec.ts',
];
```

## 推荐命令

```bash
npm run test:e2e
```
