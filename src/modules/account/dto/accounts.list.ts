// src/modules/account/dto/accounts.list.ts
import { Field, ObjectType } from '@nestjs/graphql';
import { AccountStatus, IdentityTypeEnum } from 'src/types/models/account.types';

/**
 * 账户信息响应对象
 */
@ObjectType()
export class AccountResponse {
  @Field(() => Number, { description: '账户 ID' })
  id!: number;

  @Field(() => String, { description: '登录名', nullable: true })
  loginName!: string | null;

  @Field(() => String, { description: '登录邮箱', nullable: true })
  loginEmail!: string | null;

  @Field(() => AccountStatus, { description: '账户状态' })
  status!: AccountStatus;

  @Field(() => [IdentityTypeEnum], { description: '身份类型提示', nullable: true })
  identityHint!: IdentityTypeEnum[] | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  // 密码和登录历史等敏感信息暂不暴露给前端，稍晚添加 guard 进行限制
}

/**
 * 账户列表响应对象
 */
@ObjectType()
export class AccountsListResponse {
  @Field(() => [AccountResponse], { description: '账户列表' })
  list!: AccountResponse[];

  @Field(() => Number, { description: '当前页码' })
  current!: number;

  @Field(() => Number, { description: '每页数量' })
  pageSize!: number;

  @Field(() => Number, { description: '总数量' })
  total!: number;
}
