import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CatStatus } from '../entities/cat.entity';

/**
 * 创建 Cat 的输入 DTO
 * 用于测试 TypeORM 的创建功能
 */
@InputType()
export class CreateCatInput {
  @Field(() => String, {
    description: 'Cat 的名称',
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: '名称必须是字符串' })
  @MaxLength(100, { message: '名称长度不能超过 100 个字符' })
  name?: string;

  @Field(() => CatStatus, {
    description: 'Cat 的状态',
    defaultValue: CatStatus.ACTIVE,
  })
  @IsEnum(CatStatus, { message: '状态必须是有效的 CatStatus 枚举值' })
  status: CatStatus = CatStatus.ACTIVE;
}
