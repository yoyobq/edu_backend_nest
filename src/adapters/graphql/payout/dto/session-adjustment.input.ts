// 文件位置：src/adapters/graphql/payout/dto/session-adjustment.input.ts
import { Field, InputType } from '@nestjs/graphql';
import { PaginationArgs, SortInput } from '@src/adapters/graphql/pagination.args';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

/**
 * 课次调整记录的搜索与分页输入
 * - 承载文本搜索、过滤与排序/分页
 */
@InputType({ description: '搜索与分页课次调整记录输入' })
export class SearchSessionAdjustmentsInputGql {
  @Field(() => String, {
    nullable: true,
    description:
      '文本搜索：支持 customerId/operatorAccountId（数字）与 reasonType/orderRef（文本）',
  })
  @IsOptional()
  @IsString()
  query?: string;

  @Field(() => PaginationArgs, { description: '分页参数（支持 OFFSET/CURSOR）' })
  @ValidateNested()
  @Type(() => PaginationArgs)
  pagination!: PaginationArgs;

  @Field(() => [SortInput], {
    nullable: true,
    description: '排序字段列表（如 createdAt/id/orderRef）',
  })
  @IsOptional()
  sorts?: SortInput[];

  @Field(() => Number, { nullable: true, description: '客户 ID 精确过滤' })
  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;

  @Field(() => String, { nullable: true, description: '原因类型（枚举字符串）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  reasonType?: string;

  @Field(() => Number, { nullable: true, description: '操作者账号 ID 精确过滤' })
  @IsOptional()
  @IsInt()
  @Min(1)
  operatorAccountId?: number;

  @Field(() => String, { nullable: true, description: '订单号精确过滤（≤ 64 字符）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderRef?: string;
}
