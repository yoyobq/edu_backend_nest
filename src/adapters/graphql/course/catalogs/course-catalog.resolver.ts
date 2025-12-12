// src/adapters/graphql/course/catalogs/course-catalog.resolver.ts
// 课程目录 GraphQL Resolver（迁移自 src/adapters/graphql/course-catalogs/course-catalog.resolver.ts）
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import type { CourseLevel } from '@app-types/models/course.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CreateCatalogUsecase } from '@src/usecases/course/catalogs/create-catalog.usecase';
import { DeactivateCatalogUsecase } from '@src/usecases/course/catalogs/deactivate-catalog.usecase';
import { GetCatalogByLevelUsecase } from '@src/usecases/course/catalogs/get-catalog-by-level.usecase';
import { ListCatalogsUsecase } from '@src/usecases/course/catalogs/list-catalogs.usecase';
import { ReactivateCatalogUsecase } from '@src/usecases/course/catalogs/reactivate-catalog.usecase';
import { UpdateCatalogDetailsUsecase } from '@src/usecases/course/catalogs/update-catalog-details.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CourseCatalogDTO } from './dto/course-catalog.dto';
import {
  CreateCatalogInput,
  DeactivateCatalogInput,
  GetCatalogByLevelInput,
  ReactivateCatalogInput,
  UpdateCatalogDetailsInput,
} from './dto/course-catalog.input';
import {
  CourseCatalogsListResult,
  CreateCatalogResult,
  DeactivateCatalogResult,
  ReactivateCatalogResult,
  UpdateCatalogDetailsResult,
} from './dto/course-catalog.result';

// 为了避免不安全的 any/unknown 访问，定义映射所需的最小字段约束
interface CatalogLike {
  readonly id: number;
  readonly courseLevel: CourseLevel;
  readonly title: string;
  readonly description?: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deactivatedAt?: Date | null;
  readonly createdBy?: number | null;
  readonly updatedBy?: number | null;
}

/**
 * 将领域模型映射为 GraphQL DTO
 * @param model 领域模型（满足 CatalogLike 字段约束）
 * @returns GraphQL DTO 实例
 */
function toCatalogDTO<T extends CatalogLike>(model: T): CourseCatalogDTO {
  const dto = new CourseCatalogDTO();
  dto.id = model.id;
  dto.courseLevel = model.courseLevel;
  dto.title = model.title;
  dto.description = model.description ?? null;
  dto.createdAt = model.createdAt;
  dto.updatedAt = model.updatedAt;
  dto.deactivatedAt = model.deactivatedAt ?? null;
  dto.createdBy = model.createdBy ?? null;
  dto.updatedBy = model.updatedBy ?? null;
  return dto;
}

/**
 * 课程目录 GraphQL Resolver
 * 提供课程目录相关的查询和变更操作
 */
@Resolver(() => CourseCatalogDTO)
export class CourseCatalogResolver {
  constructor(
    private readonly getCatalogByLevelUsecase: GetCatalogByLevelUsecase,
    private readonly listCatalogsUsecase: ListCatalogsUsecase, // 注入列表查询 usecase
    private readonly updateCatalogDetailsUsecase: UpdateCatalogDetailsUsecase,
    private readonly deactivateCatalogUsecase: DeactivateCatalogUsecase,
    private readonly reactivateCatalogUsecase: ReactivateCatalogUsecase,
    private readonly createCatalogUsecase: CreateCatalogUsecase,
  ) {}

  /**
   * 获取所有有效的课程目录列表
   */
  @Query(() => CourseCatalogsListResult, { description: '获取课程目录列表' })
  async courseCatalogsList(): Promise<CourseCatalogsListResult> {
    // 使用 usecase 返回的实体进行安全映射，不在此处重定义类型
    const entities = await this.listCatalogsUsecase.execute();
    const items: CourseCatalogDTO[] = entities.map((e) => toCatalogDTO(e));
    const result = new CourseCatalogsListResult();
    result.items = items;
    return result;
  }

  /**
   * 根据课程等级查询课程目录
   */
  @Query(() => CourseCatalogDTO, { nullable: true, description: '根据课程等级查询课程目录' })
  async courseCatalogByLevel(
    @Args('input') input: GetCatalogByLevelInput,
  ): Promise<CourseCatalogDTO | null> {
    const catalog = await this.getCatalogByLevelUsecase.execute({
      courseLevel: input.courseLevel,
    });

    if (catalog === null) {
      return null;
    }
    return toCatalogDTO(catalog);
  }

  // 取消搜索接口：不再暴露 searchCourseCatalogs 查询

  /**
   * 更新课程目录详情（需要管理员权限）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => UpdateCatalogDetailsResult, { description: '更新课程目录详情' })
  async updateCatalogDetails(
    @Args('input') input: UpdateCatalogDetailsInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpdateCatalogDetailsResult> {
    // 构建会话信息
    const session = mapJwtToUsecaseSession(user);
    const params: UpdateCatalogDetailsInput = {
      id: input.id,
      title: input.title,
      description: input.description,
    };
    const result = await this.updateCatalogDetailsUsecase.execute(session, params);
    const output = new UpdateCatalogDetailsResult();
    output.success = result.success;
    // usecase 已返回只读 DTO，此处不再重复映射
    output.data = result.data ?? null;
    output.message = result.message ?? null;
    return output;
  }

  /**
   * 下线课程目录（需要管理员权限）
   * @param input 下线输入参数
   * @param user 当前用户的 JWT 信息
   * @returns 下线结果（包含是否更新与最新实体）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => DeactivateCatalogResult, { description: '下线课程目录' })
  async deactivateCatalog(
    @Args('input') input: DeactivateCatalogInput,
    @currentUser() user: JwtPayload,
  ): Promise<DeactivateCatalogResult> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.deactivateCatalogUsecase.execute(session, { id: input.id });

    const output = new DeactivateCatalogResult();
    output.catalog = toCatalogDTO(result.catalog);
    output.isUpdated = result.isUpdated;
    return output;
  }

  /**
   * 重新激活课程目录（需要管理员权限）
   * @param input 重新激活输入参数
   * @param user 当前用户的 JWT 信息
   * @returns 重新激活结果（包含是否更新与最新实体）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => ReactivateCatalogResult, { description: '重新激活课程目录' })
  async reactivateCatalog(
    @Args('input') input: ReactivateCatalogInput,
    @currentUser() user: JwtPayload,
  ): Promise<ReactivateCatalogResult> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.reactivateCatalogUsecase.execute(session, { id: input.id });

    const output = new ReactivateCatalogResult();
    output.catalog = toCatalogDTO(result.catalog);
    output.isUpdated = result.isUpdated;
    return output;
  }

  /**
   * 创建课程目录（需要管理员或经理权限）
   * 并发安全，按 courseLevel 唯一约束幂等
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => CreateCatalogResult, { description: '创建课程目录' })
  async createCatalog(
    @Args('input') input: CreateCatalogInput,
    @currentUser() user: JwtPayload,
  ): Promise<CreateCatalogResult> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.createCatalogUsecase.execute(session, {
      courseLevel: input.courseLevel,
      title: input.title,
      description: input.description ?? null,
    });
    const output = new CreateCatalogResult();
    output.catalog = toCatalogDTO(result.catalog);
    output.isNewlyCreated = result.isNewlyCreated;
    return output;
  }
}
