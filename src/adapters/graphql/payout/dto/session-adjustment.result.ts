// 文件位置：src/adapters/graphql/payout/dto/session-adjustment.result.ts
import { ObjectType } from '@nestjs/graphql';
import { paginatedTypeFactory } from '@src/adapters/graphql/pagination.type-factory';
import { PayoutSessionAdjustmentType } from './session-adjustment.dto';

/**
 * 课次调整记录分页结果
 */
@ObjectType({ description: '课次调整记录分页结果' })
export class PaginatedSessionAdjustmentsResult extends paginatedTypeFactory(
  PayoutSessionAdjustmentType,
) {}
