// src/usecases/course-catalogs/create-catalog.usecase.ts
import { CourseLevel } from '@app-types/models/course.types';
import { CATALOG_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseCatalogService } from '@src/modules/course/catalogs/course-catalog.service';
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
 * - `courseLevel` 全局唯一，若已存在则幂等返回（`isNewlyCreated = false`）
 * - `title` 必填且去除首尾空格；`description` 为空字符串按 `null` 存储
 * - 默认 `deactivatedAt = null`，并记录 `createdBy / updatedBy`
 * - 并发安全：通过 Service 的并发安全创建方法（`createOrGet`）直接尝试插入，捕获唯一约束冲突后回退查询，统一返回结果结构
 */
@Injectable()
export class CreateCatalogUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 执行创建课程目录
   * 并发语义：
   * - 依赖数据库唯一约束（`uk_catalogs_course_level`）
   * - 当并发同时创建同一 `courseLevel` 时，只有一次插入成功返回 `isNewlyCreated = true`，其余并发者捕获重复键后回退查询，返回 `isNewlyCreated = false`
   * - 保证时间戳由 ORM 自动维护，不手动赋值 `createdAt / updatedAt`
   * @param session 当前用户会话
   * @param input 创建参数
   * @returns 创建结果（包含 `catalog` 与 `isNewlyCreated`）
   */
  async execute(session: UsecaseSession, input: CreateCatalogParams): Promise<CreateCatalogResult> {
    this.ensurePermissions(session);

    // 字段规范化与校验
    const normalized = this.normalizeInput(input);

    // 并发安全创建：依赖数据库唯一约束并在冲突时幂等回退
    const toCreate: Partial<CourseCatalogEntity> = {
      courseLevel: normalized.courseLevel,
      title: normalized.title,
      description: normalized.description,
      deactivatedAt: null,
      createdBy: session.accountId,
      updatedBy: session.accountId,
    };

    const { catalog, isNewlyCreated } = await this.courseCatalogService.createOrGet(toCreate);
    return { catalog, isNewlyCreated };
  }

  /**
   * 权限校验：仅允许 admin/manager/teacher
   * @param session 当前会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const allowed = ['admin', 'manager', 'teacher'];
    const ok = session.roles?.some((r) => allowed.includes(String(r).toLowerCase()));
    if (!ok) {
      throw new DomainError(CATALOG_ERROR.PERMISSION_DENIED, '仅管理员可以创建课程目录');
    }
  }

  /**
   * 规范化与校验输入参数
   * @param input 原始输入
   */
  private normalizeInput(input: CreateCatalogParams): Required<CreateCatalogParams> {
    const title = (input.title ?? '').trim();
    if (!title) {
      throw new DomainError(CATALOG_ERROR.TITLE_EMPTY, '标题不能为空');
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
