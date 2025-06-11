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
    const { req } = context;
    const body: unknown = 'body' in req && req.body ? req.body : undefined;
    this.logger.debug(
      {
        // headers: req.headers,
        body: body,
        url: req.url,
        // method: req.method,
      },
      'debug 详细信息演示',
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
