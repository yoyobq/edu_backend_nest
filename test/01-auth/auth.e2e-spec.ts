// test/01-auth/auth.e2e-spec.ts
import { AccountService } from '@modules/account/account.service';
import { AccountEntity } from '@modules/account/entities/account.entity';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { AccountStatus, AudienceTypeEnum, LoginTypeEnum } from '@src/types/models/account.types';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';

// 在文件顶部添加 UserInfoEntity 的导入
import { Gender, UserState } from '@app-types/models/user-info.types';
import { UserInfoEntity } from '@modules/account/entities/user-info.entity';

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
      const accountRepository = dataSource.getRepository(AccountEntity);
      const userInfoRepository = dataSource.getRepository(UserInfoEntity);

      // 创建账户时需要对密码进行哈希处理
      const createdAccounts = await Promise.all(
        Object.values(testAccountsPlaintext).map(async (account) => {
          // 先保存账户以获取 createdAt，然后更新密码
          const savedAccount = await accountRepository.save({
            ...account,
            loginPassword: 'temp', // 临时密码
            recentLoginHistory: null,
            identityHint: null,
          });

          // 使用 AccountService 的标准方法对密码进行哈希
          const hashedPassword = AccountService.hashPasswordWithTimestamp(
            account.loginPassword,
            savedAccount.createdAt,
          );

          // 更新为哈希后的密码
          await accountRepository.update(savedAccount.id, {
            loginPassword: hashedPassword,
          });

          return savedAccount;
        }),
      );

      // 为每个账户创建对应的用户信息记录
      await Promise.all(
        createdAccounts.map(async (account) => {
          await userInfoRepository.save({
            accountId: account.id,
            nickname: `${account.loginName}_nickname`,
            gender: Gender.SECRET,
            birthDate: null,
            avatar: null,
            email: account.loginEmail,
            signature: null,
            accessGroup: ['guest'], // 默认访问组
            address: null,
            phone: null,
            tags: null,
            geographic: null,
            metaDigest: '',
            notifyCount: 0,
            unreadCount: 0,
            userState: UserState.ACTIVE,
          });
        }),
      );

      // 验证所有测试账户是否创建成功
      const createdAccountsCheck = await accountRepository.find({
        where: {
          loginName: In(Object.values(testAccountsPlaintext).map((acc) => acc.loginName)),
        },
      });

      if (createdAccountsCheck.length !== Object.keys(testAccountsPlaintext).length) {
        throw new Error(
          `测试账户创建不完整，期望 ${Object.keys(testAccountsPlaintext).length} 个，实际创建 ${createdAccountsCheck.length} 个`,
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
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              accessToken
              refreshToken
              accountId
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

    console.log('🚀 登录请求参数:', { loginName, loginPassword, type, audience, ip });
    // console.dir(response.body, { depth: null });
    console.log('📥 登录响应:', JSON.stringify(response.body, null, 2));
    return response;
  };

  describe('登录成功场景', () => {
    // 用户名登录成功测试
    it('应该支持用户名登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    // 邮箱登录成功测试
    it('应该支持邮箱登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginEmail,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    // 有效 audience 登录测试
    it('应该支持有效的 audience 登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'SSTSTEST',
      );

      const { data } = response.body;
      console.log(data);
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    // 用户 ID 验证测试
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
      expect(data?.login.accountId).toBe(account?.id.toString());
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
      expect(errors?.[0]?.message).toContain('账户未激活或已被禁用');
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
      expect(errors?.[0]?.message).toContain('账户未激活或已被禁用');
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
                accountId
              }
            }
          `,
        })
        .expect(400);

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('input');
    });

    // 修正第二个测试用例中的字段访问
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
      expect(data?.login.accountId).toBe(account?.id.toString());
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
