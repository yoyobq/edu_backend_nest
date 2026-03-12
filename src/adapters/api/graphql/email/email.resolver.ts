// src/adapters/api/graphql/email/email.resolver.ts
import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { QueueEmailUsecase } from '@src/usecases/email-queue/queue-email.usecase';
import { QueueEmailInput } from './dto/queue-email.input';
import { QueueEmailResult } from './dto/queue-email.result';

@Resolver()
export class EmailResolver {
  constructor(private readonly queueEmailUsecase: QueueEmailUsecase) {}

  @Mutation(() => QueueEmailResult, { description: '将邮件投递请求加入队列' })
  @ValidateInput()
  async queueEmail(@Args('input') input: QueueEmailInput): Promise<QueueEmailResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '生产环境禁用邮件队列调试入口');
    }

    const result = await this.queueEmailUsecase.execute({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      templateId: input.templateId,
      meta: input.meta,
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });

    return {
      queued: true,
      jobId: result.jobId,
      traceId: result.traceId,
    };
  }
}
