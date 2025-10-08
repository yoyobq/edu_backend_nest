// src/adapters/graphql/identity-management/dto/upgrade-to-customer.result.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';
// 导入枚举注册文件以确保 GraphQL 类型系统正确识别枚举
import '@src/adapters/graphql/account/enums/identity-type.enum';

/**
 * JWT Token 对象
 */
@ObjectType({ description: 'JWT Token 对象' })
export class TokensType {
  @Field(() => String, { description: '访问令牌' })
  accessToken!: string;

  @Field(() => String, { description: '刷新令牌' })
  refreshToken!: string;
}

/**
 * 升级为客户的返回结果
 */
@ObjectType({ description: '升级为客户的返回结果' })
export class UpgradeToCustomerResult {
  @Field(() => Boolean, { description: '是否成功升级（幂等：已是 Customer 则为 false）' })
  upgraded!: boolean;

  @Field(() => Int, { description: '客户 ID', nullable: true })
  customerId!: number | null;

  @Field(() => [String], { description: '更新后的访问组' })
  accessGroup!: string[];

  @Field(() => IdentityTypeEnum, { description: '用户角色' })
  role!: IdentityTypeEnum;

  @Field(() => TokensType, { description: '新生成的 JWT tokens', nullable: true })
  tokens?: TokensType | null;
}
