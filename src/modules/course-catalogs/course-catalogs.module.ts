// src/modules/course-catalogs/course-catalogs.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListCatalogsUsecase } from '@usecases/course-catalogs/list-catalogs.usecase';
import { UpdateCatalogDetailsUsecase } from '@usecases/course-catalogs/update-catalog-details.usecase';
import { CourseCatalogEntity } from './course-catalog.entity';
import { CourseCatalogService } from './course-catalog.service';

/**
 * 课程目录模块
 * 提供课程规格/产品相关功能
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseCatalogEntity])],
  providers: [
    CourseCatalogService,
    ListCatalogsUsecase, // 添加列表查询 usecase
    UpdateCatalogDetailsUsecase, // 更新详情 usecase
  ],
  exports: [
    TypeOrmModule,
    CourseCatalogService,
    ListCatalogsUsecase, // 导出列表查询 usecase
    UpdateCatalogDetailsUsecase, // 导出更新详情 usecase
  ],
})
export class CourseCatalogsModule {}
