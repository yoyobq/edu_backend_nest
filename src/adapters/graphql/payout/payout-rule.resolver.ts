// src/adapters/graphql/payout/payout-rule.resolver.ts
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { Roles } from '@src/adapters/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/graphql/guards/roles.guard';
import { mapGqlToCoreParams } from '@src/adapters/graphql/pagination.mapper';
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
  ) {}

  /**
   * 构造搜索过滤（纯函数，无副作用）
   * 说明：将 GraphQL 输入的宽类型转换为局部强类型，再安全映射到 SearchParams 允许的 Record
   * @param input GraphQL 搜索输入
   * @returns SearchParams.filters 兼容的键值对
   */
  private buildSearchFilters(
    input: SearchPayoutRulesInput,
  ): Readonly<Record<string, string | number | boolean>> {
    const normalized: Record<string, string | number | boolean | undefined> = {
      isTemplate: this.toTinyInt(input.isTemplate),
      isActive: this.toTinyInt(input.isActive),
      seriesId: this.toNumberOrUndefined(input.seriesId),
      // 语义：仅模板 → 通过 onlyTemplates 在服务层映射为 series_id IS NULL
      onlyTemplates: input.onlyTemplates === true ? true : undefined,
      createdFrom: input.createdFrom ?? undefined,
      createdTo: input.createdTo ?? undefined,
      updatedFrom: input.updatedFrom ?? undefined,
      updatedTo: input.updatedTo ?? undefined,
    };
    return this.pickDefined(normalized);
  }

  /**
   * 将可选布尔值规范化为 TINYINT（0/1），未提供返回 undefined
   * @param value 布尔输入
   * @returns 0 / 1 或 undefined
   */
  private toTinyInt(value?: boolean): number | undefined {
    return typeof value === 'boolean' ? (value ? 1 : 0) : undefined;
  }

  /**
   * 仅接受 number 类型，其他返回 undefined（避免 any）
   * @param value 可能是 number 的输入
   * @returns number 或 undefined
   */
  private toNumberOrUndefined(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * 过滤出对象中已定义的键值，返回 SearchParams 兼容类型
   * @param obj 含可选字段的对象
   * @returns 仅包含已定义字段的只读键值对
   */
  private pickDefined(
    obj: Record<string, string | number | boolean | undefined>,
  ): Readonly<Record<string, string | number | boolean>> {
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

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
    // 适配层输出：将 TINYINT 数值映射为 GraphQL Boolean
    return {
      id: e.id,
      seriesId: e.seriesId,
      ruleJson: {
        base: e.ruleJson.base,
        explain: e.ruleJson.explain,
        factors: e.ruleJson.factors,
      },
      description: e.description,
      isTemplate: !!e.isTemplate,
      isActive: !!e.isActive,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      createdBy: e.createdBy,
      updatedBy: e.updatedBy,
    };
  }

  /**
   * 创建结算规则或模板
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
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
      // 输入布尔 -> 用例层依旧是 number（0/1）
      isTemplate: typeof input.isTemplate === 'boolean' ? (input.isTemplate ? 1 : 0) : undefined,
      isActive: typeof input.isActive === 'boolean' ? (input.isActive ? 1 : 0) : undefined,
      session,
    });
    return { rule: this.toDTO(result.rule), isNewlyCreated: result.isNewlyCreated };
  }

  /** 查询：按 ID */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Query(() => PayoutSeriesRuleType, { description: '按 ID 查询结算规则' })
  async payoutRuleById(
    @Args('input') input: GetPayoutRuleByIdInput,
  ): Promise<PayoutSeriesRuleType> {
    const rule = await this.getUsecase.byId({ id: input.id });
    return this.toDTO(rule);
  }

  /** 查询：按系列 ID */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Query(() => PayoutSeriesRuleType, { description: '按系列 ID 查询课程绑定规则' })
  async payoutRuleBySeries(
    @Args('input') input: GetPayoutRuleBySeriesInput,
  ): Promise<PayoutSeriesRuleType> {
    const rule = await this.getUsecase.bySeries({ seriesId: input.seriesId });
    return this.toDTO(rule);
  }

  /** 列表 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager', 'coach')
  @Query(() => ListPayoutRulesResult, { description: '列出结算规则/模板' })
  async listPayoutRules(
    @Args('input') input: ListPayoutRulesInput,
  ): Promise<ListPayoutRulesResult> {
    const items = await this.listUsecase.execute({
      isTemplate: typeof input.isTemplate === 'boolean' ? (input.isTemplate ? 1 : 0) : undefined,
      isActive: typeof input.isActive === 'boolean' ? (input.isActive ? 1 : 0) : undefined,
      seriesId: input.seriesId ?? undefined,
    });
    return { items: items.map((e) => this.toDTO(e)) };
  }

  /** 更新元信息 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
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
        isActive: typeof input.isActive === 'boolean' ? (input.isActive ? 1 : 0) : undefined,
      },
      session,
    });
    return { rule: this.toDTO(rule) };
  }

  /** 更新 JSON */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Mutation(() => BindOrUnbindPayoutRuleResult, { description: '绑定模板到课程系列' })
  async bindPayoutRule(
    @Args('input') input: BindPayoutRuleInput,
    @currentUser() user: JwtPayload,
  ): Promise<BindOrUnbindPayoutRuleResult> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.bindUsecase.execute({
      ruleId: input.ruleId,
      seriesId: input.seriesId,
      session,
    });
    return { rule: this.toDTO(result.rule), isUpdated: result.isUpdated };
  }

  /** 解绑课程系列 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Mutation(() => BindOrUnbindPayoutRuleResult, { description: '解绑课程系列与结算规则' })
  async unbindPayoutRule(
    @Args('input') input: UnbindPayoutRuleInput,
    @currentUser() user: JwtPayload,
  ): Promise<BindOrUnbindPayoutRuleResult> {
    const session = mapJwtToUsecaseSession(user);
    const rule = await this.unbindUsecase.execute({ ruleId: input.ruleId, session });
    return { rule: this.toDTO(rule), isUpdated: true };
  }

  /** 停用 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Query(() => ListPayoutRulesResult, { description: '搜索与分页结算规则（不含 JSON 细项）' })
  async searchPayoutRules(
    @Args('input') input: SearchPayoutRulesInput,
  ): Promise<ListPayoutRulesResult> {
    const page = mapGqlToCoreParams({ ...input.pagination, sorts: input.sorts });
    // 过滤构造下沉为私有纯函数，降低分支复杂度
    const filters = this.buildSearchFilters(input);

    const res = await this.listUsecase.searchPaged({
      params: { query: input.query, filters, pagination: page },
    });

    return { items: res.items.map((e) => this.toDTO(e)) };
  }
}
