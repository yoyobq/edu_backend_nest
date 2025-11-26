// 文件位置：src/adapters/graphql/payout/session-adjustment.resolver.ts
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { ValidateInput } from '@core/common/errors/validate-input.decorator';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { mapGqlToCoreParams } from '@src/adapters/graphql/pagination.mapper';
import { SearchSessionAdjustmentsUsecase } from '@src/usecases/payout/search-session-adjustments.usecase';
import { PayoutSessionAdjustmentType } from './dto/session-adjustment.dto';
import { SearchSessionAdjustmentsInputGql } from './dto/session-adjustment.input';
import { PaginatedSessionAdjustmentsResult } from './dto/session-adjustment.result';

/**
 * 课次调整记录 GraphQL 解析器
 * - 仅做 DTO 映射与用例调用
 * - 权限由用例层负责，外部提供 JwtAuthGuard
 */
@Resolver(() => PayoutSessionAdjustmentType)
export class SessionAdjustmentResolver {
  constructor(private readonly searchUsecase: SearchSessionAdjustmentsUsecase) {}

  /**
   * 搜索与分页课次调整记录
   * - 允许 MANAGER / CUSTOMER（适配层不做角色拦截，交由用例判定）
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
}
