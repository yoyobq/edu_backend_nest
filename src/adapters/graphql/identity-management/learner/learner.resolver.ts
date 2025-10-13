// src/adapters/graphql/identity-management/learner/learner.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { CreateMyLearnerUsecase } from '@src/usecases/identity-management/learner/create-my-learner.usecase';
import { DeleteMyLearnerUsecase } from '@src/usecases/identity-management/learner/delete-my-learner.usecase';
import { GetMyLearnerUsecase } from '@src/usecases/identity-management/learner/get-my-learner.usecase';
import {
  ListMyLearnersUsecase,
  PaginatedLearners,
} from '@src/usecases/identity-management/learner/list-my-learners.usecase';
import { UpdateMyLearnerUsecase } from '@src/usecases/identity-management/learner/update-my-learner.usecase';
import { CreateLearnerInput } from './dto/learner.input.create';
import { DeleteLearnerInput } from './dto/learner.input.delete';
import { GetLearnerInput } from './dto/learner.input.get';
import { LearnerOutput } from './dto/learner.output';
import { ListLearnersInput } from './dto/learner.input.list';
import { ListLearnersOutput } from './dto/learners.output';
import { UpdateLearnerInput } from './dto/learner.input.update';

/**
 * 学员管理 GraphQL Resolver
 * 提供学员的增删改查功能
 */
@Resolver(() => LearnerOutput)
export class LearnerResolver {
  constructor(
    private readonly createMyLearnerUsecase: CreateMyLearnerUsecase,
    private readonly updateMyLearnerUsecase: UpdateMyLearnerUsecase,
    private readonly deleteMyLearnerUsecase: DeleteMyLearnerUsecase,
    private readonly getMyLearnerUsecase: GetMyLearnerUsecase,
    private readonly listMyLearnersUsecase: ListMyLearnersUsecase,
  ) {}

  /**
   * 创建我的学员
   * @param input 创建学员输入参数
   * @param user 当前用户信息
   * @returns 创建的学员信息
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => LearnerOutput, { description: '创建我的学员' })
  async createMyLearner(
    @Args('input') input: CreateLearnerInput,
    @currentUser() user: JwtPayload,
  ): Promise<LearnerOutput> {
    const result = await this.createMyLearnerUsecase.execute({
      currentAccountId: Number(user.sub),
      name: input.name,
      gender: input.gender,
      birthDate: input.birthDate,
      avatarUrl: input.avatarUrl,
      specialNeeds: input.specialNeeds,
      remark: input.remark,
      countPerSession: input.countPerSession,
    });

    return this.mapLearnerEntityToOutput(result.learner);
  }

  /**
   * 更新我的学员信息
   * @param input 更新学员输入参数
   * @param user 当前用户信息
   * @returns 更新后的学员信息
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => LearnerOutput, { description: '更新我的学员信息' })
  async updateMyLearner(
    @Args('input') input: UpdateLearnerInput,
    @currentUser() user: JwtPayload,
  ): Promise<LearnerOutput> {
    const result = await this.updateMyLearnerUsecase.execute(Number(user.sub), {
      id: input.learnerId,
      name: input.name,
      gender: input.gender,
      birthDate: input.birthDate,
      avatarUrl: input.avatarUrl,
      specialNeeds: input.specialNeeds,
      remark: input.remark,
      countPerSession: input.countPerSession,
    });

    return this.mapLearnerEntityToOutput(result);
  }

  /**
   * 删除我的学员
   * @param input 删除学员输入参数
   * @param user 当前用户信息
   * @returns 删除是否成功
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: '删除我的学员' })
  async deleteMyLearner(
    @Args('input') input: DeleteLearnerInput,
    @currentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.deleteMyLearnerUsecase.execute(Number(user.sub), input.learnerId);

    return true;
  }

  /**
   * 获取我的学员信息
   * @param input 获取学员输入参数
   * @param user 当前用户信息
   * @returns 学员信息
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => LearnerOutput, { description: '获取我的学员信息' })
  async myLearner(
    @Args('input') input: GetLearnerInput,
    @currentUser() user: JwtPayload,
  ): Promise<LearnerOutput> {
    const result: LearnerEntity = await this.getMyLearnerUsecase.execute(
      Number(user.sub),
      input.learnerId,
    );

    return this.mapLearnerEntityToOutput(result);
  }

  /**
   * 分页查询我的学员列表
   * @param input 查询学员列表输入参数
   * @param user 当前用户信息
   * @returns 学员列表和分页信息
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => ListLearnersOutput, { description: '分页查询我的学员列表' })
  async myLearners(
    @Args('input') input: ListLearnersInput,
    @currentUser() user: JwtPayload,
  ): Promise<ListLearnersOutput> {
    const result: PaginatedLearners = await this.listMyLearnersUsecase.execute(Number(user.sub), {
      page: input.page,
      limit: input.limit,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    });

    return {
      learners: result.items.map((learner: LearnerEntity) =>
        this.mapLearnerEntityToOutput(learner),
      ),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1,
      },
    };
  }

  /**
   * 将学员实体映射为 GraphQL 输出 DTO
   * @param learner 学员实体
   * @returns GraphQL 输出 DTO
   */
  private mapLearnerEntityToOutput(learner: LearnerEntity): LearnerOutput {
    return {
      id: learner.id,
      name: learner.name,
      gender: learner.gender,
      birthDate: learner.birthDate,
      avatarUrl: learner.avatarUrl,
      specialNeeds: learner.specialNeeds,
      countPerSession: learner.countPerSession,
      remark: learner.remark,
      createdAt: learner.createdAt,
      updatedAt: learner.updatedAt,
    };
  }
}
