// src/adapters/graphql/account/dto/reset-password.dto.ts

import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * 重置密码输入参数
 */
@InputType()
export class ResetPasswordInput {
  @Field(() => String, { description: '验证 token' })
  @IsNotEmpty({ message: '验证 token 不能为空' })
  @IsString({ message: '验证 token 必须是字符串' })
  token!: string;

  @Field(() => String, { description: '新密码' })
  @IsNotEmpty({ message: '新密码不能为空' })
  @IsString({ message: '新密码必须是字符串' })
  @MinLength(6, { message: '密码长度至少为 6 位' })
  newPassword!: string;
}

/**
 * 重置密码结果
 */
@ObjectType()
export class ResetPasswordResult {
  @Field(() => Boolean, { description: '是否成功' })
  success!: boolean;

  @Field(() => String, { nullable: true, description: '消息' })
  message?: string;

  @Field(() => Number, { nullable: true, description: '重置密码的账户 ID' })
  accountId?: number;
}
