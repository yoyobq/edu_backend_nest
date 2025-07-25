// test/auth/auth.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AccountEntity } from '../../src/modules/account/entities/account.entity';
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
    if (!global.testDataSource) {
      throw new Error('全局测试数据源未初始化。请检查 global-setup-e2e.ts 是否正确配置。');
    }

    if (!global.testDataSource.isInitialized) {
      throw new Error('全局测试数据源未初始化完成。请检查 global-setup-e2e.ts 中的初始化逻辑。');
    }

    // 直接使用全局数据源
    dataSource = global.testDataSource;

    // 创建一个不包含 TypeORM 配置的测试模块，避免创建新的 DataSource
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
    // 清理并创建测试数据
    await cleanupTestData();
    await createTestAccounts();
  });

  /**
   * 清理测试数据
   */
  const cleanupTestData = async (): Promise<void> => {
    try {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const loginNames = Object.values(testAccounts).map((account) => account.loginName);

      if (loginNames.length > 0) {
        await accountRepository.delete({
          loginName: In(loginNames),
        });
      }
    } catch (error) {
      console.warn('清理测试数据失败:', error);
    }
  };

  /**
   * 创建测试账户数据
   */
  const createTestAccounts = async (): Promise<void> => {
    try {
      const repository = dataSource.getRepository(AccountEntity);

      // 批量创建测试账户
      const accounts = Object.values(testAccounts).map((account) => ({
        ...account,
        recentLoginHistory: null,
        identityHint: null,
      }));

      // 只在首次创建时输出日志，或者完全移除
      // console.log('🔍 准备创建的测试账户:', accounts);
      // const savedAccounts =
      await repository.save(accounts);
      // console.log('✅ 成功创建的测试账户:', savedAccounts);

      // 简化验证逻辑，只检查是否创建成功，不输出详细信息
      const verifyAccount = await repository.findOne({
        where: { loginName: testAccounts.activeUser.loginName },
      });

      if (!verifyAccount) {
        throw new Error('测试账户创建失败');
      }
      // console.log('🔍 验证保存的账户数据:', verifyAccount);
    } catch (error) {
      console.error('❌ 创建测试账户失败:', error);
      throw error;
    }
  };

  /**
   * 执行 GraphQL 登录请求
   */
  const performLogin = async (
    loginName: string,
    loginPassword: string,
    type = LoginTypeEnum.PASSWORD,
  ) => {
    console.log('🚀 登录请求参数:', { loginName, loginPassword, type });

    const response = await request(app.getHttpServer())
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

    console.log('📥 登录响应:', JSON.stringify(response.body, null, 2));
    return response;
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

      const { data } = response.body;
      expect(data?.login.success).toBe(true);
      expect(data?.login.userId).toBeDefined();
      expect(data?.login.token).toBeDefined();
      expect(data?.login.errorMessage).toBeUndefined();
    });

    /**
     * 测试邮箱登录成功
     */
    it('应该支持邮箱登录成功', async () => {
      const response = await performLogin(
        testAccounts.activeUser.loginEmail,
        testAccounts.activeUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.success).toBe(true);
      expect(data?.login.userId).toBeDefined();
      expect(data?.login.token).toBeDefined();
      expect(data?.login.errorMessage).toBeUndefined();
    });
  });

  describe('账户状态相关场景', () => {
    /**
     * 测试账户不存在
     */
    it('应该正确处理账户不存在的情况', async () => {
      const response = await performLogin('nonexistent', 'password123');

      const { data } = response.body;
      expect(data?.login.success).toBe(false);
      expect(data?.login.errorMessage).toBe('账户不存在');
    });

    /**
     * 测试账户被禁用
     */
    it('应该正确处理账户被禁用的情况', async () => {
      const response = await performLogin(
        testAccounts.bannedUser.loginName,
        testAccounts.bannedUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.success).toBe(false);
      expect(data?.login.errorMessage).toBe('账户已被禁用');
    });

    /**
     * 测试账户状态为待激活
     */
    it('应该正确处理待激活账户的情况', async () => {
      const response = await performLogin(
        testAccounts.pendingUser.loginName,
        testAccounts.pendingUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.success).toBe(false);
      expect(data?.login.errorMessage).toBe('账户已被禁用');
    });
  });

  describe('密码验证场景', () => {
    /**
     * 测试密码错误
     */
    it('应该正确处理密码错误的情况', async () => {
      const response = await performLogin(testAccounts.activeUser.loginName, 'wrongpassword');

      const { data } = response.body;
      expect(data?.login.success).toBe(false);
      expect(data?.login.errorMessage).toBe('密码错误');
    });

    /**
     * 测试空密码
     */
    it('应该正确处理空密码的情况', async () => {
      const response = await performLogin(testAccounts.activeUser.loginName, '');

      const { data } = response.body;
      expect(data?.login.success).toBe(false);
      expect(data?.login.errorMessage).toBe('密码错误');
    });
  });

  describe('输入参数验证', () => {
    /**
     * 测试空用户名
     */
    it('应该正确处理空用户名的情况', async () => {
      const response = await performLogin('', 'password123');

      const { data } = response.body;
      expect(data?.login.success).toBe(false);
      expect(data?.login.errorMessage).toBe('账户不存在');
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

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('loginName');
    });
  });

  describe('业务逻辑验证', () => {
    /**
     * 测试登录成功后返回正确的用户 ID
     */
    it('登录成功后应该返回正确的用户 ID', async () => {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const account = await accountRepository.findOne({
        where: { loginName: testAccounts.activeUser.loginName },
      });

      const response = await performLogin(
        testAccounts.activeUser.loginName,
        testAccounts.activeUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.userId).toBe(account?.id);
    });

    /**
     * 测试 JWT Token 格式
     */
    it('登录成功后应该返回有效的 JWT Token', async () => {
      const response = await performLogin(
        testAccounts.activeUser.loginName,
        testAccounts.activeUser.loginPassword,
      );

      const { data } = response.body;
      const token = data?.login.token;

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // 简单验证 JWT 格式（三个部分用 . 分隔）
      expect(token.split('.')).toHaveLength(3);
    });
  });
});
