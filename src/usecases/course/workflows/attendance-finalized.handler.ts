// 文件位置：/var/www/backend/src/usecases/course/workflows/attendance-finalized.handler.ts
import { decimalCompute } from '@core/common/numeric/decimal';
import type { IntegrationEventEnvelope } from '@core/common/integration-events/events.types';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import type { ParticipationAttendanceRecordEntity } from '@src/modules/participation/attendance/participation-attendance-record.entity';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { SessionAdjustmentReasonType } from '@src/modules/payout/session-adjustments/payout-session-adjustment.entity';
import { PayoutSessionAdjustmentsService } from '@src/modules/payout/session-adjustments/payout-session-adjustments.service';
import type { IntegrationEventHandler } from '@src/modules/common/integration-events/outbox.dispatcher';

/**
 * AttendanceFinalized 事件处理器（扣课 + 记录调整）
 */
@Injectable()
export class AttendanceFinalizedHandler implements IntegrationEventHandler {
  readonly type = 'AttendanceFinalized' as const;
  private readonly dedup = new Set<string>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly customerService: CustomerService,
    private readonly adjustmentsService: PayoutSessionAdjustmentsService,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * 处理 AttendanceFinalized 事件：按 dedupKey 幂等
   * @param input 事件信封包裹
   */
  async handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void> {
    const key = this.resolveDedupKey({ envelope: input.envelope });
    if (this.dedup.has(key)) return;
    this.dedup.add(key);

    const sessionId = this.parsePositiveInt({ value: input.envelope.payload.sessionId });
    if (!sessionId) {
      this.logger.warn(
        { type: input.envelope.type, dedupKey: key, payload: input.envelope.payload },
        'AttendanceFinalized payload missing sessionId',
      );
      return;
    }
    const finalizedBy = this.parsePositiveInt({ value: input.envelope.payload.finalizedBy });

    const records = await this.attendanceService.listBySession(sessionId);
    const chargeable = records.filter((r) =>
      this.isChargeableCount({ countApplied: r.countApplied }),
    );
    if (chargeable.length === 0) return;

    const enrollmentIds = Array.from(new Set(chargeable.map((r) => r.enrollmentId)));
    const enrollments = await this.enrollmentService.findManyByIds({ ids: enrollmentIds });
    const enrollmentMap = new Map<number, number>(enrollments.map((e) => [e.id, e.customerId]));

    const deductions = this.buildCustomerDeductions({ records: chargeable, enrollmentMap });
    if (deductions.size === 0) return;

    await this.dataSource.transaction(async (manager) => {
      const customerIds = Array.from(deductions.keys());
      const customers = await this.customerService.findManyByIds({ ids: customerIds, manager });
      const customerMap = new Map(customers.map((c) => [c.id, c]));
      const now = new Date();

      for (const [customerId, deductSessions] of deductions.entries()) {
        const customer = customerMap.get(customerId);
        if (!customer) continue;
        const beforeSessions = Number(customer.remainingSessions);
        const afterSessions = decimalCompute({
          op: 'add',
          a: beforeSessions,
          b: -deductSessions,
          outScale: 2,
        });
        await manager.getRepository(CustomerEntity).update(customerId, {
          remainingSessions: afterSessions,
          updatedBy: finalizedBy ?? null,
          updatedAt: now,
        });
        await this.adjustmentsService.appendAdjustment({
          customerId,
          deltaSessions: -deductSessions,
          beforeSessions,
          afterSessions,
          reasonType: SessionAdjustmentReasonType.ATTENDANCE_DEDUCT,
          reasonNote: `sessionId:${sessionId}`,
          operatorAccountId: finalizedBy ?? null,
          orderRef: null,
          manager,
        });
      }
    });
  }

  /**
   * 解析 dedupKey，保证一致性
   * @param params 参数对象
   */
  private resolveDedupKey(params: { readonly envelope: IntegrationEventEnvelope }): string {
    return (
      params.envelope.dedupKey ??
      `${params.envelope.type}:${params.envelope.aggregateId}:${params.envelope.schemaVersion}`
    );
  }

  /**
   * 解析正整数
   * @param params 参数对象
   */
  private parsePositiveInt(params: { readonly value: unknown }): number | null {
    const raw = params.value;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }

  /**
   * 判断是否需要扣课
   * @param params 参数对象
   */
  private isChargeableCount(params: { readonly countApplied: string | number }): boolean {
    const raw = params.countApplied;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && n > 0;
  }

  /**
   * 汇总客户扣课次数
   * @param params 参数对象
   */
  private buildCustomerDeductions(params: {
    readonly records: ReadonlyArray<ParticipationAttendanceRecordEntity>;
    readonly enrollmentMap: ReadonlyMap<number, number>;
  }): Map<number, number> {
    const result = new Map<number, number>();
    for (const record of params.records) {
      const customerId = params.enrollmentMap.get(record.enrollmentId);
      if (!customerId) continue;
      const current = result.get(customerId) ?? 0;
      const next = decimalCompute({
        op: 'add',
        a: current,
        b: Number(record.countApplied),
        outScale: 2,
      });
      result.set(customerId, next);
    }
    return result;
  }
}
