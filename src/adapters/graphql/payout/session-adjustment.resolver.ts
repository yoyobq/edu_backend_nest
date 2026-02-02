// 文件位置：src/adapters/graphql/payout/session-adjustment.resolver.ts
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { ValidateInput } from '@core/common/errors/validate-input.decorator';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { mapGqlToCoreParams } from '@src/adapters/graphql/pagination.mapper';
import { CreateSessionAdjustmentUsecase } from '@src/usecases/payout/create-session-adjustment.usecase';
import { SearchSessionAdjustmentsUsecase } from '@src/usecases/payout/search-session-adjustments.usecase';
import { UpdateSessionAdjustmentUsecase } from '@src/usecases/payout/update-session-adjustment.usecase';
import { PayoutSessionAdjustmentType } from './dto/session-adjustment.dto';
import { SearchSessionAdjustmentsInputGql } from './dto/session-adjustment.input';
import {
  CreateSessionAdjustmentInputGql,
  UpdateSessionAdjustmentInputGql,
} from './dto/session-adjustment.mutation.input';
import { PaginatedSessionAdjustmentsResult } from './dto/session-adjustment.result';

type SessionAdjustmentDTOInput = {
  id: number;
  customerId: number;
  deltaSessions: string;
  beforeSessions: string;
  afterSessions: string;
  reasonType: unknown;
  reasonNote: string | null;
  operatorAccountId: number | null;
  orderRef: string | null;
  createdAt: Date;
};

/**
 * 课次调整记录 GraphQL 解析器
 * - 仅做 DTO 映射与用例调用
 * - 权限由用例层负责，外部提供 JwtAuthGuard
 */
@Resolver(() => PayoutSessionAdjustmentType)
export class SessionAdjustmentResolver {
  constructor(
    private readonly searchUsecase: SearchSessionAdjustmentsUsecase,
    private readonly createUsecase: CreateSessionAdjustmentUsecase,
    private readonly updateUsecase: UpdateSessionAdjustmentUsecase,
  ) {}

  /**
   * 搜索与分页课次调整记录
   * - 允许 MANAGER / ADMIN / CUSTOMER（适配层不做角色拦截，交由用例判定）
   */
  @UseGuards(JwtAuthGuard)
  @ValidateInput()
  @Query(() => PaginatedSessionAdjustmentsResult, { description: '搜索与分页课次调整记录' })
  async searchSessionAdjustments(
    @Args('input') input: SearchSessionAdjustmentsInputGql,
    @currentUser() user: JwtPayload,
  ): Promise<PaginatedSessionAdjustmentsResult> {
    const session = mapJwtToUsecaseSession(user);
    const pagination = mapGqlToCoreParams({ ...input.pagination, sorts: input.sorts });
    const res = await this.searchUsecase.execute({
      session,
      params: {
        query: input.query,
        filters: {
          ...(typeof input.customerId === 'number' ? { customerId: input.customerId } : {}),
          ...(typeof input.operatorAccountId === 'number'
            ? { operatorAccountId: input.operatorAccountId }
            : {}),
          ...(typeof input.reasonType === 'string' ? { reasonType: input.reasonType } : {}),
          ...(typeof input.orderRef === 'string' ? { orderRef: input.orderRef } : {}),
          ...(typeof input.createdFrom === 'string' ? { createdFrom: input.createdFrom } : {}),
          ...(typeof input.createdTo === 'string' ? { createdTo: input.createdTo } : {}),
          ...(typeof input.direction === 'string' ? { direction: input.direction } : {}),
          ...(typeof input.customerName === 'string' ? { customerName: input.customerName } : {}),
        },
        pagination,
      },
    });

    return {
      items: res.items.map((e) => ({
        id: e.id,
        customerId: e.customerId,
        deltaSessions: e.deltaSessions,
        beforeSessions: e.beforeSessions,
        afterSessions: e.afterSessions,
        reasonType: String(e.reasonType),
        reasonNote: e.reasonNote,
        operatorAccountId: e.operatorAccountId,
        orderRef: e.orderRef,
        createdAt: e.createdAt,
      })),
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
      pageInfo: res.pageInfo
        ? {
            hasNext: res.pageInfo.hasNext ?? false,
            nextCursor: res.pageInfo.nextCursor,
          }
        : undefined,
    };
  }

  /**
   * 创建课次调整记录
   */
  @UseGuards(JwtAuthGuard)
  @ValidateInput()
  @Mutation(() => PayoutSessionAdjustmentType, { description: '创建课次调整记录' })
  async createSessionAdjustment(
    @Args('input') input: CreateSessionAdjustmentInputGql,
    @currentUser() user: JwtPayload,
  ): Promise<PayoutSessionAdjustmentType> {
    const session = mapJwtToUsecaseSession(user);
    const entity = await this.createUsecase.execute({
      session,
      customerId: input.customerId,
      deltaSessions: input.deltaSessions,
      beforeSessions: input.beforeSessions,
      afterSessions: input.afterSessions,
      reasonType: input.reasonType,
      reasonNote: input.reasonNote ?? null,
      operatorAccountId: input.operatorAccountId ?? null,
      orderRef: input.orderRef ?? null,
    });
    return this.toDTO(entity);
  }

  /**
   * 更新课次调整记录
   */
  @UseGuards(JwtAuthGuard)
  @ValidateInput()
  @Mutation(() => PayoutSessionAdjustmentType, { description: '更新课次调整记录' })
  async updateSessionAdjustment(
    @Args('input') input: UpdateSessionAdjustmentInputGql,
    @currentUser() user: JwtPayload,
  ): Promise<PayoutSessionAdjustmentType> {
    const session = mapJwtToUsecaseSession(user);
    const entity = await this.updateUsecase.execute({
      session,
      id: input.id,
      deltaSessions: input.deltaSessions,
      beforeSessions: input.beforeSessions,
      afterSessions: input.afterSessions,
      reasonType: input.reasonType,
      reasonNote: input.reasonNote ?? null,
      operatorAccountId: input.operatorAccountId ?? null,
      orderRef: input.orderRef ?? null,
    });
    return this.toDTO(entity);
  }

  /**
   * DTO 映射
   * @param e 实体
   */
  private toDTO(e: SessionAdjustmentDTOInput): PayoutSessionAdjustmentType {
    return {
      id: e.id,
      customerId: e.customerId,
      deltaSessions: e.deltaSessions,
      beforeSessions: e.beforeSessions,
      afterSessions: e.afterSessions,
      reasonType: String(e.reasonType),
      reasonNote: e.reasonNote,
      operatorAccountId: e.operatorAccountId,
      orderRef: e.orderRef,
      createdAt: e.createdAt,
    };
  }
}
