// src/usecases/course-catalogs/update-catalog-details.usecase.ts
import { UpdateCatalogDetailsInput } from '@adapters/graphql/course-catalogs/dto/course-catalog.input';
import { UpdateCatalogDetailsResult } from '@adapters/graphql/course-catalogs/dto/course-catalog.result';
import { DomainError } from '@core/common/errors/domain-error';
import { CourseCatalogEntity } from '@modules/course-catalogs/course-catalog.entity';
import { CourseCatalogService } from '@modules/course-catalogs/course-catalog.service';
import { Injectable } from '@nestjs/common';

// 假设的会话和权限类型，需要根据实际项目调整
interface AccountSession {
  accountId: number;
  roles: string[]; // 修改：改为角色数组
  // 其他会话信息
}

/**
 * 更新课程目录详情用例
 * 仅允许 manager 更新 title/description
 * 不允许修改 courseLevel / deactivatedAt
 */
@Injectable()
export class UpdateCatalogDetailsUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 执行更新课程目录详情
   * @param session 当前用户会话
   * @param input 更新输入参数
   * @returns 更新结果
   */
  async execute(
    session: AccountSession,
    input: UpdateCatalogDetailsInput,
  ): Promise<UpdateCatalogDetailsResult> {
    // 1) 权限验证
    this.validatePermissions(session);

    // 2) 查询实体
    const entity = await this.courseCatalogService.findById(input.id);
    if (!entity) {
      throw new DomainError('CATALOG_NOT_FOUND', '课程目录不存在');
    }

    // 3) 验证至少更新一项
    this.validateUpdateFields(input);

    // 4) 准备更新数据
    const updateData = this.prepareUpdateData(input);

    // 5) 保存更新
    const savedEntity = await this.courseCatalogService.update(input.id, updateData);
    if (!savedEntity) {
      throw new DomainError('UPDATE_FAILED', '更新课程目录失败');
    }

    return {
      success: true,
      data: savedEntity,
      message: '课程目录更新成功',
    };
  }

  /**
   * 验证用户权限
   * @param session 用户会话
   */
  private validatePermissions(session: AccountSession): void {
    // 统一转换为小写再比较，更优雅且高效
    const allowedRoles = ['admin', 'teacher', 'manager'];
    const hasPermission = session.roles.some((role) => allowedRoles.includes(role.toLowerCase()));

    if (!hasPermission) {
      throw new DomainError('INSUFFICIENT_PERMISSIONS', '仅管理员可以更新课程目录');
    }
  }

  /**
   * 验证更新字段
   * @param input 输入参数
   */
  private validateUpdateFields(input: UpdateCatalogDetailsInput): void {
    const hasTitle = typeof input.title !== 'undefined';
    const hasDescription = typeof input.description !== 'undefined';

    if (!hasTitle && !hasDescription) {
      throw new DomainError(
        'NO_UPDATABLE_FIELDS',
        '至少需要提供 title 或 description 中的一个字段',
      );
    }
  }

  /**
   * 准备更新数据
   * @param input 输入参数
   * @returns 更新数据对象
   */
  private prepareUpdateData(input: UpdateCatalogDetailsInput): Partial<CourseCatalogEntity> {
    const updateData: Partial<CourseCatalogEntity> = {};

    if (typeof input.title !== 'undefined') {
      const trimmedTitle = (input.title ?? '').trim();
      if (!trimmedTitle) {
        throw new DomainError('TITLE_EMPTY', '标题不能为空');
      }
      updateData.title = trimmedTitle;
    }

    if (typeof input.description !== 'undefined') {
      const trimmedDescription = (input.description ?? '').trim();
      // 空字符串转为 null，与数据库可空字段一致
      updateData.description = trimmedDescription === '' ? null : trimmedDescription;
    }

    return updateData;
  }
}
