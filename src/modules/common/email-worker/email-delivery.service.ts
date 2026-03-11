// /var/www/worker-backend/src/modules/common/email-worker/email-delivery.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import type { SendEmailInput, SendEmailResult } from './email-worker.types';

@Injectable()
export class EmailDeliveryService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext(EmailDeliveryService.name);
  }

  /**
   * 发送邮件，使用本机 sendmail 交给 Postfix 转发。
   */
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const providerMessageId = `sendmail-${randomUUID()}`;
    const body = input.html ?? input.text ?? '';
    const contentType = input.html ? 'text/html; charset="UTF-8"' : 'text/plain; charset="UTF-8"';
    const fromAddress = this.configService.get<string>('EMAIL_FROM');
    const sendmailPath = this.configService.get<string>('SENDMAIL_PATH') ?? '/usr/sbin/sendmail';
    const headers: string[] = [`To: ${input.to}`, `Subject: ${input.subject}`, 'MIME-Version: 1.0'];
    if (fromAddress) {
      headers.push(`From: ${fromAddress}`);
    }
    headers.push(`Content-Type: ${contentType}`);
    const message = `${headers.join('\n')}\n\n${body}\n`;
    await this.sendWithSendmail({
      message,
      to: input.to,
      subject: input.subject,
      sendmailPath,
    });
    this.logger.info(
      {
        to: this.maskEmail(input.to),
        subject: input.subject,
        providerMessageId,
        templateId: input.templateId,
      },
      'Email sent via sendmail',
    );
    return {
      accepted: true,
      providerMessageId,
    };
  }

  /**
   * 通过 sendmail 执行发送，错误会抛出给上层处理。
   */
  private async sendWithSendmail(input: {
    readonly message: string;
    readonly to: string;
    readonly subject: string;
    readonly sendmailPath: string;
  }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(input.sendmailPath, ['-t', '-i'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        reject(error);
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            `Sendmail failed (code ${code}) for ${input.to} subject "${input.subject}": ${stderr}`,
          ),
        );
      });
      child.stdin.write(input.message);
      child.stdin.end();
    });
  }

  /**
   * 邮箱脱敏，避免日志泄露。
   */
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
