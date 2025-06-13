// src/cats/dto/cats.args.ts
import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CatStatus } from '../entities/cat.entity';

/**
 * Cat 查询参数
 * 支持筛选、分页、排序功能
 */
@ArgsType()
export class CatsArgs {
  // === 筛选条件 ===
  @Field(() => String, { description: '按名称搜索（模糊匹配）', nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field(() => CatStatus, { description: '按状态筛选', nullable: true })
  @IsOptional()
  @IsEnum(CatStatus)
  status?: CatStatus;

  @Field(() => [CatStatus], { description: '按多个状态筛选', nullable: true })
  @IsOptional()
  @IsEnum(CatStatus, { each: true })
  statuses?: CatStatus[];

  @Field(() => Date, { description: '创建时间起始', nullable: true })
  @IsOptional()
  createdAfter?: Date;

  @Field(() => Date, { description: '创建时间结束', nullable: true })
  @IsOptional()
  createdBefore?: Date;

  // === 分页参数 ===
  @Field(() => Int, { description: '页码（从 1 开始）', defaultValue: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @Field(() => Int, { description: '每页数量', defaultValue: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  // === 排序参数 ===
  @Field(() => String, { description: '排序字段', defaultValue: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy: string = 'createdAt';

  @Field(() => String, { description: '排序方向', defaultValue: 'DESC' })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}
