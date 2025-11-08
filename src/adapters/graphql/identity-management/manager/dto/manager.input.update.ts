// src/adapters/graphql/identity-management/manager/dto/manager.input.update.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 更新经理信息的 GraphQL 输入参数
 */
@InputType()
export class UpdateManagerInput {
  @Field(() => Int, { nullable: true, description: '经理 ID（不填表示更新自己）' })
  @IsOptional()
  @IsInt({ message: '经理 ID 必须是整数' })
  @Min(1, { message: '经理 ID 必须大于 0' })
  managerId?: number;

  @Field(() => String, { nullable: true, description: '经理姓名' })
  @IsOptional()
  @IsString({ message: '经理姓名必须是字符串' })
  @MaxLength(64, { message: '经理姓名长度不能超过 64' })
  name?: string;

  @Field(() => String, { nullable: true, description: '备注信息（不对外展示）' })
  @IsOptional()
  @IsString({ message: '备注信息必须是字符串' })
  @MaxLength(255, { message: '备注信息长度不能超过 255' })
  remark?: string | null;
}
