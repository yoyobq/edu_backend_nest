<!-- /var/www/worker-backend/docs/project-convention/input-field-design.md -->

# 输入 normalize 设计规范（简版）

## 1. 目标

  本规范用于统一项目中的输入收敛方式，在沿用 class-validator + class-transformer +
  ValidationPipe 的前提下，解决以下问题：

  - 相同输入规则散落在 DTO、usecase、service 多处重复实现
  - undefined / null / 空字符串 / 空白字符串 语义不一致
  - trim、列表过滤、枚举校验、limit 收敛缺少统一出口
  - Adapter 层校验与 Usecase 层业务语义边界不清晰

  本规范不追求一次性替换旧代码，采用渐进迁移。

  ———

  ## 2. 基本原则

  - DTO 层负责入口校验与基础转换。
  - Normalize 层负责纯输入收敛，不承担业务编排。
  - Usecase 层负责声明语义、组合 normalize、映射业务错误。
  - Service/Repository 层不新增输入规则，只消费稳定输入。

  一句话原则：

  Adapter 负责拦脏数据，Normalize 负责收敛值，Usecase 负责业务决策。

  ———

  ## 3. 分层边界

  ### Adapter 层

  职责：

  - 接收 HTTP / GraphQL / Queue 外部输入
  - 使用 class-validator 做结构校验
  - 使用 class-transformer 做轻量转换
  - 拒绝明显非法输入

  允许做的事：

  - trim
  - toLowerCase
  - 基础类型转换
  - IsEnum、Min、Max、IsOptional 等声明式校验

  禁止做的事：

  - 唯一性判断
  - 权限判断
  - 数据库查询
  - 按业务场景猜语义
  - 跨字段业务编排

  硬规则：

  - Adapter 只允许做“无语义、可复用、不会影响业务判定”的轻量转换
  - 只要涉及空值策略、列表策略、默认值、错误语义，必须进入 Normalize 层
  - DTO 层只允许无语义轻量转换，不负责把空白字符串转换为 undefined 或 null

  ### Normalize 层

  职责：

  - 对输入值做纯函数收敛
  - 统一空值策略
  - 统一列表策略
  - 统一枚举和值域策略
  - 返回稳定值或统一错误

  禁止做的事：

  - I/O
  - 依赖配置
  - 读取上下文
  - 拼装 DTO
  - 处理权限
  - 处理持久化

  硬规则：

  - Normalize 层是空值策略、列表策略、默认值、错误语义的唯一收口层
  - DTO / Adapter 不得实现会影响业务判定的输入语义收敛

  ### Usecase 层

  职责：

  - 声明字段语义
  - 选择具体 normalize policy
  - 补充业务上下文并透传基础 error_code
  - 做业务规则校验与流程编排

  ———

  ## 4. 统一输入语义

  ### 文本

  - required text：输入必须为字符串；trim 后不能为空
  - optional text：输入可缺省；空白值如何处理必须显式声明
  - normalized text：仅在调用方明确要求时，执行额外收敛，如大小写统一、空白归一

  ### 空值

  必须明确区分：

  - undefined：调用方未提供
  - null：调用方明确提供空值
  - ''：空字符串输入
  - '   '：空白字符串输入

  默认要求：

  - 通用层不得把这四者自动视为同义
  - 每个 normalize 函数必须声明空值策略
  - 未声明时不得隐式选择策略
  - required text 默认拒绝空白
  - optional text 若未显式声明 policy，禁止实现
  - DTO 层不得擅自把空白字符串转成 null
  - DTO 层不得把空白字符串转成 undefined
  - 空白字符串的语义解释一律进入 Normalize 层

  ### 列表

  - 列表元素必须先逐项校验类型
  - 文本列表必须先逐项 trim
  - 空白项必须显式决定是过滤还是报错
  - 去重必须显式开启
  - 去重后顺序保持不变
  - 空列表如何处理必须显式声明

  ### 数字范围

  - 范围收敛必须统一通过 fallback + min + max
  - 不允许在多个 usecase 中手写默认值与 clamp 逻辑

  ———

  ## 5. 推荐的 Normalize 函数集合

  建议仅保留以下稳定基础函数，不设计过大的万能入口：

  - normalizeRequiredText(input)
  - normalizeOptionalText(input, emptyPolicy)
  - normalizeTextList(input, listPolicy)
  - normalizeEnumValue(input, allowed, enumPolicy?)
  - normalizeLimit(input, range)

  `parseInputValue(input: unknown)` 可以作为局部辅助函数存在，但不应成为全局总入口；
  否则容易演变为混合解析、语义、错误映射的万能函数。

  ———

  ## 6. 推荐策略定义

  ### EmptyPolicy

  可选值：

  - to_undefined
  - to_null
  - reject
  - keep_empty_string

  要求：

  - 每个 optional text 函数必须显式传入
  - 不允许默认猜测

  ### ListPolicy

  至少包含：

  - filter_empty: boolean
  - reject_invalid_item: boolean
  - dedupe: boolean
  - empty_result: 'keep' | 'to_undefined' | 'to_null' | 'reject'

  ### LimitRange

  固定结构：

  - fallback
  - min
  - max

  ———

  ## 7. 错误约定

  Normalize 层错误必须统一。

  - 全部抛 DomainError
  - 仅允许使用通用 error_code，不直接绑定具体业务场景错误语义

  项目当前已有统一 `DomainError + error_code` 约定，约束如下：

  - Normalize 层统一抛 DomainError，禁止返回错误对象
  - Usecase 层只补充业务上下文，不二次改写基础错误语义
  - Usecase 层不得改写 Normalize 层产出的通用 error_code
  - Adapter 层不做业务错误编排

  禁止同一函数同时出现：

  - 部分情况返回值
  - 部分情况返回错误对象
  - 部分情况抛异常

  ———

  ## 8. 当前技术栈下的落地方式

  不引入新库，继续使用现有方案：

  - DTO 层继续使用 class-validator
  - DTO 层允许使用 @Transform 做轻量转换（仅限 trim、大小写、基础类型转换）
  - core/common 新增小型 normalize policy 层
  - Usecase 层只调用 normalize policy，不再手写零散 trim()、去重、空值判断、limit 收敛

  适用场景：

  - GraphQL Input DTO
  - Queue Payload 入站校验
  - Usecase 参数收敛
  - Module 内部复用的纯输入收敛函数

  ———

  ## 9. 明确禁止事项

  - 不在 normalize 中做数据库查重
  - 不在 normalize 中做权限判断
  - 不在 normalize 中补业务默认值，除非调用方显式声明
  - 不根据字段名猜语义
  - 不把非法输入“尽量修复后放行”
  - 不在 service 中继续散写 trim、Math.min、数组去重等通用收敛逻辑

  ———

  ## 10. 迁移策略

  - 旧链路保持兼容，不强制回改
  - 新增 usecase 默认接入统一 normalize policy
  - 高频重复规则优先收敛：文本、列表、枚举、limit
  - 迁移一个 usecase，补一组单测
  - 未完成迁移前，禁止继续新增新的手工 normalize 变体
  - 新增代码不得在 usecase / service 手写新的通用 trim、列表过滤、limit clamp
  - 旧逻辑可暂时保留；但一旦修改旧逻辑，优先迁入 normalize policy

  ———

  ## 11. 最小执行标准

  一个新输入字段接入时，必须回答 5 个问题：

  1. 它是 required 还是 optional？
  2. 空白字符串是报错、转 undefined、转 null，还是保留？
  3. 是否需要大小写统一或空白归一？
  4. 如果是列表，空项、重复项、空列表怎么处理？
  5. 如果失败，需要补充哪些业务上下文（不改写通用 error_code）？

  答不清楚，就不要写进通用 normalize。

  ———

  ## 12. 总结

  - 固定 Adapter / Normalize / Usecase 三层边界
  - 把通用输入收敛收口到少量纯函数
  - 统一空值、列表、枚举、limit 的处理策略
  - 阻止规则继续在 usecase 和 service 中扩散
