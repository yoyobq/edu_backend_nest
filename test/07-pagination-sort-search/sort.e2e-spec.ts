// test/07-pagination-sort-search/sort.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '@src/core/config/config.module';
import { DatabaseModule } from '@src/core/database/database.module';
import { TypeOrmSort } from '@src/infrastructure/typeorm/sort/typeorm-sort';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { DataSource } from 'typeorm';

describe('TypeOrmSort 独立使用 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    // 仅初始化配置与数据库，不引入 GraphQL 模块，避免无关依赖
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppConfigModule, // 提供全局配置（ConfigService）
        DatabaseModule, // 初始化 TypeORM DataSource
        // 注册相关实体，确保关系元数据完整
        TypeOrmModule.forFeature([LearnerEntity, CustomerEntity, AccountEntity, UserInfoEntity]),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    await seedLearnersForSort();
  });

  afterAll(async () => {
    try {
      if (dataSource && dataSource.isInitialized) {
        await dataSource
          .createQueryBuilder()
          .delete()
          .from(LearnerEntity)
          .where('name LIKE :prefix', { prefix: 'SORT_CASE_%' })
          .execute();
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('白名单过滤与列解析：非法字段被拒绝', async () => {
    const sort = new TypeOrmSort(['name', 'id'], { name: 'learner.name', id: 'learner.id' });

    const qb = dataSource.getRepository(LearnerEntity).createQueryBuilder('learner');

    // 非法字段解析应返回 null
    expect(sort.resolveColumn('createdAt')).toBeNull();

    // normalizeSorts 应过滤非法字段并回退默认值
    const normalized = sort.normalizeSorts({
      sorts: [
        { field: 'createdAt', direction: 'DESC' },
        { field: 'name', direction: 'ASC' },
      ],
      allowed: ['name', 'id'],
      defaults: [
        { field: 'name', direction: 'ASC' },
        { field: 'id', direction: 'ASC' },
      ],
    });

    // 期望：过滤非法字段后仅保留允许字段（不自动补 defaults）
    expect(normalized.length).toBe(1);
    expect(normalized[0].field).toBe('name');

    // 应用到 QueryBuilder 验证不抛错（ORDER BY 正常）
    normalized.forEach((s, idx) => {
      const col = sort.resolveColumn(s.field);
      expect(col).toBeTruthy();
      if (idx === 0) qb.orderBy(col!, s.direction);
      else qb.addOrderBy(col!, s.direction);
    });

    const rows = await qb.limit(5).getMany();
    expect(Array.isArray(rows)).toBe(true);
  });

  it('游标模式补齐 tieBreaker：确保 primary 与 tie 排前两位', () => {
    const sort = new TypeOrmSort(['name', 'id', 'updatedAt'], {
      name: 'learner.name',
      id: 'learner.id',
      updatedAt: 'learner.updatedAt',
    });

    const normalized = sort.normalizeSorts({
      sorts: [{ field: 'name', direction: 'DESC' }],
      allowed: ['name', 'id', 'updatedAt'],
      defaults: [
        { field: 'name', direction: 'ASC' },
        { field: 'id', direction: 'ASC' },
      ],
      tieBreaker: { primary: 'name', tieBreaker: 'id' },
    });

    expect(normalized[0]).toEqual({ field: 'name', direction: 'DESC' });
    expect(normalized[1]).toEqual({ field: 'id', direction: 'DESC' });
  });

  it('禁止 primary 与 tieBreaker 相同，抛出 INVALID_CURSOR', () => {
    const sort = new TypeOrmSort(['name', 'id'], { name: 'learner.name', id: 'learner.id' });
    expect(() =>
      sort.normalizeSorts({
        allowed: ['name', 'id'],
        defaults: [
          { field: 'name', direction: 'ASC' },
          { field: 'id', direction: 'ASC' },
        ],
        tieBreaker: { primary: 'name', tieBreaker: 'name' },
      }),
    ).toThrow();
  });

  /**
   * 种子数据：为排序测试插入 LearnerEntity 记录。
   * 为便于清理，名称统一以前缀 "SORT_CASE_" 开头。
   * Returns: Promise<void>
   */
  async function seedLearnersForSort(): Promise<void> {
    await dataSource
      .createQueryBuilder()
      .delete()
      .from(LearnerEntity)
      .where('name LIKE :prefix', { prefix: 'SORT_CASE_%' })
      .execute();

    const repo = dataSource.getRepository(LearnerEntity);
    const now = new Date();
    await repo.save(
      Array.from({ length: 8 }).map((_, i) => ({
        name: `SORT_CASE_${i}`,
        customerId: 900001,
        createdAt: now,
        updatedAt: now,
      })) as Partial<LearnerEntity>[],
    );
  }
});
