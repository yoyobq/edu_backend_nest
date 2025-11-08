// src/adapters/graphql/identity-management/dto/upgrade-to-coach.input.ts
import { AudienceTypeEnum } from '@app-types/models/account.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 升级为教练的输入参数
 */
@InputType({ description: '升级为教练的输入参数' })
export class UpgradeToCoachInput {
  @Field(() => String, { description: '教练姓名' })
  @IsNotEmpty({ message: '教练姓名不能为空' })
  @IsString({ message: '教练姓名必须是字符串' })
  @MaxLength(64, { message: '教练姓名长度不能超过 64 个字符' })
  name!: string;

  @Field(() => Int, { nullable: true, description: '教练等级（1-3），默认 1' })
  @IsOptional()
  @IsInt({ message: '教练等级必须是整数' })
  @Min(1, { message: '教练等级必须在 1-3 之间' })
  level?: number;

  @Field(() => String, { nullable: true, description: '简介/推介' })
  @IsOptional()
  @IsString({ message: '简介必须是字符串' })
  @MaxLength(2000, { message: '简介长度不能超过 2000' })
  description?: string | null;

  @Field(() => String, { nullable: true, description: '头像 URL' })
  @IsOptional()
  @IsString({ message: '头像 URL 必须是字符串' })
  @MaxLength(255, { message: '头像 URL 长度不能超过 255' })
  avatarUrl?: string | null;

  @Field(() => String, { nullable: true, description: '教练专长' })
  @IsOptional()
  @IsString({ message: '教练专长必须是字符串' })
  @MaxLength(100, { message: '教练专长长度不能超过 100' })
  specialty?: string | null;

  @Field(() => String, { nullable: true, description: '备注' })
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  @MaxLength(255, { message: '备注长度不能超过 255' })
  remark?: string | null;

  @Field(() => AudienceTypeEnum, { description: '客户端类型' })
  @IsEnum(AudienceTypeEnum, { message: 'audience 必须是有效的客户端类型' })
  audience!: AudienceTypeEnum;
}
