// src/adapters/graphql/identity-management/dto/upgrade-to-customer.input.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 升级为客户的输入参数
 */
@InputType({ description: '升级为客户的输入参数' })
export class UpgradeToCustomerInput {
  @Field(() => String, { description: '客户姓名' })
  @IsNotEmpty({ message: '客户姓名不能为空' })
  @IsString({ message: '客户姓名必须是字符串' })
  @MaxLength(64, { message: '客户姓名长度不能超过 64 个字符' })
  name!: string;

  @Field(() => String, { nullable: true, description: '备用联系电话' })
  @IsOptional()
  @IsString({ message: '联系电话必须是字符串' })
  @MaxLength(20, { message: '联系电话长度不能超过 20 个字符' })
  contactPhone?: string;

  @Field(() => String, { nullable: true, description: '联络偏好时间，例：晚上/周末' })
  @IsOptional()
  @IsString({ message: '联络偏好时间必须是字符串' })
  @MaxLength(50, { message: '联络偏好时间长度不能超过 50 个字符' })
  preferredContactTime?: string;

  @Field(() => String, { nullable: true, description: '内部备注' })
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  @MaxLength(255, { message: '备注长度不能超过 255 个字符' })
  remark?: string;

  @Field(() => AudienceTypeEnum, { description: '客户端类型' })
  @IsEnum(AudienceTypeEnum, { message: 'audience 必须是有效的客户端类型' })
  audience!: AudienceTypeEnum;
}
