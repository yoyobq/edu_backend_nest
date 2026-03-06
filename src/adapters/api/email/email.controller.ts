import { BadRequestException, Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { QueueEmailUsecase } from '@src/usecases/email/queue-email.usecase';

interface QueueEmailRequestBody {
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly templateId?: string;
  readonly meta?: Readonly<Record<string, string>>;
  readonly dedupKey?: string;
  readonly traceId?: string;
}

@Controller('dev/email-queue')
export class EmailController {
  constructor(private readonly queueEmailUsecase: QueueEmailUsecase) {}

  @Post('send')
  async queueEmail(@Body() body: QueueEmailRequestBody) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev email queue endpoint is disabled in production');
    }
    if (!body.to || !body.subject || body.to.trim().length === 0 || body.subject.trim().length === 0) {
      throw new BadRequestException('`to` and `subject` are required');
    }
    const result = await this.queueEmailUsecase.execute({
      to: body.to.trim(),
      subject: body.subject.trim(),
      text: body.text,
      html: body.html,
      templateId: body.templateId,
      meta: body.meta,
      dedupKey: body.dedupKey,
      traceId: body.traceId,
    });
    return {
      queued: true,
      ...result,
    };
  }
}
