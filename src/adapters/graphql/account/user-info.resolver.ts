// 文件位置：src/adapters/graphql/account/user-info.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import { GetVisibleUserInfoUsecase } from '@src/usecases/account/get-visible-user-info.usecase';
import { UserInfoView } from '@app-types/models/auth.types';
import { currentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { BasicUserInfoDTO } from './dto/basic-user-info.dto';
import { UserInfoDTO } from './dto/user-info.dto';

/**
 * 用户信息 GraphQL 解析器
 * 适配 `GetVisibleUserInfoUsecase`，提供按可见性规则读取用户信息的查询。
 */
@Resolver()
export class UserInfoResolver {
  constructor(private readonly getVisibleUserInfoUsecase: GetVisibleUserInfoUsecase) {}

  /**
   * 按可见性读取用户信息（完整）
   * @param user 当前登录用户的 JWT 载荷
   * @param accountId 目标账户 ID
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => UserInfoDTO, { name: 'userInfo' })
  async userInfo(
    @currentUser() user: JwtPayload,
    @Args('accountId', { type: () => Int }) accountId: number,
  ): Promise<UserInfoDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const view = await this.getVisibleUserInfoUsecase.execute({
      session,
      targetAccountId: accountId,
      detail: 'FULL',
    });
    return this.mapViewToDTO(view);
  }

  /**
   * 按可见性读取用户信息（基础版）
   * @param user 当前登录用户的 JWT 载荷
   * @param accountId 目标账户 ID
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => BasicUserInfoDTO, { name: 'basicUserInfo' })
  async basicUserInfo(
    @currentUser() user: JwtPayload,
    @Args('accountId', { type: () => Int }) accountId: number,
  ): Promise<BasicUserInfoDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const view = await this.getVisibleUserInfoUsecase.execute({
      session,
      targetAccountId: accountId,
      detail: 'BASIC',
    });
    return this.mapViewToBasicDTO(view);
  }

  /**
   * 将领域视图映射为 GraphQL 完整 DTO
   */
  private mapViewToDTO(view: UserInfoView): UserInfoDTO {
    return {
      id: view.accountId,
      accountId: view.accountId,
      nickname: view.nickname,
      gender: view.gender,
      birthDate: view.birthDate,
      avatarUrl: view.avatarUrl,
      email: view.email,
      signature: view.signature,
      accessGroup: view.accessGroup,
      address: view.address,
      phone: view.phone,
      tags: view.tags,
      geographic: this.serializeGeographic(view.geographic),
      notifyCount: view.notifyCount,
      unreadCount: view.unreadCount,
      userState: view.userState,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    } as UserInfoDTO;
  }

  /**
   * 将领域视图映射为 GraphQL 基础 DTO
   */
  private mapViewToBasicDTO(view: UserInfoView): BasicUserInfoDTO {
    return {
      id: view.accountId,
      accountId: view.accountId,
      nickname: view.nickname,
      gender: view.gender,
      avatarUrl: view.avatarUrl,
      phone: view.phone,
    } as BasicUserInfoDTO;
  }

  private serializeGeographic(
    geo: { province?: string | null; city?: string | null } | null,
  ): string | null {
    if (!geo) return null;
    const parts: string[] = [];
    if (geo.province) parts.push(geo.province);
    if (geo.city) parts.push(geo.city);
    return parts.length > 0 ? parts.join(', ') : null;
  }
}
