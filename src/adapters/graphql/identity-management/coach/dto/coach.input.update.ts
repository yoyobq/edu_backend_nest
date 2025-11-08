// src/adapters/graphql/identity-management/coach/dto/coach.input.update.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 更新教练信息的 GraphQL 输入参数
 */
@InputType()
export class UpdateCoachInput {
  @Field(() => Int, { nullable: true, description: '教练 ID（仅 manager 需要指定）' })
  @IsOptional()
  @IsInt({ message: '教练 ID 必须是整数' })
  @Min(1, { message: '教练 ID 必须大于 0' })
  coachId?: number;

  @Field(() => String, { nullable: true, description: '教练姓名' })
  @IsOptional()
  @IsString({ message: '教练姓名必须是字符串' })
  @MaxLength(64, { message: '教练姓名长度不能超过 64' })
  name?: string;

  @Field(() => Int, { nullable: true, description: '教练等级（仅 manager 可更新）' })
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
}
