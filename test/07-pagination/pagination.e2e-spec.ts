// test/07-pagination/pagination.e2e-spec.ts
import { DomainError, PAGINATION_ERROR } from '@core/common/errors/domain-error';
import type { ICursorSigner } from '@core/pagination/pagination.ports';
import type { SortParam } from '@core/pagination/pagination.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { initGraphQLSchema } from '@src/adapters/graphql/schema/schema.init';
import { AppModule } from '@src/app.module';
import { TypeOrmPaginator } from '@src/infrastructure/typeorm/pagination/typeorm-paginator';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { PaginationModule } from '@src/modules/common/pagination.module';
import { PAGINATION_TOKENS } from '@src/modules/common/tokens/pagination.tokens';
import { DataSource } from 'typeorm';

describe('分页工具 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let signer: ICursorSigner;

  // 统一的排序白名单与默认排序
  const allowedSorts: ReadonlyArray<string> = ['name', 'id'];
  const defaultSorts: ReadonlyArray<SortParam> = [{ field: 'id', direction: 'ASC' }];

  // 列名解析：实体字段到 SQL 列（带别名）
  const resolveColumn = (field: string): string | null => {
    switch (field) {
      case 'id':
        return 'learner.id';
      case 'name':
        return 'learner.name';
      default:
        return null;
    }
  };

  // 排序列映射：用于游标边界
  const mapSortColumn = (field: string): string | null => {
    switch (field) {
      case 'id':
        return 'learner.id';
      case 'name':
        return 'learner.name';
      default:
        return null as unknown as string; // 保持类型，实际不会用到未知字段
    }
  };

  // 构造待测分页器实例（使用同一 signer）
  const buildPaginator = (): TypeOrmPaginator => new TypeOrmPaginator(signer, mapSortColumn);

  beforeAll(async () => {
    // 确保 GraphQL 枚举/标量注册（与项目习惯保持一致）
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, PaginationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    signer = app.get(PAGINATION_TOKENS.CURSOR_SIGNER as unknown as string);

    // 清理并准备测试数据
    await seedLearners(30);
  });

  afterAll(async () => {
    try {
      await dataSource.getRepository(LearnerEntity).clear();
    } finally {
      if (app) await app.close();
    }
  });

  /**
   * 种子数据：创建指定数量的 Learner 记录（name 序列 L00..LNN，便于字典序）
   */
  const seedLearners = async (count: number): Promise<void> => {
    const repo = dataSource.getRepository(LearnerEntity);
    await repo.clear();
    for (let i = 0; i < count; i += 1) {
      const name = `L${String(i).padStart(2, '0')}`;
      await repo.save(
        repo.create({
          customerId: 1,
          name,
          birthDate: null,
          avatarUrl: null,
          specialNeeds: null,
          remark: null,
          deactivatedAt: null,
          createdBy: null,
          updatedBy: null,
          countPerSession: 1,
        }),
      );
    }
  };

  /**
   * 构造基础查询（不设置排序，交由分页器）
   */
  const createBaseQb = () =>
    dataSource.getRepository(LearnerEntity).createQueryBuilder('learner').where('learner.id > :x', {
      x: 0,
    });

  it('OFFSET 模式返回正确的分页与总数', async () => {
    const qb = createBaseQb();
    const paginator = buildPaginator();

    const result = await paginator.paginate<{ id: number; name: string }>({
      qb,
      params: { mode: 'OFFSET', page: 2, pageSize: 10, withTotal: true },
      options: {
        allowedSorts,
        defaultSorts,
        resolveColumn,
      },
    });

    expect(result.items.length).toBe(10);
    expect(result.total).toBe(30);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);

    // 验证项顺序（按 name ASC, id ASC，默认排序退回 id ASC）
    const names = result.items.map((r) => r.name);
    expect(names[0]).toBe('L10');
    expect(names[9]).toBe('L19');
  });

  it('CURSOR 模式分页与 nextCursor 正确衔接（按 name ASC, id ASC）', async () => {
    const qb1 = createBaseQb();
    const paginator = buildPaginator();

    const page1 = await paginator.paginate<{ id: number; name: string }>({
      qb: qb1,
      params: {
        mode: 'CURSOR',
        limit: 10,
        sorts: [
          { field: 'name', direction: 'ASC' },
          { field: 'id', direction: 'ASC' },
        ],
      },
      options: {
        allowedSorts,
        defaultSorts,
        cursorKey: { primary: 'name', tieBreaker: 'id' },
        resolveColumn,
      },
    });

    expect(page1.items.length).toBe(10);
    expect(page1.pageInfo?.hasNext).toBe(true);
    expect(page1.pageInfo?.nextCursor).toBeDefined();

    const qb2 = createBaseQb();
    const page2 = await paginator.paginate<{ id: number; name: string }>({
      qb: qb2,
      params: {
        mode: 'CURSOR',
        limit: 10,
        after: page1.pageInfo?.nextCursor,
        sorts: [
          { field: 'name', direction: 'ASC' },
          { field: 'id', direction: 'ASC' },
        ],
      },
      options: {
        allowedSorts,
        defaultSorts,
        cursorKey: { primary: 'name', tieBreaker: 'id' },
        resolveColumn,
      },
    });

    expect(page2.items.length).toBe(10);
    expect(page2.pageInfo?.hasNext).toBe(true);

    const qb3 = createBaseQb();
    const page3 = await paginator.paginate<{ id: number; name: string }>({
      qb: qb3,
      params: {
        mode: 'CURSOR',
        limit: 10,
        after: page2.pageInfo?.nextCursor,
        sorts: [
          { field: 'name', direction: 'ASC' },
          { field: 'id', direction: 'ASC' },
        ],
      },
      options: {
        allowedSorts,
        defaultSorts,
        cursorKey: { primary: 'name', tieBreaker: 'id' },
        resolveColumn,
      },
    });

    expect(page3.items.length).toBe(10);
    expect(page3.pageInfo?.hasNext).toBe(false);

    // 验证三个批次无重复覆盖
    const ids = new Set<number>();
    [...page1.items, ...page2.items, ...page3.items].forEach((r) => ids.add(r.id));
    expect(ids.size).toBe(30);
  });

  it('非法排序字段将被忽略并回退到默认排序', async () => {
    const qb = createBaseQb();
    const paginator = buildPaginator();

    const result = await paginator.paginate<{ id: number; name: string }>({
      qb,
      params: {
        mode: 'OFFSET',
        page: 1,
        pageSize: 10,
        sorts: [{ field: 'createdAt', direction: 'ASC' }],
      },
      options: { allowedSorts, defaultSorts, resolveColumn },
    });

    // 默认排序 id ASC
    expect(result.items.length).toBe(10);
    const names = result.items.map((r) => r.name);
    expect(names[0]).toBe('L00');
    expect(names[9]).toBe('L09');
  });

  it('非法游标签名被拒绝', async () => {
    const qb = createBaseQb();
    const paginator = buildPaginator();

    await expect(
      paginator.paginate<{ id: number; name: string }>({
        qb,
        params: { mode: 'CURSOR', limit: 10, after: 'invalid_cursor' },
        options: {
          allowedSorts,
          defaultSorts,
          cursorKey: { primary: 'name', tieBreaker: 'id' },
          resolveColumn,
        },
      }),
    ).rejects.toBeInstanceOf(DomainError);

    await expect(
      paginator.paginate<{ id: number; name: string }>({
        qb,
        params: { mode: 'CURSOR', limit: 10, after: 'invalid_cursor' },
        options: {
          allowedSorts,
          defaultSorts,
          cursorKey: { primary: 'name', tieBreaker: 'id' },
          resolveColumn,
        },
      }),
    ).rejects.toMatchObject({ code: PAGINATION_ERROR.INVALID_CURSOR });
  });
});
