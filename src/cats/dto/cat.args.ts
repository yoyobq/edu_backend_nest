import { ArgsType, Field, ID } from '@nestjs/graphql';
import { IsInt, IsPositive } from 'class-validator';

/**
 * 获取单个 Cat 的参数类
 * 专门用于 findOne 查询，保持职责单一
 */
@ArgsType()
export class CatArgs {
  @Field(() => ID, {
    description: 'Cat 的唯一标识符',
  })
  @IsInt({ message: 'ID 必须是整数' })
  @IsPositive({ message: 'ID 必须是正整数' })
  id!: number;
}
