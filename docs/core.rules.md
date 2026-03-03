<!-- /var/www/backend/docs/core.rules.md -->

# Core 说明

## 定位与职责

- Core 只承载领域模型、值对象、领域规则与端口接口。
- Core 是系统中最稳定、最少变动的层，负责表达业务不变性。
- Core 不关心运行时环境与框架，保持纯粹与可移植性。

## 允许内容

- 领域模型与值对象（不可变或受控变更）。
- 领域规则与纯函数（确定性、无副作用）。
- 端口接口（由 infrastructure 提供实现）。
- 领域错误码、错误映射表与业务枚举。

## 禁止内容

- 任何框架代码：NestJS、GraphQL、Express、TypeORM 等。
- 任何 I/O 与外部依赖：数据库、HTTP、消息队列、缓存、文件系统。
- 读取配置、环境变量或注入 ConfigService。
- 运行时注册：全局中间件、过滤器、装饰器副作用。
- 依赖注入相关标记：Module、Injectable、Provider 等。

## 依赖方向

- 允许：usecases、modules(service)、infrastructure 依赖 core。
- 禁止：core 依赖任何上游层（adapters、usecases、modules、infrastructure）。

## 设计原则

- 领域规则优先，技术细节后置。
- 抽象稳定，具体实现可替换。
- 纯函数优先，最小副作用。

## 命名与结构

- 领域模型命名清晰表达业务语义。
- 端口接口以能力命名，避免技术细节。
- 按领域边界组织目录，避免横切堆叠。
