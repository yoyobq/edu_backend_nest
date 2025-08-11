// src/modules/register/dto/register.input.ts

import { Field, InputType } from '@nestjs/graphql';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeText, toLowerCase, trimText } from '../../../core/common/text/text.helper';
import { RegisterTypeEnum } from '../../../types/services/register.types';

/**
 * 用户注册输入参数
 */
@InputType()
export class RegisterInput {
  @Field(() => String, { description: '登录名', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => trimText(value))
  @IsString({ message: '登录名必须是字符串' })
  @MinLength(4, { message: '登录名至少 4 个字符' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: '登录名只能包含英文字母、数字、下划线和短横线',
  })
  loginName?: string | null;

  @Field(() => String, { description: '登录邮箱' })
  @Transform(({ value }: TransformFnParams) => toLowerCase(trimText(value)))
  @IsNotEmpty({ message: '邮箱不能为空' })
  @MaxLength(254, { message: '邮箱长度不能超过 254 个字符' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  loginEmail!: string;

  @Field(() => String, { description: '登录密码' })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码至少 8 个字符' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])\S{8,}$/, {
    message: '密码必须包含字母、数字和符号三种字符类型',
  })
  loginPassword!: string;

  @Field(() => String, { description: '昵称', nullable: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => normalizeText(value))
  @IsString({ message: '昵称必须是字符串' })
  @MinLength(2, { message: '昵称至少 2 个字符' })
  @MaxLength(20, { message: '昵称最多 20 个字符' })
  @Matches(/^(?![\p{Script=Han}]{8,})[\p{Script=Han}A-Za-z0-9 _\-\u00B7\u30FB.]{2,20}$/u, {
    message:
      '昵称长度限制：中文最多 7 个汉字，整体长度 2 到 20 个字符；允许中文、英文、数字、空格、下划线 _、短横线 -、中点 ·/・、点 .；不支持 Emoji',
  })
  nickname?: string;

  @Field(() => RegisterTypeEnum, {
    description: '注册类型',
    defaultValue: RegisterTypeEnum.REGISTRANT,
  })
  @IsEnum(RegisterTypeEnum, { message: '注册类型无效' })
  type: RegisterTypeEnum = RegisterTypeEnum.REGISTRANT;
}
