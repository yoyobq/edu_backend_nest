// src/adapters/graphql/identity-management/manager/manager.resolver.ts
import { JwtPayload } from '@app-types/jwt.types';
import { EmploymentStatus } from '@app-types/models/account.types';
import { UserState } from '@app-types/models/user-info.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ManagerType } from '@src/adapters/graphql/account/dto/identity/manager.dto';
import { LoginHistoryItem } from '@src/adapters/graphql/account/enums/login-history.types';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { ListManagersInput } from '@src/adapters/graphql/identity-management/manager/dto/manager.input.list';
import { ListManagersOutput } from '@src/adapters/graphql/identity-management/manager/dto/managers.list';
import { GetAccountByIdUsecase } from '@src/usecases/account/get-account-by-id.usecase';
import { GetVisibleUserInfoUsecase } from '@src/usecases/account/get-visible-user-info.usecase';
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

type ManagerEntityView = Awaited<ReturnType<UpdateManagerUsecase['execute']>>;

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
    private readonly getAccountByIdUsecase: GetAccountByIdUsecase,
    private readonly getVisibleUserInfoUsecase: GetVisibleUserInfoUsecase,
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
    const entity = await this.updateManagerUsecase.execute({
      currentAccountId: Number(user.sub),
      managerId: input.managerId,
      name: input.name,
      remark: input.remark ?? null,
    });
    let phone: string | null = null;
    let userState: UserState | null = null;
    let loginHistory: LoginHistoryItem[] | null = null;
    if (entity.accountId) {
      // 可见性驱动读取用户信息，确保与 Customer 对齐的 userinfo 合并策略
      try {
        const view = await this.getVisibleUserInfoUsecase.execute({
          session: { accountId: Number(user.sub), roles: ['MANAGER'] },
          targetAccountId: entity.accountId,
          detail: 'FULL',
        });
        phone = view.phone ?? null;
        userState = view.userState ?? null;
      } catch {
        phone = null;
        userState = null;
      }
      try {
        const account = await this.getAccountByIdUsecase.execute(entity.accountId);
        loginHistory = account.recentLoginHistory ?? null;
      } catch {
        loginHistory = null;
      }
    }
    return {
      manager: this.mapManagerEntityToType(entity, {
        userPhone: phone,
        userState,
        loginHistory,
      }),
    };
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
  private mapManagerEntityToType(
    entity: ManagerEntityView,
    extras?: {
      userState?: UserState | null;
      userPhone?: string | null;
      loginHistory?: LoginHistoryItem[] | null;
    },
  ): ManagerType {
    const dto: ManagerType = {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      departmentId: null,
      remark: entity.remark,
      jobTitle: null,
      phone: extras?.userPhone ?? null,
      employmentStatus: entity.deactivatedAt ? EmploymentStatus.LEFT : EmploymentStatus.ACTIVE,
      userState: extras?.userState ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deactivatedAt: entity.deactivatedAt ?? null,
      loginHistory: extras?.loginHistory ?? null,
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
  @Query(() => ListManagersOutput, { description: '查询经理列表（仅 manager，非分页）' })
  async managers(
    @Args('input') input: ListManagersInput,
    @currentUser() user: JwtPayload,
  ): Promise<ListManagersOutput> {
    const result: PaginatedManagers = await this.listManagersUsecase.execute(Number(user.sub), {
      includeDeleted: input.includeDeleted,
    });

    const list = result.items.map((item) =>
      this.mapManagerEntityToType(item.entity, {
        userState: item.userState,
        userPhone: item.userPhone,
        loginHistory: item.loginHistory as LoginHistoryItem[] | null,
      }),
    );
    return {
      managers: list,
      data: list, // 兼容旧字段，便于前端与测试渐进切换
    };
  }
}
