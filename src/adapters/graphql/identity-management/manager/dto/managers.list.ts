// src/adapters/graphql/identity-management/manager/dto/managers.list.ts
import { Field, ObjectType } from '@nestjs/graphql';
import { ManagerType } from '@src/adapters/graphql/account/dto/identity/manager.dto';
import { PaginationInfo } from '@src/adapters/graphql/identity-management/learner/dto/learners.list';

/**
 * GraphQL 输出：经理列表分页结果
 *
 * 输出说明：
 * - `managers`：标准字段，推荐使用。
 * - `data`：兼容旧字段，语义上等价于 `managers`。在 Resolver 中会同步赋值为相同列表，保留用于向后兼容，后续可按计划移除。
 * - `pagination`：分页信息结构，仅承载页码、总数与是否有前后页，不包含查询构建与游标逻辑。
 */
@ObjectType()
export class ListManagersOutput {
  /** 经理列表（新字段，建议使用） */
  @Field(() => [ManagerType], { description: '经理列表' })
  managers!: ManagerType[];

  /** 兼容旧字段（如需统一命名，可后续移除） */
  @Field(() => [ManagerType], {
    description: '经理列表（兼容字段）',
    deprecationReason: '请改用 managers 字段',
  })
  data!: ManagerType[];

  @Field(() => PaginationInfo, { description: '分页信息' })
  pagination!: PaginationInfo;
}
