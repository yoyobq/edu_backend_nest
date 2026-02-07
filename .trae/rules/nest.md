这是基于 Nest 的 TS 项目，代码输出应符合 TS 的 ESLint 规范，不要随意移除现有注释，数据类型禁止定义 any 类型，
项目里 adapters 只是入口适配，usecases 负责编排，modules(service) 提供同域可复用读/写服务并承接 DI，infrastructure 承载外部依赖的具体实现，core 只放抽象与纯规则
依赖方向允许 adapters → usecases；usecases → modules(service) | core；modules(service) → infrastructure | core；infrastructure → core
依赖方向禁止 adapters → modules(service)/infrastructure，usecases → infrastructure，任意层 → adapters
定义 usecase 时：写（C/U/D）一律在 usecases；纯读放在 modules/_/_.service 便于复用；一旦跨域（跨 module 的读或写）立即提升为 usecase。
src/core/common/errors/domain-error 是所有自定义错误的映射表，业务抛错应该在里面找到或自定义对应的 error_code
禁止在 DTO/Resolver 里做副作用注册，统一走 schema.init.ts（建议位于 src/adapters/graphql/schema.init.ts）
usecases 层仅依赖 core 的端口与模型；需要使用外部实现时通过 modules(service) 的 DI 间接注入，不直接依赖 infrastructure
core 只允许定义领域模型/值对象/纯函数与端口接口，禁止引入或依赖任何框架/SDK/驱动，中不得出现 I/O、副作用或进程级状态
infrastructure 仅负责实现 core 定义的端口接口并对接外部依赖，不得编写业务规则或用例编排；不得被 adapters 或 usecases 直接依赖具体实现，只能通过 modules(service) 进行 DI 绑定与暴露
ORM 实体只在 modules(service) 内部使用；对上游（usecases/adapters）暴露的是 DTO/只读模型。禁止在适配层直接返回 ORM 实体或 QueryBuilder
所有外部依赖的配置/密钥经配置模块注入（如 ConfigService），禁止硬编码在 infrastructure 实现或 usecases 中；core 不得读取配置
事务由 usecases 定义与开启；modules(service) 提供细粒度方法由 usecase 编排到同一事务上下文内。禁止在 modules(service) 各自开启跨域事务
如果一个用例只在单一 bounded context 内操作同库数据、没有任何对外系统调用，并且失败后可以通过用户重试弥补，那么只用本地事务，不引入 outbox。可参考本项目的 Account 域。
一旦某个用例涉及跨聚合/跨 bounded context 的流程，或者需要调用外部系统（MQ、邮件、微信、其它服务）、做异步/延迟处理，或必须保证“幂等 + 可重试”的可靠投递，就应当采用 outbox：在本地事务中先记录事件，再由异步 worker 对外扩散，本项目中 course 中的 workflow 模块默认按此设计。
