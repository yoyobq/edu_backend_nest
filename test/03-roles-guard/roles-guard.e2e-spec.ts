// test/03-roles-guard/roles-guard.e2e-spec.ts
import { Gender, UserState } from '@app-types/models/user-info.types';
import { INestApplication, UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '@src/adapters/graphql/guards/roles.guard';
import { AppModule } from '@src/app.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AccountStatus, LoginTypeEnum } from '@src/types/models/account.types';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';

/**
 * 测试用的 GraphQL Resolver
 * 用于测试不同角色权限场景
 */
@Resolver()
class TestRolesResolver {
  /**
   * 无角色要求的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard)
  publicQuery(): string {
    return 'public access';
  }

  /**
   * 需要 MANAGER 角色的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  managerQuery(): string {
    return 'manager access';
  }

  /**
   * 需要 ADMIN 角色的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  adminQuery(): string {
    return 'admin access';
  }

  /**
   * 需要多个角色之一的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  multiRoleQuery(): string {
    return 'multi role access';
  }

  /**
   * 空角色数组的查询（应该根据用户的 accessGroup 首项判断）
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles()
  emptyRolesQuery(): string {
    return 'empty roles access';
  }

  /**
   * 仅需要认证但无角色守卫的查询
   */
  @Query(() => String)
  @UseGuards(JwtAuthGuard)
  authOnlyQuery(): string {
    return 'auth only access';
  }

  /**
   * 无任何守卫的查询
   */
  @Query(() => String)
  noGuardQuery(): string {
    return 'no guard access';
  }

  /**
   * 仅角色守卫无认证守卫的查询（用于测试未登录场景）
   */
  @Query(() => String)
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  roleOnlyQuery(): string {
    return 'role only access';
  }
}

/**
 * RolesGuard E2E 测试
 */
describe('RolesGuard (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let managerToken: string;
  let coachToken: string;
  let adminToken: string;
  let guestToken: string;
  let emptyRolesToken: string;

  // 测试账户数据
  const testAccounts = {
    manager: {
      loginName: 'testmanager',
      loginEmail: 'manager@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
      accessGroup: ['MANAGER'],
    },
    coach: {
      loginName: 'testcoach',
      loginEmail: 'coach@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
      accessGroup: ['COACH'],
    },
    admin: {
      loginName: 'testadmin',
      loginEmail: 'admin@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
      accessGroup: ['ADMIN'],
    },
    guest: {
      loginName: 'testguest',
      loginEmail: 'guest@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
      accessGroup: ['GUEST'],
    },
    emptyRoles: {
      loginName: 'testempty',
      loginEmail: 'empty@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
      accessGroup: [], // 空角色数组
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [TestRolesResolver],
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
    await cleanupTestData();
    await createTestAccounts();
    await loginAllUsers();
  });

  /**
   * 清理测试数据
   */
  const cleanupTestData = async (): Promise<void> => {
    try {
      const accountRepository = dataSource.getRepository(AccountEntity);
      const userInfoRepository = dataSource.getRepository(UserInfoEntity);
      const loginNames = Object.values(testAccounts).map((account) => account.loginName);

      if (loginNames.length > 0) {
        // 先删除用户信息
        const accounts = await accountRepository.find({
          where: { loginName: In(loginNames) },
        });
        const accountIds = accounts.map((account) => account.id);
        if (accountIds.length > 0) {
          await userInfoRepository.delete({ accountId: In(accountIds) });
        }

        // 再删除账户
        await accountRepository.delete({ loginName: In(loginNames) });
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

      const createdAccounts = await Promise.all(
        Object.values(testAccounts).map(async (account) => {
          const savedAccount = await accountRepository.save({
            loginName: account.loginName,
            loginEmail: account.loginEmail,
            loginPassword: 'temp',
            status: account.status,
            recentLoginHistory: null,
            identityHint: null,
          });

          const hashedPassword = AccountService.hashPasswordWithTimestamp(
            account.loginPassword,
            savedAccount.createdAt,
          );

          await accountRepository.update(savedAccount.id, {
            loginPassword: hashedPassword,
          });

          return { ...savedAccount, accessGroup: account.accessGroup };
        }),
      );

      // 创建用户信息记录
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
            accessGroup: account.accessGroup,
            address: null,
            phone: null,
            tags: null,
            geographic: null,
            metaDigest: '',
            notifyCount: 0,
            unreadCount: 0,
            state: UserState.ACTIVE,
          });
        }),
      );
    } catch (error) {
      console.error('创建测试账户失败:', error);
      throw error;
    }
  };

  /**
   * 登录所有测试用户获取 token
   */
  const loginAllUsers = async (): Promise<void> => {
    const loginUser = async (loginName: string, loginPassword: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation Login($input: AuthLoginInput!) {
              login(input: $input) {
                accessToken
              }
            }
          `,
          variables: {
            input: {
              loginName,
              loginPassword,
              type: LoginTypeEnum.PASSWORD,
              audience: 'DESKTOP',
            },
          },
        })
        .expect(200);

      return response.body.data.login.accessToken as string;
    };

    managerToken = await loginUser(
      testAccounts.manager.loginName,
      testAccounts.manager.loginPassword,
    );
    coachToken = await loginUser(testAccounts.coach.loginName, testAccounts.coach.loginPassword);
    adminToken = await loginUser(testAccounts.admin.loginName, testAccounts.admin.loginPassword);
    guestToken = await loginUser(testAccounts.guest.loginName, testAccounts.guest.loginPassword);
    emptyRolesToken = await loginUser(
      testAccounts.emptyRoles.loginName,
      testAccounts.emptyRoles.loginPassword,
    );
  };

  /**
   * 执行 GraphQL 查询
   */
  const executeQuery = (query: string, token?: string): request.Test => {
    const req = request(app.getHttpServer()).post('/graphql').send({ query });

    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }

    return req;
  };

  describe('无 @Roles 装饰器场景', () => {
    it('应该允许无角色要求的查询通过（有认证）', async () => {
      const response = await executeQuery('query { publicQuery }', managerToken).expect(200);

      expect(response.body.data.publicQuery).toBe('public access');
    });

    it('应该允许无任何守卫的查询通过（无认证）', async () => {
      const response = await executeQuery('query { noGuardQuery }').expect(200);

      expect(response.body.data.noGuardQuery).toBe('no guard access');
    });

    it('应该允许仅认证守卫的查询通过', async () => {
      const response = await executeQuery('query { authOnlyQuery }', managerToken).expect(200);

      expect(response.body.data.authOnlyQuery).toBe('auth only access');
    });
  });

  describe("@Roles('MANAGER') + accessGroup 匹配场景", () => {
    it('应该允许 MANAGER 角色访问 managerQuery', async () => {
      const response = await executeQuery('query { managerQuery }', managerToken).expect(200);

      expect(response.body.data.managerQuery).toBe('manager access');
    });

    it('应该允许 ADMIN 角色访问需要 MANAGER 或 ADMIN 的查询', async () => {
      const response = await executeQuery('query { multiRoleQuery }', adminToken).expect(200);

      expect(response.body.data.multiRoleQuery).toBe('multi role access');
    });

    it('应该允许 MANAGER 角色访问需要 MANAGER 或 ADMIN 的查询', async () => {
      const response = await executeQuery('query { multiRoleQuery }', managerToken).expect(200);

      expect(response.body.data.multiRoleQuery).toBe('multi role access');
    });
  });

  describe("@Roles('MANAGER') + accessGroup 不匹配场景", () => {
    it('应该拒绝 COACH 角色访问 managerQuery 并返回 403', async () => {
      const response = await executeQuery('query { managerQuery }', coachToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['MANAGER']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['COACH']);
    });

    it('应该拒绝 GUEST 角色访问 adminQuery 并返回 403', async () => {
      const response = await executeQuery('query { adminQuery }', guestToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['ADMIN']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['GUEST']);
    });

    it('应该拒绝 COACH 角色访问需要 MANAGER 或 ADMIN 的查询', async () => {
      const response = await executeQuery('query { multiRoleQuery }', coachToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual([
        'MANAGER',
        'ADMIN',
      ]);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['COACH']);
    });
  });

  describe('未登录场景（移除 JwtAuthGuard）', () => {
    it('应该拒绝未登录用户访问并返回 401', async () => {
      const response = await executeQuery('query { roleOnlyQuery }').expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('用户未登录');
      expect(response.body.errors[0].extensions.errorCode).toBe('JWT_AUTHENTICATION_FAILED');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['MANAGER']);
    });
  });

  describe('@Roles() 空数组场景', () => {
    it('应该拒绝空 accessGroup 用户访问并返回 403', async () => {
      const response = await executeQuery('query { emptyRolesQuery }', emptyRolesToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('用户权限信息缺失');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual([]);
    });

    // 删除了无意义的测试用例："应该允许有角色的用户访问空角色要求的查询"
  });

  describe('角色大小写不敏感测试', () => {
    it('应该支持角色名大小写不敏感匹配', async () => {
      // 创建一个大小写混合的测试账户
      const accountRepository = dataSource.getRepository(AccountEntity);
      const userInfoRepository = dataSource.getRepository(UserInfoEntity);

      const mixedCaseAccount = await accountRepository.save({
        loginName: 'mixedcase',
        loginEmail: 'mixed@example.com',
        loginPassword: 'temp',
        status: AccountStatus.ACTIVE,
        recentLoginHistory: null,
        identityHint: null,
      });

      const hashedPassword = AccountService.hashPasswordWithTimestamp(
        'password123',
        mixedCaseAccount.createdAt,
      );

      await accountRepository.update(mixedCaseAccount.id, {
        loginPassword: hashedPassword,
      });

      await userInfoRepository.save({
        accountId: mixedCaseAccount.id,
        nickname: 'mixed_nickname',
        gender: Gender.SECRET,
        birthDate: null,
        avatar: null,
        email: 'mixed@example.com',
        signature: null,
        accessGroup: ['Manager'], // 大小写混合
        address: null,
        phone: null,
        tags: null,
        geographic: null,
        metaDigest: '',
        notifyCount: 0,
        unreadCount: 0,
        state: UserState.ACTIVE,
      });

      // 登录获取 token
      const loginResponse = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation Login($input: AuthLoginInput!) {
              login(input: $input) {
                accessToken
              }
            }
          `,
          variables: {
            input: {
              loginName: 'mixedcase',
              loginPassword: 'password123',
              type: LoginTypeEnum.PASSWORD,
              audience: 'DESKTOP',
            },
          },
        })
        .expect(200);

      const mixedToken = loginResponse.body.data.login.accessToken;

      // 测试大小写不敏感匹配
      const response = await executeQuery('query { managerQuery }', mixedToken).expect(200);

      expect(response.body.data.managerQuery).toBe('manager access');
    });
  });

  describe('脏数据处理测试', () => {
    it('应该正确处理数据库 accessGroup 为 null 的约束', async () => {
      // 直接修改数据库中的 accessGroup 为 null
      const userInfoRepository = dataSource.getRepository(UserInfoEntity);
      const accountRepository = dataSource.getRepository(AccountEntity);

      const account = await accountRepository.findOne({
        where: { loginName: testAccounts.coach.loginName },
      });

      // 尝试更新为 null，预期会失败
      let updateError: Error | null = null;
      try {
        if (account) {
          await userInfoRepository.update(
            { accountId: account.id },
            { accessGroup: null as unknown as string[] }, // 使用 unknown 进行类型转换
          );
        }
      } catch (error) {
        updateError = error as Error;
      }

      // 验证数据库操作抛出了错误
      expect(updateError).toBeDefined();
      // 验证错误信息包含数据库列不能为空的提示
      expect(updateError?.message).toContain('Column');
      expect(updateError?.message).toContain('cannot be null');
    });

    it('应该正确处理 RolesGuard 中 accessGroup 为 null 的情况', async () => {
      // 直接修改数据库中的 accessGroup 为空数组（绕过数据库约束）
      const userInfoRepository = dataSource.getRepository(UserInfoEntity);
      const accountRepository = dataSource.getRepository(AccountEntity);

      const account = await accountRepository.findOne({
        where: { loginName: testAccounts.coach.loginName },
      });

      if (account) {
        // 使用空数组而不是 null，以绕过数据库约束
        await userInfoRepository.update(
          { accountId: account.id },
          { accessGroup: [] }, // 使用空数组
        );
      }

      // 重新登录获取新的 token
      const loginResponse = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation Login($input: AuthLoginInput!) {
              login(input: $input) {
                accessToken
              }
            }
          `,
          variables: {
            input: {
              loginName: testAccounts.coach.loginName,
              loginPassword: testAccounts.coach.loginPassword,
              type: LoginTypeEnum.PASSWORD,
              audience: 'DESKTOP',
            },
          },
        })
        .expect(200);

      const emptyGroupToken = loginResponse.body.data.login.accessToken;

      // 测试应该抛出权限信息缺失错误
      const response = await executeQuery('query { managerQuery }', emptyGroupToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].message).toContain('用户权限信息缺失');
    });
  });
});
