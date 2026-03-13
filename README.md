# AIGC Friendly Architecture Backend

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg)
![NestJS](https://img.shields.io/badge/framework-NestJS-E0234E.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

基于 NestJS + TypeScript 的后端 API 项目，当前以 GraphQL 为主入口，使用 MySQL + TypeORM，并遵循严格的分层架构约束。

## 💡 核心理念：AIGC Friendly

本项目专为 **AI 辅助编程（Copilot / Agent）** 场景优化，旨在提供一个 AI 容易理解、维护与扩展的架构模版：

- **清晰的上下文边界**：Adapters / Usecases / Core / Infrastructure 分层明确，AI 容易定位代码职责。
- **显式的依赖规则**：严格的单向依赖约束，减少 AI 生成循环依赖或错误引用的概率。
- **规范化的读写分离**：Query Service (读) 与 Usecases (写) 分离，便于 AI 识别副作用与事务边界。
- **自文档化代码**：通过显式的规则文档 (`docs/*.rules.md`) 与强类型约束，辅助 AI 进行更准确的代码生成。

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [项目结构与架构](#项目结构与架构)
- [功能概览](#功能概览)
- [快速开始](#快速开始)
- [开发与测试](#开发与测试)
- [API 访问](#api-访问)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

## 项目简介

项目面向账号体系、身份管理与验证流程等业务场景，提供统一鉴权、分页 / 排序 / 搜索与错误映射能力，并内置基于 QM Worker 的 AI / Email 异步队列、任务审计与调试查询能力。它既是脚手架，也是一套经过实践验证的 DDD 轻量级落地实现。

## 技术栈

- **Runtime**: Node.js
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: MySQL 8.0
- **ORM**: TypeORM
- **API Protocol**: GraphQL (Apollo Server)
- **Logging**: Pino
- **Configuration**: @nestjs/config
- **Validation**: class-validator + class-transformer

## 项目结构与架构

### 目录结构

```text
src/
├── adapters/                    # 入口适配层（GraphQL / HTTP）
├── bootstraps/                  # 多入口启动层
│   ├── api/
│   │   ├── api.module.ts
│   │   └── main.ts
│   └── worker/
│       ├── worker.module.ts
│       └── main.ts
├── core/                        # 领域模型、纯规则、端口接口
├── infrastructure/              # 外部依赖实现（DB、配置、安全等）
├── modules/                     # 同域可复用服务（读写能力承载）
├── usecases/                    # 用例编排层（流程、事务、权限组合）
├── types/                       # 跨层共享类型
└── schema.graphql               # GraphQL schema 生成目标（按配置）
```

### 启动入口

- API 入口：`src/bootstraps/api/main.ts` + `src/bootstraps/api/api.module.ts`
- Worker 入口：`src/bootstraps/worker/main.ts` + `src/bootstraps/worker/worker.module.ts`

### 双启动的设计理念

- **职责隔离**：API 进程只处理请求接入与同步响应；Worker 进程只处理异步消费与重试。
- **运行时策略隔离**：并发、退避、重试、队列监听等 Worker 策略不污染 API 请求链路。
- **部署弹性**：可按流量独立扩缩容 API 与 Worker，避免互相抢占资源。
- **故障隔离**：队列堆积或第三方抖动主要影响 Worker，不直接拖垮 API 对外可用性。
- **边界清晰**：配合分层规则，形成“API 入队 -> Usecase 编排 -> Worker 消费”的稳定协作模型。

### 架构分层与依赖方向

项目采用固定分层，并限制依赖方向（Strict Layered Architecture）：

#### 1. 职责划分

- **`adapters`**: 只做输入解析、权限接入与输出封装。
- **`usecases`**: 负责编排写流程、事务边界与错误映射。
- **`modules(service)`**: 承载同域可复用读写服务，提供 DTO / 只读视图，其中 **Query Service** 负责只读、权限判定与输出规范化。
- **`infrastructure`**: 实现 `core` 端口并对接外部系统，不做业务编排。
- **`core`**: 只保留领域规则、模型、值对象与端口抽象，不依赖任何外部框架。

#### 2. 依赖规则

- **允许**: `adapters → usecases`, `usecases → modules | core`, `modules → infrastructure | core`, `infrastructure → core`
- **禁止**: 反向依赖、跨层跳跃依赖（如 `adapters` 直接调 `infrastructure`）

#### 3. 详细规则

更多细节请参考 `docs/` 下的规则文档：

- [Core Rules](docs/common/core.rules.md)
- [Adapters Rules](docs/api/adapters.rules.md)
- [Usecase Rules](docs/common/usecase.rules.md)
- [Modules Rules](docs/common/modules.rules.md)
- [Query Service Rules](docs/common/queryservice.rules.md)
- [Infrastructure Rules](docs/common/infrastructure.rules.md)
- [Queue Identifiers Rules](docs/common/queue-identifiers.rules.md)
- [AI Task Lifecycle Audit Rules](docs/common/ai-task-lifecycle-audit.rules.md)
- [QM Worker Integration Rules](docs/worker/qm-worker-integration.rules.md)

## 功能概览

### 平台基础能力

- ✅ **GraphQL API**: 统一入口与错误映射
- ✅ **Auth & Security**: JWT 鉴权、角色访问控制 (RBAC)、字段加密、安全签名
- ✅ **Data Access**: 分页 / 排序 / 搜索通用能力、数据库事务支持
- ✅ **Observability**: 结构化日志 (Pino)、配置管理
- ✅ **QM Worker Base**: 统一 AI / Email 队列接入、消费链路与模块装配模式

### 业务域能力

- ✅ **Auth**: 账号密码登录 / 第三方登录集成
- ✅ **Registration**: 邮箱注册流程 / 第三方快捷注册
- ✅ **Identity Management**: 多角色管理 (Coach / Manager / Learner)
- ✅ **Verification**: 验证码生成与验证流程（邀请、重置密码、绑定）
- ✅ **AI Queue & Worker**: 支持 `queueAiGenerate` / `queueAiEmbed` 入队与 provider 路由消费
- ✅ **Async Task Audit**: 支持按 `traceId` / 业务锚点 / 队列任务标识进行调试查询

## 快速开始

### 环境准备

- Node.js >= 18
- MySQL >= 8.0
- npm / yarn / pnpm

### 安装与运行

1. **安装依赖**

   ```bash
   npm install
   ```

2. **配置环境变量**

   ```bash
   cp env/.env.example env/.env.development
   # 编辑 env/.env.development 填入数据库配置
   ```

3. **启动应用**

   ```bash
   # 开发模式
   npm run start:dev

   # 生产模式
   npm run start:prod
   ```

## 开发与测试

### 常用命令

```bash
# 代码格式化
npm run format

# Lint 检查与修复
npm run lint

# TypeScript 类型检查
npm run typecheck
```

### 测试策略

```bash
# 单元测试 (Unit Test)
npm run test:unit

# 端到端测试 (E2E Test)
npm run test:e2e

# 测试覆盖率
npm run test:cov
```

- 真实第三方受控 Smoke 单独放在 `test/99-third-party-live-smoke/`

### 开发约定

- **写操作 (Command)**: 统一在 `usecases` 层编排，处理事务。
- **读操作 (Query)**: 优先在 `modules` 层的 Query Service 实现，高性能且无副作用。
- **外部依赖**: 必须通过 `infrastructure` 实现 `core` 定义的接口，禁止业务层直接依赖 SDK。
- **GraphQL**: 副作用（如 Dataloader 注册）统一在 `src/adapters/graphql/schema.init.ts` 管理。

## API 访问

项目启动后（默认端口 3000）：

- **Playground**: [http://localhost:3000/graphql](http://localhost:3000/graphql)
- **Schema File**: `src/schema.graphql` (自动生成)

## 贡献指南

欢迎参与项目贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: Add some AmazingFeature'`) - 请遵循 Conventional Commits 规范
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 相关资源

- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [Apollo GraphQL](https://www.apollographql.com/docs/apollo-server/)
