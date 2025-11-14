// 文件位置：test/04-course/create-series-draft.e2e-spec.ts
import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { ClassMode, CourseSeriesStatus, VenueType } from '@app-types/models/course-series.types';
import { CourseLevel } from '@app-types/models/course.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { CourseCatalogEntity } from '../../src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '../../src/modules/course/series/course-series.entity';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('CreateSeriesUsecase (e2e) - createCourseSeriesDraft', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerToken: string;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource, includeKeys: ['manager'] });

    managerToken = await loginAndGetToken(
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );
  }, 30000);

  afterAll(async () => {
    await cleanupDraftSeriesAndCatalogs();
    await cleanupTestAccounts(dataSource);
    if (app) await app.close();
  });

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

  const ensureCatalog = async (): Promise<number> => {
    const repo = dataSource.getRepository(CourseCatalogEntity);
    const existed = await repo.findOne({ where: { courseLevel: CourseLevel.FITNESS } });
    if (existed) {
      await repo.update(existed.id, {
        title: 'E2E 测试目录',
        description: 'CreateSeriesDraft 测试用',
        deactivatedAt: null,
      });
      return existed.id;
    }
    const created = await repo.save(
      repo.create({
        courseLevel: CourseLevel.FITNESS as CourseLevel,
        title: 'E2E 测试目录',
        description: 'CreateSeriesDraft 测试用',
        deactivatedAt: null,
        createdBy: null,
        updatedBy: null,
      }) as Partial<CourseCatalogEntity>,
    );
    return (created as CourseCatalogEntity).id;
  };

  const cleanupDraftSeriesAndCatalogs = async (): Promise<void> => {
    await dataSource.query('DELETE FROM course_series WHERE remark = ?', ['E2E 草稿测试']);
    await dataSource.query('DELETE FROM course_catalogs WHERE title = ?', ['E2E 测试目录']);
  };

  it('manager 能创建草稿系列，状态为 PLANNED，且无节次生成', async () => {
    const catalogId = await ensureCatalog();
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);

    const mutation = `
      mutation {
        createCourseSeriesDraft(input: {
          catalogId: ${catalogId},
          title: "E2E 草稿系列",
          description: "说明",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=18",
          leaveCutoffHours: 12,
          pricePerSession: 99.99,
          teachingFeeRef: 80,
          maxLearners: 4,
          remark: "E2E 草稿测试"
        }) {
          id
          status
          title
          startDate
          endDate
          classMode
          maxLearners
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ query: mutation })
      .expect(200);

    if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
    const data = res.body.data.createCourseSeriesDraft as {
      id: number;
      status: CourseSeriesStatus;
      title: string;
      startDate: string;
      endDate: string;
      classMode: ClassMode;
      maxLearners: number;
    };

    expect(data.status).toBe(CourseSeriesStatus.PLANNED);
    expect(data.classMode).toBe(ClassMode.SMALL_CLASS);
    expect(data.maxLearners).toBe(4);

    const qb = dataSource
      .getRepository(CourseSeriesEntity)
      .createQueryBuilder('s')
      .leftJoin('course_sessions', 'sess', 'sess.series_id = s.id')
      .select('COUNT(sess.id)', 'cnt')
      .where('s.id = :id', { id: data.id });
    const sessionCount = (await qb.getRawOne()) as { cnt?: unknown } | null;
    const cntNum = typeof sessionCount?.cnt === 'string' ? Number(sessionCount?.cnt) : 0;
    expect(cntNum).toBe(0);
  });

  it('未登录用户不允许创建系列，返回 UNAUTHENTICATED', async () => {
    const catalogId = await ensureCatalog();
    const start = new Date();
    const end = new Date(start.getTime() + 3 * 24 * 3600 * 1000);

    const mutation = `
      mutation {
        createCourseSeriesDraft(input: {
          catalogId: ${catalogId},
          title: "未登录创建",
          description: "说明",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "BYDAY=MO",
          leaveCutoffHours: 12,
          maxLearners: 2
        }) { id }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: mutation })
      .expect(200);
    const err = (res.body.errors?.[0] ?? null) as { extensions?: { code?: string } } | null;
    expect(err?.extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('目录不存在时返回 CATALOG_NOT_FOUND', async () => {
    const start = new Date();
    const end = new Date(start.getTime() + 3 * 24 * 3600 * 1000);

    const mutation = `
      mutation {
        createCourseSeriesDraft(input: {
          catalogId: 999999,
          title: "不存在目录",
          description: "说明",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "BYDAY=MO",
          leaveCutoffHours: 12,
          maxLearners: 2
        }) { id }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ query: mutation })
      .expect(200);
    const err = (res.body.errors?.[0] ?? null) as { extensions?: { errorCode?: string } } | null;
    expect(err?.extensions?.errorCode).toBe('CATALOG_NOT_FOUND');
  });

  it('标题为空时返回 COURSE_SERIES_TITLE_EMPTY', async () => {
    const catalogId = await ensureCatalog();
    const start = new Date();
    const end = new Date(start.getTime() + 3 * 24 * 3600 * 1000);

    const mutation = `
      mutation {
        createCourseSeriesDraft(input: {
          catalogId: ${catalogId},
          title: " ",
          description: "说明",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "BYDAY=MO",
          leaveCutoffHours: 12,
          maxLearners: 2
        }) { id }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ query: mutation })
      .expect(200);
    const err = (res.body.errors?.[0] ?? null) as { extensions?: { errorCode?: string } } | null;
    expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_TITLE_EMPTY');
  });

  it('日期非法（开始大于结束）返回 COURSE_SERIES_DATE_INVALID', async () => {
    const catalogId = await ensureCatalog();
    const end = new Date();
    const start = new Date(end.getTime() + 3 * 24 * 3600 * 1000);

    const mutation = `
      mutation {
        createCourseSeriesDraft(input: {
          catalogId: ${catalogId},
          title: "日期非法",
          description: "说明",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "BYDAY=MO",
          leaveCutoffHours: 12,
          maxLearners: 2
        }) { id }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ query: mutation })
      .expect(200);
    const err = (res.body.errors?.[0] ?? null) as { extensions?: { errorCode?: string } } | null;
    expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_DATE_INVALID');
  });

  it('周期规则非法返回 COURSE_SERIES_DATE_INVALID', async () => {
    const catalogId = await ensureCatalog();
    const start = new Date();
    const end = new Date(start.getTime() + 3 * 24 * 3600 * 1000);

    const mutation = `
      mutation {
        createCourseSeriesDraft(input: {
          catalogId: ${catalogId},
          title: "周期规则非法",
          description: "说明",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "FREQ=WEEKLY",
          leaveCutoffHours: 12,
          maxLearners: 2
        }) { id }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ query: mutation })
      .expect(200);
    const err = (res.body.errors?.[0] ?? null) as { extensions?: { errorCode?: string } } | null;
    expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_DATE_INVALID');
  });

  it('小班课容量非法返回 COURSE_SERIES_INVALID_PARAMS', async () => {
    const catalogId = await ensureCatalog();
    const start = new Date();
    const end = new Date(start.getTime() + 3 * 24 * 3600 * 1000);

    const mutation = `
      mutation {
        createCourseSeriesDraft(input: {
          catalogId: ${catalogId},
          title: "容量非法",
          description: "说明",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "BYDAY=MO",
          leaveCutoffHours: 12,
          maxLearners: 0
        }) { id }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ query: mutation })
      .expect(200);
    const err = (res.body.errors?.[0] ?? null) as { extensions?: { errorCode?: string } } | null;
    expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_INVALID_PARAMS');
  });
});
