// test/auth/auth.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AccountEntity } from '../../src/modules/account/entities/account.entity';
import { GraphQLErrorResponse, GraphQLSchemaResponse } from '../../src/types/graphql.types';
import { AccountStatus, LoginTypeEnum } from '../../src/types/models/account.types';

/**
 * Auth 模块 E2E 测试
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  // 测试账户数据
  const testAccounts = {
    activeUser: {
      loginName: 'testuser',
      loginEmail: 'test@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
    },
    bannedUser: {
      loginName: 'banneduser',
      loginEmail: 'banned@example.com',
      loginPassword: 'password123',
      status: AccountStatus.BANNED,
    },
    pendingUser: {
      loginName: 'pendinguser',
      loginEmail: 'pending@example.com',
      loginPassword: 'password123',
      status: AccountStatus.PENDING,
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // 每个测试前清理数据库并创建测试数据
    if (dataSource && dataSource.isInitialized) {
      await dataSource.synchronize(true);
      await createTestAccounts();
    }
  });

  /**
   * 创建测试账户数据
   */
  const createTestAccounts = async (): Promise<void> => {
    const accountRepository = dataSource.getRepository(AccountEntity);

    // 创建活跃用户
    await accountRepository.save({
      ...testAccounts.activeUser,
      recentLoginHistory: null,
      identityHint: null,
    });

    // 创建被禁用用户
    await accountRepository.save({
      ...testAccounts.bannedUser,
      recentLoginHistory: null,
      identityHint: null,
    });

    // 创建待激活用户
    await accountRepository.save({
      ...testAccounts.pendingUser,
      recentLoginHistory: null,
      identityHint: null,
    });
  };

  /**
   * 执行 GraphQL 登录请求
   */
  const performLogin = async (
    loginName: string,
    loginPassword: string,
    type = LoginTypeEnum.PASSWORD,
  ) => {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation Login($loginName: String!, $loginPassword: String!, $type: String) {
            login(loginName: $loginName, loginPassword: $loginPassword, type: $type) {
              success
              errorMessage
              token
              userId
            }
          }
        `,
        variables: {
          loginName,
          loginPassword,
          type,
        },
      })
      .expect(200);
  };

  describe('登录成功场景', () => {
    /**
     * 测试用户名登录成功
     */
    it('应该支持用户名登录成功', async () => {
      const response = await performLogin(
        testAccounts.activeUser.loginName,
        testAccounts.activeUser.loginPassword,
      );

      const body = response.body;
      expect(body.data?.login.success).toBe(true);
      expect(body.data?.login.userId).toBeDefined();
      expect(body.data?.login.errorMessage).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });

    /**
     * 测试邮箱登录成功
     */
    it('应该支持邮箱登录成功', async () => {
      const response = await performLogin(
        testAccounts.activeUser.loginEmail,
        testAccounts.activeUser.loginPassword,
      );

      const body = response.body;
      expect(body.data?.login.success).toBe(true);
      expect(body.data?.login.userId).toBeDefined();
      expect(body.data?.login.errorMessage).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });
  });

  describe('账户相关错误场景', () => {
    /**
     * 测试账户不存在
     */
    it('应该正确处理账户不存在的情况', async () => {
      const response = await performLogin('nonexistent', 'password123');

      const body = response.body;
      expect(body.data?.login.success).toBe(false);
      expect(body.data?.login.errorMessage).toBe('账户不存在');
      expect(body.data?.login.userId).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });

    /**
     * 测试账户被禁用
     */
    it('应该正确处理账户被禁用的情况', async () => {
      const response = await performLogin(
        testAccounts.bannedUser.loginName,
        testAccounts.bannedUser.loginPassword,
      );

      const body = response.body;
      expect(body.data?.login.success).toBe(false);
      expect(body.data?.login.errorMessage).toBe('账户已被禁用');
      expect(body.data?.login.userId).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });

    /**
     * 测试账户状态为待激活
     */
    it('应该正确处理待激活账户的情况', async () => {
      const response = await performLogin(
        testAccounts.pendingUser.loginName,
        testAccounts.pendingUser.loginPassword,
      );

      const body = response.body;
      expect(body.data?.login.success).toBe(false);
      expect(body.data?.login.errorMessage).toBe('账户已被禁用');
      expect(body.data?.login.userId).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });
  });

  describe('密码相关错误场景', () => {
    /**
     * 测试密码错误
     */
    it('应该正确处理密码错误的情况', async () => {
      const response = await performLogin(testAccounts.activeUser.loginName, 'wrongpassword');

      const body = response.body;
      expect(body.data?.login.success).toBe(false);
      expect(body.data?.login.errorMessage).toBe('密码错误');
      expect(body.data?.login.userId).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });

    /**
     * 测试空密码
     */
    it('应该正确处理空密码的情况', async () => {
      const response = await performLogin(testAccounts.activeUser.loginName, '');

      const body = response.body;
      expect(body.data?.login.success).toBe(false);
      expect(body.data?.login.errorMessage).toBe('密码错误');
      expect(body.data?.login.userId).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });
  });

  describe('输入参数验证', () => {
    /**
     * 测试空用户名
     */
    it('应该正确处理空用户名的情况', async () => {
      const response = await performLogin('', 'password123');

      const body = response.body;
      expect(body.data?.login.success).toBe(false);
      expect(body.data?.login.errorMessage).toBe('账户不存在');
      expect(body.data?.login.userId).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });

    /**
     * 测试特殊字符用户名
     */
    it('应该正确处理特殊字符用户名的情况', async () => {
      const response = await performLogin('user@#$%', 'password123');

      const body = response.body;
      expect(body.data?.login.success).toBe(false);
      expect(body.data?.login.errorMessage).toBe('账户不存在');
      expect(body.data?.login.userId).toBeUndefined();
      expect(body.errors).toBeUndefined();
    });

    /**
     * 测试 GraphQL 参数验证
     */
    it('应该正确验证必需参数', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation Login {
              login {
                success
                errorMessage
              }
            }
          `,
        })
        .expect(400);

      const body = response.body as GraphQLErrorResponse;
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.message).toContain('loginName');
    });
  });

  describe('数据库集成测试', () => {
    /**
     * 测试数据库连接和查询
     */
    it('应该能够正确查询数据库中的账户', async () => {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const account = await accountRepository.findOne({
        where: { loginName: testAccounts.activeUser.loginName },
      });

      expect(account).toBeDefined();
      expect(account?.loginName).toBe(testAccounts.activeUser.loginName);
      expect(account?.status).toBe(AccountStatus.ACTIVE);
    });

    /**
     * 测试登录后数据库状态
     */
    it('登录成功后应该能够获取正确的用户 ID', async () => {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const account = await accountRepository.findOne({
        where: { loginName: testAccounts.activeUser.loginName },
      });

      const response = await performLogin(
        testAccounts.activeUser.loginName,
        testAccounts.activeUser.loginPassword,
      );

      const body = response.body;
      expect(body.data?.login.userId).toBe(account?.id);
    });
  });

  describe('GraphQL 接口测试', () => {
    /**
     * 测试 login mutation 功能
     */
    it('应该正确处理 login mutation', async () => {
      // 直接测试业务逻辑，而不是 schema 结构
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              login(loginName: "nonexistent", loginPassword: "test") {
                success
                errorMessage
              }
            }
          `,
        })
        .expect(200);

      const body = response.body;
      // 测试返回的数据结构和业务逻辑
      expect(body.data?.login).toBeDefined();
      expect(body.data?.login.success).toBe(false);
      expect(body.data?.login.errorMessage).toBe('账户不存在');
    });

    /**
     * 测试 login mutation 可用性
     */
    it('应该支持 login mutation', async () => {
      // 直接测试 login mutation 而不是 introspection
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              login(loginName: "test", loginPassword: "test") {
                success
                errorMessage
              }
            }
          `,
        })
        .expect(200);

      const body = response.body;

      // 不关心登录是否成功，只要 mutation 存在且返回了预期的字段结构
      expect(body.data?.login).toBeDefined();
      expect(body.data?.login).toHaveProperty('success');
      expect(body.data?.login).toHaveProperty('errorMessage');
    });

    /**
     * 测试 GraphQL schema 可用性
     */
    it('应该支持 login mutation', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            query {
              __schema {
                mutationType {
                  fields {
                    name
                    description
                  }
                }
              }
            }
          `,
        });

      // 如果 introspection 被禁用或有其他问题，处理错误情况
      if (response.status === 400) {
        const body = response.body as GraphQLErrorResponse;

        console.log('Schema query failed:', body.errors);

        // 如果是 introspection 被禁用的错误，跳过此测试
        if (body.errors?.[0]?.message?.includes('introspection')) {
          pending('Introspection is disabled');
          return;
        }

        // 其他错误则失败
        fail(`Schema query failed: ${body.errors?.[0]?.message}`);
      }

      expect(response.status).toBe(200);
      const body = response.body as GraphQLSchemaResponse;

      expect(body.data).toBeDefined();
      const mutations = body.data!.__schema.mutationType.fields;

      const loginMutation = mutations.find((field: { name: string }) => field.name === 'login');

      expect(loginMutation).toBeDefined();
      expect(loginMutation?.description).toBe('用户登录');
    });

    /**
     * 测试 GraphQL 错误处理
     */
    it('应该正确处理 GraphQL 语法错误', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: 'invalid graphql syntax',
        })
        .expect(400);

      const body = response.body as GraphQLErrorResponse;
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.message).toContain('Syntax Error');
    });
  });
});
