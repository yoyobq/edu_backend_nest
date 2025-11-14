// src/adapters/graphql/course/workflows/session-close.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import { CloseSessionUsecase } from '@src/usecases/course/workflows/close-session.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

/**
 * 关闭节次输入（GraphQL DTO）
 */
@Resolver()
export class SessionCloseResolver {
  constructor(private readonly closeUsecase: CloseSessionUsecase) {}

  /**
   * 关闭节次（结课）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { name: 'closeSession' })
  async closeSession(
    @currentUser() user: JwtPayload,
    @Args('sessionId', { type: () => Number }) sessionId: number,
  ): Promise<boolean> {
    const session = mapJwtToUsecaseSession(user);
    await this.closeUsecase.execute(session, { sessionId });
    return true;
  }
}
