import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  QM_WORKER_ENTRY_POLICY_KEY,
  type QmWorkerEntryPolicy,
} from '@src/adapters/api/graphql/decorators/qm-worker-entry.decorator';

@Injectable()
export class QmWorkerEntryGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<QmWorkerEntryPolicy>(
      QM_WORKER_ENTRY_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) {
      return true;
    }

    if (!this.isEnabled(policy)) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, policy.disabledMessage);
    }

    return true;
  }

  private isEnabled(policy: QmWorkerEntryPolicy): boolean {
    const configValue = this.configService.get<boolean | undefined>(policy.enabledConfigKey);
    return configValue === true;
  }
}
