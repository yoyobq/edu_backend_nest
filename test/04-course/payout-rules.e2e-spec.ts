// 文件位置：test/04-course/payout-rules.e2e-spec.ts
import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import {
  ClassMode,
  CourseSeriesStatus,
  PublisherType,
  VenueType,
} from '@app-types/models/course-series.types';
import { CourseLevel } from '@app-types/models/course.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { executeGql as executeGqlUtils } from '../utils/e2e-graphql-utils';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { CourseCatalogEntity } from '../../src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '../../src/modules/course/series/course-series.entity';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 结算规则（课酬规则） E2E 测试
 * 覆盖：创建模板与课程绑定规则、查询、更新元信息与 JSON、绑定/解绑、停用/启用（幂等语义）
 */
describe('Payout Rules (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let managerToken: string;
  let coachToken: string;

  let catalogId: number;
  let seriesId: number;
  let seriesId2: number;
  let coachSeriesId: number;
  let coachBoundRuleId: number;

  // 统一基础规则 JSON，用于创建与更新
  const baseRuleJson = {
    base: 120,
    explain: '基础课酬规则说明（测试用）',
    factors: { peak: 1.2, weekend: 1.1 },
  } as const;

  /**
   * 将 Record<string, number> 转换为 GraphQL 输入对象字面量字符串
   * 示例：{ a: 1, b: 0.9 } -> "{ a: 1, b: 0.9 }"
   */
  const toGqlFactors = (obj: Record<string, number>): string => {
    const entries = Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `{ ${entries} }`;
  };

  beforeAll(async () => {
    // 初始化 GraphQL Schema
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // 账号准备
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource, includeKeys: ['manager', 'coach', 'guest'] });

    managerToken = await loginAndGetToken(
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );

    // 获取 coach 账号的 access token，用于权限负例校验
    coachToken = await loginAndGetToken(
      testAccountsConfig.coach.loginName,
      testAccountsConfig.coach.loginPassword,
    );

    // 课程目录与系列准备
    catalogId = await ensureTestCatalog();
    seriesId = await createTestSeries(catalogId);
    seriesId2 = await createTestSeries(catalogId);

    // 为 coach 创建一个自有系列（用于权限正例）
    const coachId = await (async (): Promise<number> => {
      const resp = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation Login($input: AuthLoginInput!) {
              login(input: $input) {
                role
                identity { ... on CoachType { id } }
              }
            }
          `,
          variables: {
            input: {
              loginName: testAccountsConfig.coach.loginName,
              loginPassword: testAccountsConfig.coach.loginPassword,
              type: LoginTypeEnum.PASSWORD,
              audience: AudienceTypeEnum.DESKTOP,
            },
          },
        })
        .expect(200);
      if (resp.body.errors)
        throw new Error(`读取教练身份失败: ${JSON.stringify(resp.body.errors)}`);
      return resp.body.data.login.identity.id as number;
    })();
    coachSeriesId = await (async () => {
      const repo = dataSource.getRepository(CourseSeriesEntity);
      const now = new Date();
      const start = new Date(now.getTime() + 24 * 3600 * 1000);
      const end = new Date(now.getTime() + 8 * 24 * 3600 * 1000);
      const created = await repo.save(
        repo.create({
          catalogId,
          publisherType: PublisherType.COACH,
          publisherId: coachId,
          title: `测试系列 ${Date.now()}`,
          description: '自动化测试系列（教练自有）',
          venueType: VenueType.SANDA_GYM,
          classMode: ClassMode.SMALL_CLASS,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          recurrenceRule: null,
          leaveCutoffHours: 12,
          pricePerSession: '100.00',
          teachingFeeRef: '80.00',
          maxLearners: 8,
          status: CourseSeriesStatus.PLANNED,
          remark: 'E2E 测试用系列（教练自有）',
          createdBy: null,
          updatedBy: null,
        }),
      );
      return created.id;
    })();
  }, 60000);

  afterAll(async () => {
    // 清理测试生成的数据
    await cleanupPayoutRules();
    await cleanupSeriesAndCatalog();
    await cleanupTestAccounts(dataSource);
    if (app) await app.close();
  });

  /**
   * 登录并获取 access token
   * @param loginName 登录名
   * @param loginPassword 登录密码
   * @returns access token
   */
  const loginAndGetToken = async (loginName: string, loginPassword: string): Promise<string> => {
    const resp = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) { accessToken }
          }
        `,
        variables: {
          input: {
            loginName,
            loginPassword,
            type: LoginTypeEnum.PASSWORD,
            audience: AudienceTypeEnum.DESKTOP,
          },
        },
      })
      .expect(200);
    if (resp.body.errors) throw new Error(`登录失败: ${JSON.stringify(resp.body.errors)}`);
    return resp.body.data.login.accessToken as string;
  };

  /**
   * 确保存在一个测试课程目录，返回其 ID
   * 使用直接写库创建，便于在用例中专注于结算规则流程
   * @returns 课程目录 ID
   */
  const ensureTestCatalog = async (): Promise<number> => {
    const repo = dataSource.getRepository(CourseCatalogEntity);
    const level = CourseLevel.FITNESS;
    const existing = await repo.findOne({ where: { courseLevel: level } });
    if (existing) {
      await repo.update(existing.id, {
        title: '体能课程（测试）',
        description: '测试目录',
        deactivatedAt: null,
      });
      return existing.id;
    }
    const created = await repo.save(
      repo.create({
        courseLevel: level,
        title: '体能课程（测试）',
        description: '测试目录',
        deactivatedAt: null,
        createdBy: null,
        updatedBy: null,
      }),
    );
    return created.id;
  };

  /**
   * 创建一个测试课程系列，返回其 ID
   * @param cid 课程目录 ID
   */
  const createTestSeries = async (cid: number): Promise<number> => {
    const repo = dataSource.getRepository(CourseSeriesEntity);
    const now = new Date();
    const start = new Date(now.getTime() + 24 * 3600 * 1000);
    const end = new Date(now.getTime() + 8 * 24 * 3600 * 1000);
    const created = await repo.save(
      repo.create({
        catalogId: cid,
        publisherType: PublisherType.MANAGER,
        publisherId: 1, // 测试数据：不影响绑定校验（仅要求存在 seriesId）
        title: `测试系列 ${Date.now()}`,
        description: '自动化测试系列',
        venueType: VenueType.SANDA_GYM,
        classMode: ClassMode.SMALL_CLASS,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        recurrenceRule: null,
        leaveCutoffHours: 12,
        pricePerSession: '100.00',
        teachingFeeRef: '80.00',
        maxLearners: 8,
        status: CourseSeriesStatus.PLANNED,
        remark: 'E2E 测试用系列',
        createdBy: null,
        updatedBy: null,
      }),
    );
    return created.id;
  };

  /**
   * 清理测试生成的结算规则
   */
  const cleanupPayoutRules = async (): Promise<void> => {
    await dataSource.query(
      'DELETE FROM payout_series_rule WHERE series_id IS NULL OR series_id IN (?, ?, ?)',
      [seriesId ?? 0, seriesId2 ?? 0, coachSeriesId ?? 0],
    );
  };

  /**
   * 清理测试生成的系列与目录
   */
  const cleanupSeriesAndCatalog = async (): Promise<void> => {
    if (seriesId) await dataSource.query('DELETE FROM course_series WHERE id = ?', [seriesId]);
    if (seriesId2) await dataSource.query('DELETE FROM course_series WHERE id = ?', [seriesId2]);
    if (coachSeriesId)
      await dataSource.query('DELETE FROM course_series WHERE id = ?', [coachSeriesId]);
    if (catalogId) await dataSource.query('DELETE FROM course_catalogs WHERE id = ?', [catalogId]);
  };

  /**
   * 执行 GraphQL 查询/变更（可选携带 token）
   * @param query GraphQL 文本
   * @param token 可选 access token
   */
  const executeGQL = (query: string, token?: string): request.Test =>
    executeGqlUtils({ app, query, token });

  describe('创建与查询结算规则', () => {
    let templateRuleId: number;
    let boundRuleId: number;

    it('创建模板规则（不传 seriesId），返回 isNewlyCreated=true', async () => {
      const mutation = `
        mutation {
          createPayoutRule(input: {
            ruleJson: { base: ${baseRuleJson.base}, explain: "${baseRuleJson.explain}", factors: ${toGqlFactors(
              baseRuleJson.factors,
            )} },
            description: "模板规则（测试）",
            isTemplate: true,
            isActive: true
          }) {
            rule { id seriesId isTemplate isActive description ruleJson { base explain factors } }
            isNewlyCreated
          }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      const payload = res.body.data.createPayoutRule;
      expect(payload.isNewlyCreated).toBe(true);
      expect(payload.rule.seriesId).toBeNull();
      expect(payload.rule.isTemplate).toBe(true);
      templateRuleId = payload.rule.id as number;
    });

    it('创建绑定规则（传 seriesId），若不存在则创建并返回 isNewlyCreated=true', async () => {
      const mutation = `
        mutation {
          createPayoutRule(input: {
            seriesId: ${seriesId},
            ruleJson: { base: 150, explain: "系列规则（测试）", factors: ${toGqlFactors({ offpeak: 0.9 })} },
            description: "系列绑定规则（测试）",
            isTemplate: false,
            isActive: true
          }) {
            rule { id seriesId isTemplate isActive description ruleJson { base explain factors } }
            isNewlyCreated
          }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      const payload = res.body.data.createPayoutRule;
      expect(payload.isNewlyCreated).toBe(true);
      expect(payload.rule.seriesId).toBe(seriesId);
      expect(payload.rule.isTemplate).toBe(false);
      boundRuleId = payload.rule.id as number;
    });

    it('按 ID 查询：payoutRuleById', async () => {
      const query = `
        query { payoutRuleById(input: { id: ${boundRuleId} }) { id seriesId isTemplate isActive ruleJson { base } } }
      `;
      const res = await executeGQL(query, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const rule = res.body.data.payoutRuleById;
      expect(rule.id).toBe(boundRuleId);
      expect(rule.seriesId).toBe(seriesId);
      expect(rule.isTemplate).toBe(false);
    });

    it('按系列查询：payoutRuleBySeries', async () => {
      const query = `
        query { payoutRuleBySeries(input: { seriesId: ${seriesId} }) { id seriesId isTemplate isActive } }
      `;
      const res = await executeGQL(query, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const rule = res.body.data.payoutRuleBySeries;
      expect(rule.id).toBe(boundRuleId);
      expect(rule.seriesId).toBe(seriesId);
      expect(rule.isTemplate).toBe(false);
    });

    it('列出规则：listPayoutRules（可过滤 isTemplate/isActive）', async () => {
      const query = `
        query {
          listPayoutRules(input: { isTemplate: true, isActive: true }) {
            items { id seriesId isTemplate isActive }
          }
        }
      `;
      const res = await executeGQL(query, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.listPayoutRules.items as Array<{
        id: number;
        isTemplate: boolean;
      }>;
      expect(Array.isArray(items)).toBe(true);
      const hasTemplate = items.some((i) => i.id === templateRuleId && i.isTemplate === true);
      expect(hasTemplate).toBe(true);
    });
  });

  describe('更新、绑定与启停操作', () => {
    let targetRuleId: number;

    beforeAll(async () => {
      // 使用模板规则作为绑定目标
      const mutation = `
        mutation {
          createPayoutRule(input: {
            ruleJson: { base: 200, explain: "模板用于绑定测试", factors: ${toGqlFactors({ levelA: 1.05 })} },
            description: "待绑定模板",
            isTemplate: true,
            isActive: true
          }) { rule { id } isNewlyCreated }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      targetRuleId = res.body.data.createPayoutRule.rule.id as number;
    });

    it('绑定模板到系列：bindPayoutRule（使用第二个系列避免冲突）', async () => {
      const mutation = `
        mutation {
          bindPayoutRule(input: { ruleId: ${targetRuleId}, seriesId: ${seriesId2} }) {
            rule { id seriesId isTemplate updatedBy }
            isUpdated
          }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const rule = res.body.data.bindPayoutRule.rule;
      const isUpdated = res.body.data.bindPayoutRule.isUpdated as boolean;
      expect(rule.seriesId).toBe(seriesId2);
      expect(rule.isTemplate).toBe(false);
      expect(isUpdated).toBe(true);
    });

    it('更新元信息：updatePayoutRuleMeta（描述 + 停用）', async () => {
      const mutation = `
        mutation {
          updatePayoutRuleMeta(input: { id: ${targetRuleId}, description: "更新后的描述", isActive: false }) {
            rule { id description isActive updatedBy }
          }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const rule = res.body.data.updatePayoutRuleMeta.rule;
      expect(rule.description).toBe('更新后的描述');
      expect(rule.isActive).toBe(false);
    });

    it('更新 JSON：updatePayoutRuleJson（校验 base 非负与 factors 数字）', async () => {
      const mutation = `
        mutation {
          updatePayoutRuleJson(input: {
            id: ${targetRuleId},
            ruleJson: { base: 220, explain: "更新 JSON", factors: ${toGqlFactors({ peak: 1.15, extra: 0.95 })} }
          }) {
            rule { id ruleJson { base explain factors } updatedBy }
          }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const rule = res.body.data.updatePayoutRuleJson.rule;
      expect(rule.ruleJson.base).toBe(220);
      expect(rule.ruleJson.explain).toBe('更新 JSON');
    });

    it('停用：deactivatePayoutRule 在已停用情况下返回 isUpdated=false', async () => {
      const mutation = `
        mutation { deactivatePayoutRule(input: { id: ${targetRuleId} }) { rule { id isActive } isUpdated } }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const payload = res.body.data.deactivatePayoutRule;
      expect(payload.rule.isActive).toBe(false);
      expect(payload.isUpdated).toBe(false);
    });

    it('停用幂等：再次停用返回 isUpdated=false', async () => {
      const mutation = `
        mutation { deactivatePayoutRule(input: { id: ${targetRuleId} }) { rule { id isActive } isUpdated } }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const payload = res.body.data.deactivatePayoutRule;
      expect(payload.rule.isActive).toBe(false);
      expect(payload.isUpdated).toBe(false);
    });

    it('启用：reactivatePayoutRule 返回 isUpdated=true（若原为停用）', async () => {
      const mutation = `
        mutation { reactivatePayoutRule(input: { id: ${targetRuleId} }) { rule { id isActive } isUpdated } }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const payload = res.body.data.reactivatePayoutRule;
      expect(payload.rule.isActive).toBe(true);
      expect(payload.isUpdated).toBe(true);
    });

    it('解绑：unbindPayoutRule 将规则变为模板（seriesId=null, isTemplate=1）', async () => {
      const mutation = `
        mutation { unbindPayoutRule(input: { ruleId: ${targetRuleId} }) { rule { id seriesId isTemplate } } }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      const rule = res.body.data.unbindPayoutRule.rule;
      expect(rule.seriesId).toBeNull();
      expect(rule.isTemplate).toBe(true);
    });
  });

  describe('搜索与分页负例：searchPayoutRules', () => {
    /**
     * 非法排序字段：在 SearchEngine 中将被白名单过滤并回退默认排序
     * 期望响应成功且无 GraphQL 错误（与 learners 用法保持一致）
     */
    it('非法排序字段被忽略并回退默认排序（不抛错）', async () => {
      const query = `
        query {
          searchPayoutRules(input: {
            pagination: { mode: OFFSET, page: 1, pageSize: 10 },
            sorts: [ { field: "unknownField", direction: DESC } ]
          }) {
            items { id }
          }
        }
      `;
      const res = await executeGQL(query, managerToken).expect(200);
      // 断言成功，无 GraphQL 错误（unknownField 被过滤，回退默认排序 createdAt/id）
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data?.searchPayoutRules?.items).toBeDefined();
    });

    /**
     * 游标互斥：after 与 before 同时提供时触发 PAGINATION_INVALID_CURSOR
     * GraphQL 错误结构：extensions.errorCode = 'PAGINATION_INVALID_CURSOR'
     */
    it('游标互斥校验：after 与 before 同时提供触发 INVALID_CURSOR', async () => {
      // 注：GraphQL PaginationArgs 不暴露 before 字段；此负例改为提供非法游标结构触发 INVALID_CURSOR
      const query = `
        query {
          searchPayoutRules(input: {
            pagination: { mode: CURSOR, limit: 5, after: "dummy", sorts: [ { field: "createdAt", direction: DESC } ] },
            sorts: [ { field: "createdAt", direction: DESC } ]
          }) {
            items { id }
          }
        }
      `;
      // 通过提供无效游标（无法解析）断言 INVALID_CURSOR
      const res = await executeGQL(query, managerToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions.errorCode).toBe('PAGINATION_INVALID_CURSOR');
    });

    /**
     * CURSOR 模式下非法排序字段：同样将被白名单过滤并回退默认排序
     * 期望响应成功，无 GraphQL 错误
     */
    it('CURSOR 模式非法排序字段被忽略，正常返回（不抛错）', async () => {
      const query = `
        query {
          searchPayoutRules(input: {
            pagination: { mode: CURSOR, limit: 5 },
            sorts: [ { field: "unknownField", direction: ASC } ]
          }) {
            items { id }
          }
        }
      `;
      const res = await executeGQL(query, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data?.searchPayoutRules?.items).toBeDefined();
    });
  });

  describe('权限负例：coach 写操作应返回 INSUFFICIENT_PERMISSIONS', () => {
    let coachTestRuleId: number;

    beforeAll(async () => {
      // 预置一个模板规则用于 bind/update 测试（由 manager 创建）
      const mutation = `
        mutation {
          createPayoutRule(input: {
            ruleJson: { base: 180, explain: "coach 权限负例预置模板", factors: ${toGqlFactors({ peak: 1.1 })} },
            description: "coach 权限负例预置模板",
            isTemplate: true,
            isActive: true
          }) { rule { id } isNewlyCreated }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      if (res.body.errors) throw new Error(`预置模板失败: ${JSON.stringify(res.body.errors)}`);
      coachTestRuleId = res.body.data.createPayoutRule.rule.id as number;
    });

    /**
     * coach 角色调用 createPayoutRule 应返回 INSUFFICIENT_PERMISSIONS
     */
    it('权限负例：coach 调用 createPayoutRule 返回 INSUFFICIENT_PERMISSIONS', async () => {
      const mutation = `
        mutation {
          createPayoutRule(input: {
            ruleJson: { base: 160, explain: "coach create 负例", factors: ${toGqlFactors({ offpeak: 0.95 })} },
            description: "coach create 负例",
            isTemplate: true,
            isActive: true
          }) { rule { id } isNewlyCreated }
        }
      `;
      const res = await executeGQL(mutation, coachToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    /**
     * coach 角色调用 bindPayoutRule 应返回 INSUFFICIENT_PERMISSIONS
     */
    it('权限负例：coach 调用 bindPayoutRule 返回 INSUFFICIENT_PERMISSIONS', async () => {
      const mutation = `
        mutation {
          bindPayoutRule(input: { ruleId: ${coachTestRuleId}, seriesId: ${seriesId} }) {
            rule { id seriesId isTemplate }
            isUpdated
          }
        }
      `;
      const res = await executeGQL(mutation, coachToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    /**
     * coach 角色调用 updatePayoutRuleMeta 应返回 INSUFFICIENT_PERMISSIONS
     */
    it('权限负例：coach 调用 updatePayoutRuleMeta 返回 INSUFFICIENT_PERMISSIONS', async () => {
      const mutation = `
        mutation {
          updatePayoutRuleMeta(input: { id: ${coachTestRuleId}, description: "coach 更新元信息", isActive: false }) {
            rule { id description isActive }
          }
        }
      `;
      const res = await executeGQL(mutation, coachToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    /**
     * coach 角色调用 updatePayoutRuleJson 应返回 INSUFFICIENT_PERMISSIONS
     */
    it('权限负例：coach 调用 updatePayoutRuleJson 返回 INSUFFICIENT_PERMISSIONS', async () => {
      const mutation = `
        mutation {
          updatePayoutRuleJson(input: {
            id: ${coachTestRuleId},
            ruleJson: { base: 200, explain: "coach 更新 JSON", factors: ${toGqlFactors({ levelB: 1.02 })} }
          }) {
            rule { id ruleJson { base explain } }
          }
        }
      `;
      const res = await executeGQL(mutation, coachToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('权限与负例', () => {
    let guestToken: string;
    let coachToken: string;

    beforeAll(async () => {
      guestToken = await loginAndGetToken(
        testAccountsConfig.guest.loginName,
        testAccountsConfig.guest.loginPassword,
      );
      coachToken = await loginAndGetToken(
        testAccountsConfig.coach.loginName,
        testAccountsConfig.coach.loginPassword,
      );
    });

    it('权限负例：非 manager 角色调用 createPayoutRule 应失败', async () => {
      const mutation = `
        mutation {
          createPayoutRule(input: {
            ruleJson: { base: 100, explain: "权限负例", factors: ${toGqlFactors({ a: 1 })} },
            description: "权限测试",
            isTemplate: true,
            isActive: true
          }) { rule { id } isNewlyCreated }
        }
      `;
      const res = await executeGQL(mutation, guestToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('JSON 负例：createPayoutRule base 为负触发 JSON_INVALID', async () => {
      const mutation = `
        mutation {
          createPayoutRule(input: {
            ruleJson: { base: -1, explain: "负值", factors: ${toGqlFactors({ a: 1 })} },
            description: "JSON 负例",
            isTemplate: true,
            isActive: true
          }) { rule { id } isNewlyCreated }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions?.errorCode).toBe('PAYOUT_RULE_JSON_INVALID');
    });

    it('互斥负例：createPayoutRule seriesId=null 且 isTemplate=false 触发 INVALID_TEMPLATE_FLAG', async () => {
      const mutation = `
        mutation {
          createPayoutRule(input: {
            ruleJson: { base: 100, explain: "互斥负例", factors: ${toGqlFactors({ a: 1 })} },
            description: "互斥测试",
            isTemplate: false
          }) { rule { id } isNewlyCreated }
        }
      `;
      const res = await executeGQL(mutation, managerToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions?.errorCode).toBe('PAYOUT_RULE_INVALID_TEMPLATE_FLAG');
    });

    it('禁用规则绑定负例：先停用，再尝试绑定触发 INACTIVE_BIND', async () => {
      // 1. 创建模板并停用
      const createRes = await executeGQL(
        `
          mutation {
            createPayoutRule(input: {
              ruleJson: { base: 90, explain: "禁用绑定负例", factors: ${toGqlFactors({ x: 1 })} },
              description: "禁用绑定",
              isTemplate: true,
              isActive: true
            }) { rule { id } isNewlyCreated }
          }
        `,
        managerToken,
      ).expect(200);
      const ruleId = createRes.body.data.createPayoutRule.rule.id as number;

      const deactivateRes = await executeGQL(
        `mutation { deactivatePayoutRule(input: { id: ${ruleId} }) { rule { id isActive } isUpdated } }`,
        managerToken,
      ).expect(200);
      expect(deactivateRes.body.errors).toBeUndefined();
      expect(deactivateRes.body.data.deactivatePayoutRule.rule.isActive).toBe(false);

      // 2. 尝试绑定 → 期望业务错误 INACTIVE_BIND
      const bindMutation = `
        mutation { bindPayoutRule(input: { ruleId: ${ruleId}, seriesId: ${seriesId} }) { rule { id } isUpdated } }
      `;
      const res = await executeGQL(bindMutation, managerToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions?.errorCode).toBe('PAYOUT_RULE_INACTIVE_BIND');
    });

    it('权限校验：payoutRuleById 仅 manager 可访问，coach 应失败', async () => {
      const query = `
        query {
          payoutRuleById(input: { id: 1 }) { id }
        }
      `;
      const res = await executeGQL(query, coachToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('权限校验：payoutRuleBySeries 仅 manager 可访问，coach 应失败', async () => {
      // coach 访问他人系列应失败（权限不足 / 非归属）
      const queryOther = `
        query {
          payoutRuleBySeries(input: { seriesId: ${seriesId} }) { id }
        }
      `;
      const resOther = await executeGQL(queryOther, coachToken).expect(200);
      expect(Array.isArray(resOther.body.errors)).toBe(true);
      const errOther = resOther.body.errors[0];
      expect(errOther.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');

      // 先为 coach 自有系列创建规则（由 manager 执行，绑定到 coachSeriesId）
      const createRes = await executeGQL(
        `
          mutation {
            createPayoutRule(input: {
              seriesId: ${coachSeriesId},
              ruleJson: { base: 130, explain: "coach 自有系列规则", factors: ${toGqlFactors({ own: 1.0 })} },
              description: "coach 系列绑定规则",
              isTemplate: false,
              isActive: true
            }) { rule { id seriesId isTemplate isActive } isNewlyCreated }
          }
        `,
        managerToken,
      ).expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      coachBoundRuleId = createRes.body.data.createPayoutRule.rule.id as number;

      // coach 访问自身系列应成功
      const querySelf = `
        query {
          payoutRuleBySeries(input: { seriesId: ${coachSeriesId} }) { id seriesId isTemplate isActive }
        }
      `;
      const resSelf = await executeGQL(querySelf, coachToken).expect(200);
      expect(resSelf.body.errors).toBeUndefined();
      expect(resSelf.body.data?.payoutRuleBySeries?.id).toBe(coachBoundRuleId);
      expect(resSelf.body.data?.payoutRuleBySeries?.seriesId).toBe(coachSeriesId);
      expect(resSelf.body.data?.payoutRuleBySeries?.isTemplate).toBe(false);
    });

    it('权限校验：listPayoutRules 允许 coach 访问', async () => {
      const query = `
        query {
          listPayoutRules(input: { }) { items { id } }
        }
      `;
      const res = await executeGQL(query, coachToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      expect(Array.isArray(res.body.data?.listPayoutRules?.items)).toBe(true);
    });

    it('权限校验：searchPayoutRules 仅 manager 可访问，coach 应失败', async () => {
      const query = `
        query {
          searchPayoutRules(input: { pagination: { mode: OFFSET, page: 1, pageSize: 5 } }) { items { id } }
        }
      `;
      const res = await executeGQL(query, coachToken).expect(200);
      expect(Array.isArray(res.body.errors)).toBe(true);
      const err = res.body.errors[0];
      expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });
});
