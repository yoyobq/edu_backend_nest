import { Args, Query, Resolver } from '@nestjs/graphql';
import { CatsService } from './cats.service';
import { GetCatArgs } from './dto/cat.args';
import { Cat } from './entities/cat.entity';

@Resolver(() => Cat)
export class CatsResolver {
  constructor(private readonly catsService: CatsService) {}

  /**
   * 根据 ID 查询单个 Cat
   * 使用专门的 GetCatArgs DTO 进行参数验证和类型定义
   *
   * @param getCatArgs - 包含 Cat ID 的参数对象
   * @returns Promise<Cat> - 返回找到的 Cat 实体
   * @throws NotFoundException - 当指定 ID 的 Cat 不存在时抛出
   *
   * GraphQL 查询示例：
   * ```graphql
   * query {
   *   cat(id: 1) {
   *     id
   *     name
   *     status
   *     createdAt
   *     updatedAt
   *   }
   * }
   * ```
   */
  @Query(() => Cat, { name: 'cat' })
  async findOne(@Args() getCatArgs: GetCatArgs): Promise<Cat> {
    // 使用 DTO 中验证过的 ID 参数
    return this.catsService.findOne(getCatArgs.id);
  }
}
