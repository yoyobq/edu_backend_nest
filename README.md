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
├── app.module.ts          # 应用主模块
├── main.ts                # 应用入口文件
├── cats/                  # Cats 示例模块
│   ├── cats.module.ts     # Cats 模块定义
│   ├── cats.resolver.ts   # GraphQL 解析器
│   ├── cats.service.ts    # 业务逻辑服务
│   ├── dto/               # 数据传输对象
│   └── entities/          # 数据库实体
├── config/                # 配置模块
│   ├── config.module.ts   # 配置模块定义
│   ├── database.config.ts # 数据库配置
│   ├── graphql.config.ts  # GraphQL 配置
│   ├── logger.config.ts   # 日志配置
│   └── server.config.ts   # 服务器配置
├── logger/                # 日志模块
└── utils/                 # 工具函数
```

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

### 核心模块
- ✅ **配置管理**: 多环境配置支持，类型安全的配置服务
- ✅ **日志系统**: 基于 Pino 的高性能日志记录
- ✅ **数据库集成**: TypeORM + MySQL 8.0，支持连接池和事务
- ✅ **GraphQL API**: Apollo Server 集成，支持订阅和内省

### 示例模块 (Cats)
- ✅ **CRUD 操作**: 完整的增删改查功能
- ✅ **GraphQL 解析器**: 类型安全的 GraphQL API
- ✅ **数据验证**: 输入数据验证和转换
- ✅ **分页查询**: 支持分页和排序
- ✅ **错误处理**: 统一的错误处理机制

## 开发指南

### 添加新模块

1. 使用 NestJS CLI 生成模块：

```bash
nest generate module your-module
nest generate service your-module
nest generate resolver your-module
```

2. 创建实体和 DTO：

```bash
# 在模块目录下创建
mkdir src/your-module/entities
mkdir src/your-module/dto
```

3. 在 `app.module.ts` 中注册新模块

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
