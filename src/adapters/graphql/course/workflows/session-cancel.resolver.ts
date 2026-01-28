// src/adapters/graphql/course/workflows/session-cancel.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import { CancelSessionUsecase } from '@src/usecases/course/workflows/cancel-session.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

@Resolver()
export class SessionCancelResolver {
  constructor(private readonly cancelSessionUsecase: CancelSessionUsecase) {}

  /**
   * 取消节次（标记为 CANCELED）
   * @param user 当前登录用户的 JWT 载荷
   * @param sessionId 节次 ID
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { name: 'cancelSession' })
  async cancelSession(
    @currentUser() user: JwtPayload,
    @Args('sessionId', { type: () => Number }) sessionId: number,
  ): Promise<boolean> {
    const session = mapJwtToUsecaseSession(user);
    await this.cancelSessionUsecase.execute(session, { sessionId });
    return true;
  }
}
