import { Field, InputType, Int, PartialType } from '@nestjs/graphql';
import { IsInt, IsPositive } from 'class-validator';
import { CreateCatInput } from './create-cat.input';

/**
 * 更新 Cat 的输入 DTO（包含 ID）
 * 继承 CreateCatInput 并使所有字段可选
 * 适用于单参数风格的 GraphQL Mutation
 * 当前用于对外接口，统一 createCat 和 updateCat 接口风格
 *
 * 使用示例：
 * mutation {
 *   updateCat(input: { id: 1, name: "新名字", status: ACTIVE }) {
 *     id
 *     name
 *     status
 *   }
 * }
 */
@InputType()
export class UpdateCatInput extends PartialType(CreateCatInput) {
  @Field(() => Int, { description: 'Cat 的唯一标识符' })
  @IsInt({ message: 'ID 必须是整数' })
  @IsPositive({ message: 'ID 必须是正整数' })
  id!: number;
}

/**
 * 更新 Cat 数据的输入 DTO（不包含 ID）
 * 继承 CreateCatInput 并使所有字段可选
 * 适用于多参数风格的 GraphQL Mutation，ID 通过单独参数传递
 * 当前用于内部实际的 update 操作，分离 ID 和 data
 *
 * 设计优势：
 * 1. 语义分离：ID 是标识符，data 是实际要更新的数据
 * 2. 参数清晰：updateCat(id: Int!, data: UpdateCatDataInput)
 * 3. 复用性强：可在批量更新、嵌套更新等场景中复用
 * 4. 类型安全：TypeScript 能更好地推断参数类型
 *
 */
@InputType()
export class UpdateCatDataInput extends PartialType(CreateCatInput) {
  // 继承 CreateCatInput 的所有字段，但都是可选的
  // 不包含 id 字段，因为 id 通过单独的参数传递
}
