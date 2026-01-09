// 文件位置：test/04-course/update-course-series.e2e-spec.ts
import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { ClassMode, VenueType } from '@app-types/models/course-series.types';
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

describe('Update Course Series (e2e)', () => {
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
    await seedTestAccounts({ dataSource, includeKeys: ['manager', 'coach'] });

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
    await cleanupSeriesAndCatalogs();
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
        title: 'E2E 更新测试目录',
        description: 'UpdateSeries 测试用',
        deactivatedAt: null,
      });
      return existed.id;
    }
    const created = await repo.save(
      repo.create({
        courseLevel: CourseLevel.FITNESS as CourseLevel,
        title: 'E2E 更新测试目录',
        description: 'UpdateSeries 测试用',
        deactivatedAt: null,
        createdBy: null,
        updatedBy: null,
      }) as Partial<CourseCatalogEntity>,
    );
    return (created as CourseCatalogEntity).id;
  };

  const createDraftSeries = async (params: {
    readonly catalogId: number;
    readonly auth: string;
    readonly title?: string;
    readonly remark?: string;
  }): Promise<number> => {
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
    const title = params.title ?? 'E2E 待更新系列';
    const remark = params.remark ?? 'E2E 更新测试';

    const mutation = `
      mutation {
        createCourseSeriesDraft(input: {
          catalogId: ${params.catalogId},
          title: "${title}",
          description: "初始描述",
          venueType: ${VenueType.SANDA_GYM},
          classMode: ${ClassMode.SMALL_CLASS},
          startDate: "${start.toISOString().slice(0, 10)}",
          endDate: "${end.toISOString().slice(0, 10)}",
          recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=18",
          leaveCutoffHours: 12,
          pricePerSession: 100.00,
          teachingFeeRef: 50.00,
          maxLearners: 4,
          remark: "${remark}"
        }) { id }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', params.auth)
      .send({ query: mutation })
      .expect(200);

    if (res.body.errors) throw new Error(`创建草稿失败: ${JSON.stringify(res.body.errors)}`);
    return Number(res.body.data.createCourseSeriesDraft.id);
  };

  const cleanupSeriesAndCatalogs = async (): Promise<void> => {
    await dataSource.query('DELETE FROM course_series WHERE remark LIKE ?', ['E2E 更新测试%']);
    await dataSource.query('DELETE FROM course_catalogs WHERE title = ?', ['E2E 更新测试目录']);
  };

  describe('updateCourseSeries', () => {
    it('manager 可以更新草稿系列的基本信息', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createDraftSeries({ catalogId, auth: managerTokenWithBearer });

      const updateMutation = `
        mutation {
          updateCourseSeries(input: {
            id: ${seriesId},
            title: "已更新的系列标题",
            description: "新的描述",
            pricePerSession: 120.50,
            teachingFeeRef: 60.00,
            maxLearners: 6,
            remark: "E2E 更新测试 (已修改)"
          }) {
            id
            title
            description
            pricePerSession
            teachingFeeRef
            maxLearners
            updatedBy
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: updateMutation })
        .expect(200);

      if (res.body.errors) throw new Error(`更新失败: ${JSON.stringify(res.body.errors)}`);

      const data = res.body.data.updateCourseSeries;
      expect(Number(data.id)).toBe(seriesId);
      expect(data.title).toBe('已更新的系列标题');
      expect(data.description).toBe('新的描述');
      expect(Number(data.pricePerSession)).toBe(120.5);
      expect(Number(data.teachingFeeRef)).toBe(60.0);
      expect(data.maxLearners).toBe(6);

      // 验证 updatedBy 是否有值 (假定 manager 登录后有 accountId)
      expect(data.updatedBy).toBeTruthy();

      // 验证数据库
      const repo = dataSource.getRepository(CourseSeriesEntity);
      const updatedEntity = await repo.findOne({ where: { id: seriesId } });
      expect(updatedEntity).toBeDefined();
      expect(updatedEntity?.title).toBe('已更新的系列标题');
      expect(updatedEntity?.remark).toBe('E2E 更新测试 (已修改)');
    });

    it('支持部分更新（只更新价格）', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createDraftSeries({ catalogId, auth: managerTokenWithBearer });

      const updateMutation = `
        mutation {
          updateCourseSeries(input: {
            id: ${seriesId},
            pricePerSession: 200.00
          }) {
            id
            title
            pricePerSession
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: updateMutation })
        .expect(200);

      const data = res.body.data.updateCourseSeries;
      expect(Number(data.pricePerSession)).toBe(200.0);
      expect(data.title).toBe('E2E 待更新系列'); // 保持原值
    });

    it('coach 可以更新自己创建的未发布 series', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createDraftSeries({
        catalogId,
        auth: coachTokenWithBearer,
        remark: 'E2E 更新测试 (coach)',
      });

      const updateMutation = `
        mutation {
          updateCourseSeries(input: {
            id: ${seriesId},
            title: "Coach 更新标题",
            remark: "E2E 更新测试 (coach 已更新)"
          }) {
            id
            title
            remark
            updatedBy
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: updateMutation })
        .expect(200);

      if (res.body.errors) throw new Error(`coach 更新失败: ${JSON.stringify(res.body.errors)}`);
      const data = res.body.data.updateCourseSeries;
      expect(Number(data.id)).toBe(seriesId);
      expect(data.title).toBe('Coach 更新标题');
      expect(data.remark).toBe('E2E 更新测试 (coach 已更新)');
      expect(data.updatedBy).toBeTruthy();
    });

    it('coach 不允许更新非自己创建的 series', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createDraftSeries({ catalogId, auth: managerTokenWithBearer });

      const updateMutation = `
        mutation {
          updateCourseSeries(input: {
            id: ${seriesId},
            title: "Coach 尝试更新"
          }) {
            id
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', coachTokenWithBearer)
        .send({ query: updateMutation })
        .expect(200);

      const err = res.body.errors?.[0];
      expect(err).toBeDefined();
      const msg = String(err.message ?? '');
      expect(msg).toMatch(/无权更新|ACCESS_DENIED|权限/i);
    });

    it('尝试更新不存在的系列 ID 应报错', async () => {
      const updateMutation = `
          mutation {
            updateCourseSeries(input: {
              id: 999999,
              title: "幽灵系列"
            }) {
              id
            }
          }
        `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', managerTokenWithBearer)
        .send({ query: updateMutation })
        .expect(200);

      const err = res.body.errors?.[0];
      expect(err).toBeDefined();
      // 期望是 EntityNotFoundError 转换过来的错误，或者直接是 500/404
      // 根据项目惯例，可能返回 COURSE_SERIES_NOT_FOUND 或类似
      // 这里暂时断言有错误即可，最好能断言 code
      // 如果是 TypeORM findOneOrFail 抛出的 EntityNotFoundError，可能会被全局过滤器捕获
    });
  });
});
