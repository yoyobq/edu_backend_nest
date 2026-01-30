// src/modules/course-catalogs/course-catalogs.module.ts
import { PaginationModule } from '@modules/common/pagination.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseCatalogEntity } from './course-catalog.entity';
import { CourseCatalogService } from './course-catalog.service';

/**
 * 课程目录模块
 * 提供课程规格/产品相关功能
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseCatalogEntity]), PaginationModule],
  providers: [CourseCatalogService],
  exports: [TypeOrmModule, CourseCatalogService],
})
export class CourseCatalogsModule {}
