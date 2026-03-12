<!-- /var/www/worker-backend/docs/common/infrastructure.rules.md -->

# Infrastructure 说明

## 定位与职责

- Infrastructure 承接外部依赖与框架实现。
- Infrastructure 仅包含 I/O 与运行时实现。
- 仅实现 core 中定义的端口接口，不承载业务编排。

## 允许内容

- ORM 与数据库连接、仓储实现、查询优化。
- 外部系统接入：消息队列、邮件、短信、第三方 SDK。
- GraphQL / HTTP / RPC 运行时配置与基础设施初始化。
- 日志、监控、链路追踪、加密、序列化等技术能力适配。

## 禁止内容

- 业务用例编排与领域规则。
- 直接被 adapters 或 usecases import。
- 将 ORM Entity 暴露到 adapters 或返回给上层。
- 跨领域数据组装与权限判断。

## 依赖方向

- 允许：infrastructure 依赖 core。
- 禁止：usecases 依赖 infrastructure。
- 禁止：adapters 依赖 infrastructure。

## 设计原则

- 以端口为中心实现适配，避免业务渗透。
- 细粒度、可替换、可测试的技术实现。
- 保持实现可观测性与可恢复性。

## 命名与结构

- 按外部系统或技术领域划分目录。
- 一个端口对应一个或多个实现，命名与端口一致。
