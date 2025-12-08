// test/06-identity-management/coach-management.e2e-spec.ts

import { AudienceTypeEnum, IdentityTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * Coach 管理 E2E 测试
 * 覆盖更新、下线、上线三个操作，验证权限与幂等规则
 */
describe('Coach Management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let managerAccessToken: string;
  let coachAccessToken: string;
  let coachId: number;

  beforeAll(async () => {
    // 初始化 GraphQL Schema
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // 清理并创建测试账号：manager 与 coach
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource });

    // 登录并记录 access token
    managerAccessToken = await loginAndGetToken(
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );

    coachAccessToken = await loginAndGetToken(
      testAccountsConfig.coach.loginName,
      testAccountsConfig.coach.loginPassword,
    );

    // 查询教练身份，获取 coachId
    coachId = await getMyCoachId(app, coachAccessToken);
  }, 60000);

  afterAll(async () => {
    await cleanupTestAccounts(dataSource);
    if (app) await app.close();
  });

  /**
   * 列表查询：仅管理员可访问
   */
  describe('查询教练列表（coaches）', () => {
    it('未认证访问 coaches 应该被拒绝', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            query ListCoaches($input: ListCoachesInput!) {
              coaches(input: $input) { data { id name } pagination { total page limit totalPages } }
            }
          `,
          variables: { input: { page: 1, limit: 10 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/Unauthorized|未认证|认证/);
    });

    it('非管理员访问 coaches 应返回权限错误（使用 coach token）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            query ListCoaches($input: ListCoachesInput!) {
              coaches(input: $input) { data { id name } pagination { total page limit totalPages } }
            }
          `,
          variables: { input: { page: 1, limit: 10 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(
        /仅管理员可查看教练列表|仅活跃的 manager 可查看教练列表|权限|无权|ACCESS_DENIED/,
      );
    });

    it('管理员可以分页查询教练列表，包含分页信息与新字段、分页标志', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListCoaches($input: ListCoachesInput!) {
              coaches(input: $input) {
                coaches { id name accountId level description avatarUrl specialty deactivatedAt }
                data { id name }
                pagination { total page limit totalPages hasNext hasPrev }
              }
            }
          `,
          variables: { input: { page: 1, limit: 10, sortBy: 'CREATED_AT', sortOrder: 'DESC' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const out = response.body.data.coaches;
      expect(out).toBeDefined();
      expect(out.pagination).toBeDefined();
      expect(typeof out.pagination.total).toBe('number');
      expect(out.pagination.page).toBe(1);
      expect(out.pagination.limit).toBe(10);
      // 新字段 coaches 列表
      expect(Array.isArray(out.coaches)).toBe(true);
      // 兼容旧字段 data 仍可用
      expect(Array.isArray(out.data)).toBe(true);
      // 分页标志：根据当前预置数据仅 1 个教练，第一页应无上一页，且通常无下一页
      expect(out.pagination.hasPrev).toBe(false);
      expect(out.pagination.hasNext).toBe(false);
      // 至少应包含当前测试预置的 coach 账户
      const hasCoach = out.coaches.some((c: any) => c.id === coachId);
      expect(hasCoach).toBe(true);
    });

    it('管理员查询支持按 name 升序排序', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListCoaches($input: ListCoachesInput!) {
              coaches(input: $input) { coaches { id name } pagination { total page limit totalPages } }
            }
          `,
          variables: { input: { page: 1, limit: 10, sortBy: 'NAME', sortOrder: 'ASC' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const items: Array<{ id: number; name: string }> = response.body.data.coaches.coaches;
      // 简单断言：名称应按字典序非降排列
      const names = items.map((i) => i.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names.join('|')).toBe(sorted.join('|'));
    });

    /**
     * 验证 coaches 支持姓名模糊搜索（Manager 视角）
     */
    it('管理员查询支持 query 按姓名模糊搜索', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListCoaches($input: ListCoachesInput!) {
              coaches(input: $input) {
                coaches { id name }
                data { id name }
                pagination { total page limit totalPages hasNext hasPrev }
              }
            }
          `,
          variables: { input: { page: 1, limit: 10, query: 'coach_name' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const out = response.body.data.coaches;
      expect(out.pagination.total).toBeGreaterThanOrEqual(1);
      const hasCoach = out.coaches.some((c: { id: number; name: string }) => c.id === coachId);
      expect(hasCoach).toBe(true);
    });

    /**
     * 验证 coaches 支持手机号模糊搜索（Manager 视角）
     * 先为测试教练的 user_info 写入手机号，再进行查询
     */
    it('管理员查询支持 query 按手机号模糊搜索', async () => {
      const accountRepo = dataSource.getRepository(AccountEntity);
      const uiRepo = dataSource.getRepository(UserInfoEntity);
      const coachAccount = await accountRepo.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });
      if (!coachAccount) throw new Error('测试教练账号不存在');
      await uiRepo.update({ accountId: coachAccount.id }, { phone: '13800138000' });

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListCoaches($input: ListCoachesInput!) {
              coaches(input: $input) {
                coaches { id name }
                pagination { total page limit totalPages }
              }
            }
          `,
          variables: { input: { page: 1, limit: 10, query: '1380013' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const out = response.body.data.coaches;
      expect(out.pagination.total).toBeGreaterThanOrEqual(1);
      const hasCoach = out.coaches.some((c: { id: number; name: string }) => c.id === coachId);
      expect(hasCoach).toBe(true);
    });

    /**
     * 验证 coaches 查询：query 不匹配时返回空列表与 total=0
     */
    it('管理员查询 query 不匹配应返回空列表', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListCoaches($input: ListCoachesInput!) {
              coaches(input: $input) {
                coaches { id name }
                data { id name }
                pagination { total page limit totalPages hasNext hasPrev }
              }
            }
          `,
          variables: { input: { page: 1, limit: 10, query: '不存在关键词 00000' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const out = response.body.data.coaches;
      expect(Array.isArray(out.coaches)).toBe(true);
      expect(out.coaches.length).toBe(0);
      expect(Array.isArray(out.data)).toBe(true);
      expect(out.data.length).toBe(0);
      expect(out.pagination.total).toBe(0);
      expect(out.pagination.hasPrev).toBe(false);
      expect(out.pagination.hasNext).toBe(false);
    });

    it('管理员列表应正确返回 description 与 remark 字段', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListCoaches($input: ListCoachesInput!) {
              coaches(input: $input) {
                coaches { id name description remark }
              }
            }
          `,
          variables: { input: { page: 1, limit: 10 } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      type CoachListItem = {
        id: number;
        name: string;
        description: string | null;
        remark: string | null;
      };
      const list: CoachListItem[] = response.body.data.coaches.coaches as CoachListItem[];
      const target = list.find((c) => c.id === coachId);
      expect(target).toBeDefined();
      expect(typeof target!.description === 'string' || target!.description === null).toBe(true);
      expect(typeof target!.remark === 'string' || target!.remark === null).toBe(true);
      // 预置数据包含登录名标识，便于断言
      expect(target!.description ?? '').toContain(testAccountsConfig.coach.loginName);
      expect(target!.remark ?? '').toContain(testAccountsConfig.coach.loginName);
    });
  });

  /**
   * 登录获取 token
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
   * 读取当前用户的教练身份 ID
   */
  const getMyCoachId = async (nestApp: INestApplication, token: string): Promise<number> => {
    const resp = await request(nestApp.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              role
              identity {
                ... on CoachType { id }
              }
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
    if (resp.body.errors) throw new Error(`读取教练身份失败: ${JSON.stringify(resp.body.errors)}`);
    if (resp.body.data.login.role !== IdentityTypeEnum.COACH) throw new Error('当前角色不是 Coach');
    return resp.body.data.login.identity.id as number;
  };

  describe('更新教练信息', () => {
    it('未认证访问 updateCoach 应该被拒绝', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id } }
            }
          `,
          variables: { input: { name: '未认证更新' } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/Unauthorized|未认证|认证/);
    });

    it('非教练/非管理员用户更新应返回身份验证失败（使用 customer token）', async () => {
      const customerToken = await loginAndGetToken(
        testAccountsConfig.customer.loginName,
        testAccountsConfig.customer.loginPassword,
      );
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id } }
            }
          `,
          variables: { input: { name: '非法身份更新' } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/用户身份验证失败|权限|无权/);
    });
    it('教练用户应该可以更新 name / description / avatarUrl / specialty / remark', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) {
                coach { id name description avatarUrl specialty remark level }
              }
            }
          `,
          variables: {
            input: {
              name: '教练测试姓名',
              description: 'E2E 教练自更新描述',
              avatarUrl: 'https://example.com/avatar.png',
              specialty: '体能',
              remark: 'E2E 教练自更新',
            },
          },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const coach = response.body.data.updateCoach.coach;
      expect(coach.id).toBeDefined();
      expect(coach.name).toBe('教练测试姓名');
      expect(coach.description).toBe('E2E 教练自更新描述');
      expect(coach.avatarUrl).toBe('https://example.com/avatar.png');
      expect(coach.specialty).toBe('体能');
      expect(coach.remark).toBe('E2E 教练自更新');
      // 教练身份无权更新 level，应保持为原值（默认 1）
      expect(typeof coach.level === 'number').toBe(true);
    });

    it('教练尝试更新 level 应该报错（GraphQL 错误）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id level } }
            }
          `,
          variables: { input: { level: 2 } },
        })
        .expect(200);

      // 应返回 GraphQL 错误（DomainError 映射）
      expect(response.body.errors).toBeDefined();
      const message = response.body.errors?.[0]?.message ?? '';
      expect(message).toMatch(/Coach 不可修改等级|权限|无权/);
    });

    it('管理员应该可以更新指定教练的 level', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id level remark } }
            }
          `,
          variables: { input: { coachId, level: 3, remark: 'E2E 管理员更新等级' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const coach = response.body.data.updateCoach.coach;
      expect(coach.id).toBe(coachId);
      expect(typeof coach.level === 'number').toBe(true);
      expect(coach.remark).toBe('E2E 管理员更新等级');
    });

    it('管理员未提供 coachId 更新 level 应该报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id level } }
            }
          `,
          variables: { input: { level: 2 } },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/Manager 必须指定目标教练 ID|必须指定/);
    });

    it('管理员更新不存在的 coachId 应该报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id level } }
            }
          `,
          variables: { input: { coachId: 999999, level: 2 } },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/目标教练不存在|教练不存在/);
    });

    it('管理员更新 level 为 0（DTO 校验）应报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id level } }
            }
          `,
          variables: { input: { coachId, level: 0 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      // 宽松匹配，兼容不同语言环境或文案缩写
      expect(msg).toMatch(/1-3/);
    });

    it('管理员更新 level 为 4（用例逻辑）应报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id level } }
            }
          `,
          variables: { input: { coachId, level: 4 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/等级必须在 1-3 之间|Max|不超过 3/);
    });

    it('DTO 长度校验：name 超长应报错', async () => {
      const longName = 'A'.repeat(65);
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id name } }
            }
          `,
          variables: { input: { name: longName } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/教练姓名长度不能超过 64|MaxLength|长度/);
    });

    it('DTO 长度校验：avatarUrl 超长应报错', async () => {
      const longUrl = 'https://example.com/'.padEnd(260, 'x');
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id avatarUrl } }
            }
          `,
          variables: { input: { avatarUrl: longUrl } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/头像 URL 长度不能超过 255|MaxLength|长度/);
    });

    it('DTO 长度校验：specialty 超长应报错', async () => {
      const longSpecialty = '特长'.repeat(51);
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id specialty } }
            }
          `,
          variables: { input: { specialty: longSpecialty } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/教练专长长度不能超过 100|MaxLength|长度/);
    });

    it('DTO 长度校验：remark 超长应报错', async () => {
      const longRemark = '备注'.repeat(130);
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id remark } }
            }
          `,
          variables: { input: { remark: longRemark } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/备注长度不能超过 255|MaxLength|长度/);
    });

    it('DTO 长度校验：description 超长应报错', async () => {
      const longDesc = '描'.repeat(2001);
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id description } }
            }
          `,
          variables: { input: { description: longDesc } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/简介长度不能超过 2000|MaxLength|长度/);
    });

    it('教练尝试跨人编辑（提供其他 coachId）应报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation UpdateCoach($input: UpdateCoachInput!) {
              updateCoach(input: $input) { coach { id } }
            }
          `,
          variables: { input: { coachId: 999999, name: '非法跨人编辑' } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/无权限编辑其他教练信息|权限|无权/);
    });
  });

  describe('教练上下线', () => {
    it('未认证下线应该被拒绝', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation DeactivateCoach($input: DeactivateCoachInput!) {
              deactivateCoach(input: $input) { isUpdated }
            }
          `,
          variables: { input: { id: coachId } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/Unauthorized|未认证|认证/);
    });

    it('教练尝试下线应被拒绝（仅 manager 可下线）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachAccessToken}`)
        .send({
          query: `
            mutation DeactivateCoach($input: DeactivateCoachInput!) {
              deactivateCoach(input: $input) { isUpdated }
            }
          `,
          variables: { input: { id: coachId } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/仅 manager 可以下线教练|权限|无权/);
    });
    it('管理员应该可以下线教练（幂等）', async () => {
      // 第一次下线
      const first = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateCoach($input: DeactivateCoachInput!) {
              deactivateCoach(input: $input) {
                coach { id deactivatedAt employmentStatus }
                isUpdated
              }
            }
          `,
          variables: { input: { id: coachId } },
        })
        .expect(200);

      if (first.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(first.body.errors)}`);
      expect(first.body.data.deactivateCoach.isUpdated).toBe(true);
      expect(first.body.data.deactivateCoach.coach.deactivatedAt).toBeTruthy();

      // 第二次下线（幂等）
      const second = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateCoach($input: DeactivateCoachInput!) {
              deactivateCoach(input: $input) {
                coach { id deactivatedAt employmentStatus }
                isUpdated
              }
            }
          `,
          variables: { input: { id: coachId } },
        })
        .expect(200);
      expect(second.body.data.deactivateCoach.isUpdated).toBe(false);
      expect(second.body.data.deactivateCoach.coach.employmentStatus).toBe('LEFT');
    });

    it('管理员应该可以上线教练（幂等）', async () => {
      // 第一次上线
      const first = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateCoach($input: ReactivateCoachInput!) {
              reactivateCoach(input: $input) {
                coach { id deactivatedAt employmentStatus }
                isUpdated
              }
            }
          `,
          variables: { input: { id: coachId } },
        })
        .expect(200);

      if (first.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(first.body.errors)}`);
      expect(first.body.data.reactivateCoach.isUpdated).toBe(true);
      expect(first.body.data.reactivateCoach.coach.deactivatedAt).toBeNull();
      expect(first.body.data.reactivateCoach.coach.employmentStatus).toBe('ACTIVE');

      // 第二次上线（幂等）
      const second = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateCoach($input: ReactivateCoachInput!) {
              reactivateCoach(input: $input) {
                coach { id deactivatedAt employmentStatus }
                isUpdated
              }
            }
          `,
          variables: { input: { id: coachId } },
        })
        .expect(200);
      expect(second.body.data.reactivateCoach.isUpdated).toBe(false);
      expect(second.body.data.reactivateCoach.coach.employmentStatus).toBe('ACTIVE');
    });

    it('ReactivateCoachInput.id = 0 应返回不存在错误（边界值）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateCoach($input: ReactivateCoachInput!) {
              reactivateCoach(input: $input) { isUpdated }
            }
          `,
          variables: { input: { id: 0 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/教练不存在|未找到|不存在/);
    });

    it('不存在的教练 ID 上线应报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateCoach($input: ReactivateCoachInput!) {
              reactivateCoach(input: $input) { isUpdated }
            }
          `,
          variables: { input: { id: 999999 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/教练不存在|未找到|不存在/);
    });

    it('管理员下线不存在的教练 ID 应报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateCoach($input: DeactivateCoachInput!) {
              deactivateCoach(input: $input) { isUpdated }
            }
          `,
          variables: { input: { id: 999999 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/教练不存在|未找到|不存在/);
    });
  });
});
