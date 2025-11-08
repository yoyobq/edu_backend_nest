// src/adapters/graphql/identity-management/coach/coach.resolver.ts
import { JwtPayload } from '@app-types/jwt.types';
import { EmploymentStatus } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { DeactivateCoachUsecase } from '@src/usecases/identity-management/coach/deactivate-coach.usecase';
import { ReactivateCoachUsecase } from '@src/usecases/identity-management/coach/reactivate-coach.usecase';
import { UpdateCoachUsecase } from '@src/usecases/identity-management/coach/update-coach.usecase';
import { CoachType } from '../../account/dto/identity/coach.dto';
import { DeactivateCoachInput } from './dto/coach.input.deactivate';
import { ReactivateCoachInput } from './dto/coach.input.reactivate';
import { UpdateCoachInput } from './dto/coach.input.update';
import {
  DeactivateCoachResult,
  ReactivateCoachResult,
  UpdateCoachResult,
} from './dto/coach.result';

/**
 * Coach 管理 GraphQL 解析器
 * - 提供更新、下线、上线三个操作
 * - 仅做 DTO 与 Usecase 的薄适配；业务规则由 Usecase 层实现
 */
@Resolver(() => CoachType)
export class CoachResolver {
  constructor(
    private readonly updateCoachUsecase: UpdateCoachUsecase,
    private readonly deactivateCoachUsecase: DeactivateCoachUsecase,
    private readonly reactivateCoachUsecase: ReactivateCoachUsecase,
  ) {}

  /**
   * 更新教练信息
   * @param input 更新输入参数
   * @param user 当前用户信息
   * @returns 更新后的教练信息
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => UpdateCoachResult, { description: '更新教练信息' })
  async updateCoach(
    @Args('input') input: UpdateCoachInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpdateCoachResult> {
    const entity: CoachEntity = await this.updateCoachUsecase.execute({
      currentAccountId: Number(user.sub),
      coachId: input.coachId,
      name: input.name,
      level: input.level,
      description: input.description ?? null,
      avatarUrl: input.avatarUrl ?? null,
      specialty: input.specialty ?? null,
      remark: input.remark ?? null,
    });

    return { coach: this.mapCoachEntityToType(entity) };
  }

  /**
   * 下线教练
   * @param input 下线输入参数
   * @param user 当前用户信息
   * @returns 下线结果（含是否更新）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => DeactivateCoachResult, { description: '下线教练' })
  async deactivateCoach(
    @Args('input') input: DeactivateCoachInput,
    @currentUser() user: JwtPayload,
  ): Promise<DeactivateCoachResult> {
    const result = await this.deactivateCoachUsecase.execute(Number(user.sub), { id: input.id });
    return {
      coach: this.mapCoachEntityToType(result.coach),
      isUpdated: result.isUpdated,
    };
  }

  /**
   * 上线教练
   * @param input 上线输入参数
   * @param user 当前用户信息
   * @returns 上线结果（含是否更新）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => ReactivateCoachResult, { description: '上线教练' })
  async reactivateCoach(
    @Args('input') input: ReactivateCoachInput,
    @currentUser() user: JwtPayload,
  ): Promise<ReactivateCoachResult> {
    const result = await this.reactivateCoachUsecase.execute(Number(user.sub), { id: input.id });
    return {
      coach: this.mapCoachEntityToType(result.coach),
      isUpdated: result.isUpdated,
    };
  }

  /**
   * 将 Coach 实体映射为 GraphQL 输出类型
   * @param entity 教练实体
   * @returns GraphQL 输出 DTO
   */
  private mapCoachEntityToType(entity: CoachEntity): CoachType {
    const dto: CoachType = {
      id: entity.id,
      accountId: entity.accountId,
      name: entity.name,
      remark: entity.remark,
      employmentStatus: entity.deactivatedAt ? EmploymentStatus.LEFT : EmploymentStatus.ACTIVE,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      level: entity.level,
      description: entity.description,
      avatarUrl: entity.avatarUrl,
      specialty: entity.specialty,
      deactivatedAt: entity.deactivatedAt ?? null,
    };
    return dto;
  }
}
