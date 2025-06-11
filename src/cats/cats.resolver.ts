import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CatsService } from './cats.service';
import { CreateCatInput } from './dto/create-cat.input';
import { UpdateCatInput } from './dto/update-cat.input';
import { Cat } from './entities/cat.entity';

// 定义 GraphQL Context 的类型接口
interface GraphQLContext {
  req: Request;
  res: Response;
}

@Resolver(() => Cat)
export class CatsResolver {
  constructor(
    @InjectPinoLogger('CatsResolver')
    private readonly logger: PinoLogger,
    private readonly catsService: CatsService,
  ) {}

  @Mutation(() => Cat)
  createCat(@Args('createCatInput') createCatInput: CreateCatInput) {
    return this.catsService.create(createCatInput);
  }

  @Query(() => [Cat], { name: 'cats' })
  findAll() {
    return this.catsService.findAll();
  }

  @Query(() => Cat, { name: 'cat' })
  findOne(@Args('id', { type: () => Int }) id: number, @Context() context: GraphQLContext) {
    // 现在可以安全地访问 req 和 res，并且有完整的类型支持
    const { req } = context;
    this.logger.debug(
      {
        headers: req.headers,
        body: ('body' in req ? req.body : undefined) as unknown, // 明确的类型断言
        url: req.url,
        method: req.method,
      },
      'full',
    );
    return this.catsService.findOne(id);
  }

  @Mutation(() => Cat)
  updateCat(@Args('updateCatInput') updateCatInput: UpdateCatInput) {
    return this.catsService.update(updateCatInput.id, updateCatInput);
  }

  @Mutation(() => Cat)
  removeCat(@Args('id', { type: () => Int }) id: number) {
    return this.catsService.remove(id);
  }
}
