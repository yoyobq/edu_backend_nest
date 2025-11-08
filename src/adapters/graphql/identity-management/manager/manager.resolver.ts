// src/adapters/graphql/identity-management/manager/manager.resolver.ts
import { JwtPayload } from '@app-types/jwt.types';
import { EmploymentStatus } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ManagerType } from '@src/adapters/graphql/account/dto/identity/manager.dto';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { ListManagersInput } from '@src/adapters/graphql/identity-management/manager/dto/manager.input.list';
import { ListManagersOutput } from '@src/adapters/graphql/identity-management/manager/dto/managers.list';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { DeactivateManagerUsecase } from '@src/usecases/identity-management/manager/deactivate-manager.usecase';
import {
  ListManagersUsecase,
  PaginatedManagers,
} from '@src/usecases/identity-management/manager/list-managers.usecase';
import { ReactivateManagerUsecase } from '@src/usecases/identity-management/manager/reactivate-manager.usecase';
import { UpdateManagerUsecase } from '@src/usecases/identity-management/manager/update-manager.usecase';
import { DeactivateManagerInput } from './dto/manager.input.deactivate';
import { ReactivateManagerInput } from './dto/manager.input.reactivate';
import { UpdateManagerInput } from './dto/manager.input.update';
import {
  DeactivateManagerResult,
  ReactivateManagerResult,
  UpdateManagerResult,
} from './dto/manager.result';

/**
 * Manager 管理 GraphQL 解析器
 * - 提供更新、下线、上线三个操作与列表查询
 * - 仅做 DTO 与 Usecase 的薄适配；业务规则由 Usecase 层实现
 */
@Resolver(() => ManagerType)
export class ManagerResolver {
  constructor(
    private readonly updateManagerUsecase: UpdateManagerUsecase,
    private readonly deactivateManagerUsecase: DeactivateManagerUsecase,
    private readonly reactivateManagerUsecase: ReactivateManagerUsecase,
    private readonly listManagersUsecase: ListManagersUsecase,
  ) {}

  /**
   * 更新经理信息
   * @param input 更新输入参数
   * @param user 当前用户信息
   * @returns 更新后的经理信息
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => UpdateManagerResult, { description: '更新经理信息' })
  async updateManager(
    @Args('input') input: UpdateManagerInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpdateManagerResult> {
    const entity: ManagerEntity = await this.updateManagerUsecase.execute({
      currentAccountId: Number(user.sub),
      managerId: input.managerId,
      name: input.name,
      remark: input.remark ?? null,
    });

    return { manager: this.mapManagerEntityToType(entity) };
  }

  /**
   * 下线经理
   * @param input 下线输入参数
   * @param user 当前用户信息
   * @returns 下线结果（含是否更新）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => DeactivateManagerResult, { description: '下线经理' })
  async deactivateManager(
    @Args('input') input: DeactivateManagerInput,
    @currentUser() user: JwtPayload,
  ): Promise<DeactivateManagerResult> {
    const result = await this.deactivateManagerUsecase.execute(Number(user.sub), { id: input.id });
    return {
      manager: this.mapManagerEntityToType(result.manager),
      isUpdated: result.isUpdated,
    };
  }

  /**
   * 上线经理
   * @param input 上线输入参数
   * @param user 当前用户信息
   * @returns 上线结果（含是否更新）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => ReactivateManagerResult, { description: '上线经理' })
  async reactivateManager(
    @Args('input') input: ReactivateManagerInput,
    @currentUser() user: JwtPayload,
  ): Promise<ReactivateManagerResult> {
    const result = await this.reactivateManagerUsecase.execute(Number(user.sub), { id: input.id });
    return {
      manager: this.mapManagerEntityToType(result.manager),
      isUpdated: result.isUpdated,
    };
  }

  /**
   * 将 Manager 实体映射为 GraphQL 输出类型
   * @param entity 经理实体
   * @returns GraphQL 输出 DTO
   */
  private mapManagerEntityToType(entity: ManagerEntity): ManagerType {
    const dto: ManagerType = {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      departmentId: null,
      remark: entity.remark,
      jobTitle: null,
      employmentStatus: entity.deactivatedAt ? EmploymentStatus.LEFT : EmploymentStatus.ACTIVE,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deactivatedAt: entity.deactivatedAt ?? null,
    };
    return dto;
  }

  /**
   * 分页查询经理列表（仅管理员）
   * @param input 查询输入参数
   * @param user 当前登录用户信息
   * @returns 经理列表与分页信息
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => ListManagersOutput, { description: '分页查询经理列表（仅 manager）' })
  async managers(
    @Args('input') input: ListManagersInput,
    @currentUser() user: JwtPayload,
  ): Promise<ListManagersOutput> {
    const result: PaginatedManagers = await this.listManagersUsecase.execute(Number(user.sub), {
      page: input.page,
      limit: input.limit,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
      includeDeleted: input.includeDeleted,
    });

    const list = result.items.map((entity: ManagerEntity) => this.mapManagerEntityToType(entity));
    return {
      managers: list,
      data: list, // 兼容旧字段，便于前端与测试渐进切换
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1,
      },
    };
  }
}
