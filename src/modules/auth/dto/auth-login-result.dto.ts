// src/modules/auth/dto/auth-login-result.dto.ts

import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * 用户登录结果
 */
@ObjectType({ description: '用户登录结果' })
export class AuthLoginResult {
  @Field(() => String, { description: '登录成功时返回的 access token' })
  accessToken!: string;

  @Field(() => String, { description: '登录成功时返回的 refresh token' })
  refreshToken!: string;

  @Field(() => ID, { description: '用户 ID' })
  userId!: number;
}
