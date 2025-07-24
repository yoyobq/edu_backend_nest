import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CatsService } from './cats.service';
import { CatArgs } from './dto/cat.args';
import { CatDto } from './dto/cat.dto';
import { CatsArgs } from './dto/cats.args';
import { CatsListResponse } from './dto/cats.list';
import { CreateCatInput } from './dto/create-cat.input';
import { CreateCatOutput } from './dto/create-cat.output';
import { DeleteCatInput, DeleteCatResponse } from './dto/delete-cat';
import { UpdateCatInput } from './dto/update-cat.input';

@Resolver()
export class CatsResolver {
  constructor(private readonly catsService: CatsService) {}

  /**
   * 创建新的 Cat
   */
  @Mutation(() => CreateCatOutput, { name: 'createCat', description: '创建新的 Cat' })
  async createCat(
    @Args('createCatInput') createCatInput: CreateCatInput,
  ): Promise<CreateCatOutput> {
    return this.catsService.create(createCatInput);
  }

  /**
   * 更新 Cat
   * 前端传入单参数 UpdateCatInput，内部拆分为 id 和 data
   */
  @Mutation(() => CatDto, { name: 'updateCat', description: '更新指定 ID 的 Cat' })
  async updateCat(@Args('updateCatInput') updateCatInput: UpdateCatInput): Promise<CatDto> {
    // 拆分参数：提取 id 和其余更新数据
    const { id, ...updateData } = updateCatInput;

    // 调用 service 的多参数方法
    return this.catsService.update(id, updateData);
  }

  /**
   * 获取所有 Cat（简单查询）
   */
  @Query(() => [CatDto], { name: 'cats', description: '获取所有 Cat' })
  async findAll(): Promise<CatDto[]> {
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
  @Query(() => CatDto, { name: 'cat', description: '根据 ID 查询 Cat' })
  async findOne(@Args() args: CatArgs): Promise<CatDto> {
    return this.catsService.findOne(args.id);
  }

  /**
   * 删除 Cat
   */
  @Mutation(() => DeleteCatResponse, { name: 'deleteCat', description: '删除指定 ID 的 Cat' })
  async deleteCat(
    @Args('deleteCatInput') deleteCatInput: DeleteCatInput,
  ): Promise<DeleteCatResponse> {
    const result = await this.catsService.remove(deleteCatInput.id);

    return {
      success: result.success,
      message: result.message,
    };
  }
}
