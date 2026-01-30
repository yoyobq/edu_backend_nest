// src/modules/course/catalogs/course-catalog-service.module.ts

import { PaginationModule } from '@modules/common/pagination.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseCatalogEntity } from './course-catalog.entity';
import { CourseCatalogService } from './course-catalog.service';

/**
 * Course Catalog Service 模块
 * 专门导出 CourseCatalogService 供 usecases 使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseCatalogEntity]), PaginationModule],
  providers: [CourseCatalogService],
  exports: [CourseCatalogService],
})
export class CourseCatalogServiceModule {}
