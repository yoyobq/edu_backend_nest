// test/07-pagination-sort-search/search.e2e-spec.ts
import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import type { SearchOptions } from '@core/search/search.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '@src/core/config/config.module';
import { DatabaseModule } from '@src/core/database/database.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { SearchModule, SearchService } from '@src/modules/common/search.module';
import { VerificationRecordEntity } from '@src/modules/verification-record/verification-record.entity';
import { randomBytes } from 'crypto';
import { DataSource, type SelectQueryBuilder } from 'typeorm';

describe('TypeOrmSearch 功能测试 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let searchService: SearchService;

  /**
   * 构造搜索选项：定义文本搜索列、排序白名单与列解析函数。
   */
  const buildOptions = (): SearchOptions => ({
    searchColumns: ['learner.name'],
    minQueryLength: 2,
    allowedSorts: ['name', 'id', 'updatedAt'],
    defaultSorts: [
      { field: 'name', direction: 'ASC' },
      { field: 'id', direction: 'ASC' },
    ],
    cursorKey: { primary: 'name', tieBreaker: 'id' },
    resolveColumn: (field: string): string | null => {
      switch (field) {
        case 'id':
          return 'learner.id';
        case 'name':
          return 'learner.name';
        case 'updatedAt':
          return 'learner.updatedAt';
        case 'customerId':
          return 'learner.customerId';
        default:
          return null;
      }
    },
    allowedFilters: ['customerId'],
    normalizeFilterValue: ({ field, raw }) => {
      if (field === 'customerId') return typeof raw === 'string' ? Number(raw) : raw;
      return raw;
    },
  });

  beforeAll(async () => {
    // 仅初始化配置与数据库，并注入 SearchService
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        DatabaseModule,
        SearchModule,
        TypeOrmModule.forFeature([
          LearnerEntity,
          CustomerEntity,
          AccountEntity,
          UserInfoEntity,
          VerificationRecordEntity,
        ]),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    searchService = moduleFixture.get<SearchService>(SearchService);

    await seedLearnersForSearch();
    await seedVerificationRecordsForLearners({ perLearner: 2 });
  });

  afterAll(async () => {
    try {
      if (dataSource && dataSource.isInitialized) {
        await dataSource
          .createQueryBuilder()
          .delete()
          .from(LearnerEntity)
          .where('name LIKE :prefix', { prefix: 'SE_CASE_%' })
          .execute();

        // 清理联表的验证记录数据
        if (seededLearnerIds.length > 0) {
          await dataSource
            .createQueryBuilder()
            .delete()
            .from(VerificationRecordEntity)
            .where('subjectType = :stype', { stype: SubjectType.LEARNER })
            .andWhere('subjectId IN (:...ids)', { ids: seededLearnerIds })
            .execute();
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  it('OFFSET：文本搜索 + 过滤 + 排序白名单', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner')
      .where('learner.id > :x', { x: 0 }) as unknown as SelectQueryBuilder<Record<string, unknown>>;

    const options = buildOptions();

    const result = await searchService.search<{ id: number; name: string }>({
      qb,
      params: {
        query: 'SE_CASE_', // 命中所有种子数据
        filters: { customerId: 910001 },
        pagination: { mode: 'OFFSET', page: 2, pageSize: 3, withTotal: true },
      },
      options,
    });

    expect(result.items.length).toBe(3);
    expect(result.total).toBe(8);
    const names = result.items.map((r) => r.name);
    // 默认排序 name ASC, id ASC：第二页应为 SE_CASE_03..SE_CASE_05
    expect(names[0]).toBe('SE_CASE_03');
    expect(names[2]).toBe('SE_CASE_05');
  });

  it('CURSOR：after 翻页（手工提供 cursorToken）', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner') as unknown as SelectQueryBuilder<Record<string, unknown>>;
    const options = buildOptions();

    // 第一页（limit 5）
    const page1 = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: 'SE_CASE_', pagination: { mode: 'CURSOR', limit: 5 } },
      options,
    });
    expect(page1.items.length).toBe(5);
    expect(page1.pageInfo?.hasNext).toBe(true);

    // 使用第一页最后一项构造游标令牌（与 cursorKey 一致）
    const last = page1.items[4];
    const token = {
      key: 'name',
      primaryValue: last.name,
      tieField: 'id',
      tieValue: last.id,
    };

    // 第二页（after 翻页）
    const page2 = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: 'SE_CASE_', pagination: { mode: 'CURSOR', limit: 5, after: 'token' } },
      options: { ...options, cursorToken: token },
    });

    expect(page2.items.length).toBe(3); // 共 8 条，后续应拿到 3 条
    expect(page2.pageInfo?.hasNext).toBe(false);

    const names2 = page2.items.map((r) => r.name);
    expect(names2[0]).toBe('SE_CASE_05');
    expect(names2[2]).toBe('SE_CASE_07');
  });

  /**
   * 测试：CURSOR before 翻页
   * - 使用第二页的首项构造游标令牌，向前翻页应拿到第一页的数据
   * - 验证 pageInfo.hasPrev 语义（若恰好拿满上一页则为 false）
   */
  it('CURSOR：before 翻页（手工提供 cursorToken）', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner') as unknown as SelectQueryBuilder<Record<string, unknown>>;
    const options = buildOptions();

    // 先取第一页与第二页
    const page1 = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: 'SE_CASE_', pagination: { mode: 'CURSOR', limit: 5 } },
      options,
    });
    expect(page1.items.length).toBe(5);

    const last = page1.items[4];
    const tokenAfter = { key: 'name', primaryValue: last.name, tieField: 'id', tieValue: last.id };
    const page2 = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: 'SE_CASE_', pagination: { mode: 'CURSOR', limit: 5, after: 'token' } },
      options: { ...options, cursorToken: tokenAfter },
    });
    expect(page2.items.length).toBe(3);

    // 使用第二页的首项构造 before 游标
    const firstOfPage2 = page2.items[0];
    const tokenBefore = {
      key: 'name',
      primaryValue: firstOfPage2.name,
      tieField: 'id',
      tieValue: firstOfPage2.id,
    };

    const prevPage = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: 'SE_CASE_', pagination: { mode: 'CURSOR', limit: 5, before: 'token' } },
      options: { ...options, cursorToken: tokenBefore },
    });

    // 应拿到第一页的 5 条记录，并且返回为正序
    expect(prevPage.items.length).toBe(5);
    const namesPrev = prevPage.items.map((r) => r.name);
    expect(namesPrev[0]).toBe('SE_CASE_00');
    expect(namesPrev[4]).toBe('SE_CASE_04');

    // 因为恰好拿满上一页，hasPrev 为 false（没有更早一页）
    expect(prevPage.pageInfo?.hasPrev).toBe(false);
    // 非 before 模式下不暴露 hasNext
    expect(prevPage.pageInfo?.hasNext).toBeUndefined();
  });

  /**
   * 测试：最小查询长度短路
   * - minQueryLength = 2 时，长度为 1 的查询词将被忽略
   * - 结果相当于未应用文本搜索，仅受过滤与排序影响
   */
  it('OFFSET：最小查询长度短路，忽略过短查询', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner')
      .where('learner.id > :x', { x: 0 }) as unknown as SelectQueryBuilder<Record<string, unknown>>;

    const options = buildOptions(); // minQueryLength = 2

    const result = await searchService.search<{ id: number; name: string }>({
      qb,
      params: {
        query: 'S', // 仅 1 个字符，触发短路
        filters: { customerId: 910001 },
        pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
      },
      options,
    });

    expect(result.total).toBe(8);
    expect(result.items.length).toBe(8);
    const names = result.items.map((r) => r.name);
    expect(names[0]).toBe('SE_CASE_00');
    expect(names[7]).toBe('SE_CASE_07');
  });

  /**
   * 测试：过滤白名单行为
   * - 未在 allowedFilters 中的过滤字段会被忽略，不抛错
   */
  it('过滤器白名单：未知过滤器被忽略且不报错', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner')
      .where('learner.id > :x', { x: 0 }) as unknown as SelectQueryBuilder<Record<string, unknown>>;

    const options = buildOptions();

    const result = await searchService.search<{ id: number; name: string }>({
      qb,
      params: {
        query: 'SE_CASE_',
        // unknown 字段不在白名单中，应被忽略
        filters: { unknown: 'x' } as unknown as Record<string, string | number | boolean>,
        pagination: { mode: 'OFFSET', page: 1, pageSize: 20 },
      },
      options,
    });

    expect(result.items.length).toBe(8);
    const names = result.items.map((r) => r.name);
    expect(names[0]).toBe('SE_CASE_00');
    expect(names[7]).toBe('SE_CASE_07');
  });

  /**
   * 测试：文本搜索特殊字符转义
   * - 查询词为 '%' 时，按 ESCAPE '\\' 视为字面量百分号，不应命中任何记录
   */
  it('文本搜索转义：query 为 % 返回 0 行', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner')
      .where('learner.id > :x', { x: 0 }) as unknown as SelectQueryBuilder<Record<string, unknown>>;

    // 将最小查询长度降为 1，允许单字符查询
    const options = { ...buildOptions(), minQueryLength: 1 };

    const result = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: '%', pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } },
      options,
    });

    expect(result.items.length).toBe(0);
  });

  /**
   * 文本搜索转义补充：查询词为 '_' 时按字面量匹配下划线
   * - 在 ESCAPE '\\' 规则下，'_' 视为字面量，名称包含下划线的记录应命中
   */
  it('文本搜索转义：query 为 _ 返回 8 行', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner')
      .where('learner.id > :x', { x: 0 }) as unknown as SelectQueryBuilder<Record<string, unknown>>;

    const options = { ...buildOptions(), minQueryLength: 1 };

    const result = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: '_', pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } },
      options,
    });

    expect(result.items.length).toBe(8);
    const names = result.items.map((r) => r.name);
    expect(names[0]).toContain('_');
  });

  /**
   * 测试：OFFSET + JOIN 下的 DISTINCT 计数
   * - 为每个 Learner 生成 2 条验证记录，内连接将产生重复行
   * - TypeORM 的 getCount 对主实体会自动去重，因此不提供 countDistinctBy 时，total 为主实体唯一数（应为 8）
   * - 提供 countDistinctBy: 'vr.id' 时，total 为联表行的唯一数（应为 16）
   */
  it('OFFSET：countDistinctBy 在联表重复行下返回准确总数', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner')
      .innerJoin(
        VerificationRecordEntity,
        'vr',
        'vr.subjectType = :stype AND vr.subjectId = learner.id',
        { stype: SubjectType.LEARNER },
      ) as unknown as SelectQueryBuilder<Record<string, unknown>>;

    // A) 未提供 DISTINCT 计数，TypeORM 自动对主实体去重，total 为 8
    const optionsA = buildOptions();
    const resA = await searchService.search<{ id: number; name: string }>({
      qb,
      params: {
        query: 'SE_CASE_',
        pagination: { mode: 'OFFSET', page: 1, pageSize: 5, withTotal: true },
      },
      options: optionsA,
    });
    expect(resA.total).toBe(8);
    expect(resA.items.length).toBe(5);

    // B) 启用 DISTINCT 按 vr.id 计数（联表行），total 应为 16
    const optionsB: SearchOptions = { ...optionsA, countDistinctBy: 'vr.id' };
    const resB = await searchService.search<{ id: number; name: string }>({
      qb,
      params: {
        query: 'SE_CASE_',
        pagination: { mode: 'OFFSET', page: 1, pageSize: 5, withTotal: true },
      },
      options: optionsB,
    });
    expect(resB.total).toBe(16);
    expect(resB.items.length).toBe(5);
  });

  /**
   * 测试：AND 模式文本搜索（多列同时命中）
   * - 为种子数据 remark 字段包含同样的前缀，AND 模式应命中所有 8 条
   */
  it('OFFSET：AND 模式文本搜索（多列同时命中）', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner') as unknown as SelectQueryBuilder<Record<string, unknown>>;

    const options: SearchOptions = {
      ...buildOptions(),
      searchColumns: ['learner.name', 'learner.remark'],
      searchMode: 'AND',
    };

    const res = await searchService.search<{ id: number; name: string; remark: string | null }>({
      qb,
      params: { query: 'SE_CASE_', pagination: { mode: 'OFFSET', page: 1, pageSize: 20 } },
      options,
    });
    expect(res.items.length).toBe(8);
  });

  /**
   * 测试：buildTextSearch 自定义钩子
   * - 覆盖内置 LIKE 逻辑，改为前缀匹配（name LIKE 'SE_CASE_%'）
   */
  it('OFFSET：buildTextSearch 自定义钩子（前缀匹配）', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner') as unknown as SelectQueryBuilder<Record<string, unknown>>;

    const options: SearchOptions = {
      ...buildOptions(),
      buildTextSearch: ({ query }) => {
        const prefix = query.endsWith('_') ? `${query}%` : `${query}_%`;
        return { clause: 'learner.name LIKE :prefix', params: { prefix } };
      },
    };

    const res = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: 'SE_CASE_', pagination: { mode: 'OFFSET', page: 1, pageSize: 20 } },
      options,
    });
    expect(res.items.length).toBe(8);
  });

  /**
   * 测试：normalizeFilterValue + buildFilter 组合
   * - ids 过滤字符串归一化为数字数组，并构造 IN 子句
   */
  it('过滤：normalizeFilterValue 与 buildFilter 组合（IN 列表）', async () => {
    const repo = dataSource.getRepository(LearnerEntity);
    const firstThree = await repo.find({ where: { customerId: 910001 }, take: 3 });
    const ids = firstThree.map((l) => l.id);

    const qb = repo.createQueryBuilder('learner') as unknown as SelectQueryBuilder<
      Record<string, unknown>
    >;

    const options: SearchOptions = {
      ...buildOptions(),
      allowedFilters: ['ids'],
      resolveColumn: (field: string): string | null => {
        switch (field) {
          case 'id':
            return 'learner.id';
          case 'name':
            return 'learner.name';
          case 'updatedAt':
            return 'learner.updatedAt';
          case 'ids':
            return 'learner.id';
          default:
            return null;
        }
      },
      // 归一化为字符串，避免返回数组违反类型约束
      normalizeFilterValue: ({ field, raw }) => {
        if (field === 'ids') {
          return typeof raw === 'string' ? raw : String(raw);
        }
        return raw;
      },
      buildFilter: ({ field, column, value }) => {
        if (field === 'ids' && typeof value === 'string') {
          const list = value
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n));
          return { clause: `${column} IN (:...ids)`, params: { ids: list } };
        }
        return null;
      },
    };

    const res = await searchService.search<{ id: number; name: string }>({
      qb,
      params: {
        filters: { ids: ids.join(',') },
        pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
      },
      options,
    });
    expect(res.items.length).toBe(ids.length);
    const gotIds = res.items.map((x) => x.id).sort((a, b) => a - b);
    expect(gotIds).toEqual([...ids].sort((a, b) => a - b));
  });

  /**
   * 测试：allowedSorts 与 resolveColumn 不一致的防御性错误
   * - 当允许排序的业务字段无法解析为安全列时，应抛出 DomainError
   */
  it('排序：allowedSorts 与 resolveColumn 不一致时抛出错误', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner') as unknown as SelectQueryBuilder<Record<string, unknown>>;

    const options: SearchOptions = {
      searchColumns: ['learner.name'],
      allowedSorts: ['badField'],
      defaultSorts: [{ field: 'badField', direction: 'ASC' }],
      resolveColumn: (field: string): string | null => {
        switch (field) {
          case 'name':
            return 'learner.name';
          default:
            return null; // badField 无法解析
        }
      },
    };

    await expect(
      searchService.search<{ id: number; name: string }>({
        qb,
        params: { pagination: { mode: 'OFFSET', page: 1, pageSize: 1 } },
        options,
      }),
    ).rejects.toThrow(/排序白名单与列解析不一致/);
  });

  /**
   * 测试：addSortColumnsToSelect 开启后一致性
   * - 在实体选择场景下应保持正常返回，不抛错
   */
  it('排序：addSortColumnsToSelect 开启后一致性', async () => {
    const qb = dataSource
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner') as unknown as SelectQueryBuilder<Record<string, unknown>>;

    const options: SearchOptions = { ...buildOptions(), addSortColumnsToSelect: true };
    const res = await searchService.search<{ id: number; name: string }>({
      qb,
      params: { query: 'SE_CASE_', pagination: { mode: 'OFFSET', page: 1, pageSize: 20 } },
      options,
    });
    expect(res.items.length).toBe(8);
  });

  /**
   * 种子数据：为搜索测试插入 LearnerEntity 记录。
   * - 使用统一前缀 "SE_CASE_" 便于文本搜索与清理。
   * - 指定同一 customerId 以验证过滤。
   * Returns: Promise<void>
   */
  /**
   * 为搜索测试插入 LearnerEntity 记录
   * - 使用统一前缀 "SE_CASE_" 便于文本搜索与清理
   * - 指定同一 customerId 以验证过滤
   * - 附加 remark 字段以覆盖 AND 模式
   * Returns: Promise<void>
   */
  async function seedLearnersForSearch(): Promise<void> {
    await dataSource
      .createQueryBuilder()
      .delete()
      .from(LearnerEntity)
      .where('name LIKE :prefix', { prefix: 'SE_CASE_%' })
      .execute();

    const repo = dataSource.getRepository(LearnerEntity);
    const now = new Date();
    const inserted = await repo.save(
      Array.from({ length: 8 }).map((_, i) => ({
        name: `SE_CASE_${String(i).padStart(2, '0')}`,
        customerId: 910001,
        remark: '包含 SE_CASE_ 以覆盖 AND 模式',
        createdAt: now,
        updatedAt: now,
      })) as Partial<LearnerEntity>[],
    );
    seededLearnerIds = inserted.map((l) => l.id);
  }

  /**
   * 为每个 Learner 生成多条验证记录以制造联表重复行
   * - subjectType 统一为 LEARNER，subjectId 指向 Learner.id
   * - 使用随机 token 指纹确保唯一约束
   * Returns: Promise<void>
   */
  async function seedVerificationRecordsForLearners(params: { perLearner: number }): Promise<void> {
    const { perLearner } = params;
    const learnerRepo = dataSource.getRepository(LearnerEntity);
    const vrRepo = dataSource.getRepository(VerificationRecordEntity);
    const learners = await learnerRepo.find({ where: { name: 'SE_CASE_00' } });
    // 若尚未插入，则读取所有前缀数据
    const allLearners =
      learners.length > 0
        ? await learnerRepo.find({ where: { customerId: 910001 } })
        : await learnerRepo.find({ where: { customerId: 910001 } });

    const now = new Date();
    const rows: Partial<VerificationRecordEntity>[] = [];
    allLearners.forEach((l) => {
      for (let k = 0; k < perLearner; k += 1) {
        rows.push({
          type: VerificationRecordType.INVITE_COACH,
          tokenFp: randomBytes(32),
          status: VerificationRecordStatus.ACTIVE,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          notBefore: null,
          targetAccountId: null,
          subjectType: SubjectType.LEARNER,
          subjectId: l.id,
          payload: null,
          issuedByAccountId: null,
          consumedByAccountId: null,
          consumedAt: null,
        });
      }
    });

    await vrRepo.save(rows);
  }

  // 记录已插入的 Learner.id 以便清理验证记录
  let seededLearnerIds: number[] = [];
  /**
   * Learners 搜索实践测试分组
   * - 结合 Learner 领域数据，验证过滤与游标翻页行为
   */
  describe('Learners 搜索实践测试 (e2e)', () => {
    /**
     * 构造 learners 搜索选项：定义文本搜索列、排序白名单与列解析函数。
     * Returns: SearchOptions
     */
    const buildLearnerOptions = (): SearchOptions => ({
      searchColumns: ['learner.name'],
      minQueryLength: 2,
      allowedSorts: ['name', 'id', 'updatedAt'],
      defaultSorts: [
        { field: 'name', direction: 'ASC' },
        { field: 'id', direction: 'ASC' },
      ],
      cursorKey: { primary: 'name', tieBreaker: 'id' },
      resolveColumn: (field: string): string | null => {
        switch (field) {
          case 'id':
            return 'learner.id';
          case 'name':
            return 'learner.name';
          case 'updatedAt':
            return 'learner.updatedAt';
          case 'customerId':
            return 'learner.customerId';
          default:
            return null;
        }
      },
      allowedFilters: ['customerId'],
      normalizeFilterValue: ({ field, raw }) => {
        if (field === 'customerId') return typeof raw === 'string' ? Number(raw) : raw;
        return raw;
      },
    });

    beforeAll(async () => {
      await seedLearnersForLearnerSpec();
    });

    afterAll(async () => {
      try {
        if (dataSource && dataSource.isInitialized) {
          await dataSource
            .createQueryBuilder()
            .delete()
            .from(LearnerEntity)
            .where('name LIKE :prefix', { prefix: 'LS_%' })
            .execute();
        }
      } catch (err) {
        // 忽略清理异常，以免影响其他测试分组；同时避免空块
        console.warn('Learners 清理失败（忽略）', err);
      }
    });

    it('OFFSET：过滤 customerId 应只返回该客户的学员', async () => {
      const qb = dataSource
        .getRepository(LearnerEntity)
        .createQueryBuilder('learner')
        .where('learner.id > :x', { x: 0 }) as unknown as SelectQueryBuilder<
        Record<string, unknown>
      >;

      const options = buildLearnerOptions();

      const result = await searchService.search<{ id: number; name: string; customerId: number }>({
        qb,
        params: {
          query: 'LS_',
          filters: { customerId: 920001 },
          pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
        },
        options,
      });

      expect(result.total).toBe(4);
      const names = result.items.map((r) => r.name);
      expect(names[0]).toBe('LS_A_00');
      expect(names[3]).toBe('LS_A_03');
      result.items.forEach((r) => expect(r.customerId).toBe(920001));
    });

    it('CURSOR：after 翻页，跨客户聚合 + 默认排序', async () => {
      const qb = dataSource
        .getRepository(LearnerEntity)
        .createQueryBuilder('learner') as unknown as SelectQueryBuilder<Record<string, unknown>>;
      const options = buildLearnerOptions();

      const page1 = await searchService.search<{ id: number; name: string }>({
        qb,
        params: { query: 'LS_', pagination: { mode: 'CURSOR', limit: 3 } },
        options,
      });
      expect(page1.items.length).toBe(3);
      expect(page1.pageInfo?.hasNext).toBe(true);

      const last = page1.items[2];
      const token = { key: 'name', primaryValue: last.name, tieField: 'id', tieValue: last.id };

      const page2 = await searchService.search<{ id: number; name: string }>({
        qb,
        params: { query: 'LS_', pagination: { mode: 'CURSOR', limit: 3, after: 'token' } },
        options: { ...options, cursorToken: token },
      });

      expect(page2.items.length).toBe(3);
      expect(page2.pageInfo?.hasNext).toBe(false);

      const names2 = page2.items.map((r) => r.name);
      expect(names2[0]).toBe('LS_A_03');
      expect(names2[1]).toBe('LS_B_00');
      expect(names2[2]).toBe('LS_B_01');
    });

    it('过滤值归一化：字符串 customerId 也能正确过滤', async () => {
      const qb = dataSource
        .getRepository(LearnerEntity)
        .createQueryBuilder('learner')
        .where('learner.id > :x', { x: 0 }) as unknown as SelectQueryBuilder<
        Record<string, unknown>
      >;

      const options = buildLearnerOptions();

      const result = await searchService.search<{ id: number; name: string; customerId: number }>({
        qb,
        params: {
          query: 'LS_',
          filters: { customerId: '920002' },
          pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
        },
        options,
      });

      expect(result.total).toBe(2);
      const names = result.items.map((r) => r.name);
      expect(names[0]).toBe('LS_B_00');
      expect(names[1]).toBe('LS_B_01');
      result.items.forEach((r) => expect(r.customerId).toBe(920002));
    });

    /**
     * LEFT JOIN 下 DISTINCT 计数语义
     * - Learners 分组未生成验证记录，左连接将产生 vr 为空的行
     * - 未提供 countDistinctBy 时，total 为主实体唯一数（应为 6）
     * - 指定 countDistinctBy: 'vr.id' 时，COUNT(DISTINCT) 不计 NULL，应为 0
     */
    it('LEFT JOIN：countDistinctBy 在空联表下的计数语义', async () => {
      const qb = dataSource
        .getRepository(LearnerEntity)
        .createQueryBuilder('learner')
        .leftJoin(
          VerificationRecordEntity,
          'vr',
          'vr.subjectType = :stype AND vr.subjectId = learner.id',
          { stype: SubjectType.LEARNER },
        ) as unknown as SelectQueryBuilder<Record<string, unknown>>;

      const optionsA = buildLearnerOptions();
      const resA = await searchService.search<{ id: number; name: string }>({
        qb,
        params: {
          query: 'LS_',
          pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
        },
        options: optionsA,
      });
      expect(resA.total).toBe(6);
      expect(resA.items.length).toBe(6);

      const optionsB: SearchOptions = { ...optionsA, countDistinctBy: 'vr.id' };
      const resB = await searchService.search<{ id: number; name: string }>({
        qb,
        params: {
          query: 'LS_',
          pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true },
        },
        options: optionsB,
      });
      expect(resB.total).toBe(0);
      expect(resB.items.length).toBe(6); // items 仍按主实体返回
    });

    /**
     * 过滤组合交集：ids + customerId
     * - 构造跨客户的 id 列表，并叠加 customerId 过滤
     * - 结果应为交集，只返回属于目标客户的那些 id
     */
    it('过滤组合：ids 与 customerId 交集', async () => {
      const repo = dataSource.getRepository(LearnerEntity);
      const a0 = await repo.findOne({ where: { name: 'LS_A_00' } });
      const b0 = await repo.findOne({ where: { name: 'LS_B_00' } });
      if (!a0 || !b0) throw new Error('Learners 种子不存在');

      const qb = repo.createQueryBuilder('learner') as unknown as SelectQueryBuilder<
        Record<string, unknown>
      >;

      const options: SearchOptions = {
        ...buildLearnerOptions(),
        allowedFilters: ['ids', 'customerId'],
        resolveColumn: (field: string): string | null => {
          switch (field) {
            case 'id':
              return 'learner.id';
            case 'name':
              return 'learner.name';
            case 'updatedAt':
              return 'learner.updatedAt';
            case 'customerId':
              return 'learner.customerId';
            case 'ids':
              return 'learner.id';
            default:
              return null;
          }
        },
        normalizeFilterValue: ({ field, raw }) => {
          if (field === 'ids') return typeof raw === 'string' ? raw : String(raw);
          if (field === 'customerId') return typeof raw === 'string' ? Number(raw) : raw;
          return raw;
        },
        buildFilter: ({ field, column, value }) => {
          if (field === 'ids' && typeof value === 'string') {
            const list = value
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n));
            return { clause: `${column} IN (:...ids)`, params: { ids: list } };
          }
          if (field === 'customerId' && typeof value === 'number') {
            return { clause: `${column} = :cid`, params: { cid: value } };
          }
          return null;
        },
      };

      const ids = [a0.id, b0.id];
      const res = await searchService.search<{ id: number; name: string; customerId: number }>({
        qb,
        params: {
          filters: { ids: ids.join(','), customerId: 920001 },
          pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
        },
        options,
      });

      expect(res.items.length).toBe(1);
      expect(res.items[0].id).toBe(a0.id);
      expect(res.items[0].customerId).toBe(920001);
    });

    /**
     * 种子数据：为搜索测试插入 LearnerEntity 记录。
     * - 使用前缀 "LS_" 并包含客户标记 "A/B" 便于文本搜索。
     * - 指定两个 customerId 以验证过滤与跨客户聚合。
     * Returns: Promise<void>
     */
    async function seedLearnersForLearnerSpec(): Promise<void> {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(LearnerEntity)
        .where('name LIKE :prefix', { prefix: 'LS_%' })
        .execute();

      const repo = dataSource.getRepository(LearnerEntity);
      const now = new Date();
      const rows: Array<Partial<LearnerEntity>> = [
        { name: 'LS_A_00', customerId: 920001, createdAt: now, updatedAt: now },
        { name: 'LS_A_01', customerId: 920001, createdAt: now, updatedAt: now },
        { name: 'LS_A_02', customerId: 920001, createdAt: now, updatedAt: now },
        { name: 'LS_A_03', customerId: 920001, createdAt: now, updatedAt: now },
        { name: 'LS_B_00', customerId: 920002, createdAt: now, updatedAt: now },
        { name: 'LS_B_01', customerId: 920002, createdAt: now, updatedAt: now },
      ];
      await repo.save(rows);
    }
  });
});
