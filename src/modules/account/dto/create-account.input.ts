// src/modules/account/dto/create-account.input.ts
import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { AccountStatus, IdentityTypeEnum } from 'src/types/models/account.types';

/**
 * 创建账户输入参数
 */
@InputType()
export class CreateAccountInput {
  @Field(() => String, { description: '登录名', nullable: true })
  @IsOptional()
  @IsString({ message: '登录名必须是字符串' })
  @MinLength(3, { message: '登录名至少 3 个字符' })
  loginName?: string;

  @Field(() => String, { description: '登录邮箱', nullable: true })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  loginEmail?: string;

  @Field(() => String, { description: '登录密码' })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少 6 个字符' })
  loginPassword!: string;

  @Field(() => AccountStatus, { description: '账户状态', defaultValue: AccountStatus.PENDING })
  @IsOptional()
  @IsEnum(AccountStatus, { message: '账户状态无效' })
  status?: AccountStatus = AccountStatus.PENDING;

  @Field(() => [IdentityTypeEnum], { description: '身份类型提示', nullable: true })
  @IsOptional()
  @IsEnum(IdentityTypeEnum, { each: true, message: '身份类型无效' })
  identityHint?: IdentityTypeEnum[];
}
