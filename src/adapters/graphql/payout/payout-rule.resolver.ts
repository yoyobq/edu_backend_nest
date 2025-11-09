// src/adapters/graphql/payout/payout-rule.resolver.ts
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import type { ICursorSigner } from '@core/pagination/pagination.ports';
import type { CursorToken } from '@core/pagination/pagination.types';
import { Inject, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { mapGqlToCoreParams } from '@src/adapters/graphql/pagination.mapper';
import { PAGINATION_TOKENS } from '@src/modules/common/tokens/pagination.tokens';
import { BindPayoutRuleUsecase } from '@src/usecases/course/payout/bind-payout-rule.usecase';
import { CreatePayoutRuleUsecase } from '@src/usecases/course/payout/create-payout-rule.usecase';
import { DeactivatePayoutRuleUsecase } from '@src/usecases/course/payout/deactivate-payout-rule.usecase';
import { GetPayoutRuleUsecase } from '@src/usecases/course/payout/get-payout-rule.usecase';
import { ListPayoutRulesUsecase } from '@src/usecases/course/payout/list-payout-rules.usecase';
import { ReactivatePayoutRuleUsecase } from '@src/usecases/course/payout/reactivate-payout-rule.usecase';
import { UnbindPayoutRuleUsecase } from '@src/usecases/course/payout/unbind-payout-rule.usecase';
import { UpdatePayoutRuleUsecase } from '@src/usecases/course/payout/update-payout-rule.usecase';
import { PayoutSeriesRuleType } from './dto/payout-rule.dto';
import {
  BindPayoutRuleInput,
  CreatePayoutRuleInput,
  GetPayoutRuleByIdInput,
  GetPayoutRuleBySeriesInput,
  ListPayoutRulesInput,
  SearchPayoutRulesInput,
  TogglePayoutRuleActiveInput,
  UnbindPayoutRuleInput,
  UpdatePayoutRuleJsonInput,
  UpdatePayoutRuleMetaInput,
} from './dto/payout-rule.input';
import {
  BindOrUnbindPayoutRuleResult,
  CreatePayoutRuleResult,
  ListPayoutRulesResult,
  TogglePayoutRuleActiveResult,
  UpdatePayoutRuleResult,
} from './dto/payout-rule.result';

/**
 * 结算规则 GraphQL 解析器
 * - 仅做 DTO 映射与 Usecase 调用
 * - 权限与业务规则由 Usecase 层负责
 */
@Resolver(() => PayoutSeriesRuleType)
export class PayoutRuleResolver {
  constructor(
    private readonly createUsecase: CreatePayoutRuleUsecase,
    private readonly updateUsecase: UpdatePayoutRuleUsecase,
    private readonly bindUsecase: BindPayoutRuleUsecase,
    private readonly unbindUsecase: UnbindPayoutRuleUsecase,
    private readonly listUsecase: ListPayoutRulesUsecase,
    private readonly getUsecase: GetPayoutRuleUsecase,
    private readonly reactivateUsecase: ReactivatePayoutRuleUsecase,
    private readonly deactivateUsecase: DeactivatePayoutRuleUsecase,
    // 注入游标签名器用于解析/签名游标字符串
    @Inject(PAGINATION_TOKENS.CURSOR_SIGNER) private readonly cursorSigner: ICursorSigner,
  ) {}

  /**
   * 将实体映射为 GraphQL 输出类型
   * @param e 规则实体（仅使用必要字段，避免适配层依赖 modules 实体类型）
   */
  private toDTO(e: {
    readonly id: number;
    readonly seriesId: number | null;
    readonly ruleJson: {
      readonly base: number;
      readonly explain: string;
      readonly factors: Record<string, number>;
    };
    readonly description: string | null;
    readonly isTemplate: number;
    readonly isActive: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly createdBy: number | null;
    readonly updatedBy: number | null;
  }): PayoutSeriesRuleType {
    return {
      id: e.id,
      seriesId: e.seriesId,
      ruleJson: {
        base: e.ruleJson.base,
        explain: e.ruleJson.explain,
        factors: e.ruleJson.factors,
      },
      description: e.description,
      isTemplate: e.isTemplate,
      isActive: e.isActive,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      createdBy: e.createdBy,
      updatedBy: e.updatedBy,
    };
  }

  /**
   * 创建结算规则或模板
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => CreatePayoutRuleResult, { description: '创建结算规则或模板' })
  async createPayoutRule(
    @Args('input') input: CreatePayoutRuleInput,
    @currentUser() user: JwtPayload,
  ): Promise<CreatePayoutRuleResult> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.createUsecase.execute({
      seriesId: input.seriesId ?? null,
      ruleJson: input.ruleJson,
      description: input.description ?? null,
      isTemplate: input.isTemplate,
      isActive: input.isActive,
      session,
    });
    return { rule: this.toDTO(result.rule), isNewlyCreated: result.isNewlyCreated };
  }

  /** 查询：按 ID */
  @Query(() => PayoutSeriesRuleType, { description: '按 ID 查询结算规则' })
  async payoutRuleById(
    @Args('input') input: GetPayoutRuleByIdInput,
  ): Promise<PayoutSeriesRuleType> {
    const rule = await this.getUsecase.byId({ id: input.id });
    return this.toDTO(rule);
  }

  /** 查询：按系列 ID */
  @Query(() => PayoutSeriesRuleType, { description: '按系列 ID 查询课程绑定规则' })
  async payoutRuleBySeries(
    @Args('input') input: GetPayoutRuleBySeriesInput,
  ): Promise<PayoutSeriesRuleType> {
    const rule = await this.getUsecase.bySeries({ seriesId: input.seriesId });
    return this.toDTO(rule);
  }

  /** 列表 */
  @Query(() => ListPayoutRulesResult, { description: '列出结算规则/模板' })
  async listPayoutRules(
    @Args('input') input: ListPayoutRulesInput,
  ): Promise<ListPayoutRulesResult> {
    const items = await this.listUsecase.execute({
      isTemplate: input.isTemplate,
      isActive: input.isActive,
      seriesId: input.seriesId ?? undefined,
    });
    return { items: items.map((e) => this.toDTO(e)) };
  }

  /** 更新元信息 */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => UpdatePayoutRuleResult, { description: '更新结算规则元信息' })
  async updatePayoutRuleMeta(
    @Args('input') input: UpdatePayoutRuleMetaInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpdatePayoutRuleResult> {
    const session = mapJwtToUsecaseSession(user);
    const rule = await this.updateUsecase.updateMeta({
      id: input.id,
      patch: {
        description: input.description ?? undefined,
        isActive: input.isActive,
        isTemplate: input.isTemplate,
      },
      session,
    });
    return { rule: this.toDTO(rule) };
  }

  /** 更新 JSON */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => UpdatePayoutRuleResult, { description: '更新结算规则 JSON' })
  async updatePayoutRuleJson(
    @Args('input') input: UpdatePayoutRuleJsonInput,
    @currentUser() user: JwtPayload,
  ): Promise<UpdatePayoutRuleResult> {
    const session = mapJwtToUsecaseSession(user);
    const rule = await this.updateUsecase.updateJson({
      id: input.id,
      ruleJson: input.ruleJson,
      session,
    });
    return { rule: this.toDTO(rule) };
  }

  /** 绑定模板到系列 */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => BindOrUnbindPayoutRuleResult, { description: '绑定模板到课程系列' })
  async bindPayoutRule(
    @Args('input') input: BindPayoutRuleInput,
    @currentUser() user: JwtPayload,
  ): Promise<BindOrUnbindPayoutRuleResult> {
    const session = mapJwtToUsecaseSession(user);
    const rule = await this.bindUsecase.execute({
      ruleId: input.ruleId,
      seriesId: input.seriesId,
      session,
    });
    return { rule: this.toDTO(rule) };
  }

  /** 解绑课程系列 */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => BindOrUnbindPayoutRuleResult, { description: '解绑课程系列与结算规则' })
  async unbindPayoutRule(
    @Args('input') input: UnbindPayoutRuleInput,
    @currentUser() user: JwtPayload,
  ): Promise<BindOrUnbindPayoutRuleResult> {
    const session = mapJwtToUsecaseSession(user);
    const rule = await this.unbindUsecase.execute({ ruleId: input.ruleId, session });
    return { rule: this.toDTO(rule) };
  }

  /** 停用 */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => TogglePayoutRuleActiveResult, { description: '停用结算规则' })
  async deactivatePayoutRule(
    @Args('input') input: TogglePayoutRuleActiveInput,
    @currentUser() user: JwtPayload,
  ): Promise<TogglePayoutRuleActiveResult> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.deactivateUsecase.execute({ id: input.id, session });
    return { rule: this.toDTO(result.rule), isUpdated: result.isUpdated };
  }

  /** 启用 */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => TogglePayoutRuleActiveResult, { description: '启用结算规则' })
  async reactivatePayoutRule(
    @Args('input') input: TogglePayoutRuleActiveInput,
    @currentUser() user: JwtPayload,
  ): Promise<TogglePayoutRuleActiveResult> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.reactivateUsecase.execute({ id: input.id, session });
    return { rule: this.toDTO(result.rule), isUpdated: result.isUpdated };
  }

  /**
   * 搜索 + 分页（不含 JSON 细项）
   * - 文本搜索 description
   * - 过滤 isTemplate/isActive/seriesId/时间范围
   * - 排序 createdAt / id / seriesId / isActive / isTemplate
   * - 支持 OFFSET / CURSOR
   */
  @Query(() => ListPayoutRulesResult, { description: '搜索与分页结算规则（不含 JSON 细项）' })
  async searchPayoutRules(
    @Args('input') input: SearchPayoutRulesInput,
  ): Promise<ListPayoutRulesResult> {
    const page = mapGqlToCoreParams({ ...input.pagination, sorts: input.sorts });
    const after = page.mode === 'CURSOR' ? page.after : undefined;
    const token: CursorToken | undefined = after ? this.cursorSigner.verify(after) : undefined;

    const filters: Record<string, string | number | boolean> = {};
    if (typeof input.isTemplate === 'number') filters.isTemplate = input.isTemplate;
    if (typeof input.isActive === 'number') filters.isActive = input.isActive;
    if (typeof input.seriesId === 'number') filters.seriesId = input.seriesId;
    if (input.seriesId === null) filters.seriesId = null as unknown as number; // 占位：服务层特判 IS NULL
    if (input.createdFrom) filters.createdFrom = input.createdFrom;
    if (input.createdTo) filters.createdTo = input.createdTo;
    if (input.updatedFrom) filters.updatedFrom = input.updatedFrom;
    if (input.updatedTo) filters.updatedTo = input.updatedTo;

    const res = await this.listUsecase.searchPaged({
      params: { query: input.query, filters, pagination: page },
      cursorToken: token,
    });

    return { items: res.items.map((e) => this.toDTO(e)) };
  }
}
