// src/adapters/graphql/course-catalogs/course-catalog.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { CourseCatalogService } from '@modules/course-catalogs/course-catalog.service';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UpdateCatalogDetailsUsecase } from '@usecases/course-catalogs/update-catalog-details.usecase';
import { DeactivateCatalogUsecase } from '@usecases/course-catalogs/deactivate-catalog.usecase';
import { ReactivateCatalogUsecase } from '@usecases/course-catalogs/reactivate-catalog.usecase';
import { ListCatalogsUsecase } from '@usecases/course-catalogs/list-catalogs.usecase';
import { currentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CourseCatalogDTO } from './dto/course-catalog.dto';
import {
  DeactivateCatalogInput,
  GetCatalogByLevelInput,
  ReactivateCatalogInput,
  UpdateCatalogDetailsInput,
} from './dto/course-catalog.input';
import {
  CourseCatalogsListResult,
  DeactivateCatalogResult,
  ReactivateCatalogResult,
  UpdateCatalogDetailsResult,
} from './dto/course-catalog.result';
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
/**
 * 课程目录 GraphQL Resolver
 * 提供课程目录相关的查询和变更操作
 */
@Resolver(() => CourseCatalogDTO)
export class CourseCatalogResolver {
  constructor(
    private readonly courseCatalogService: CourseCatalogService,
    private readonly listCatalogsUsecase: ListCatalogsUsecase, // 注入列表查询 usecase
    private readonly updateCatalogDetailsUsecase: UpdateCatalogDetailsUsecase,
    private readonly deactivateCatalogUsecase: DeactivateCatalogUsecase,
    private readonly reactivateCatalogUsecase: ReactivateCatalogUsecase,
  ) {}

  /**
   * 获取所有有效的课程目录列表
   */
  @Query(() => CourseCatalogsListResult, { description: '获取课程目录列表' })
  async courseCatalogsList(): Promise<CourseCatalogsListResult> {
    const catalogs = await this.listCatalogsUsecase.execute(); // 使用 usecase

    const items: CourseCatalogDTO[] = catalogs.map((catalog) => ({
      id: catalog.id,
      courseLevel: catalog.courseLevel,
      title: catalog.title,
      description: catalog.description,
      createdAt: catalog.createdAt,
      updatedAt: catalog.updatedAt,
      deactivatedAt: catalog.deactivatedAt,
    }));

    return { items };
  }

  /**
   * 根据课程等级查询课程目录
   */
  @Query(() => CourseCatalogDTO, { nullable: true, description: '根据课程等级查询课程目录' })
  async courseCatalogByLevel(
    @Args('input') input: GetCatalogByLevelInput,
  ): Promise<CourseCatalogDTO | null> {
    const catalog = await this.courseCatalogService.findByCourseLevel(input.courseLevel);

    if (!catalog) {
      return null;
    }

    return {
      id: catalog.id,
      courseLevel: catalog.courseLevel,
      title: catalog.title,
      description: catalog.description,
      createdAt: catalog.createdAt,
      updatedAt: catalog.updatedAt,
      deactivatedAt: catalog.deactivatedAt,
    };
  }

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

    const result = await this.updateCatalogDetailsUsecase.execute(session, input);
    return result;
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

    return {
      catalog: {
        id: result.catalog.id,
        courseLevel: result.catalog.courseLevel,
        title: result.catalog.title,
        description: result.catalog.description,
        createdAt: result.catalog.createdAt,
        updatedAt: result.catalog.updatedAt,
        deactivatedAt: result.catalog.deactivatedAt,
      },
      isUpdated: result.isUpdated,
    };
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

    return {
      catalog: {
        id: result.catalog.id,
        courseLevel: result.catalog.courseLevel,
        title: result.catalog.title,
        description: result.catalog.description,
        createdAt: result.catalog.createdAt,
        updatedAt: result.catalog.updatedAt,
        deactivatedAt: result.catalog.deactivatedAt,
      },
      isUpdated: result.isUpdated,
    };
  }
}
