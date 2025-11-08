// test/06-identity-management/coach-management.e2e-spec.ts

import { AudienceTypeEnum, IdentityTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
      expect(msg).toMatch(/教练等级必须在 1-3 之间/);
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
  });
});
