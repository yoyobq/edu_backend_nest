// test/04-course/update-course-session.e2e-spec.ts
import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { CourseLevel } from '@app-types/models/course.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { CourseCatalogEntity } from '../../src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '../../src/modules/course/series/course-series.entity';
import { CourseSessionEntity } from '../../src/modules/course/sessions/course-session.entity';
import { getAccountIdByLoginName } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('Update Course Session (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerTokenWithBearer: string;
  let coachTokenWithBearer: string;
  let customerTokenWithBearer: string;

  const E2E_CATALOG_TITLE = 'E2E Update Session Catalog';
  const E2E_SERIES_REMARK = 'E2E Update Session Series';
  const E2E_SESSION_REMARK = 'E2E Update Session';

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    await cleanupCourseFixtures();
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      includeKeys: ['manager', 'coach', 'customer', 'learner'],
    });

    const managerToken = await loginAndGetToken(
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );
    managerTokenWithBearer = `Bearer ${managerToken}`;

    const coachToken = await loginAndGetToken(
      testAccountsConfig.coach.loginName,
      testAccountsConfig.coach.loginPassword,
    );
    coachTokenWithBearer = `Bearer ${coachToken}`;

    const customerToken = await loginAndGetToken(
      testAccountsConfig.customer.loginName,
      testAccountsConfig.customer.loginPassword,
    );
    customerTokenWithBearer = `Bearer ${customerToken}`;
  }, 30000);

  afterAll(async () => {
    await cleanupCourseFixtures();
    await cleanupTestAccounts(dataSource);
    if (app) await app.close();
  });

  async function loginAndGetToken(loginName: string, loginPassword: string): Promise<string> {
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
  }

  async function cleanupCourseFixtures(): Promise<void> {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DELETE FROM participation_enrollment WHERE remark = ?', [
      E2E_SESSION_REMARK,
    ]);
    await dataSource.query('DELETE FROM course_sessions WHERE remark = ?', [E2E_SESSION_REMARK]);
    await dataSource.query('DELETE FROM course_series WHERE remark = ?', [E2E_SERIES_REMARK]);
    await dataSource.query('DELETE FROM course_catalogs WHERE title = ?', [E2E_CATALOG_TITLE]);
  }

  async function ensureCatalog(managerAccountId: number): Promise<number> {
    const repo = dataSource.getRepository(CourseCatalogEntity);
    const existed = await repo.findOne({ where: { title: E2E_CATALOG_TITLE } });
    if (existed) {
      return existed.id;
    }
    const created = repo.create({
      courseLevel: CourseLevel.FITNESS,
      title: E2E_CATALOG_TITLE,
      description: 'E2E update session catalog',
      deactivatedAt: null,
      createdBy: managerAccountId,
      updatedBy: managerAccountId,
    } as Partial<CourseCatalogEntity>);
    const saved = await repo.save(created);
    return saved.id;
  }

  async function getManagerAccountId(): Promise<number> {
    return getAccountIdByLoginName(dataSource, testAccountsConfig.manager.loginName);
  }

  async function createPublishedSeries(
    catalogId: number,
    managerAccountId: number,
  ): Promise<number> {
    const repo = dataSource.getRepository(CourseSeriesEntity);
    const today = new Date().toISOString().slice(0, 10);
    const series = repo.create({
      catalogId,
      title: 'E2E Update Session Series',
      description: null,
      venueType: 'SANDA_GYM',
      classMode: 'SMALL_CLASS',
      startDate: today,
      endDate: today,
      recurrenceRule: null,
      leaveCutoffHours: 12,
      pricePerSession: null,
      teachingFeeRef: null,
      maxLearners: 10,
      status: 'PUBLISHED',
      remark: E2E_SERIES_REMARK,
      createdBy: managerAccountId,
      updatedBy: managerAccountId,
      publisherType: 'MANAGER',
      publisherId: managerAccountId,
    } as unknown as Partial<CourseSeriesEntity>);
    const saved = await repo.save(series);
    return saved.id;
  }

  async function createSession(
    seriesId: number,
    managerAccountId: number,
  ): Promise<CourseSessionEntity> {
    const repo = dataSource.getRepository(CourseSessionEntity);
    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const session = repo.create({
      seriesId,
      startTime: start,
      endTime: end,
      leadCoachId: managerAccountId,
      locationText: 'E2E Room',
      extraCoachesJson: null,
      status: SessionStatus.SCHEDULED,
      remark: E2E_SESSION_REMARK,
      attendanceConfirmedAt: null,
      attendanceConfirmedBy: null,
      leaveCutoffHoursOverride: null,
      cutoffEvaluatedAt: null,
      createdBy: managerAccountId,
      updatedBy: managerAccountId,
    } as unknown as Partial<CourseSessionEntity>);
    const saved = await repo.save(session);
    return saved;
  }

  it('manager 可以更新已发布节次的时间/地点/主教练/备注', async () => {
    const managerAccountId = await getManagerAccountId();
    const catalogId = await ensureCatalog(managerAccountId);
    const seriesId = await createPublishedSeries(catalogId, managerAccountId);
    const session = await createSession(seriesId, managerAccountId);

    const newStart = new Date(session.startTime.getTime() + 2 * 60 * 60 * 1000);
    const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);

    const mutation = `
      mutation UpdateSession($input: UpdateCourseSessionInput!) {
        updateCourseSession(input: $input) {
          id
          startTime
          endTime
          locationText
          leadCoachId
          remark
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', managerTokenWithBearer)
      .send({
        query: mutation,
        variables: {
          input: {
            id: session.id,
            startTime: newStart.toISOString(),
            endTime: newEnd.toISOString(),
            locationText: 'Updated Room',
            leadCoachId: managerAccountId,
            remark: 'Updated Remark',
          },
        },
      })
      .expect(200);

    if (res.body.errors) {
      throw new Error(`更新节次失败: ${JSON.stringify(res.body.errors)}`);
    }

    const data = res.body.data.updateCourseSession;
    expect(Number(data.id)).toBe(session.id);
    const returnedStart = new Date(data.startTime).getTime();
    const returnedEnd = new Date(data.endTime).getTime();
    expect(Math.abs(returnedStart - newStart.getTime())).toBeLessThan(1000);
    expect(Math.abs(returnedEnd - newEnd.getTime())).toBeLessThan(1000);
    expect(data.locationText).toBe('Updated Room');
    expect(Number(data.leadCoachId)).toBe(managerAccountId);
    expect(data.remark).toBe('Updated Remark');

    const repo = dataSource.getRepository(CourseSessionEntity);
    const updated = await repo.findOne({ where: { id: session.id } });
    expect(updated).toBeDefined();
    expect(updated?.locationText).toBe('Updated Room');
  });

  it('coach 调用 updateCourseSession 会被 RolesGuard 拒绝', async () => {
    const managerAccountId = await getManagerAccountId();
    const catalogId = await ensureCatalog(managerAccountId);
    const seriesId = await createPublishedSeries(catalogId, managerAccountId);
    const session = await createSession(seriesId, managerAccountId);

    const mutation = `
      mutation UpdateSession($input: UpdateCourseSessionInput!) {
        updateCourseSession(input: $input) {
          id
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', coachTokenWithBearer)
      .send({
        query: mutation,
        variables: {
          input: {
            id: session.id,
            locationText: 'Coach Try Update',
          },
        },
      })
      .expect(200);

    expect(res.body.errors).toBeDefined();
    const err = res.body.errors[0];
    expect(err.message).toContain('缺少所需角色');
    expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    expect(err.extensions?.details?.requiredRoles).toEqual(
      expect.arrayContaining(['MANAGER', 'ADMIN']),
    );
    expect(err.extensions?.details?.userRoles).toEqual(['COACH']);
  });

  it('customer 调用 updateCourseSession 会被 RolesGuard 拒绝', async () => {
    const managerAccountId = await getManagerAccountId();
    const catalogId = await ensureCatalog(managerAccountId);
    const seriesId = await createPublishedSeries(catalogId, managerAccountId);
    const session = await createSession(seriesId, managerAccountId);

    const mutation = `
      mutation UpdateSession($input: UpdateCourseSessionInput!) {
        updateCourseSession(input: $input) {
          id
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', customerTokenWithBearer)
      .send({
        query: mutation,
        variables: {
          input: {
            id: session.id,
            locationText: 'Customer Try Update',
          },
        },
      })
      .expect(200);

    expect(res.body.errors).toBeDefined();
    const err = res.body.errors[0];
    expect(err.message).toContain('缺少所需角色');
    expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    expect(err.extensions?.details?.requiredRoles).toEqual(
      expect.arrayContaining(['MANAGER', 'ADMIN']),
    );
    expect(err.extensions?.details?.userRoles).toEqual(['CUSTOMER']);
  });

  it('未登录用户调用 updateCourseSession 会被 JWT 认证拦截', async () => {
    const managerAccountId = await getManagerAccountId();
    const catalogId = await ensureCatalog(managerAccountId);
    const seriesId = await createPublishedSeries(catalogId, managerAccountId);
    const session = await createSession(seriesId, managerAccountId);

    const mutation = `
      mutation UpdateSession($input: UpdateCourseSessionInput!) {
        updateCourseSession(input: $input) {
          id
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: mutation,
        variables: {
          input: {
            id: session.id,
            locationText: 'Anonymous Try Update',
          },
        },
      })
      .expect(200);

    expect(res.body.errors).toBeDefined();
    const msg = String(res.body.errors?.[0]?.message ?? '');
    expect(msg).toContain('JWT 认证失败');
  });

  it('FINISHED 状态的节次更新应失败并返回 SESSION_STATUS_INVALID', async () => {
    const managerAccountId = await getManagerAccountId();
    const catalogId = await ensureCatalog(managerAccountId);
    const seriesId = await createPublishedSeries(catalogId, managerAccountId);
    const session = await createSession(seriesId, managerAccountId);

    const repo = dataSource.getRepository(CourseSessionEntity);
    await repo.update({ id: session.id }, { status: SessionStatus.FINISHED });

    const mutation = `
      mutation UpdateSession($input: UpdateCourseSessionInput!) {
        updateCourseSession(input: $input) {
          id
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', managerTokenWithBearer)
      .send({
        query: mutation,
        variables: {
          input: {
            id: session.id,
            locationText: 'Finished Update',
          },
        },
      })
      .expect(200);

    expect(Array.isArray(res.body.errors)).toBe(true);
    const err = res.body.errors[0];
    expect(err.extensions?.errorCode).toBe('SESSION_STATUS_INVALID');
    const msg = String(err.message ?? '');
    expect(msg).toContain('当前状态不允许修改节次');
  });

  it('CANCELED 状态的节次更新应失败并返回 SESSION_STATUS_INVALID', async () => {
    const managerAccountId = await getManagerAccountId();
    const catalogId = await ensureCatalog(managerAccountId);
    const seriesId = await createPublishedSeries(catalogId, managerAccountId);
    const session = await createSession(seriesId, managerAccountId);

    const repo = dataSource.getRepository(CourseSessionEntity);
    await repo.update({ id: session.id }, { status: SessionStatus.CANCELED });

    const mutation = `
      mutation UpdateSession($input: UpdateCourseSessionInput!) {
        updateCourseSession(input: $input) {
          id
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', managerTokenWithBearer)
      .send({
        query: mutation,
        variables: {
          input: {
            id: session.id,
            locationText: 'Canceled Update',
          },
        },
      })
      .expect(200);

    expect(Array.isArray(res.body.errors)).toBe(true);
    const err = res.body.errors[0];
    expect(err.extensions?.errorCode).toBe('SESSION_STATUS_INVALID');
    const msg = String(err.message ?? '');
    expect(msg).toContain('当前状态不允许修改节次');
  });

  it('传入 leadCoachId:null 应触发参数校验错误并拒绝更新', async () => {
    const managerAccountId = await getManagerAccountId();
    const catalogId = await ensureCatalog(managerAccountId);
    const seriesId = await createPublishedSeries(catalogId, managerAccountId);
    const session = await createSession(seriesId, managerAccountId);

    const mutation = `
      mutation UpdateSession($input: UpdateCourseSessionInput!) {
        updateCourseSession(input: $input) {
          id
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', managerTokenWithBearer)
      .send({
        query: mutation,
        variables: {
          input: {
            id: session.id,
            leadCoachId: null,
          },
        },
      })
      .expect(200);

    expect(Array.isArray(res.body.errors)).toBe(true);
    const err = res.body.errors[0];
    const msg = String(err.message ?? '');
    expect(msg).toContain('主教练 ID');
  });
});
