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
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
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

  /**
   * 构造分页器（mapSortColumn 恒为 null）：
   * 用于验证在游标边界阶段优先使用调用方提供的 resolveColumn。
   */
  const buildPaginatorNullMap = (): TypeOrmPaginator =>
    new TypeOrmPaginator(signer as unknown as ICursorSigner, (_field: string) => null);

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
      await dataSource.getRepository(CustomerEntity).clear();
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
   * 种子数据（自定义前缀）：
   * 用于特定用例中区分不同批次数据，避免字符串断言混淆。
   */
  const seedLearnersWithPrefix = async (count: number, prefix: string): Promise<void> => {
    const repo = dataSource.getRepository(LearnerEntity);
    await repo.clear();
    for (let i = 0; i < count; i += 1) {
      const name = `${prefix}${String(i).padStart(2, '0')}`;
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

  it('CURSOR 模式支持 DESC，自动补齐 tieBreaker 并正确前进', async () => {
    const qb1 = createBaseQb();
    const paginator = buildPaginator();

    const page1 = await paginator.paginate<{ id: number; name: string }>({
      qb: qb1,
      params: {
        mode: 'CURSOR',
        limit: 10,
        // 仅提供主排序字段，分页器需自动补齐 tieBreaker(id)
        sorts: [{ field: 'name', direction: 'DESC' }],
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
        sorts: [{ field: 'name', direction: 'DESC' }],
      },
      options: {
        allowedSorts,
        defaultSorts,
        cursorKey: { primary: 'name', tieBreaker: 'id' },
        resolveColumn,
      },
    });

    const qb3 = createBaseQb();
    const page3 = await paginator.paginate<{ id: number; name: string }>({
      qb: qb3,
      params: {
        mode: 'CURSOR',
        limit: 10,
        after: page2.pageInfo?.nextCursor,
        sorts: [{ field: 'name', direction: 'DESC' }],
      },
      options: {
        allowedSorts,
        defaultSorts,
        cursorKey: { primary: 'name', tieBreaker: 'id' },
        resolveColumn,
      },
    });

    // 三页合计应覆盖全部 30 条，且无重复
    expect(page3.pageInfo?.hasNext).toBe(false);
    const ids = new Set<number>();
    [...page1.items, ...page2.items, ...page3.items].forEach((r) => ids.add(r.id));
    expect(ids.size).toBe(30);

    // 验证降序序列的头尾（name 值从 L29 .. L00）
    const namesFirstPage = page1.items.map((r) => r.name);
    expect(namesFirstPage[0]).toBe('L29');
    expect(namesFirstPage[9]).toBe('L20');
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

  it('游标签名不匹配（MAC 校验失败）触发 INVALID_CURSOR 错误码', async () => {
    const qb = createBaseQb();
    const paginator = buildPaginator();

    // 先获取一个合法的 nextCursor
    const page1 = await paginator.paginate<{ id: number; name: string }>({
      qb,
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

    const validCursor = page1.pageInfo?.nextCursor as string;
    const decoded = Buffer.from(validCursor, 'base64').toString('utf8');
    const obj = JSON.parse(decoded) as { p: string; m: string };
    const token = JSON.parse(obj.p) as { key: string; value: string | number; id: string | number };
    // 篡改 payload（保持 m 不变），制造 MAC 不匹配
    const tamperedPayload = JSON.stringify({ key: token.key, value: 'HACK', id: token.id });
    const tamperedCursor = Buffer.from(
      JSON.stringify({ p: tamperedPayload, m: obj.m }),
      'utf8',
    ).toString('base64');

    let caught: unknown;
    try {
      const qb2 = createBaseQb();
      await paginator.paginate<{ id: number; name: string }>({
        qb: qb2,
        params: {
          mode: 'CURSOR',
          limit: 10,
          after: tamperedCursor,
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
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(DomainError);
    const de = caught as DomainError;
    expect(de.code).toBe(PAGINATION_ERROR.INVALID_CURSOR);
    expect(de.message).toBe('游标签名不匹配');
  });

  it('JOIN 放大下使用 COUNT(DISTINCT) 返回正确总数', async () => {
    // 准备数据：5 个客户，每个客户 2 个学员（JOIN 会放大）
    const customerRepo = dataSource.getRepository(CustomerEntity);
    const learnerRepo = dataSource.getRepository(LearnerEntity);
    await learnerRepo.clear();
    await customerRepo.clear();

    const customers: CustomerEntity[] = [];
    for (let i = 0; i < 5; i += 1) {
      const name = `C${String(i).padStart(2, '0')}`;
      const c = customerRepo.create({
        name,
        accountId: null,
        contactPhone: null,
        preferredContactTime: null,
        remark: null,
        deactivatedAt: null,
        createdBy: null,
        updatedBy: null,
        membershipLevel: 1,
      });
      customers.push(await customerRepo.save(c));
    }
    for (const c of customers) {
      for (let j = 0; j < 2; j += 1) {
        const lname = `${c.name}-L${j}`;
        await learnerRepo.save(
          learnerRepo.create({
            customerId: c.id,
            name: lname,
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
    }

    const qb = dataSource
      .getRepository(CustomerEntity)
      .createQueryBuilder('customer')
      .leftJoin('customer.learners', 'learner')
      .where('customer.id > :x', { x: 0 });

    // 注意：此处的 resolveColumn 映射到 customer 列
    const resolveCustomerColumn = (field: string): string | null => {
      switch (field) {
        case 'id':
          return 'customer.id';
        case 'name':
          return 'customer.name';
        default:
          return null;
      }
    };

    const paginator = buildPaginator();
    const result = await paginator.paginate<{ id: number; name: string }>({
      qb,
      params: { mode: 'OFFSET', page: 1, pageSize: 3, withTotal: true },
      options: {
        allowedSorts,
        defaultSorts,
        resolveColumn: resolveCustomerColumn,
        // 使用 JOIN 侧的外键列去重以避免 MySQL 对别名的转义问题
        countDistinctBy: 'customer_id',
      },
    });

    expect(result.items.length).toBe(3);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(3);

    // 还原为最初 Learner 数据，以免影响其他测试（若有）
    await seedLearners(30);
  });

  it('游标主键一致性校验：跨端点复用游标应被拒绝', async () => {
    // 使用自定义前缀以便区分数据集
    await seedLearnersWithPrefix(15, 'K');

    const paginator = buildPaginator();

    // 第一列表：primary = id，生成 nextCursor（token.key === 'id'）
    const qb1 = createBaseQb();
    const page1 = await paginator.paginate<{ id: number; name: string }>({
      qb: qb1,
      params: {
        mode: 'CURSOR',
        limit: 5,
        sorts: [
          { field: 'id', direction: 'ASC' },
          { field: 'name', direction: 'ASC' },
        ],
      },
      options: {
        allowedSorts,
        defaultSorts,
        cursorKey: { primary: 'id', tieBreaker: 'name' },
        resolveColumn,
      },
    });

    expect(page1.pageInfo?.nextCursor).toBeDefined();

    // 第二列表：primary = name，复用上一列表游标，应命中主键一致性校验
    const qb2 = createBaseQb();
    await expect(
      paginator.paginate<{ id: number; name: string }>({
        qb: qb2,
        params: {
          mode: 'CURSOR',
          limit: 5,
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
      }),
    ).rejects.toEqual(new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标主键不匹配'));

    // 还原数据集以不影响其他用例
    await seedLearners(30);
  });

  it('CURSOR 正例：mapSortColumn 为 null 时优先使用 resolveColumn，翻页正常', async () => {
    await seedLearners(15);

    const qb1 = createBaseQb();
    const paginator = buildPaginatorNullMap();

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

    expect(page2.items.length).toBe(5);
    expect(page2.pageInfo?.hasNext).toBe(false);

    const names = [...page1.items, ...page2.items].map((r) => r.name);
    expect(names[0]).toBe('L00');
    expect(names[names.length - 1]).toBe('L14');

    // 还原数据以不影响其他用例
    await seedLearners(30);
  });

  it('CURSOR 反例：mapSortColumn 为 null 且边界阶段无法解析列，触发 INVALID_CURSOR', async () => {
    await seedLearners(15);

    const qb1 = createBaseQb();
    const paginator = buildPaginatorNullMap();

    const page1 = await paginator.paginate<{ id: number; name: string }>({
      qb: qb1,
      params: {
        mode: 'CURSOR',
        limit: 5,
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

    expect(page1.pageInfo?.nextCursor).toBeDefined();

    const qb2 = createBaseQb();
    // 有状态解析函数：前两次（用于排序）返回有效列，之后（用于游标边界）返回 null
    let callCount = 0;
    const resolveColumnFailAfterOrderBy = (field: string): string | null => {
      callCount += 1;
      if (callCount <= 2) {
        switch (field) {
          case 'id':
            return 'learner.id';
          case 'name':
            return 'learner.name';
          default:
            return null;
        }
      }
      return null;
    };

    await expect(
      paginator.paginate<{ id: number; name: string }>({
        qb: qb2,
        params: {
          mode: 'CURSOR',
          limit: 5,
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
          resolveColumn: resolveColumnFailAfterOrderBy,
        },
      }),
    ).rejects.toEqual(new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '非法游标边界列'));

    // 还原数据以不影响其他用例
    await seedLearners(30);
  });
});
