import { Field, ID, InputType, ObjectType } from '@nestjs/graphql';
import { IsInt, IsPositive } from 'class-validator';

/**
 * 删除 Cat 的输入 DTO
 * 用于 deleteCat mutation，只需要 ID 参数
 * 保持与其他 DTO 的一致性和类型安全
 *
 * 使用示例：
 * mutation {
 *   deleteCat(deleteCatInput: { id: 1 }) {
 *     success
 *     message
 *   }
 * }
 */
@InputType()
export class DeleteCatInput {
  @Field(() => ID, { description: 'Cat 的唯一标识符' })
  @IsInt({ message: 'ID 必须是整数' })
  @IsPositive({ message: 'ID 必须是正整数' })
  id!: number;
}

/**
 * 删除操作的响应 DTO
 * 提供删除操作的结果信息
 * 注意：这里使用 @ObjectType() 而不是 @InputType()
 */
@ObjectType()
export class DeleteCatResponse {
  @Field(() => Boolean, { description: '删除操作是否成功' })
  success!: boolean;

  @Field(() => String, { description: '操作结果消息' })
  message!: string;
}
