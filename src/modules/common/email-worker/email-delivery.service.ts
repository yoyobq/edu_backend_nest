import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { PinoLogger } from 'nestjs-pino';
import type { SendEmailInput, SendEmailResult } from './email-worker.types';

@Injectable()
export class EmailDeliveryService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(EmailDeliveryService.name);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (input.to.endsWith('@fail.local')) {
      throw new Error('Simulated email provider failure');
    }
    await sleep(80);
    const providerMessageId = `mock-${randomUUID()}`;
    this.logger.info(
      {
        to: this.maskEmail(input.to),
        subject: input.subject,
        providerMessageId,
        templateId: input.templateId,
      },
      'Mock email sent',
    );
    return {
      accepted: true,
      providerMessageId,
    };
  }

  private maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const [localPart, domainPart] = parts;
    if (localPart.length <= 2) {
      return `${localPart.charAt(0) || '*'}***@${domainPart}`;
    }
    return `${localPart.slice(0, 2)}***@${domainPart}`;
  }
}
