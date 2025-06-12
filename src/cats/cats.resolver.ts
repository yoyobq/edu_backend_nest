import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CatsService } from './cats.service';
import { CreateCatInput } from './dto/create-cat.input';
import { UpdateCatInput } from './dto/update-cat.input';
import { Cat } from './entities/cat.entity';
// 导入 logger 模板工具
import { debugLog, errorLog, logTemplates } from '../utils/logger/templates';

// 定义 GraphQL Context 的类型接口
interface GraphQLContext {
  req: Request;
  res: Response;
}

// 定义 GraphQL 查询的类型接口
interface GraphQLQuery {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
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

    // 测试 debugLog 方法
    debugLog(
      this.logger,
      '使用 debugLog 测试 - 查询单个 Cat',
      {
        id,
        ...logTemplates.requestBody<GraphQLQuery>(req),
      },
      'CatsResolver.findOne',
    );

    // 测试 logTemplates.fullRequest 泛型
    debugLog(
      this.logger,
      '使用 fullRequest 模板测试',
      logTemplates.fullRequest<GraphQLQuery>(req),
      'CatsResolver.findOne.fullRequest',
    );

    // 测试 errorLog 方法（模拟错误场景）
    if (id < 0) {
      errorLog(
        this.logger,
        '使用 errorLog 测试 - 无效的 ID 参数',
        {
          invalidId: id,
          ...logTemplates.minimalRequest(req),
        },
        'CatsResolver.findOne.validation',
      );
    }

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
