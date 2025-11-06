// src/usecases/course-catalogs/deactivate-catalog.usecase.ts
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CourseCatalogEntity } from '@modules/course-catalogs/course-catalog.entity';
import { CourseCatalogService } from '@modules/course-catalogs/course-catalog.service';
import { Injectable } from '@nestjs/common';
import { UsecaseSession } from '@src/types/auth/session.types';

// 统一使用 UsecaseSession 会话模型

/**
 * 下线课程目录输入参数
 */
export interface DeactivateCatalogParams {
  /** 课程目录 ID */
  id: number;
}

/**
 * 下线课程目录输出结果
 */
export interface DeactivateCatalogResult {
  /** 更新后的课程目录实体 */
  catalog: CourseCatalogEntity;
  /** 是否发生状态变更（幂等时为 false） */
  isUpdated: boolean;
}

/**
 * 下线课程目录用例
 * 行为：若已下线则幂等返回；否则设置 deactivatedAt，并记录 updatedBy
 */
@Injectable()
export class DeactivateCatalogUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 执行下线操作
   * @param session 当前用户会话
   * @param input 下线参数
   * @returns 下线结果
   */
  async execute(
    session: UsecaseSession,
    input: DeactivateCatalogParams,
  ): Promise<DeactivateCatalogResult> {
    this.ensurePermissions(session);

    const entity = await this.courseCatalogService.findById(input.id);
    if (!entity) {
      throw new DomainError('CATALOG_NOT_FOUND', '课程目录不存在');
    }

    // 已下线 → 幂等返回
    if (entity.deactivatedAt) {
      return { catalog: entity, isUpdated: false };
    }

    const updated = await this.courseCatalogService.deactivate(input.id, session.accountId);
    if (!updated) {
      throw new DomainError('UPDATE_FAILED', '下线课程目录失败');
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
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '仅管理员可以下线课程目录');
    }
  }
}
