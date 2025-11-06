// src/modules/course-catalogs/course-catalogs.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListCatalogsUsecase } from '@usecases/course-catalogs/list-catalogs.usecase';
import { UpdateCatalogDetailsUsecase } from '@usecases/course-catalogs/update-catalog-details.usecase';
import { CreateCatalogUsecase } from '@usecases/course-catalogs/create-catalog.usecase';
import { DeactivateCatalogUsecase } from '@usecases/course-catalogs/deactivate-catalog.usecase';
import { ReactivateCatalogUsecase } from '@usecases/course-catalogs/reactivate-catalog.usecase';
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
    CreateCatalogUsecase, // 创建目录 usecase
    DeactivateCatalogUsecase, // 下线目录 usecase
    ReactivateCatalogUsecase, // 上线目录 usecase
  ],
  exports: [
    TypeOrmModule,
    CourseCatalogService,
    ListCatalogsUsecase, // 导出列表查询 usecase
    UpdateCatalogDetailsUsecase, // 导出更新详情 usecase
    CreateCatalogUsecase, // 导出创建目录 usecase
    DeactivateCatalogUsecase, // 导出下线目录 usecase
    ReactivateCatalogUsecase, // 导出上线目录 usecase
  ],
})
export class CourseCatalogsModule {}
