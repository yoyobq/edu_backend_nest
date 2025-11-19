// 文件位置：src/adapters/graphql/membership-levels/membership-levels.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { ListMembershipLevelsUsecase } from '@src/usecases/membership-levels/list-membership-levels.usecase';
import { MembershipLevelType } from '../account/dto/identity/membership-level.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/**
 * 会员等级 GraphQL Resolver
 * 提供只读的等级列表，供前端下拉/多选组件使用。
 */
@Resolver(() => MembershipLevelType)
export class MembershipLevelsResolver {
  constructor(private readonly listUsecase: ListMembershipLevelsUsecase) {}

  /**
   * 列出所有会员等级（只读）
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [MembershipLevelType], { name: 'membershipLevels' })
  async membershipLevels(): Promise<MembershipLevelType[]> {
    const result = await this.listUsecase.execute();
    return result.levels.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      benefits: l.benefits ? JSON.stringify(l.benefits) : null,
    }));
  }
}
