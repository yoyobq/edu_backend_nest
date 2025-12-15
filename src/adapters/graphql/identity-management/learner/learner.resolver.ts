// src/adapters/graphql/identity-management/learner/learner.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { OrderDirection } from '@src/types/common/sort.types';
import { CreateLearnerUsecase } from '@src/usecases/identity-management/learner/create-learner.usecase';
import { DeleteLearnerUsecase } from '@src/usecases/identity-management/learner/delete-learner.usecase';
import { GetLearnerUsecase } from '@src/usecases/identity-management/learner/get-learner.usecase';
import {
  ListLearnersUsecase,
  PaginatedLearners,
} from '@src/usecases/identity-management/learner/list-learners.usecase';
import { UpdateLearnerByCustomerUsecase } from '@src/usecases/identity-management/learner/update-learner-by-customer.usecase';
import { UpdateLearnerByManagerUsecase } from '@src/usecases/identity-management/learner/update-learner-by-manager.usecase';
import { LearnerOutput } from './dto/learner.arg';
import { CreateLearnerInput } from './dto/learner.input.create';
import { DeleteLearnerInput } from './dto/learner.input.delete';
import { GetLearnerInput } from './dto/learner.input.get';
import { ListLearnersInput } from './dto/learner.input.list';
import { UpdateLearnerInput } from './dto/learner.input.update';
import { ListLearnersOutput } from './dto/learners.list';

/**
 * 学员管理 GraphQL Resolver
 * 提供学员的增删改查功能
 */
@Resolver(() => LearnerOutput)
export class LearnerResolver {
  constructor(
    private readonly createLearnerUsecase: CreateLearnerUsecase,
    private readonly updateLearnerByCustomerUsecase: UpdateLearnerByCustomerUsecase,
    private readonly updateLearnerByManagerUsecase: UpdateLearnerByManagerUsecase,
    private readonly deleteLearnerUsecase: DeleteLearnerUsecase,
    private readonly getLearnerUsecase: GetLearnerUsecase,
    private readonly listLearnersUsecase: ListLearnersUsecase,
  ) {}

  /**
   * 创建学员
   * @param input 创建学员输入参数
   * @param user 当前用户信息
   * @returns 创建的学员信息
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => LearnerOutput, { description: '创建学员' })
  async createLearner(
    @Args('input') input: CreateLearnerInput,
    @currentUser() user: JwtPayload,
  ): Promise<LearnerOutput> {
    const result = await this.createLearnerUsecase.execute({
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
   * 更新学员信息
   * @param input 更新学员输入参数
   * @param user 当前用户信息
   * @returns 更新后的学员信息
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => LearnerOutput, { description: '更新学员信息' })
  async updateLearner(
    @Args('input') input: UpdateLearnerInput,
    @currentUser() user: JwtPayload,
  ): Promise<LearnerOutput> {
    const accountId = Number(user.sub);
    const isManager =
      Array.isArray(user.accessGroup) &&
      user.accessGroup.some((r) => String(r).toUpperCase() === 'MANAGER');
    const result: LearnerEntity = isManager
      ? await this.updateLearnerByManagerUsecase.execute(accountId, {
          id: input.learnerId,
          customerId: input.customerId,
          name: input.name,
          gender: input.gender,
          birthDate: input.birthDate,
          avatarUrl: input.avatarUrl,
          specialNeeds: input.specialNeeds,
          remark: input.remark,
          countPerSession: input.countPerSession,
          targetCustomerId: input.targetCustomerId,
          deactivate: input.deactivate,
        })
      : await this.updateLearnerByCustomerUsecase.execute(accountId, {
          id: input.learnerId,
          customerId: input.customerId,
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
   * 删除学员
   * @param input 删除学员输入参数
   * @param user 当前用户信息
   * @returns 删除是否成功
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean, { description: '删除学员' })
  async deleteLearner(
    @Args('input') input: DeleteLearnerInput,
    @currentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.deleteLearnerUsecase.execute(Number(user.sub), input.learnerId, input.customerId);

    return true;
  }

  /**
   * 获取学员信息
   * @param input 获取学员输入参数
   * @param user 当前用户信息
   * @returns 学员信息
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => LearnerOutput, { description: '获取学员信息' })
  async learner(
    @Args('input') input: GetLearnerInput,
    @currentUser() user: JwtPayload,
  ): Promise<LearnerOutput> {
    const isManager =
      Array.isArray(user.accessGroup) &&
      user.accessGroup.some((r) => String(r).toUpperCase() === 'MANAGER');
    const result: LearnerEntity = await this.getLearnerUsecase.execute(
      Number(user.sub),
      input.learnerId,
      input.customerId,
      isManager ? 'MANAGER' : user.activeRole,
    );

    return this.mapLearnerEntityToOutput(result);
  }

  /**
   * 分页查询学员列表
   * @param input 查询学员列表输入参数
   * @param user 当前用户信息
   * @returns 学员列表和分页信息
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => ListLearnersOutput, { description: '分页查询学员列表' })
  async learners(
    @Args('input') input: ListLearnersInput,
    @currentUser() user: JwtPayload,
  ): Promise<ListLearnersOutput> {
    const result: PaginatedLearners = await this.listLearnersUsecase.execute(
      Number(user.sub),
      {
        page: input.page,
        limit: input.limit,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder || OrderDirection.DESC,
        customerId: input.customerId,
      },
      user.activeRole,
    );

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
      customerId: learner.customerId,
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
