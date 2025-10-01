// test/03-roles-guard/roles-guard.e2e-spec.ts
import { INestApplication, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Query, Resolver } from '@nestjs/graphql';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '@src/adapters/graphql/guards/roles.guard';
import { AppModule } from '@src/app.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';

import { IdentityTypeEnum, LoginTypeEnum } from '@src/types/models/account.types';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
// 添加身份实体导入
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
// 导入全局测试账户工具
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

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
  let customerToken: string;
  let guestToken: string;
  let emptyRolesToken: string;
  let createAccountUsecase: CreateAccountUsecase;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [TestRolesResolver],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);
    createAccountUsecase = app.get(CreateAccountUsecase);

    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // 使用全局测试账户工具进行清理和创建
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase,
    });

    // 添加调试信息
    console.log('开始登录所有用户...');
    await loginAllUsers();
    console.log('所有用户登录完成');
    console.log('Token 状态:', {
      managerToken: managerToken ? 'exists' : 'null',
      coachToken: coachToken ? 'exists' : 'null',
      adminToken: adminToken ? 'exists' : 'null',
      guestToken: guestToken ? 'exists' : 'null',
      emptyRolesToken: emptyRolesToken ? 'exists' : 'null',
    });
  });

  /**
   * 登录所有测试用户获取 token
   */
  const loginAllUsers = async (): Promise<void> => {
    const loginUser = async (loginName: string, loginPassword: string): Promise<string> => {
      console.log(`尝试登录用户: ${loginName}`);

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
              audience: 'DESKTOP', // 使用 DESKTOP 作为测试环境的 audience
            },
          },
        })
        .expect(200);

      console.log(`用户 ${loginName} 登录响应:`, JSON.stringify(response.body, null, 2));

      // 检查登录是否成功
      if (!response.body.data || !response.body.data.login) {
        const errorMessage = response.body.errors?.[0]?.message || '登录失败';
        console.error(`用户 ${loginName} 登录失败:`, errorMessage);
        throw new Error(`用户 ${loginName} 登录失败: ${errorMessage}`);
      }

      const accessToken = response.body.data.login.accessToken as string;
      if (!accessToken) {
        console.error(`用户 ${loginName} 登录成功但未获取到 accessToken`);
        throw new Error(`用户 ${loginName} 登录成功但未获取到 accessToken`);
      }

      // 验证 token 格式
      const tokenParts = accessToken.split('.');
      if (tokenParts.length !== 3) {
        console.error(`用户 ${loginName} 获取的 token 格式不正确，部分数量: ${tokenParts.length}`);
        throw new Error(`用户 ${loginName} 获取的 token 格式不正确`);
      }

      console.log(`用户 ${loginName} 登录成功，获取到有效 token (长度: ${accessToken.length})`);
      return accessToken;
    };

    // 使用全局测试账户配置进行登录
    try {
      managerToken = await loginUser(
        testAccountsConfig.manager.loginName,
        testAccountsConfig.manager.loginPassword,
      );
      coachToken = await loginUser(
        testAccountsConfig.coach.loginName,
        testAccountsConfig.coach.loginPassword,
      );
      adminToken = await loginUser(
        testAccountsConfig.admin.loginName,
        testAccountsConfig.admin.loginPassword,
      );
      customerToken = await loginUser(
        testAccountsConfig.customer.loginName,
        testAccountsConfig.customer.loginPassword,
      );
      guestToken = await loginUser(
        testAccountsConfig.guest.loginName,
        testAccountsConfig.guest.loginPassword,
      );
      emptyRolesToken = await loginUser(
        testAccountsConfig.emptyRoles.loginName,
        testAccountsConfig.emptyRoles.loginPassword,
      );
    } catch (error) {
      console.error('登录用户失败:', error);
      throw error;
    }
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
      // 添加环境变量调试信息
      console.log('JWT_AUDIENCE 环境变量:', process.env.JWT_AUDIENCE);
      console.log('JWT 配置中的 audience:', app.get(ConfigService).get('jwt.audience'));

      // 添加更详细的 token 调试信息
      console.log('managerToken:', managerToken ? 'exists' : 'null');
      console.log('managerToken 长度:', managerToken?.length);
      console.log('managerToken 前50个字符:', managerToken?.substring(0, 50));

      // 检查 token 格式和内容
      if (managerToken) {
        const tokenParts = managerToken.split('.');
        console.log('Token 部分数量:', tokenParts.length);
        if (tokenParts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            console.log('Token payload:', payload);
          } catch (e) {
            console.error('无法解析 token payload:', e);
          }
        }
      }

      const response = await executeQuery('query { publicQuery }', managerToken).expect(200);

      // 添加详细的响应调试
      console.log('publicQuery 完整响应:', JSON.stringify(response.body, null, 2));
      console.log('response.body.data:', response.body.data);
      console.log('response.body.errors:', response.body.errors);

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

    it('应该拒绝 CUSTOMER 角色访问 adminQuery 并返回 403', async () => {
      const response = await executeQuery('query { adminQuery }', customerToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['ADMIN']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['CUSTOMER']);
    });

    it('应该拒绝 COACH 角色访问 adminQuery 并返回 403', async () => {
      const response = await executeQuery('query { adminQuery }', coachToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('缺少所需角色');
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].extensions.details.requiredRoles).toEqual(['ADMIN']);
      expect(response.body.errors[0].extensions.details.userRoles).toEqual(['COACH']); // 使用 COACH 角色
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

  describe('脏数据处理测试', () => {
    it('应该正确处理数据库 accessGroup 为 null 的约束', async () => {
      // 直接修改数据库中的 accessGroup 为 null
      const userInfoRepository = dataSource.getRepository(UserInfoEntity);
      const accountRepository = dataSource.getRepository(AccountEntity);

      const account = await accountRepository.findOne({
        where: { loginName: testAccountsConfig.coach.loginName },
      });

      // 尝试更新为 null，预期会失败
      let updateError: Error | null = null;
      try {
        if (account) {
          await userInfoRepository.update(
            { accountId: account.id },
            { accessGroup: null as unknown as IdentityTypeEnum[] },
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

    it('应该正确处理 RolesGuard 中 accessGroup 为空数组的情况', async () => {
      // 使用现有的 emptyRoles 账户，它的 accessGroup 就是空数组
      const response = await executeQuery('query { managerQuery }', emptyRolesToken).expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.errors[0].message).toContain('用户权限信息缺失');
    });
  });
});
