// src/modules/auth/dto/auth.args.ts

import { ArgsType, Field } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LoginTypeEnum } from 'src/types/models/account.types';

/**
 * 用户登录参数
 */
@ArgsType()
export class AuthLoginArgs {
  @Field(() => String, { description: '登录名或邮箱' })
  @IsString({ message: '登录名必须是字符串' })
  @IsNotEmpty({ message: '登录名不能为空' })
  loginName!: string;

  @Field(() => String, { description: '登录密码' })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  loginPassword!: string;

  @Field(() => String, { description: '登录类型', nullable: true })
  @IsOptional()
  @IsEnum(LoginTypeEnum, { message: '登录类型无效' })
  type?: LoginTypeEnum;

  @Field(() => String, { description: '客户端 IP 地址', nullable: true })
  @IsOptional()
  @IsString({ message: 'IP 地址必须是字符串' })
  ip?: string;

  @Field(() => String, { description: '客户端类型', nullable: true })
  @IsOptional()
  @IsString({ message: '客户端类型是字符串' })
  audience?: string;
}
