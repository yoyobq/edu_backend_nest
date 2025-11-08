// src/usecases/course-catalogs/reactivate-catalog.usecase.ts
import { CATALOG_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseCatalogService } from '@src/modules/course/catalogs/course-catalog.service';
import { UsecaseSession } from '@src/types/auth/session.types';

// 统一使用 UsecaseSession 会话模型

/**
 * 上线课程目录输入参数
 */
export interface ReactivateCatalogParams {
  /** 课程目录 ID */
  id: number;
}

/**
 * 上线课程目录输出结果
 */
export interface ReactivateCatalogResult {
  /** 更新后的课程目录实体 */
  catalog: CourseCatalogEntity;
  /** 是否发生状态变更（幂等时为 false） */
  isUpdated: boolean;
}

/**
 * 重新激活课程目录用例
 * 并发与幂等语义：
 * - 若已上线（`deactivatedAt` 为 `null`）则直接幂等返回 `isUpdated = false`
 * - 否则调用 Service 的 `reactivate`（内部使用 `merge + save`），确保 `@UpdateDateColumn` 自动维护
 * - 本用例按 `id` 单行更新，不涉及唯一约束竞争，默认幂等
 */
@Injectable()
export class ReactivateCatalogUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 执行上线操作
   * @param session 当前用户会话
   * @param input 上线参数
   * @returns 上线结果
   */
  async execute(
    session: UsecaseSession,
    input: ReactivateCatalogParams,
  ): Promise<ReactivateCatalogResult> {
    this.ensurePermissions(session);

    const entity = await this.courseCatalogService.findById(input.id);
    if (!entity) {
      throw new DomainError(CATALOG_ERROR.NOT_FOUND, '课程目录不存在');
    }

    // 已上线（deactivatedAt 为 null）→ 幂等返回
    if (!entity.deactivatedAt) {
      return { catalog: entity, isUpdated: false };
    }

    const updated = await this.courseCatalogService.reactivate(input.id, session.accountId);
    if (!updated) {
      throw new DomainError(CATALOG_ERROR.UPDATE_FAILED, '重新激活课程目录失败');
    }

    return { catalog: updated, isUpdated: true };
  }

  /**
   * 权限校验：仅允许 admin/manager/teacher
   * @param session 当前会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const allowed = ['admin', 'manager', 'teacher'];
    const ok = session.roles?.some((r) => allowed.includes(String(r).toLowerCase()));
    if (!ok) {
      throw new DomainError(CATALOG_ERROR.PERMISSION_DENIED, '仅管理员可以重新激活课程目录');
    }
  }
}
