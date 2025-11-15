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
import { AccountEntity } from '../../src/modules/account/base/entities/account.entity';
import { CoachEntity } from '../../src/modules/account/identities/training/coach/account-coach.entity';
import { CourseCatalogEntity } from '../../src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '../../src/modules/course/series/course-series.entity';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('Course Series (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerToken: string;
  let managerTokenWithBearer: string;
  let coachToken: string;
  let coachTokenWithBearer: string;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource, includeKeys: ['manager', 'coach', 'learner', 'guest'] });

    managerToken = await loginAndGetToken(
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );
    managerTokenWithBearer = `Bearer ${managerToken}`;

    coachToken = await loginAndGetToken(
      testAccountsConfig.coach.loginName,
      testAccountsConfig.coach.loginPassword,
    );
    coachTokenWithBearer = `Bearer ${coachToken}`;
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

  describe('Series Draft', () => {
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
        .set('Authorization', managerTokenWithBearer)
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

    it('预览系列排期：返回 occurrences，包含日期与冲突标记', async () => {
      const catalogId = await ensureCatalog();
      const start = new Date();
      const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);

      // 先创建一个草稿系列
      const createMutation = `
      mutation { 
        createCourseSeriesDraft(input: {
          catalogId: ${catalogId},
          title: "E2E 预览系列",
          description: "说明",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
          leaveCutoffHours: 12,
          maxLearners: 4,
          remark: "E2E 草稿测试"
        }) { id }
      }
    `;

      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      const seriesIdRaw = createRes.body.data.createCourseSeriesDraft.id as string | number;
      const seriesId = typeof seriesIdRaw === 'string' ? Number(seriesIdRaw) : (seriesIdRaw ?? 0);
      expect(seriesId).toBeGreaterThan(0);

      // 执行预览查询
      const previewQuery = `
      query {
        previewCourseSeriesSchedule(input: { seriesId: ${seriesId}, enableConflictCheck: true }) {
          series { id title status }
          occurrences { date weekdayIndex startDateTime endDateTime conflict { hasConflict count } }
          defaultLeadCoachId
        }
      }
    `;

      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);

      if (previewRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(previewRes.body.errors)}`);
      const result = previewRes.body.data.previewCourseSeriesSchedule as {
        series: { id: number; title: string; status: CourseSeriesStatus };
        occurrences: Array<{
          date: string;
          weekdayIndex: number;
          startDateTime: string;
          endDateTime: string;
          conflict: { hasConflict: boolean; count: number } | null;
        }>;
        defaultLeadCoachId: number | null;
      };

      expect(Number(result.series.id)).toBe(seriesId);
      expect(result.series.status).toBe(CourseSeriesStatus.PLANNED);
      expect(Array.isArray(result.occurrences)).toBe(true);

      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const expectedDates: string[] = [];
      {
        const cur = new Date(startStr);
        const endD = new Date(endStr);
        while (cur.getTime() <= endD.getTime()) {
          const wd = cur.getDay();
          // 映射：周一=1、周三=3（GraphQL 返回 weekdayIndex 的规则）
          if (wd === 1 || wd === 3) expectedDates.push(fmt(cur));
          cur.setDate(cur.getDate() + 1);
        }
      }
      // 至少应生成 1 条，且数量与预期一致
      expect(result.occurrences.length).toBe(expectedDates.length);

      // 验证排序与日期范围
      const actualDates = result.occurrences.map((o) => o.date);
      const sortedActual = [...actualDates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      expect(actualDates).toEqual(sortedActual);
      for (const d of actualDates) {
        expect(d >= startStr && d <= endStr).toBe(true);
      }

      // 每条 occurrence 的详细校验
      for (const occ of result.occurrences) {
        // 日期与星期对齐
        const dt = new Date(occ.date);
        const weekdayIndexFromDate = dt.getDay() === 0 ? 7 : dt.getDay();
        expect([1, 3].includes(occ.weekdayIndex)).toBe(true);
        expect(
          occ.weekdayIndex === weekdayIndexFromDate || [1, 3].includes(weekdayIndexFromDate),
        ).toBe(true);

        // 时间与规则一致
        const sdt = new Date(occ.startDateTime);
        const edt = new Date(occ.endDateTime);
        expect(sdt.getHours()).toBe(18);
        expect(sdt.getMinutes()).toBe(0);
        expect(edt.getTime()).toBeGreaterThan(sdt.getTime());
        expect(fmt(sdt)).toBe(occ.date);

        // 冲突字段语义校验
        if (occ.conflict) {
          expect(typeof occ.conflict.hasConflict).toBe('boolean');
          if (occ.conflict.hasConflict) expect(occ.conflict.count).toBeGreaterThan(0);
          else expect(occ.conflict.count).toBe(0);
        }
      }
    });

    it('coach 身份预览：默认主教练为当前 coach', async () => {
      const catalogId = await ensureCatalog();
      const start = new Date();
      const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);

      // 使用 coach 身份创建草稿系列（发布者为该 coach）
      const createMutation = `
        mutation { 
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 预览系列 (coach)",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${start.toISOString().slice(0, 10)}",
            endDate: "${end.toISOString().slice(0, 10)}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;

      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      const seriesIdRaw = createRes.body.data.createCourseSeriesDraft.id as string | number;
      const seriesId = typeof seriesIdRaw === 'string' ? Number(seriesIdRaw) : (seriesIdRaw ?? 0);
      expect(seriesId).toBeGreaterThan(0);

      const previewQuery = `
        query {
          previewCourseSeriesSchedule(input: { seriesId: ${seriesId}, enableConflictCheck: true }) {
            series { id title status }
            occurrences { date weekdayIndex startDateTime endDateTime conflict { hasConflict count } }
            defaultLeadCoachId
          }
        }
      `;

      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);

      if (previewRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(previewRes.body.errors)}`);

      const result = previewRes.body.data.previewCourseSeriesSchedule as {
        series: { id: number; title: string; status: CourseSeriesStatus };
        occurrences: Array<{
          date: string;
          weekdayIndex: number;
          startDateTime: string;
          endDateTime: string;
          conflict: { hasConflict: boolean; count: number } | null;
        }>;
        defaultLeadCoachId: number | null;
      };

      // 通过登录名查询当前 coach 的实体，校验默认主教练 ID
      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      expect(account).toBeTruthy();
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      expect(coach).toBeTruthy();

      expect(result.defaultLeadCoachId).toBe(coach!.id);

      // 继续做基本结构断言
      expect(result.series.status).toBe(CourseSeriesStatus.PLANNED);
      expect(Array.isArray(result.occurrences)).toBe(true);
      expect(result.occurrences.length).toBeGreaterThan(0);
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

  describe('Preview Series', () => {
    it('预览系列排期：返回 occurrences，包含日期与冲突标记', async () => {
      const catalogId = await ensureCatalog();
      const start = new Date();
      const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);

      // 先创建一个草稿系列
      const createMutation = `
        mutation { 
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 预览系列",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${start.toISOString().slice(0, 10)}",
            endDate: "${end.toISOString().slice(0, 10)}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;

      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      const seriesIdRaw2 = createRes.body.data.createCourseSeriesDraft.id as string | number;
      const seriesId2 =
        typeof seriesIdRaw2 === 'string' ? Number(seriesIdRaw2) : (seriesIdRaw2 ?? 0);
      expect(seriesId2).toBeGreaterThan(0);

      // 执行预览查询
      const previewQuery = `
        query {
          previewCourseSeriesSchedule(input: { seriesId: ${seriesId2}, enableConflictCheck: true }) {
            series { id title status }
            occurrences { date weekdayIndex startDateTime endDateTime conflict { hasConflict count } }
          }
        }
      `;

      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);

      if (previewRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(previewRes.body.errors)}`);
      const result = previewRes.body.data.previewCourseSeriesSchedule as {
        series: { id: number; title: string; status: CourseSeriesStatus };
        occurrences: Array<{
          date: string;
          weekdayIndex: number;
          startDateTime: string;
          endDateTime: string;
          conflict: { hasConflict: boolean; count: number } | null;
        }>;
      };

      expect(Number(result.series.id)).toBe(seriesId2);
      expect(result.series.status).toBe(CourseSeriesStatus.PLANNED);
      expect(Array.isArray(result.occurrences)).toBe(true);
      expect(result.occurrences.length).toBeGreaterThan(0);
      for (const occ of result.occurrences) {
        expect(typeof occ.date).toBe('string');
        expect(typeof occ.weekdayIndex).toBe('number');
        expect(typeof occ.startDateTime).toBe('string');
        expect(typeof occ.endDateTime).toBe('string');
        expect(occ.conflict === null || typeof occ.conflict.hasConflict === 'boolean').toBe(true);
      }
    });

    it('预览生成准确：按 BYDAY=MO,WE 与 BYHOUR=18 对齐', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-01-01';
      const endDateStr = '2025-01-14';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 预览校验",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;

      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      const seriesIdRaw3 = createRes.body.data.createCourseSeriesDraft.id as string | number;
      const seriesId3 =
        typeof seriesIdRaw3 === 'string' ? Number(seriesIdRaw3) : (seriesIdRaw3 ?? 0);
      expect(seriesId3).toBeGreaterThan(0);

      const previewQuery = `
        query {
          previewCourseSeriesSchedule(input: { seriesId: ${seriesId3}, enableConflictCheck: true }) {
            occurrences { date weekdayIndex startDateTime endDateTime }
          }
        }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      if (previewRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(previewRes.body.errors)}`);
      const occs = (previewRes.body.data.previewCourseSeriesSchedule.occurrences ?? []) as Array<{
        date: string;
        weekdayIndex: number;
        startDateTime: string;
        endDateTime: string;
      }>;

      const expectedDates = ['2025-01-01', '2025-01-06', '2025-01-08', '2025-01-13'];
      expect(occs.length).toBe(expectedDates.length);
      const actualDates = occs.map((o) => o.date);
      expect(actualDates).toEqual(expectedDates);
      for (const o of occs) {
        expect([1, 3].includes(o.weekdayIndex)).toBe(true);
        const sdt = new Date(o.startDateTime);
        const edt = new Date(o.endDateTime);
        expect(sdt.getHours()).toBe(18);
        expect(sdt.getMinutes()).toBe(0);
        expect(edt.getTime()).toBeGreaterThan(sdt.getTime());
      }
    });

    it('支持 3 字母周编码与 & 分隔符，分钟为 30', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-01-01';
      const endDateStr = '2025-01-08';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 预览 3 字母",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MON,WED&BYHOUR=7&BYMINUTE=30",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;

      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      const seriesIdRaw4 = createRes.body.data.createCourseSeriesDraft.id as string | number;
      const seriesId4 =
        typeof seriesIdRaw4 === 'string' ? Number(seriesIdRaw4) : (seriesIdRaw4 ?? 0);
      expect(seriesId4).toBeGreaterThan(0);

      const previewQuery = `
        query {
          previewCourseSeriesSchedule(input: { seriesId: ${seriesId4}, enableConflictCheck: true }) {
            occurrences { date weekdayIndex startDateTime endDateTime }
          }
        }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      if (previewRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(previewRes.body.errors)}`);
      const occs = (previewRes.body.data.previewCourseSeriesSchedule.occurrences ?? []) as Array<{
        date: string;
        weekdayIndex: number;
        startDateTime: string;
        endDateTime: string;
      }>;

      const expectedDates = ['2025-01-01', '2025-01-06', '2025-01-08'];
      expect(occs.length).toBe(expectedDates.length);
      const actualDates = occs.map((o) => o.date);
      expect(actualDates).toEqual(expectedDates);
      for (const o of occs) {
        expect([1, 3].includes(o.weekdayIndex)).toBe(true);
        const sdt = new Date(o.startDateTime);
        const edt = new Date(o.endDateTime);
        expect(sdt.getHours()).toBe(7);
        expect(sdt.getMinutes()).toBe(30);
        expect(edt.getTime()).toBeGreaterThan(sdt.getTime());
      }
    });

    it('禁用冲突检测时 conflict 字段为 null', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-01-01';
      const endDateStr = '2025-01-06';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 预览禁用冲突",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=WE;BYHOUR=9;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;

      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      const seriesIdRaw5 = createRes.body.data.createCourseSeriesDraft.id as string | number;
      const seriesId5 =
        typeof seriesIdRaw5 === 'string' ? Number(seriesIdRaw5) : (seriesIdRaw5 ?? 0);
      expect(seriesId5).toBeGreaterThan(0);

      const previewQuery = `
        query {
          previewCourseSeriesSchedule(input: { seriesId: ${seriesId5}, enableConflictCheck: false }) {
            occurrences { date conflict { hasConflict count } }
          }
        }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      if (previewRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(previewRes.body.errors)}`);
      const occs = (previewRes.body.data.previewCourseSeriesSchedule.occurrences ?? []) as Array<{
        date: string;
        conflict: { hasConflict: boolean; count: number } | null;
      }>;
      expect(occs.length).toBeGreaterThan(0);
      for (const o of occs) {
        expect(o.conflict).toBeNull();
      }
    });
  });

  describe('Publish Series', () => {
    it('manager dryRun：未指定主教练应报错', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-02-01';
      const endDateStr = '2025-02-07';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 发布 dryRun 校验",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      const seriesIdRaw = createRes.body.data.createCourseSeriesDraft.id as string | number;
      const seriesId = typeof seriesIdRaw === 'string' ? Number(seriesIdRaw) : (seriesIdRaw ?? 0);
      expect(seriesId).toBeGreaterThan(0);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      if (previewRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(previewRes.body.errors)}`);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;
      expect(typeof previewHash).toBe('string');

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", dryRun: true }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      const err = (publishRes.body.errors?.[0] ?? null) as {
        extensions?: { errorCode?: string };
      } | null;
      expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_INVALID_PARAMS');
    });

    it('manager dryRun：主教练存在时返回 publishedAt=null 与 createdSessions=0', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-02-01';
      const endDateStr = '2025-02-07';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 发布 dryRun 成功",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      // 查找一个 coach 作为主教练
      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      const leadId = coach!.id;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", dryRun: true, leadCoachId: ${leadId} }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      if (publishRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(publishRes.body.errors)}`);
      const result = publishRes.body.data.publishCourseSeries as {
        seriesId: number;
        status: string;
        publishedAt: string | null;
        createdSessions: number;
      };
      expect(result.seriesId).toBe(seriesId);
      expect(result.publishedAt).toBeNull();
      expect(result.createdSessions).toBe(0);
    });

    it('真实发布：返回 PUBLISHED 与 publishedAt 为 ISO 字符串', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-03-01';
      const endDateStr = '2025-03-07';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 发布真实",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      const leadId = coach!.id;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", leadCoachId: ${leadId} }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      if (publishRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(publishRes.body.errors)}`);
      const result = publishRes.body.data.publishCourseSeries as {
        seriesId: number;
        status: string;
        publishedAt: string | null;
        createdSessions: number;
      };
      expect(result.status).toBe('PUBLISHED');
      expect(typeof result.publishedAt).toBe('string');
      expect(result.publishedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(result.createdSessions).toBeGreaterThan(0);
    });

    it('coach 自己发班：不带 leadCoachId 也能发布为 PUBLISHED，生成节次', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-04-01';
      const endDateStr = '2025-04-07';

      // 用 coach 身份创建草稿（publisherType=COACH）
      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E coach 发布",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      if (createRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(createRes.body.errors)}`);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);
      expect(seriesId).toBeGreaterThan(0);

      // 预览拿到 previewHash
      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      if (previewRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(previewRes.body.errors)}`);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;
      expect(typeof previewHash).toBe('string');

      // 发布（不带 leadCoachId）
      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}" }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      if (publishRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(publishRes.body.errors)}`);
      const result = publishRes.body.data.publishCourseSeries as {
        seriesId: number;
        status: string;
        publishedAt: string | null;
        createdSessions: number;
      };

      expect(result.seriesId).toBe(seriesId);
      expect(result.status).toBe('PUBLISHED');
      expect(typeof result.publishedAt).toBe('string');
      expect(result.createdSessions).toBeGreaterThan(0);

      // 进一步确认数据库已生成节次
      const qb = dataSource
        .getRepository(CourseSeriesEntity)
        .createQueryBuilder('s')
        .leftJoin('course_sessions', 'sess', 'sess.series_id = s.id')
        .select('COUNT(sess.id)', 'cnt')
        .where('s.id = :id', { id: seriesId });
      const sessionCount = (await qb.getRawOne()) as { cnt?: unknown } | null;
      const cntNum = typeof sessionCount?.cnt === 'string' ? Number(sessionCount?.cnt) : 0;
      expect(cntNum).toBeGreaterThan(0);
    });

    it('coach 自己发班：所有生成的节次 lead_coach_id 等于该 coach.id', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-04-15';
      const endDateStr = '2025-04-21';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E coach 主教练一致性",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}" }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      if (publishRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(publishRes.body.errors)}`);

      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      const coachId = coach!.id;

      const rows: Array<{ lead_coach_id: number }> = await dataSource.query(
        'SELECT lead_coach_id FROM course_sessions WHERE series_id = ?',
        [seriesId],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(Number(r.lead_coach_id)).toBe(coachId);
      }
    });

    it('coach 越权发布他人创建的系列：返回 ACCESS_DENIED，状态不变且无节次生成', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-05-01';
      const endDateStr = '2025-05-07';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E coach 越权",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}" }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      const err = (publishRes.body.errors?.[0] ?? null) as {
        extensions?: { errorCode?: string };
      } | null;
      expect(err?.extensions?.errorCode).toBe('ACCESS_DENIED');

      const seriesRepo = dataSource.getRepository(CourseSeriesEntity);
      const fresh = await seriesRepo.findOne({ where: { id: seriesId } });
      expect(fresh!.status).toBe(CourseSeriesStatus.PLANNED);

      const rows = await dataSource.query(
        'SELECT COUNT(1) AS c FROM course_sessions WHERE series_id = ?',
        [seriesId],
      );
      const c = Number(rows?.[0]?.c ?? 0);
      expect(c).toBe(0);
    });

    it('非 ADMIN/MANAGER/COACH 身份调用 publish：返回 ACCESS_DENIED，且无写操作', async () => {
      const learnerToken = await loginAndGetToken(
        testAccountsConfig.learner.loginName,
        testAccountsConfig.learner.loginPassword,
      );
      const learnerTokenWithBearer = `Bearer ${learnerToken}`;

      const catalogId = await ensureCatalog();
      const startDateStr = '2025-05-15';
      const endDateStr = '2025-05-21';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 权限拦截",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}" }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', learnerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      const err = (publishRes.body.errors?.[0] ?? null) as {
        extensions?: { errorCode?: string };
      } | null;
      expect(err?.extensions?.errorCode).toBe('ACCESS_DENIED');

      const rows = await dataSource.query(
        'SELECT COUNT(1) AS c FROM course_sessions WHERE series_id = ?',
        [seriesId],
      );
      const c = Number(rows?.[0]?.c ?? 0);
      expect(c).toBe(0);
    });

    it('manager 发布教练创建的系列：传入不同 leadCoachId，最终主教练仍为 publisherId', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-06-01';
      const endDateStr = '2025-06-07';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E manager 操作 coach 系列",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const badLeadId = 999999;
      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", leadCoachId: ${badLeadId} }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      if (publishRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(publishRes.body.errors)}`);

      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      const publisherCoachId = coach!.id;

      const rows: Array<{ lead_coach_id: number }> = await dataSource.query(
        'SELECT lead_coach_id FROM course_sessions WHERE series_id = ?',
        [seriesId],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(Number(r.lead_coach_id)).toBe(publisherCoachId);
      }
    });

    it('非 PLANNED 状态禁止发布：返回 COURSE_SERIES_INVALID_PARAMS，且无写入', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-06-15';
      const endDateStr = '2025-06-21';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 非 PLANNED 禁止发布",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      await dataSource.query('UPDATE course_series SET status = ? WHERE id = ?', [
        'PUBLISHED',
        seriesId,
      ]);

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}" }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      const err = (publishRes.body.errors?.[0] ?? null) as {
        extensions?: { errorCode?: string };
      } | null;
      expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_INVALID_PARAMS');

      const rows = await dataSource.query(
        'SELECT COUNT(1) AS c FROM course_sessions WHERE series_id = ?',
        [seriesId],
      );
      const c = Number(rows?.[0]?.c ?? 0);
      expect(c).toBe(0);
    });

    it('重复发布同一个系列：状态校验阻断或更新失败，错误且不重复创建', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-07-01';
      const endDateStr = '2025-07-07';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 重复发布",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      const leadId = coach!.id;

      const publish1 = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", leadCoachId: ${leadId} }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const res1 = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publish1 })
        .expect(200);
      if (res1.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res1.body.errors)}`);

      const publish2 = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", leadCoachId: ${leadId} }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const res2 = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publish2 })
        .expect(200);
      const err = (res2.body.errors?.[0] ?? null) as { extensions?: { errorCode?: string } } | null;
      expect(['COURSE_SERIES_INVALID_PARAMS', 'COURSE_SERIES_UPDATE_FAILED']).toContain(
        String(err?.extensions?.errorCode ?? ''),
      );
    });

    it('预览后修改系列导致 hash 失效：返回 COURSE_SERIES_INVALID_PARAMS', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-07-15';
      const endDateStr = '2025-07-21';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E hash 失效",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      await dataSource.query('UPDATE course_series SET start_date = ? WHERE id = ?', [
        '2025-07-16',
        seriesId,
      ]);

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}" }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      const err = (publishRes.body.errors?.[0] ?? null) as {
        extensions?: { errorCode?: string };
      } | null;
      expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_INVALID_PARAMS');
    });

    it('recurrenceRule 为空：非 dryRun 发布报「至少 1 节次」错误', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-08-01';
      const endDateStr = '2025-08-07';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 空规则",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      const leadId = coach!.id;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", leadCoachId: ${leadId} }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      const err = (publishRes.body.errors?.[0] ?? null) as {
        extensions?: { errorCode?: string };
      } | null;
      expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_INVALID_PARAMS');
    });

    it('selectedKeys = []：显式一个都不发，应报「至少 1 节次」错误', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-08-15';
      const endDateStr = '2025-08-21';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 空选择",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { occurrences { occurrenceKey } previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      const leadId = coach!.id;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", selectedKeys: [], leadCoachId: ${leadId} }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      const err = (publishRes.body.errors?.[0] ?? null) as {
        extensions?: { errorCode?: string };
      } | null;
      expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_INVALID_PARAMS');
    });

    it('selectedKeys 部分选择：createdSessions 等于选择数量', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-09-01';
      const endDateStr = '2025-09-07';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 部分选择",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { occurrences { occurrenceKey } previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const occurrences = (previewRes.body.data.previewCourseSeriesSchedule.occurrences ??
        []) as Array<{ occurrenceKey: string }>;
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const selected = occurrences.slice(0, Math.max(1, Math.floor(occurrences.length / 2)));
      const keys = selected.map((o) => o.occurrenceKey);

      const accountRepo = dataSource.getRepository(AccountEntity);
      const account = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      const coachRepo = dataSource.getRepository(CoachEntity);
      const coach = await coachRepo.findOne({ where: { accountId: account!.id } });
      const leadId = coach!.id;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", selectedKeys: [${keys.map((k) => `"${k}"`).join(', ')}], leadCoachId: ${leadId} }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      if (publishRes.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(publishRes.body.errors)}`);
      const result = publishRes.body.data.publishCourseSeries as { createdSessions: number };
      expect(result.createdSessions).toBe(keys.length);
    });

    it('manager 指定不存在的主教练 ID：返回 COURSE_SERIES_INVALID_PARAMS', async () => {
      const catalogId = await ensureCatalog();
      const startDateStr = '2025-09-15';
      const endDateStr = '2025-09-21';

      const createMutation = `
        mutation {
          createCourseSeriesDraft(input: {
            catalogId: ${catalogId},
            title: "E2E 主教练不存在",
            description: "说明",
            venueType: ${VenueType.SANDA_GYM},
            classMode: ${ClassMode.SMALL_CLASS},
            startDate: "${startDateStr}",
            endDate: "${endDateStr}",
            recurrenceRule: "BYDAY=MO,WE;BYHOUR=18;BYMINUTE=0",
            leaveCutoffHours: 12,
            maxLearners: 4,
            remark: "E2E 草稿测试"
          }) { id }
        }
      `;
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: createMutation })
        .expect(200);
      const seriesId = Number(createRes.body.data.createCourseSeriesDraft.id);

      const previewQuery = `
        query { previewCourseSeriesSchedule(input: { seriesId: ${seriesId} }) { previewHash } }
      `;
      const previewRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: previewQuery })
        .expect(200);
      const previewHash = previewRes.body.data.previewCourseSeriesSchedule.previewHash as string;

      const publishMutation = `
        mutation {
          publishCourseSeries(input: { seriesId: ${seriesId}, previewHash: "${previewHash}", leadCoachId: 999999 }) {
            seriesId
            status
            publishedAt
            createdSessions
          }
        }
      `;
      const publishRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: publishMutation })
        .expect(200);
      const err = (publishRes.body.errors?.[0] ?? null) as {
        extensions?: { errorCode?: string };
      } | null;
      expect(err?.extensions?.errorCode).toBe('COURSE_SERIES_INVALID_PARAMS');
    });
  });
});
