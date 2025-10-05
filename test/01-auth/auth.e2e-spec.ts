// test/01-auth/auth.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { AccountStatus, IdentityTypeEnum, LoginTypeEnum } from '@src/types/models/account.types';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';

import { Gender, UserState } from '@app-types/models/user-info.types';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * Auth 模块基础 E2E 测试
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 使用统一的测试账号配置
  const { guest: activeUser } = testAccountsConfig;

  // 额外的测试账号（仅用于特殊状态测试）
  const bannedUser = {
    loginName: 'banneduser',
    loginEmail: 'banned@example.com',
    loginPassword: 'testBanned@2024',
    status: AccountStatus.BANNED,
    accessGroup: [IdentityTypeEnum.REGISTRANT],
    identityType: IdentityTypeEnum.REGISTRANT,
  };

  const pendingUser = {
    loginName: 'pendinguser',
    loginEmail: 'pending@example.com',
    loginPassword: 'testPending@2024',
    status: AccountStatus.PENDING,
    accessGroup: [IdentityTypeEnum.REGISTRANT],
    identityType: IdentityTypeEnum.REGISTRANT,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await cleanupTestData();
    await createTestAccounts();
  });

  /**
   * 清理测试数据
   */
  const cleanupTestData = async (): Promise<void> => {
    try {
      // 清理统一测试账号
      await cleanupTestAccounts(dataSource);

      // 清理额外的特殊状态测试账号
      const accountRepository = dataSource.getRepository(AccountEntity);
      const specialAccounts = [bannedUser, pendingUser];
      const loginNames = specialAccounts.map((account) => account.loginName);

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
      // 创建统一测试账号
      await seedTestAccounts({
        dataSource,
        createAccountUsecase,
        includeKeys: ['guest'], // 只创建 guest 账号作为 activeUser
      });

      // 创建额外的特殊状态测试账号
      const specialAccounts = [bannedUser, pendingUser];
      await Promise.all(
        specialAccounts.map(async (account) => {
          await createAccountUsecase.execute({
            accountData: {
              loginName: account.loginName,
              loginEmail: account.loginEmail,
              loginPassword: account.loginPassword,
              status: account.status,
              identityHint: account.identityType,
            },
            userInfoData: {
              nickname: `${account.loginName}_nickname`,
              gender: Gender.SECRET,
              birthDate: null,
              avatarUrl: null,
              email: account.loginEmail,
              signature: null,
              accessGroup: account.accessGroup,
              address: null,
              phone: null,
              tags: null,
              geographic: null,
              metaDigest: account.accessGroup,
              notifyCount: 0,
              unreadCount: 0,
              userState: UserState.ACTIVE,
            },
          });
        }),
      );
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
    type: LoginTypeEnum = LoginTypeEnum.PASSWORD,
    audience: string = 'DESKTOP',
    ip: string = '127.0.0.1',
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
              role
              userInfo {
                id
                accountId
                nickname
                gender
                birthDate
                avatarUrl
                email
                signature
                accessGroup
                address
                phone
                tags
                geographic
                notifyCount
                unreadCount
                userState
                createdAt
                updatedAt
              }
              identity {
                ... on StaffType {
                  id
                  name
                  remark
                  jobTitle
                  departmentId
                  employmentStatus
                }
                ... on CoachType {
                  id
                  name
                  remark
                  employmentStatus
                }
                ... on ManagerType {
                  id
                  name
                  remark
                  employmentStatus
                }
                ... on CustomerType {
                  id
                  name
                  contactPhone
                  preferredContactTime
                  membershipLevel
                  remark
                }
              }
            }
          }
        `,
        variables: {
          input: {
            loginName,
            loginPassword,
            type,
            audience,
            ip,
          },
        },
      });

    return response;
  };

  describe('登录成功场景', () => {
    it('应该支持用户名登录成功', async () => {
      const response = await performLogin(
        activeUser.loginName,
        activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'DESKTOP',
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
    });

    it('应该支持邮箱登录成功', async () => {
      const response = await performLogin(activeUser.loginEmail, activeUser.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
    });

    it('应该支持有效的 audience 登录成功', async () => {
      const response = await performLogin(
        activeUser.loginName,
        activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'SSTSTEST',
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
    });

    it('登录成功后应该返回正确的用户 ID', async () => {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const account = await accountRepository.findOne({
        where: { loginName: activeUser.loginName },
      });

      const response = await performLogin(activeUser.loginName, activeUser.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBe(account?.id.toString());
    });

    it('应该正确决策用户角色', async () => {
      const response = await performLogin(activeUser.loginName, activeUser.loginPassword);

      const { data } = response.body;
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
      expect(data?.login.role).toBe(activeUser.identityType);
    });

    it('应该拒绝无效的 audience', async () => {
      const response = await performLogin(
        activeUser.loginName,
        activeUser.loginPassword,
        LoginTypeEnum.PASSWORD,
        'invalid-audience' as never,
      );

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain(
        'Value "invalid-audience" does not exist in "AudienceTypeEnum" enum.',
      );
    });
  });

  describe('账户状态相关场景', () => {
    it('应该正确处理账户不存在的情况', async () => {
      const response = await performLogin('nonexistent', 'password123');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户不存在');
    });

    it('应该正确处理账户被禁用的情况', async () => {
      const response = await performLogin(bannedUser.loginName, bannedUser.loginPassword);

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户未激活或已被禁用');
    });

    it('应该正确处理待激活账户的情况', async () => {
      const response = await performLogin(pendingUser.loginName, pendingUser.loginPassword);

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户未激活或已被禁用');
    });
  });

  describe('密码验证场景', () => {
    it('应该正确处理密码错误的情况', async () => {
      const response = await performLogin(activeUser.loginName, 'wrongpassword');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('密码错误');
    });

    it('应该正确处理空密码的情况', async () => {
      const response = await performLogin(activeUser.loginName, '');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('密码不能为空或纯空白字符');
    });
  });

  describe('输入参数验证', () => {
    it('应该正确处理空用户名的情况', async () => {
      const response = await performLogin('', 'password123');

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('账户不存在');
    });

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
                role
              }
            }
          `,
        })
        .expect(400);

      const { errors } = response.body;
      expect(errors).toBeDefined();
      expect(errors?.[0]?.message).toContain('input');
    });

    it('登录成功后应该返回有效的 JWT Token', async () => {
      const response = await performLogin(activeUser.loginName, activeUser.loginPassword);

      const { data } = response.body;
      const accessToken = data?.login.accessToken;
      const refreshToken = data?.login.refreshToken;

      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(typeof refreshToken).toBe('string');
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);
    });
  });
});
