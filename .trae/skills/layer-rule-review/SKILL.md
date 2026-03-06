---
name: "layer-rule-review"
description: "Finds layer rule docs under /docs and reviews uncommitted changes for violations. Invoke after generating code or refactors that touch layered architecture."
---

# Layer Rule Review

## 何时使用
- 每次生成或重构代码之后
- 需要确认分层依赖是否合规时

## 规则来源
从 /var/www/backend/docs 中找到对应层次的规则说明：
- adapters.rules.md
- usecase.rules.md
- modules.rules.md
- modules.extra.rules.md
- queryservice.rules.md
- infrastructure.rules.md
- core.rules.md
- type_rules.md

## 操作步骤
1. 获取未提交的变更列表，确认涉及的目录层次。
2. 按变更文件路径映射到对应规则文件。
3. 阅读对应规则说明，并逐文件检查差异是否违反。
4. 重点检查依赖方向、写操作位置、事务归属、错误码使用、配置读取位置。
5. 汇总风险点与修复建议。

## 层次映射参考
- src/adapters → adapters.rules.md
- src/usecases → usecase.rules.md
- src/modules → modules.rules.md 和 modules.extra.rules.md
- src/modules/**/queries 或 QueryService → queryservice.rules.md
- src/infrastructure → infrastructure.rules.md
- src/core → core.rules.md
- src/types → type_rules.md

## 输出要求
- 列出本次变更涉及的层次
- 引用对应规则文件名称
- 指出具体文件中的潜在违规点
