// src/modules/auth/dto/auth-login-result.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 用户登录结果
 */
@ObjectType({ description: '用户登录结果' })
export class AuthLoginResult {
  @Field(() => Boolean, { description: '是否登录成功' })
  success!: boolean;

  @Field(() => String, { nullable: true, description: '错误信息，登录失败时返回' })
  errorMessage?: string;

  @Field(() => String, { nullable: true, description: '登录成功时返回的 JWT token' })
  token?: string;

  @Field(() => Int, { nullable: true, description: '用户 ID，登录成功时返回' })
  userId?: number;
}
