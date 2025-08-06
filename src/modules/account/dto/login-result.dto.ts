// src/modules/account/dto/login-result.dto.ts

import { Field, ID, ObjectType } from '@nestjs/graphql';
import { IdentityTypeEnum } from '../../../types/models/account.types';
import { IdentityUnion, IdentityUnionType } from './identity/identity-union.type';

/**
 * 登录成功结果，失败由 Graphql 直接抛错
 */
@ObjectType({ description: '登录结果' })
export class LoginResult {
  @Field(() => String, { description: '访问令牌' })
  accessToken!: string;

  @Field(() => String, { description: '刷新令牌' })
  refreshToken!: string;

  @Field(() => ID, { description: '用户 ID' })
  accountId!: number;

  @Field(() => IdentityTypeEnum, { description: '用户默认角色' })
  role!: IdentityTypeEnum;

  @Field(() => IdentityUnion, { nullable: true, description: '当前身份信息' })
  identity?: IdentityUnionType;
}
