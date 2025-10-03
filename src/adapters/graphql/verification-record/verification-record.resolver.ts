// src/adapters/graphql/verification-record/verification-record.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { ConsumeVerificationRecordUsecase } from '@usecases/verification-record/consume-verification-record.usecase';
import { CreateVerificationRecordUsecase } from '@usecases/verification-record/create-verification-record.usecase';
import { FindVerificationRecordUsecase } from '@usecases/verification-record/find-verification-record.usecase';
import { ConsumeVerificationRecordInput } from './dto/consume-verification-record.input';
import { CreateVerificationRecordInput } from './dto/create-verification-record.input';
import { FindVerificationRecordInput } from './dto/find-verification-record.input';
import { VerificationRecordDTO } from './dto/verification-record.dto';
import {
  CreateVerificationRecordResult,
  UpdateVerificationRecordResult,
} from './dto/verification-record.result';

/**
 * 验证记录 GraphQL 解析器
 * 提供验证记录的创建、查找、消费等 GraphQL 接口
 */
@Resolver(() => VerificationRecordDTO)
export class VerificationRecordResolver {
  constructor(
    private readonly createVerificationRecordUsecase: CreateVerificationRecordUsecase,
    private readonly findVerificationRecordUsecase: FindVerificationRecordUsecase,
    private readonly consumeVerificationRecordUsecase: ConsumeVerificationRecordUsecase,
  ) {}

  /**
   * 创建验证记录
   */
  @Mutation(() => CreateVerificationRecordResult, { description: '创建验证记录' })
  @UseGuards(JwtAuthGuard)
  async createVerificationRecord(
    @Args('input') input: CreateVerificationRecordInput,
    @currentUser() user: JwtPayload,
  ): Promise<CreateVerificationRecordResult> {
    try {
      const result = await this.createVerificationRecordUsecase.execute({
        type: input.type,
        customToken: input.token,
        tokenLength: input.tokenLength,
        generateNumericCode: input.generateNumericCode,
        numericCodeLength: input.numericCodeLength,
        targetAccountId: input.targetAccountId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        payload: input.payload,
        expiresAt: input.expiresAt,
        notBefore: input.notBefore,
        issuedByAccountId: user.sub,
      });

      return {
        success: true,
        data: {
          id: result.record.id,
          type: result.record.type,
          status: result.record.status,
          expiresAt: result.record.expiresAt,
          notBefore: result.record.notBefore,
          targetAccountId: result.record.targetAccountId,
          subjectType: result.record.subjectType,
          subjectId: result.record.subjectId,
          payload: result.record.payload,
          issuedByAccountId: result.record.issuedByAccountId,
          consumedByAccountId: result.record.consumedByAccountId,
          consumedAt: result.record.consumedAt,
          createdAt: result.record.createdAt,
          updatedAt: result.record.updatedAt,
        },
        token: input.returnToken === true ? result.token : null,
        message: null,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        message: error instanceof Error ? error.message : '创建验证记录失败',
      };
    }
  }

  /**
   * 查找验证记录
   */
  @Query(() => VerificationRecordDTO, { nullable: true, description: '查找验证记录' })
  async findVerificationRecord(
    @Args('input') input: FindVerificationRecordInput,
  ): Promise<VerificationRecordDTO | null> {
    if (!input.token) {
      return null;
    }

    try {
      const result = await this.findVerificationRecordUsecase.findActiveConsumableByToken({
        token: input.token,
        expectedType: input.expectedType,
        ignoreTargetRestriction: input.ignoreTargetRestriction,
      });

      if (!result) {
        return null;
      }

      return {
        id: result.id,
        type: result.type,
        status: result.status,
        expiresAt: result.expiresAt,
        notBefore: result.notBefore,
        targetAccountId: result.targetAccountId,
        subjectType: result.subjectType,
        subjectId: result.subjectId,
        payload: result.payload,
        issuedByAccountId: result.issuedByAccountId,
        consumedByAccountId: result.consumedByAccountId,
        consumedAt: result.consumedAt,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * 消费验证记录
   */
  @Mutation(() => UpdateVerificationRecordResult, { description: '消费验证记录' })
  @UseGuards(JwtAuthGuard)
  async consumeVerificationRecord(
    @Args('input') input: ConsumeVerificationRecordInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpdateVerificationRecordResult> {
    try {
      // 使用当前登录用户作为消费者
      const consumedByAccountId = user.sub;

      // 通过 token 消费
      const result = await this.consumeVerificationRecordUsecase.consumeByToken({
        token: input.token,
        consumedByAccountId,
        expectedType: input.expectedType,
      });

      return {
        success: true,
        data: {
          id: result.id,
          type: result.type,
          status: result.status,
          expiresAt: result.expiresAt,
          notBefore: result.notBefore,
          targetAccountId: result.targetAccountId,
          subjectType: result.subjectType,
          subjectId: result.subjectId,
          payload: result.payload,
          issuedByAccountId: result.issuedByAccountId,
          consumedByAccountId: result.consumedByAccountId,
          consumedAt: result.consumedAt,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        },
        message: null,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        message: error instanceof Error ? error.message : '消费验证记录失败',
      };
    }
  }
}
