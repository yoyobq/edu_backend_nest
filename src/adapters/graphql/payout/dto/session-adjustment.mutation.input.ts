// 文件位置：src/adapters/graphql/payout/dto/session-adjustment.mutation.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 创建课次调整记录的输入
 */
@InputType({ description: '创建课次调整记录输入' })
export class CreateSessionAdjustmentInputGql {
  @Field(() => Int, { description: '客户 ID' })
  @IsInt()
  @Min(1)
  customerId!: number;

  @Field(() => Number, { description: '本次课次变动数' })
  @Type(() => Number)
  @IsNumber()
  deltaSessions!: number;

  @Field(() => Number, { description: '变动前剩余课次' })
  @Type(() => Number)
  @IsNumber()
  beforeSessions!: number;

  @Field(() => Number, { description: '变动后剩余课次' })
  @Type(() => Number)
  @IsNumber()
  afterSessions!: number;

  @Field(() => String, { description: '调整原因类型' })
  @IsString()
  @MaxLength(32)
  reasonType!: string;

  @Field(() => String, { nullable: true, description: '原因备注（≤ 255 字符）' })
  @IsOptional()
  @MaxLength(255)
  reasonNote?: string | null;

  @Field(() => Int, { nullable: true, description: '操作者账号 ID（默认当前账户）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  operatorAccountId?: number | null;

  @Field(() => String, { nullable: true, description: '关联订单号（≤ 64 字符）' })
  @IsOptional()
  @MaxLength(64)
  orderRef?: string | null;
}

/**
 * 更新课次调整记录的输入
 */
@InputType({ description: '更新课次调整记录输入' })
export class UpdateSessionAdjustmentInputGql {
  @Field(() => Int, { description: '记录 ID' })
  @IsInt()
  @Min(1)
  id!: number;

  @Field(() => Number, { nullable: true, description: '本次课次变动数' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deltaSessions?: number;

  @Field(() => Number, { nullable: true, description: '变动前剩余课次' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  beforeSessions?: number;

  @Field(() => Number, { nullable: true, description: '变动后剩余课次' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  afterSessions?: number;

  @Field(() => String, { nullable: true, description: '调整原因类型' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  reasonType?: string;

  @Field(() => String, { nullable: true, description: '原因备注（≤ 255 字符）' })
  @IsOptional()
  @MaxLength(255)
  reasonNote?: string | null;

  @Field(() => Int, { nullable: true, description: '操作者账号 ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  operatorAccountId?: number | null;

  @Field(() => String, { nullable: true, description: '关联订单号（≤ 64 字符）' })
  @IsOptional()
  @MaxLength(64)
  orderRef?: string | null;
}
