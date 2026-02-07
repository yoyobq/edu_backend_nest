// src/adapters/graphql/identity-management/customer/customer.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { UserState } from '@app-types/models/user-info.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { DeactivateCustomerUsecase } from '@src/usecases/identity-management/customer/deactivate-customer.usecase';
import { GetCustomerUsecase } from '@src/usecases/identity-management/customer/get-customer.usecase';
import {
  ListCustomersUsecase,
  PaginatedCustomers,
} from '@src/usecases/identity-management/customer/list-customers.usecase';
import {
  ListOverdueCustomersUsecase,
  PaginatedOverdueCustomers,
} from '@src/usecases/identity-management/customer/list-overdue-customers.usecase';
import { ReactivateCustomerUsecase } from '@src/usecases/identity-management/customer/reactivate-customer.usecase';
import { UpdateCustomerUsecase } from '@src/usecases/identity-management/customer/update-customer.usecase';
import { GetMembershipLevelByIdUsecase } from '@src/usecases/membership-levels/get-membership-level-by-id.usecase';
import { CustomerType } from '../../account/dto/identity/customer.dto';
import { MembershipLevelType } from '../../account/dto/identity/membership-level.dto';
import { DeactivateCustomerInput } from './dto/customer.input.deactivate';
import { GetCustomerInput } from './dto/customer.input.get';
import { ListCustomersInput } from './dto/customer.input.list';
import { ListOverdueCustomersInput } from './dto/customer.input.list-overdue';
import { ReactivateCustomerInput } from './dto/customer.input.reactivate';
import { UpdateCustomerInput } from './dto/customer.input.update';
import {
  DeactivateCustomerResult,
  ReactivateCustomerResult,
  UpdateCustomerResult,
} from './dto/customer.result';
import { ListCustomersOutput } from './dto/customers.list';

type CustomerView = {
  id: number;
  accountId: number | null;
  name: string;
  contactPhone: string | null;
  preferredContactTime: string | null;
  membershipLevel: number | null;
  remark: string | null;
  deactivatedAt: Date | null;
  remainingSessions: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Customer 管理 GraphQL 解析器
 * - 提供更新、下线、上线三个操作
 * - 仅做 DTO 与 Usecase 的薄适配；业务规则由 Usecase 层实现
 */
@Resolver(() => CustomerType)
export class CustomerResolver {
  constructor(
    private readonly updateCustomerUsecase: UpdateCustomerUsecase,
    private readonly deactivateCustomerUsecase: DeactivateCustomerUsecase,
    private readonly reactivateCustomerUsecase: ReactivateCustomerUsecase,
    private readonly listCustomersUsecase: ListCustomersUsecase,
    private readonly listOverdueCustomersUsecase: ListOverdueCustomersUsecase,
    private readonly getCustomerUsecase: GetCustomerUsecase,
    private readonly getMembershipLevelByIdUsecase: GetMembershipLevelByIdUsecase,
  ) {}

  /**
   * 更新客户信息
   * @param input 更新输入参数
   * @param user 当前用户信息
   * @returns 更新后的客户信息
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => UpdateCustomerResult, { description: '更新客户信息' })
  async updateCustomer(
    @Args('input') input: UpdateCustomerInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpdateCustomerResult> {
    const entity = await this.updateCustomerUsecase.execute({
      currentAccountId: Number(user.sub),
      customerId: input.customerId,
      name: input.name,
      contactPhone: input.contactPhone ?? null,
      preferredContactTime: input.preferredContactTime ?? null,
      remark: input.remark ?? null,
      membershipLevel: input.membershipLevel,
    });

    const customer = await this.mapCustomerEntityToType(entity);
    return { customer };
  }

  /**
   * 分页查询客户列表（仅管理员）
   * @param input 查询输入参数
   * @param user 当前用户
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => ListCustomersOutput, { description: '分页查询客户列表（仅 manager）' })
  async customers(
    @Args('input') input: ListCustomersInput,
    @currentUser() user: JwtPayload,
  ): Promise<ListCustomersOutput> {
    const result: PaginatedCustomers = await this.listCustomersUsecase.execute(Number(user.sub), {
      page: input.page,
      limit: input.limit,
      sortBy: input.sortBy ?? undefined,
      sortOrder: input.sortOrder ?? undefined,
      query: input.query ?? undefined,
      filters: {
        userState: input.userState ?? undefined,
        name: input.name ?? undefined,
        contactPhone: input.contactPhone ?? undefined,
        membershipLevel: input.membershipLevel ?? undefined,
      },
    });
    const customers = await Promise.all(
      result.items.map((item) =>
        this.mapCustomerEntityToType(
          item.customer,
          item.userState,
          item.loginHistory,
          item.userPhone,
        ),
      ),
    );
    return {
      customers,
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

  /**
   * 分页查询欠费客户列表（仅管理员）
   * @param input 查询输入参数
   * @param user 当前用户
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => ListCustomersOutput, { description: '分页查询欠费客户列表（仅 manager）' })
  async overdueCustomers(
    @Args('input') input: ListOverdueCustomersInput,
    @currentUser() user: JwtPayload,
  ): Promise<ListCustomersOutput> {
    const result: PaginatedOverdueCustomers = await this.listOverdueCustomersUsecase.execute(
      Number(user.sub),
      {
        page: input.page,
        limit: input.limit,
      },
    );
    const customers = await Promise.all(
      result.items.map((item) =>
        this.mapCustomerEntityToType(
          item.customer,
          item.userState,
          item.loginHistory,
          item.userPhone,
        ),
      ),
    );
    return {
      customers,
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

  /**
   * 获取客户信息（支持客户本人与 manager）
   * @param input 查询输入参数
   * @param user 当前用户
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => CustomerType, { description: '获取单个客户信息（仅 manager）' })
  async customer(
    @Args('input') input: GetCustomerInput,
    @currentUser() user: JwtPayload,
  ): Promise<CustomerType> {
    const safeCustomerId: number | undefined = (() => {
      const obj: { customerId?: unknown } = input ?? {};
      const val = obj.customerId;
      return typeof val === 'number' ? val : undefined;
    })();
    const result = await this.getCustomerUsecase.execute({
      currentAccountId: Number(user.sub),
      customerId: safeCustomerId,
    });
    return await this.mapCustomerEntityToType(
      result.customer,
      result.userState,
      result.loginHistory,
      result.userPhone,
    );
  }

  /**
   * 下线客户
   * @param input 下线输入参数
   * @param user 当前用户信息
   * @returns 下线结果（含是否更新）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => DeactivateCustomerResult, { description: '下线客户' })
  async deactivateCustomer(
    @Args('input') input: DeactivateCustomerInput,
    @currentUser() user: JwtPayload,
  ): Promise<DeactivateCustomerResult> {
    const result = await this.deactivateCustomerUsecase.execute(Number(user.sub), { id: input.id });
    const customer = await this.mapCustomerEntityToType(result.customer);
    return { customer, isUpdated: result.isUpdated };
  }

  /**
   * 上线客户
   * @param input 上线输入参数
   * @param user 当前用户信息
   * @returns 上线结果（含是否更新）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => ReactivateCustomerResult, { description: '上线客户' })
  async reactivateCustomer(
    @Args('input') input: ReactivateCustomerInput,
    @currentUser() user: JwtPayload,
  ): Promise<ReactivateCustomerResult> {
    const result = await this.reactivateCustomerUsecase.execute(Number(user.sub), { id: input.id });
    const customer = await this.mapCustomerEntityToType(result.customer);
    return { customer, isUpdated: result.isUpdated };
  }

  /**
   * 将 Customer 实体映射为 GraphQL 输出类型
   * @param entity 客户实体
   * @returns GraphQL 输出 DTO
   */
  private async mapCustomerEntityToType(
    entity: CustomerView,
    userState?: UserState | null,
    loginHistory?: { ip: string; timestamp: string; audience?: string }[] | null,
    userPhone?: string | null,
  ): Promise<CustomerType> {
    const base: CustomerType = {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      contactPhone: entity.contactPhone,
      phone: userPhone ?? null,
      preferredContactTime: entity.preferredContactTime,
      membershipLevel: entity.membershipLevel ?? null,
      remark: entity.remark,
      userState: userState ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deactivatedAt: entity.deactivatedAt ?? null,
      loginHistory: loginHistory ?? null,
      remainingSessions: entity.remainingSessions,
    };

    // 根据实体中的 membershipLevel（数值枚举）去等级表读取详细信息
    const levelId = Number(entity.membershipLevel ?? 0);
    const level =
      levelId > 0 ? await this.getMembershipLevelByIdUsecase.execute({ id: levelId }) : null;
    let membershipLevelInfo: MembershipLevelType | null = null;
    if (level) {
      membershipLevelInfo = {
        id: level.id,
        code: level.code,
        name: level.name,
        benefits: level.benefits ? JSON.stringify(level.benefits) : null,
      };
    }

    return { ...base, membershipLevelInfo };
  }
}
