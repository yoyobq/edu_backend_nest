// test/01-auth/auth.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { PasswordPbkdf2Helper } from '../../src/core/common/password/password.pbkdf2.helper';
import { AccountEntity } from '../../src/modules/account/entities/account.entity';
import {
  AccountStatus,
  AudienceTypeEnum,
  LoginTypeEnum,
} from '../../src/types/models/account.types';

/**
 * Auth 模块 E2E 测试
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  // 测试账户数据（明文密码，用于登录测试）
  const testAccountsPlaintext = {
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
    // if (!global.testDataSource) {
    //   throw new Error('全局测试数据源未初始化。请检查 global-setup-e2e.ts 是否正确配置。');
    // }

    // if (!global.testDataSource.isInitialized) {
    //   throw new Error('全局测试数据源未初始化完成。请检查 global-setup-e2e.ts 中的初始化逻辑。');
    // }
    // console.log('💡测试账号存在？', testAccounts !== null);
    // 直接使用全局数据源
    // dataSource = global.testDataSource;

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
      const loginNames = Object.values(testAccountsPlaintext).map((account) => account.loginName);

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

      // 创建账户时需要对密码进行哈希处理
      await Promise.all(
        Object.values(testAccountsPlaintext).map(async (account) => {
          // 先保存账户以获取 createdAt，然后更新密码
          const savedAccount = await repository.save({
            ...account,
            loginPassword: 'temp', // 临时密码
            recentLoginHistory: null,
            identityHint: null,
          });

          // 使用 createdAt 作为 salt 对密码进行哈希
          const salt = savedAccount.createdAt.toString();
          const hashedPassword = PasswordPbkdf2Helper.hashPasswordWithCrypto(
            account.loginPassword,
            salt,
          );

          // 更新为哈希后的密码
          await repository.update(savedAccount.id, {
            loginPassword: hashedPassword,
          });

          return savedAccount;
        }),
      );

      // 验证所有测试账户是否创建成功
      const createdAccounts = await repository.find({
        where: {
          loginName: In(Object.values(testAccountsPlaintext).map((acc) => acc.loginName)),
        },
      });

      if (createdAccounts.length !== Object.keys(testAccountsPlaintext).length) {
        throw new Error(
          `测试账户创建不完整，期望 ${Object.keys(testAccountsPlaintext).length} 个，实际创建 ${createdAccounts.length} 个`,
        );
      }
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
    audience: keyof typeof AudienceTypeEnum = 'DESKTOP', // 改为接受枚举键名
    ip?: string,
  ) => {
    console.log('🚀 登录请求参数:', { loginName, loginPassword, type, audience, ip });

    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              accessToken
              refreshToken
              userId
            }
          }
        `,
        variables: {
          input: {
            loginName,
            loginPassword,
            type,
            audience, // 直接传入枚举键名
            ip,
          },
        },
      })
      .expect(200);

    console.dir(response.body, { depth: null });
    console.log('📥 登录响应:', JSON.stringify(response.body, null, 2));
    return response;
  };

  describe('登录成功场景', () => {
    /**
     * 测试用户名登录成功
     */
    it('应该支持用户名登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.userId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    /**
     * 测试邮箱登录成功
     */
    it('应该支持邮箱登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginEmail,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.userId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    /**
     * 测试有效的 audience
     */
    it('应该支持有效的 audience 登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'SSTSTEST', // 使用测试环境配置中的有效 audience
      );

      const { data } = response.body;
      console.log(data);
      expect(data?.login.userId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    /**
     * 测试无效的 audience
     */
    it('应该拒绝无效的 audience', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'invalid-audience' as never, // 使用无效的 audience
      );

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain(
        'Value "invalid-audience" does not exist in "AudienceTypeEnum" enum.',
      );
    });
  });

  describe('账户状态相关场景', () => {
    /**
     * 测试账户不存在
     */
    it('应该正确处理账户不存在的情况', async () => {
      const response = await performLogin('nonexistent', 'password123');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户不存在');
    });

    /**
     * 测试账户被禁用
     */
    it('应该正确处理账户被禁用的情况', async () => {
      const response = await performLogin(
        testAccountsPlaintext.bannedUser.loginName,
        testAccountsPlaintext.bannedUser.loginPassword,
      );

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户已被禁用');
    });

    /**
     * 测试账户状态为待激活
     */
    it('应该正确处理待激活账户的情况', async () => {
      const response = await performLogin(
        testAccountsPlaintext.pendingUser.loginName,
        testAccountsPlaintext.pendingUser.loginPassword,
      );

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户已被禁用');
    });
  });

  describe('密码验证场景', () => {
    /**
     * 测试密码错误
     */
    it('应该正确处理密码错误的情况', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        'wrongpassword',
      );

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('密码错误');
    });

    /**
     * 测试空密码
     */
    it('应该正确处理空密码的情况', async () => {
      const response = await performLogin(testAccountsPlaintext.activeUser.loginName, '');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('密码错误');
    });
  });

  describe('输入参数验证', () => {
    /**
     * 测试空用户名
     */
    it('应该正确处理空用户名的情况', async () => {
      const response = await performLogin('', 'password123');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户不存在');
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
                accessToken
                refreshToken
                userId
              }
            }
          `,
        })
        .expect(400);

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('input');
    });
  });

  describe('业务逻辑验证', () => {
    /**
     * 测试登录成功后返回正确的用户 ID
     */
    it('登录成功后应该返回正确的用户 ID', async () => {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const account = await accountRepository.findOne({
        where: { loginName: testAccountsPlaintext.activeUser.loginName },
      });

      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.userId).toBe(account?.id.toString());
    });

    /**
     * 测试 JWT Token 格式
     */
    it('登录成功后应该返回有效的 JWT Token', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      const accessToken = data?.login.accessToken;
      const refreshToken = data?.login.refreshToken;

      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(typeof refreshToken).toBe('string');
      // 简单验证 JWT 格式（三个部分用 . 分隔）
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);
    });
  });
});
