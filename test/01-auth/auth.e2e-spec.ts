/* eslint-disable complexity */
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

/**
 * Auth 模块 E2E 测试
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

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
    managerUser: {
      loginName: 'manageruser',
      loginEmail: 'manager@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
    },
  };

  beforeAll(async () => {
    // 创建一个不包含 TypeORM 配置的测试模块，避免创建新的 DataSource
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
      // 使用 CreateAccountUsecase 创建普通测试账户
      await Promise.all(
        Object.entries(testAccountsPlaintext)
          .filter(([key]) => key !== 'managerUser') // 排除 manager 用户，单独处理
          .map(async ([, account]) => {
            await createAccountUsecase.execute({
              accountData: {
                loginName: account.loginName,
                loginEmail: account.loginEmail,
                loginPassword: account.loginPassword,
                status: account.status,
                identityHint: IdentityTypeEnum.REGISTRANT,
              },
              userInfoData: {
                nickname: `${account.loginName}_nickname`,
                gender: Gender.SECRET,
                birthDate: null,
                avatarUrl: null,
                email: account.loginEmail,
                signature: null,
                accessGroup: [IdentityTypeEnum.REGISTRANT],
                address: null,
                phone: null,
                tags: null,
                geographic: null,
                metaDigest: [IdentityTypeEnum.REGISTRANT],
                notifyCount: 0,
                unreadCount: 0,
                userState: UserState.ACTIVE,
              },
            });
          }),
      );

      // 单独创建 manager 用户，设置正确的身份提示和访问组
      const managerAccount = testAccountsPlaintext.managerUser;
      await createAccountUsecase.execute({
        accountData: {
          loginName: managerAccount.loginName,
          loginEmail: managerAccount.loginEmail,
          loginPassword: managerAccount.loginPassword,
          status: managerAccount.status,
          identityHint: IdentityTypeEnum.MANAGER, // 设置为 MANAGER 身份提示
        },
        userInfoData: {
          nickname: `${managerAccount.loginName}_nickname`,
          gender: Gender.SECRET,
          birthDate: null,
          avatarUrl: null,
          email: managerAccount.loginEmail,
          signature: null,
          accessGroup: [IdentityTypeEnum.MANAGER], // 设置 MANAGER 访问组
          address: null,
          phone: null,
          tags: null,
          geographic: null,
          metaDigest: [IdentityTypeEnum.MANAGER], // 设置 MANAGER 元数据
          notifyCount: 0,
          unreadCount: 0,
          userState: UserState.ACTIVE,
        },
      });

      // 验证所有测试账户是否创建成功
      const accountRepository = dataSource.getRepository(AccountEntity);
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
    // console.log('🚀 登录请求参数:', { loginName, loginPassword, type, audience, ip });

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
    // 移除 .expect(200)，让我们先看看响应内容

    // console.log('📥 登录响应状态:', response.status);
    // console.log('📥 登录响应:', response.body);
    // console.log('📥 登录响应:', JSON.stringify(response.body, null, 2));

    // 如果是 400 错误，打印更详细的信息
    // if (response.status === 400) {
    //   console.log('❌ 400 错误详情:');
    //   console.log('Headers:', response.headers);
    //   console.log('Body:', response.body);
    //   if (response.body.errors) {
    //     response.body.errors.forEach((error: any, index: number) => {
    //       console.log(`错误 ${index + 1}:`, error.message);
    //       if (error.extensions) {
    //         console.log(`错误扩展信息:`, error.extensions);
    //       }
    //     });
    //   }
    // }

    return response;
  };

  describe('登录成功场景', () => {
    // 用户名登录成功测试
    it('应该支持用户名登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
        LoginTypeEnum.PASSWORD, // 明确指定登录类型
        'DESKTOP', // 使用有效的 audience 值
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
      expect(data?.login.role).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
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
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBeDefined();
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
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

    // 角色决策测试
    it('应该正确决策用户角色', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      // 验证角色是有效的枚举值
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);
      // 对于没有特定身份提示的用户，应该返回 REGISTRANT 角色
      expect(data?.login.role).toBe(IdentityTypeEnum.REGISTRANT);
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

  describe('新登录流程特性测试', () => {
    /**
     * 测试身份信息装配
     */
    it('应该正确装配身份信息', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      // 对于 REGISTRANT 角色，identity 可能为 null
      if (data?.login.role === IdentityTypeEnum.REGISTRANT) {
        expect(data?.login.identity).toBeNull();
      } else {
        expect(data?.login.identity).toBeDefined();
      }
    });

    /**
     * 测试三段式登录流程的完整性
     */
    it('应该完成三段式登录流程', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;

      // 验证基础登录结果
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.accountId).toBeDefined();

      // 验证角色决策结果
      expect(data?.login.role).toBeDefined();
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);

      // 验证身份装配结果（可能为 null）
      expect(data?.login).toHaveProperty('identity');
    });

    /**
     * 测试 manager 用户的三段式登录流程
     */
    it('应该完成 manager 用户的三段式登录流程', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

      const { data } = response.body;

      // 输出完整的登录信息
      console.log('🔍 Manager 用户完整登录信息:');
      console.log('📋 登录响应数据:', JSON.stringify(data?.login, null, 2));
      console.log('🎯 访问令牌:', data?.login.accessToken);
      console.log('🔄 刷新令牌:', data?.login.refreshToken);
      console.log('🆔 账户 ID:', data?.login.accountId);
      console.log('👤 用户角色:', data?.login.role);
      console.log('🏢 身份信息:', data?.login.identity);
      console.log('📝 用户信息:', data?.login.userInfo);
      console.log('🔐 访问组:', data?.login.userInfo?.accessGroup);

      // 验证基础登录结果
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.accountId).toBeDefined();

      // 验证角色决策结果 - manager 用户应该被识别为 MANAGER 角色
      expect(data?.login.role).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.MANAGER);
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);

      // 验证身份装配结果
      expect(data?.login).toHaveProperty('identity');

      // 如果有身份信息，验证其结构（manager 身份可能为 null，因为可能没有对应的身份实体）
      if (data?.login.identity) {
        expect(data.login.identity).toHaveProperty('id');
        // manager 身份的其他字段验证可以根据实际的 ManagerType DTO 结构添加
      }

      // 验证访问组包含 MANAGER
      expect(data?.login.userInfo?.accessGroup).toContain(IdentityTypeEnum.MANAGER);
    });

    /**
     * 测试 manager 用户角色决策的正确性
     */
    it('应该正确决策 manager 用户角色', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

      const { data } = response.body;

      // 验证角色是有效的枚举值
      expect(Object.values(IdentityTypeEnum)).toContain(data?.login.role);

      // 对于有 MANAGER 身份提示的用户，应该返回 MANAGER 角色
      expect(data?.login.role).toBe(IdentityTypeEnum.MANAGER);

      // 验证访问组正确性
      expect(Array.isArray(data?.login.userInfo?.accessGroup)).toBe(true);
      expect(data?.login.userInfo?.accessGroup).toContain(IdentityTypeEnum.MANAGER);
    });
  });
  describe('用户信息字段验证', () => {
    /**
     * 测试登录成功后userInfo字段的完整性
     */
    it('应该返回完整的用户信息字段', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      const userInfo = data?.login.userInfo;

      // 验证userInfo对象存在
      expect(userInfo).toBeDefined();
      expect(userInfo).not.toBeNull();

      // 验证必需字段
      expect(userInfo.id).toBeDefined();
      expect(typeof userInfo.id).toBe('string'); // GraphQL ID类型返回字符串
      expect(userInfo.accountId).toBeDefined();
      expect(typeof userInfo.accountId).toBe('number');
      expect(userInfo.nickname).toBeDefined();
      expect(typeof userInfo.nickname).toBe('string');
      expect(userInfo.gender).toBeDefined();
      expect(Object.values(Gender)).toContain(userInfo.gender);
      expect(userInfo.accessGroup).toBeDefined();
      expect(Array.isArray(userInfo.accessGroup)).toBe(true);
      expect(userInfo.notifyCount).toBeDefined();
      expect(typeof userInfo.notifyCount).toBe('number');
      expect(userInfo.unreadCount).toBeDefined();
      expect(typeof userInfo.unreadCount).toBe('number');
      expect(userInfo.userState).toBeDefined();
      expect(Object.values(UserState)).toContain(userInfo.userState);
      expect(userInfo.createdAt).toBeDefined();
      expect(userInfo.updatedAt).toBeDefined();

      // 验证可选字段的类型（可以为null但类型要正确）
      if (userInfo.birthDate !== null) {
        expect(typeof userInfo.birthDate).toBe('string');
      }
      if (userInfo.avatarUrl !== null) {
        expect(typeof userInfo.avatarUrl).toBe('string');
      }
      if (userInfo.email !== null) {
        expect(typeof userInfo.email).toBe('string');
      }
      if (userInfo.signature !== null) {
        expect(typeof userInfo.signature).toBe('string');
      }
      if (userInfo.address !== null) {
        expect(typeof userInfo.address).toBe('string');
      }
      if (userInfo.phone !== null) {
        expect(typeof userInfo.phone).toBe('string');
      }
      if (userInfo.tags !== null) {
        expect(Array.isArray(userInfo.tags)).toBe(true);
        userInfo.tags.forEach((tag: any) => {
          expect(typeof tag).toBe('string');
        });
      }
      if (userInfo.geographic !== null) {
        expect(typeof userInfo.geographic).toBe('string'); // GraphQL中geographic被序列化为字符串
      }
    });

    /**
     * 测试用户信息字段的默认值
     */
    it('应该为用户信息字段提供正确的默认值', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      const userInfo = data?.login.userInfo;

      // 验证默认值
      expect(userInfo.nickname).toBe(`${testAccountsPlaintext.activeUser.loginName}_nickname`);
      expect(userInfo.gender).toBe(Gender.SECRET); // 创建账户时设置的默认值
      expect(userInfo.notifyCount).toBe(0);
      expect(userInfo.unreadCount).toBe(0);
      expect(userInfo.userState).toBe(UserState.ACTIVE); // 创建账户时设置的默认值
      expect(userInfo.accessGroup).toContain(IdentityTypeEnum.REGISTRANT);
    });

    /**
     * 测试manager用户的用户信息
     */
    it('应该正确返回manager用户的用户信息', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

      const { data } = response.body;
      const userInfo = data?.login.userInfo;

      // 验证manager用户的特殊字段
      expect(userInfo).toBeDefined();
      expect(userInfo.nickname).toBe(`${testAccountsPlaintext.managerUser.loginName}_nickname`);
      expect(userInfo.accessGroup).toContain(IdentityTypeEnum.MANAGER);
      expect(userInfo.email).toBe(testAccountsPlaintext.managerUser.loginEmail);
    });

    /**
     * 测试用户信息的时间字段格式
     */
    it('应该返回正确格式的时间字段', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      const userInfo = data?.login.userInfo;

      // 验证时间字段格式
      expect(userInfo.createdAt).toBeDefined();
      expect(userInfo.updatedAt).toBeDefined();

      // 验证是否为有效的ISO日期字符串
      expect(new Date(userInfo.createdAt).toISOString()).toBe(userInfo.createdAt);
      expect(new Date(userInfo.updatedAt).toISOString()).toBe(userInfo.updatedAt);

      // 验证创建时间不晚于更新时间
      expect(new Date(userInfo.createdAt).getTime()).toBeLessThanOrEqual(
        new Date(userInfo.updatedAt).getTime(),
      );
    });

    /**
     * 测试用户信息与账户ID的一致性
     */
    it('应该确保用户信息中的accountId与登录结果的accountId一致', async () => {
      const response = await performLogin(
        testAccountsPlaintext.activeUser.loginName,
        testAccountsPlaintext.activeUser.loginPassword,
      );

      const { data } = response.body;
      const loginResult = data?.login;

      expect(loginResult.userInfo.accountId.toString()).toBe(loginResult.accountId);
      expect(loginResult.userInfo.id).toBe(loginResult.accountId); // UserInfoDTO中id字段映射为accountId
    });
  });
});
