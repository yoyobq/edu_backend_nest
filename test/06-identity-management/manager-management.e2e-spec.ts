// 文件路径：test/06-identity-management/manager-management.e2e-spec.ts
import {
  AudienceTypeEnum,
  IdentityTypeEnum,
  LoginTypeEnum,
  IdentityTypeEnum as RoleEnum,
} from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { AccountEntity } from '../../src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '../../src/modules/account/base/entities/user-info.entity';
import { AccountService } from '../../src/modules/account/base/services/account.service';
import { ManagerEntity } from '../../src/modules/account/identities/training/manager/account-manager.entity';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * Manager 管理 E2E 测试
 * 覆盖：列表查询（仅 manager 身份）、更新、下线、上线与幂等
 */
describe('Manager Management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let managerAccessToken: string;
  let customerAccessToken: string;
  let managerId: number;

  beforeAll(async () => {
    // 初始化 GraphQL Schema（适配器层）
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // 清理并创建测试账号：manager 与 customer
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource });

    // 登录并记录 access token
    managerAccessToken = await loginAndGetToken(
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );

    customerAccessToken = await loginAndGetToken(
      testAccountsConfig.customer.loginName,
      testAccountsConfig.customer.loginPassword,
    );

    // 查询当前登录 manager 的身份 ID
    managerId = await getMyManagerId(app, managerAccessToken);
  }, 60000);

  afterAll(async () => {
    await cleanupTestAccounts(dataSource);
    if (app) await app.close();
  });

  /**
   * 创建一个临时 Manager 账户并登录
   * 用于测试跨人编辑、禁止下线他人与允许为他人上线等权限场景
   * @returns { accountId, managerId, accessToken, loginName }
   */
  const createAdhocManagerAndLogin = async (): Promise<{
    accountId: number;
    managerId: number;
    accessToken: string;
    loginName: string;
  }> => {
    const repoAccount = dataSource.getRepository(AccountEntity);
    const repoUserInfo = dataSource.getRepository(UserInfoEntity);
    const repoManager = dataSource.getRepository(ManagerEntity);

    const loginName = `testmanager_${Date.now()}`;
    const loginEmail = `${loginName}@example.com`;
    const loginPassword = 'TestManager@2025';

    const temp = await repoAccount.save(
      repoAccount.create({
        loginName,
        loginEmail,
        loginPassword: 'temp',
        status: testAccountsConfig.manager.status,
        identityHint: RoleEnum.MANAGER,
      }),
    );

    const hashed = AccountService.hashPasswordWithTimestamp(loginPassword, temp.createdAt);
    await repoAccount.update(temp.id, { loginPassword: hashed });

    const newUserInfo = repoUserInfo.create({
      accountId: temp.id,
      nickname: `${loginName}_nickname`,
      gender: Gender.SECRET,
      birthDate: null,
      avatarUrl: null,
      email: loginEmail,
      signature: null,
      accessGroup: [RoleEnum.MANAGER],
      address: null,
      phone: null,
      tags: null,
      geographic: null,
      metaDigest: [RoleEnum.MANAGER],
      notifyCount: 0,
      unreadCount: 0,
      userState: UserState.ACTIVE,
    });
    await repoUserInfo.save(newUserInfo);

    const manager = await repoManager.save(
      repoManager.create({
        accountId: temp.id,
        name: `${loginName}_manager_name`,
        deactivatedAt: null,
        remark: `临时 manager 身份记录 - ${loginName}`,
        createdBy: null,
        updatedBy: null,
      }),
    );

    const token = await loginAndGetToken(loginName, loginPassword);
    return { accountId: temp.id, managerId: manager.id, accessToken: token, loginName };
  };

  /**
   * 登录获取 access token
   * @param loginName 登录名
   * @param loginPassword 登录密码
   * @returns access token
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
   * 读取当前用户的 manager 身份 ID
   * @param nestApp Nest 应用实例
   * @param token 访问令牌
   * @returns managerId
   */
  const getMyManagerId = async (nestApp: INestApplication, token: string): Promise<number> => {
    const resp = await request(nestApp.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              role
              identity {
                ... on ManagerType { id }
              }
            }
          }
        `,
        variables: {
          input: {
            loginName: testAccountsConfig.manager.loginName,
            loginPassword: testAccountsConfig.manager.loginPassword,
            type: LoginTypeEnum.PASSWORD,
            audience: AudienceTypeEnum.DESKTOP,
          },
        },
      })
      .expect(200);
    if (resp.body.errors) throw new Error(`读取经理身份失败: ${JSON.stringify(resp.body.errors)}`);
    if (resp.body.data.login.role !== IdentityTypeEnum.MANAGER)
      throw new Error('当前角色不是 Manager');
    return resp.body.data.login.identity.id as number;
  };

  /**
   * 列表查询：仅 manager 身份可访问；支持排序与 includeDeleted
   */
  describe('查询经理列表（managers）', () => {
    it('未认证访问 managers 应被拒绝', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            query ListManagers($input: ListManagersInput!) {
              managers(input: $input) { data { id name } pagination { total page limit totalPages } }
            }
          `,
          variables: { input: { page: 1, limit: 10 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/Unauthorized|未认证|认证/);
    });

    it('非 manager 身份访问 managers 应返回权限错误（使用 customer token）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            query ListManagers($input: ListManagersInput!) {
              managers(input: $input) { data { id name } pagination { total page limit totalPages } }
            }
          `,
          variables: { input: { page: 1, limit: 10 } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/仅 manager 可查看 Manager 列表|ACCESS_DENIED|权限|无权/);
    });

    it('manager 身份可以分页查询经理列表，包含分页信息', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListManagers($input: ListManagersInput!) {
              managers(input: $input) {
                managers { id name accountId remark employmentStatus deactivatedAt }
                data { id name accountId remark employmentStatus deactivatedAt }
                pagination { total page limit totalPages }
              }
            }
          `,
          variables: { input: { page: 1, limit: 10, sortBy: 'CREATED_AT', sortOrder: 'DESC' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const out = response.body.data.managers;
      expect(out).toBeDefined();
      expect(out.pagination).toBeDefined();
      expect(typeof out.pagination.total).toBe('number');
      expect(out.pagination.page).toBe(1);
      expect(out.pagination.limit).toBe(10);
      expect(Array.isArray(out.data)).toBe(true);
      // 兼容字段 data 与标准字段 managers 一致性校验
      expect(Array.isArray(out.managers)).toBe(true);
      expect(out.managers.length).toBe(out.data.length);
      if (out.managers.length > 0) {
        expect(out.managers[0].id).toBe(out.data[0].id);
        expect(out.managers[0].name).toBe(out.data[0].name);
      }
      // 至少应包含当前测试预置的 manager 账户
      const hasManager = out.data.some((m: any) => m.id === managerId);
      expect(hasManager).toBe(true);
    });

    // 参数行为：page < 1 将被规范化为 1（不抛错）
    it('ListManagersInput 参数规范化：page=0 应返回 page=1', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListManagers($input: ListManagersInput!) {
              managers(input: $input) { data { id } pagination { total page limit totalPages } }
            }
          `,
          variables: { input: { page: 0, limit: 10 } },
        })
        .expect(200);
      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      const out = response.body.data.managers;
      expect(out).toBeDefined();
      // 断言规范化结果：page=0 被规范化为 1
      expect(out.pagination.page).toBe(1);
      expect(out.pagination.limit).toBe(10);
    });

    it('manager 查询支持按 name 升序排序', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListManagers($input: ListManagersInput!) {
              managers(input: $input) { data { id name } pagination { total page limit totalPages } }
            }
          `,
          variables: { input: { page: 1, limit: 10, sortBy: 'NAME', sortOrder: 'ASC' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const items: Array<{
        id: number;
        name: string;
      }> = response.body.data.managers.data;
      const names = items.map((i) => i.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names.join('|')).toBe(sorted.join('|'));
    });

    it('manager 查询 includeDeleted=true 可返回停用项', async () => {
      // 先下线自己，确保列表包含停用项
      const deactivateResp = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateManager($input: DeactivateManagerInput!) {
              deactivateManager(input: $input) { manager { id deactivatedAt } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      if (deactivateResp.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(deactivateResp.body.errors)}`);
      expect(deactivateResp.body.data.deactivateManager.manager.deactivatedAt).toBeTruthy();

      // 查询包含停用项
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            query ListManagers($input: ListManagersInput!) {
              managers(input: $input) {
                data { id deactivatedAt }
                pagination { total page limit totalPages hasNext hasPrev }
              }
            }
          `,
          variables: { input: { page: 1, limit: 10, includeDeleted: true } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const list = response.body.data.managers.data as Array<{
        id: number;
        deactivatedAt: string | null;
      }>;
      const me = list.find((m) => m.id === managerId);
      expect(me).toBeDefined();
      expect(me!.deactivatedAt).toBeTruthy();

      // 分页字段补充断言：第一页无上一页，hasPrev=false；hasNext 为布尔值
      const pg = response.body.data.managers.pagination;
      expect(typeof pg.hasNext).toBe('boolean');
      expect(typeof pg.hasPrev).toBe('boolean');
      expect(pg.page).toBe(1);
      expect(pg.hasPrev).toBe(false);

      // 恢复上线，避免影响后续测试
      const reactivateResp = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateManager($input: ReactivateManagerInput!) {
              reactivateManager(input: $input) { manager { id deactivatedAt } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      if (reactivateResp.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(reactivateResp.body.errors)}`);
      expect(reactivateResp.body.data.reactivateManager.manager.deactivatedAt).toBeNull();
    });
  });

  describe('更新经理信息', () => {
    it('未认证访问 updateManager 应被拒绝', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation UpdateManager($input: UpdateManagerInput!) {
              updateManager(input: $input) { manager { id name remark employmentStatus deactivatedAt } }
            }
          `,
          variables: { input: { name: '未认证更新' } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/Unauthorized|未认证|认证/);
    });

    it('manager 身份可以更新自己的 name 与 remark', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateManager($input: UpdateManagerInput!) {
              updateManager(input: $input) { manager { id name remark employmentStatus deactivatedAt } }
            }
          `,
          variables: { input: { name: '经理测试姓名', remark: 'E2E 更新备注' } },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const mgr = response.body.data.updateManager.manager;
      expect(mgr.id).toBe(managerId);
      expect(mgr.name).toBe('经理测试姓名');
      expect(mgr.remark).toBe('E2E 更新备注');
      // employmentStatus 应根据 deactivatedAt 映射
      expect(['ACTIVE', 'LEFT']).toContain(mgr.employmentStatus);
    });

    it('非 manager 身份访问 updateManager 应返回权限错误（使用 customer token）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation UpdateManager($input: UpdateManagerInput!) {
              updateManager(input: $input) { manager { id name } }
            }
          `,
          variables: { input: { name: '越权更新' } },
        })
        .expect(200);
      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/仅 manager 可编辑资料|ACCESS_DENIED|权限/);
    });

    it('manager 可以编辑其他 manager 的资料（提供 managerId）', async () => {
      const other = await createAdhocManagerAndLogin();

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateManager($input: UpdateManagerInput!) {
              updateManager(input: $input) { manager { id name remark } }
            }
          `,
          variables: {
            input: { managerId: other.managerId, name: '他人更新姓名', remark: '跨人编辑' },
          },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const mgr: { id: number; name: string; remark: string | null } =
        response.body.data.updateManager.manager;
      expect(mgr.id).toBe(other.managerId);
      expect(mgr.name).toBe('他人更新姓名');
      expect(mgr.remark).toBe('跨人编辑');
    });
  });

  describe('下线与上线经理', () => {
    it('未认证访问 deactivate/reactivate 应被拒绝', async () => {
      const deactivate = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation DeactivateManager($input: DeactivateManagerInput!) {
              deactivateManager(input: $input) { manager { id } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      expect(deactivate.body.errors).toBeDefined();

      const reactivate = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation ReactivateManager($input: ReactivateManagerInput!) {
              reactivateManager(input: $input) { manager { id } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      expect(reactivate.body.errors).toBeDefined();
    });

    it('manager 下线自己后 isUpdated=true，再次下线幂等 isUpdated=false', async () => {
      // 首次下线
      const resp1 = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateManager($input: DeactivateManagerInput!) {
              deactivateManager(input: $input) { manager { id deactivatedAt } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      if (resp1.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(resp1.body.errors)}`);
      expect(resp1.body.data.deactivateManager.isUpdated).toBe(true);
      expect(resp1.body.data.deactivateManager.manager.deactivatedAt).toBeTruthy();

      // 再次下线（幂等）
      const resp2 = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateManager($input: DeactivateManagerInput!) {
              deactivateManager(input: $input) { manager { id deactivatedAt } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      if (resp2.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(resp2.body.errors)}`);
      expect(resp2.body.data.deactivateManager.isUpdated).toBe(false);

      // 上线：恢复 active
      const resp3 = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateManager($input: ReactivateManagerInput!) {
              reactivateManager(input: $input) { manager { id deactivatedAt } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      if (resp3.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(resp3.body.errors)}`);
      expect(resp3.body.data.reactivateManager.manager.deactivatedAt).toBeNull();
      expect(resp3.body.data.reactivateManager.isUpdated).toBe(true);

      // 再次上线（幂等）
      const resp4 = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateManager($input: ReactivateManagerInput!) {
              reactivateManager(input: $input) { manager { id deactivatedAt } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      if (resp4.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(resp4.body.errors)}`);
      expect(resp4.body.data.reactivateManager.isUpdated).toBe(false);
    });

    it('非 manager 身份无法下线或上线（使用 customer token）', async () => {
      const deactivate = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation DeactivateManager($input: DeactivateManagerInput!) {
              deactivateManager(input: $input) { manager { id } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      expect(deactivate.body.errors).toBeDefined();
      expect(deactivate.body.errors?.[0]?.message ?? '').toMatch(
        /仅 manager 可以下线|权限|ACCESS_DENIED/,
      );

      const reactivate = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation ReactivateManager($input: ReactivateManagerInput!) {
              reactivateManager(input: $input) { manager { id } isUpdated }
            }
          `,
          variables: { input: { id: managerId } },
        })
        .expect(200);
      expect(reactivate.body.errors).toBeDefined();
      expect(reactivate.body.errors?.[0]?.message ?? '').toMatch(
        /仅 manager 可以上线|权限|ACCESS_DENIED/,
      );
    });

    it('manager 不能下线其他 manager，应返回权限错误', async () => {
      const other = await createAdhocManagerAndLogin();

      const resp = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateManager($input: DeactivateManagerInput!) {
              deactivateManager(input: $input) { manager { id } isUpdated }
            }
          `,
          variables: { input: { id: other.managerId } },
        })
        .expect(200);
      expect(resp.body.errors).toBeDefined();
      const msg = resp.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/不能随意下线其他 manager|ACCESS_DENIED|权限/);
    });

    it('manager 可以为其他 manager 上线（他人当前为停用状态）', async () => {
      const other = await createAdhocManagerAndLogin();

      // 先将对方设为停用状态（直接写实体，避免干扰当前用户状态）
      await dataSource.getRepository(ManagerEntity).update(other.managerId, {
        deactivatedAt: new Date(),
      });

      const resp = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateManager($input: ReactivateManagerInput!) {
              reactivateManager(input: $input) { manager { id deactivatedAt } isUpdated }
            }
          `,
          variables: { input: { id: other.managerId } },
        })
        .expect(200);

      if (resp.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(resp.body.errors)}`);
      expect(resp.body.data.reactivateManager.manager.id).toBe(other.managerId);
      expect(resp.body.data.reactivateManager.manager.deactivatedAt).toBeNull();
      expect(resp.body.data.reactivateManager.isUpdated).toBe(true);
    });
  });
});
