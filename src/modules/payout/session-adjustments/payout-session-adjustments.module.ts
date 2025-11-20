// src/modules/payout/session-adjustments/payout-session-adjustments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchModule } from '@src/modules/common/search.module';
import { PayoutSessionAdjustmentEntity } from './payout-session-adjustment.entity';
import { PayoutSessionAdjustmentsService } from './payout-session-adjustments.service';

@Module({
  imports: [TypeOrmModule.forFeature([PayoutSessionAdjustmentEntity]), SearchModule],
  providers: [PayoutSessionAdjustmentsService],
  exports: [TypeOrmModule, PayoutSessionAdjustmentsService],
})
export class PayoutSessionAdjustmentsModule {}
