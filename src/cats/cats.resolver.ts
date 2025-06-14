// src/cats/cats.resolver.ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CatsService } from './cats.service';
import { CatArgs } from './dto/cat.args';
import { CatsArgs } from './dto/cats.args';
import { CreateCatInput } from './dto/create-cat.input'; // 添加导入
import { CatsListResponse } from './dto/cats.list';
import { Cat } from './entities/cat.entity';

@Resolver(() => Cat)
export class CatsResolver {
  constructor(private readonly catsService: CatsService) {}

  /**
   * 创建新的 Cat
   */
  @Mutation(() => Cat, { name: 'createCat', description: '创建新的 Cat' })
  async createCat(@Args('createCatInput') createCatInput: CreateCatInput): Promise<Cat> {
    return this.catsService.create(createCatInput);
  }

  /**
   * 获取所有 Cat（简单查询）
   */
  @Query(() => [Cat], { name: 'cats', description: '获取所有 Cat' })
  async findAll(): Promise<Cat[]> {
    return this.catsService.findAll();
  }

  /**
   * 分页查询 Cat（复杂查询）
   */
  @Query(() => CatsListResponse, { name: 'searchCats', description: '分页查询 Cat' })
  async searchCats(@Args() args: CatsArgs): Promise<CatsListResponse> {
    // 并行查询数据和总数
    const [cats, total] = await Promise.all([
      this.catsService.findMany(args),
      this.catsService.countMany(args),
    ]);

    const response = new CatsListResponse();
    response.cats = cats;
    response.total = total;
    response.page = args.page;
    response.limit = args.limit;

    return response;
  }

  /**
   * 根据 ID 查询单个 Cat
   */
  @Query(() => Cat, { name: 'cat', description: '根据 ID 查询 Cat' })
  async findOne(@Args() args: CatArgs): Promise<Cat> {
    return this.catsService.findOne(args.id);
  }
}
