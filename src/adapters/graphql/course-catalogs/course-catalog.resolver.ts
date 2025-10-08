// src/adapters/graphql/course-catalogs/course-catalog.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { CourseCatalogService } from '@modules/course-catalogs/course-catalog.service';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UpdateCatalogDetailsUsecase } from '@usecases/course-catalogs/update-catalog-details.usecase';
import { ListCatalogsUsecase } from '@usecases/course-catalogs/list-catalogs.usecase';
import { currentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CourseCatalogDTO } from './dto/course-catalog.dto';
import { GetCatalogByLevelInput, UpdateCatalogDetailsInput } from './dto/course-catalog.input';
import { CourseCatalogsListResult, UpdateCatalogDetailsResult } from './dto/course-catalog.result';
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
    const session = {
      accountId: user.sub,
      roles: user.accessGroup, // 传递完整的角色数组
    };

    const result = await this.updateCatalogDetailsUsecase.execute(session, input);
    return result;
  }
}
