// src/adapters/graphql/identity-management/dto/upgrade-to-coach.result.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * JWT Token 对象（与客户升级复用结构）
 */
@ObjectType({ description: 'JWT Token 对象' })
export class TokensTypeForCoach {
  @Field(() => String, { description: '访问令牌' })
  accessToken!: string;

  @Field(() => String, { description: '刷新令牌' })
  refreshToken!: string;
}

/**
 * 升级为教练的返回结果
 */
@ObjectType({ description: '升级为教练的返回结果' })
export class UpgradeToCoachResult {
  @Field(() => Boolean, { description: '是否成功升级（幂等：已是 Coach 则为 false）' })
  upgraded!: boolean;

  @Field(() => Int, { description: '教练 ID', nullable: true })
  coachId!: number | null;

  @Field(() => [String], { description: '更新后的访问组' })
  accessGroup!: string[];

  @Field(() => IdentityTypeEnum, { description: '用户角色' })
  role!: IdentityTypeEnum;

  @Field(() => TokensTypeForCoach, { description: '新生成的 JWT tokens', nullable: true })
  tokens?: TokensTypeForCoach | null;
}
