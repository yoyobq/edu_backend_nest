// src/usecases/course-catalogs/create-catalog.usecase.ts
import { CourseLevel } from '@app-types/models/course.types';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CourseCatalogEntity } from '@modules/course-catalogs/course-catalog.entity';
import { CourseCatalogService } from '@modules/course-catalogs/course-catalog.service';
import { Injectable } from '@nestjs/common';
import { UsecaseSession } from '@src/types/auth/session.types';

// 统一使用 UsecaseSession，避免在各 usecase 重复定义本地会话类型

/**
 * 创建课程目录的输入参数
 */
export interface CreateCatalogParams {
  /** 课程等级 */
  courseLevel: CourseLevel;
  /** 课程标题（必填） */
  title: string;
  /** 课程描述（可选） */
  description?: string | null;
}

/**
 * 创建课程目录的输出结果
 */
export interface CreateCatalogResult {
  /** 创建的课程目录实体 */
  catalog: CourseCatalogEntity;
  /** 是否新创建（若已存在则为 false 幂等返回） */
  isNewlyCreated: boolean;
}

/**
 * 创建课程目录用例
 * 规则：
 * - 仅允许 admin/manager/teacher 创建
 * - `courseLevel` 全局唯一，若已存在则幂等返回（isNewlyCreated=false）
 * - `title` 必填且去除首尾空格；`description` 为空字符串按 null 存储
 * - 默认 `deactivatedAt=null`，并记录 `createdBy/updatedBy`
 */
@Injectable()
export class CreateCatalogUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 执行创建课程目录
   * @param session 当前用户会话
   * @param input 创建参数
   * @returns 创建结果
   */
  async execute(session: UsecaseSession, input: CreateCatalogParams): Promise<CreateCatalogResult> {
    this.ensurePermissions(session);

    // 字段规范化与校验
    const normalized = this.normalizeInput(input);

    // 唯一性校验：按 courseLevel 查重（幂等）
    const existing = await this.courseCatalogService.findByCourseLevel(normalized.courseLevel);
    if (existing) {
      return { catalog: existing, isNewlyCreated: false };
    }

    // 创建实体
    const toCreate: Partial<CourseCatalogEntity> = {
      courseLevel: normalized.courseLevel,
      title: normalized.title,
      description: normalized.description,
      deactivatedAt: null,
      createdBy: session.accountId,
      updatedBy: session.accountId,
    };

    const created = await this.courseCatalogService.create(toCreate);
    return { catalog: created, isNewlyCreated: true };
  }

  /**
   * 权限校验：仅允许 admin/manager/teacher
   * @param session 当前会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const allowed = ['admin', 'manager', 'teacher'];
    const ok = session.roles?.some((r) => allowed.includes(String(r).toLowerCase()));
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '仅管理员可以创建课程目录');
    }
  }

  /**
   * 规范化与校验输入参数
   * @param input 原始输入
   */
  private normalizeInput(input: CreateCatalogParams): Required<CreateCatalogParams> {
    const title = (input.title ?? '').trim();
    if (!title) {
      throw new DomainError('TITLE_EMPTY', '标题不能为空');
    }

    // 描述去空格；空串存 null
    const descTrimmed = (input.description ?? '').trim();
    const description = descTrimmed.length === 0 ? null : descTrimmed;

    return {
      courseLevel: input.courseLevel,
      title,
      description,
    };
  }
}
