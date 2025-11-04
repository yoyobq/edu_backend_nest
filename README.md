<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">基于 <a href="http://nestjs.com/" target="_blank">NestJS</a> 框架构建的现代化后端 API 服务</p>
<p align="center">
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
</p>

## 项目简介

这是一个基于 [NestJS](https://github.com/nestjs/nest) 框架的 TypeScript 后端项目，集成了 GraphQL API、MySQL 数据库和现代化的日志系统。

## 技术栈

- **框架**: NestJS (Node.js)
- **语言**: TypeScript
- **数据库**: MySQL 8.0
- **ORM**: TypeORM
- **API**: GraphQL (Apollo Server)
- **日志**: Pino Logger
- **配置管理**: @nestjs/config
- **数据验证**: class-validator + class-transformer

## 项目结构

```
src/
├── adapters/                    # 适配层： GraphQL / HTTP 入口
│   ├── graphql/
│   └── http/
├── app.module.ts                # 应用主模块
├── core/                        # 纯规则与端口接口（无 I/O）
│   ├── common/
│   ├── config/
│   ├── database/
│   ├── field-encryption/
│   ├── graphql/
│   ├── jwt/
│   ├── logger/
│   ├── middleware/
│   ├── pagination/
│   ├── search/
│   ├── security/
│   └── sort/
├── infrastructure/              # 外部依赖具体实现（仅实现端口）
│   ├── mail/
│   ├── security/
│   └── typeorm/
├── main.ts                      # 应用入口
├── modules/                     # 领域模块服务（对内复用的读/写服务）
│   ├── account/
│   ├── auth/
│   ├── common/
│   ├── course-catalogs/
│   ├── identity-management/
│   ├── register/
│   ├── student/
│   ├── third-party-auth/
│   └── verification-record/
├── plugins/
├── shared/
├── types/                       # 类型与模型定义
│   ├── auth/
│   ├── common/
│   ├── errors/
│   ├── gql/
│   ├── jwt.types.ts
│   ├── models/
│   ├── response.types.ts
│   └── services/
├── usecases/                    # 用例编排（跨域读写与事务）
│   ├── account/
│   ├── auth/
│   ├── course-catalogs/
│   ├── identity-management/
│   ├── registration/
│   ├── third-party-accounts/
│   └── verification/
└── utils/                       # 工具与测试辅助
    ├── logger/
    └── test/
test/
├── 00-app/
├── 01-auth/
├── 02-register/
├── 03-roles-guard/
├── 04-course/
├── 05-verification-record/
├── 06-identity-management/
├── 07-pagination-sort-search/
└── ...

env/
└── .env.example
```

## 架构分层与依赖方向

为保持可维护性与安全性，项目采用分层架构并严格限定依赖方向：

- 分层职责：
  - `adapters`：作为入口适配，仅做输入输出适配与解析，不含业务规则。
  - `usecases`：负责编排业务用例，执行写操作（创建/更新/删除），定义并开启事务；跨域读/写一律在此提升为用例。
  - `modules (service)`：同域内可复用的读/写服务，暴露 DTO/只读模型，内部可使用 ORM 实体；通过 DI 承接 `infrastructure` 实现。
  - `infrastructure`：实现 `core` 端口并对接外部依赖（数据库、邮件等），不编排业务规则。
  - `core`：只放领域模型/值对象/端口接口与纯函数，不引入或依赖任何框架/驱动；不得出现 I/O 或副作用。

- 允许的依赖方向：
  - `adapters → usecases`
  - `usecases → modules (service) | core`
  - `modules (service) → infrastructure | core`
  - `infrastructure → core`

- 禁止的依赖方向：
  - `adapters → modules (service) / infrastructure`
  - `usecases → infrastructure`
  - `任意层 → adapters`

- 其他关键约束：
  - 纯读操作尽量放在 `modules/_/_.service`，便于复用；写操作（创建/更新/删除）统一在 `usecases`。
  - ORM 实体仅在 `modules (service)` 内部使用；对上游暴露的是 DTO/只读模型。
  - 所有外部依赖的配置/密钥通过配置模块注入（如 `ConfigService`），禁止硬编码在 `infrastructure` 或 `usecases`；`core` 不得读取配置。
  - 事务由 `usecases` 定义与开启；`modules (service)` 提供细粒度方法，由用例编排到同一事务上下文内，禁止在各模块各自开启跨域事务。

## 环境配置

1. 复制环境变量配置文件：

```bash
cp env/.env.example env/.env.development
```

2. 配置数据库连接信息：

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_username
DB_PASS=your_password
DB_NAME=your_database
DB_TIMEZONE=+08:00
DB_SYNCHRONIZE=false
DB_LOGGING=true
DB_POOL_SIZE=10

# 服务器配置
SERVER_HOST=127.0.0.1
SERVER_PORT=3000

# 环境变量
NODE_ENV=development
```

## 项目安装

```bash
# 安装依赖
$ npm install
```

## 运行项目

```bash
# 开发模式
$ npm run dev
# 或
$ npm run start:dev

# 生产模式
$ npm run start:prod

# 调试模式
$ npm run start:debug
```

## 测试

```bash
# 单元测试
$ npm run test

# 端到端测试
$ npm run test:e2e

# 测试覆盖率
$ npm run test:cov

# 监听模式测试
$ npm run test:watch
```

## 代码质量

```bash
# 代码格式化
$ npm run format

# 代码检查和修复
$ npm run lint
```

## API 文档

项目启动后，可以通过以下地址访问：

- **GraphQL Playground**: `http://localhost:3000/graphql` (开发环境)
- **GraphQL Schema**: 自动生成在 `src/schema.graphql`

## 已实现功能

### 平台能力

- ✅ 配置管理：多环境配置支持，类型安全的配置服务
- ✅ 日志系统：基于 Pino 的高性能日志记录
- ✅ 数据库集成：TypeORM + MySQL 8.0，支持连接池与事务
- ✅ GraphQL API：Apollo Server 集成，支持订阅与内省
- ✅ 分页 / 排序 / 搜索：统一解析器与服务，防注入、稳定翻页
- ✅ 安全与鉴权：JWT、角色守卫、字段加密（ Field Encryption ）

### 业务模块

- ✅ 账户与身份管理（ Account / Identity Management ）
- ✅ 用户注册（ Register ）
- ✅ 第三方认证（ Third-Party Auth / Accounts ）
- ✅ 验证记录（ Verification Record ）

## 开发指南

### 新增模块流程（遵循分层与依赖方向）

- 在 `core` 定义领域模型 / 值对象与端口接口，保持纯函数与零副作用。
- 在 `infrastructure` 实现端口并对接外部依赖；禁止编排业务规则。
- 在 `modules (service)` 绑定 DI 并提供同域可复用的读 / 写服务，对上游暴露 DTO / 只读模型。
- 在 `usecases` 编排跨域读写与事务，写操作（ C / U / D ）一律在此层进行。
- 在 `adapters` 注册 GraphQL / HTTP 入口，避免副作用注册，统一走 `src/adapters/graphql/schema.init.ts`。
- 排序与分页：绑定实体专用 `SortResolver` 白名单映射；`CURSOR` 模式优先使用 `PaginationService`；`OFFSET` 模式补稳定副键（如 `id`）。
- 测试：在 `test/` 增加端到端用例覆盖排序、分页与权限流程。

### 数据库迁移

```bash
# 生成迁移文件
npm run typeorm:migration:generate -- -n MigrationName

# 运行迁移
npm run typeorm:migration:run

# 回滚迁移
npm run typeorm:migration:revert
```

## 部署

### 构建项目

```bash
$ npm run build
```

### 生产环境运行

```bash
$ npm run start:prod
```

## 相关资源

- [NestJS 官方文档](https://docs.nestjs.com)
- [TypeORM 文档](https://typeorm.io)
- [GraphQL 文档](https://graphql.org/learn/)
- [Apollo Server 文档](https://www.apollographql.com/docs/apollo-server/)

## 支持

如果您在使用过程中遇到问题，请：

1. 查看 [NestJS 官方文档](https://docs.nestjs.com)
2. 访问 [NestJS Discord 社区](https://discord.gg/G7Qnnhy)
3. 提交 Issue 到项目仓库

## 许可证

本项目采用 MIT 许可证。
