// test/01-auth/auth-identity.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { AccountStatus, IdentityTypeEnum, LoginTypeEnum } from '@src/types/models/account.types';
import { MembershipLevel } from '@src/types/models/training.types';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';

import { Gender, UserState } from '@app-types/models/user-info.types';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';

/**
 * Auth 身份测试 E2E 测试 - 专门测试 Coach、Customer 和 Manager 身份
 */
describe('Auth Identity (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 测试账户数据
  const testAccountsPlaintext = {
    coachUser: {
      loginName: 'coachuser',
      loginEmail: 'coach@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
      identityType: IdentityTypeEnum.COACH,
    },
    customerUser: {
      loginName: 'customeruser',
      loginEmail: 'customer@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
      identityType: IdentityTypeEnum.CUSTOMER,
    },
    managerUser: {
      loginName: 'manageruser',
      loginEmail: 'manager@example.com',
      loginPassword: 'password123',
      status: AccountStatus.ACTIVE,
      identityType: IdentityTypeEnum.MANAGER,
    },
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
      const accountRepository = dataSource.getRepository(AccountEntity);
      const coachRepository = dataSource.getRepository(CoachEntity);
      const customerRepository = dataSource.getRepository(CustomerEntity);
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const loginNames = Object.values(testAccountsPlaintext).map((account) => account.loginName);

      if (loginNames.length > 0) {
        // 先查找要删除的账户 ID
        const accountsToDelete = await accountRepository.find({
          where: { loginName: In(loginNames) },
          select: ['id'],
        });
        const accountIds = accountsToDelete.map((account) => account.id);

        // 先删除身份记录（避免外键约束问题）
        if (accountIds.length > 0) {
          await coachRepository.delete({
            accountId: In(accountIds),
          });
          await customerRepository.delete({
            accountId: In(accountIds),
          });
          await managerRepository.delete({
            accountId: In(accountIds),
          });
        }

        // 再删除账户记录
        await accountRepository.delete({
          loginName: In(loginNames),
        });

        console.log('🧹 身份测试数据清理完成:', {
          deletedAccounts: accountIds.length,
          loginNames,
        });
      }
    } catch (error) {
      console.warn('清理身份测试数据失败:', error);
    }
  };

  /**
   * 创建测试账户数据
   */
  const createTestAccounts = async (): Promise<void> => {
    try {
      // 创建 Coach 用户
      const coachAccount = testAccountsPlaintext.coachUser;
      const createdCoachAccount = await createAccountUsecase.execute({
        accountData: {
          loginName: coachAccount.loginName,
          loginEmail: coachAccount.loginEmail,
          loginPassword: coachAccount.loginPassword,
          status: coachAccount.status,
          identityHint: IdentityTypeEnum.COACH,
        },
        userInfoData: {
          nickname: `${coachAccount.loginName}_nickname`,
          gender: Gender.SECRET,
          birthDate: null,
          avatarUrl: null,
          email: coachAccount.loginEmail,
          signature: null,
          accessGroup: [IdentityTypeEnum.COACH],
          address: null,
          phone: null,
          tags: null,
          geographic: null,
          metaDigest: [IdentityTypeEnum.COACH],
          notifyCount: 0,
          unreadCount: 0,
          userState: UserState.ACTIVE,
        },
      });

      // 为 Coach 用户创建对应的身份记录
      const coachRepository = dataSource.getRepository(CoachEntity);
      const coachEntity = coachRepository.create({
        accountId: createdCoachAccount.id,
        name: `${coachAccount.loginName}_coach_name`,
        level: 1,
        description: `测试用 coach 描述 - ${coachAccount.loginName}`,
        avatarUrl: null,
        specialty: '篮球',
        deactivatedAt: null,
        remark: `测试用 coach 身份记录 - ${coachAccount.loginName}`,
        createdBy: null,
        updatedBy: null,
      });
      await coachRepository.save(coachEntity);

      // 创建 Customer 用户
      const customerAccount = testAccountsPlaintext.customerUser;
      const createdCustomerAccount = await createAccountUsecase.execute({
        accountData: {
          loginName: customerAccount.loginName,
          loginEmail: customerAccount.loginEmail,
          loginPassword: customerAccount.loginPassword,
          status: customerAccount.status,
          identityHint: IdentityTypeEnum.CUSTOMER,
        },
        userInfoData: {
          nickname: `${customerAccount.loginName}_nickname`,
          gender: Gender.SECRET,
          birthDate: null,
          avatarUrl: null,
          email: customerAccount.loginEmail,
          signature: null,
          accessGroup: [IdentityTypeEnum.CUSTOMER],
          address: null,
          phone: null,
          tags: null,
          geographic: null,
          metaDigest: [IdentityTypeEnum.CUSTOMER],
          notifyCount: 0,
          unreadCount: 0,
          userState: UserState.ACTIVE,
        },
      });

      // 为 Customer 用户创建对应的身份记录
      const customerRepository = dataSource.getRepository(CustomerEntity);
      const customerEntity = customerRepository.create({
        accountId: createdCustomerAccount.id,
        name: `${customerAccount.loginName}_customer_name`,
        contactPhone: '13800138000',
        preferredContactTime: '09:00-18:00',
        membershipLevel: MembershipLevel.NORMAL,
        deactivatedAt: null,
        remark: `测试用 customer 身份记录 - ${customerAccount.loginName}`,
        createdBy: null,
        updatedBy: null,
      });
      await customerRepository.save(customerEntity);

      // 创建 Manager 用户
      const managerAccount = testAccountsPlaintext.managerUser;
      const createdManagerAccount = await createAccountUsecase.execute({
        accountData: {
          loginName: managerAccount.loginName,
          loginEmail: managerAccount.loginEmail,
          loginPassword: managerAccount.loginPassword,
          status: managerAccount.status,
          identityHint: IdentityTypeEnum.MANAGER,
        },
        userInfoData: {
          nickname: `${managerAccount.loginName}_nickname`,
          gender: Gender.SECRET,
          birthDate: null,
          avatarUrl: null,
          email: managerAccount.loginEmail,
          signature: null,
          accessGroup: [IdentityTypeEnum.MANAGER],
          address: null,
          phone: null,
          tags: null,
          geographic: null,
          metaDigest: [IdentityTypeEnum.MANAGER],
          notifyCount: 0,
          unreadCount: 0,
          userState: UserState.ACTIVE,
        },
      });

      // 为 Manager 用户创建对应的身份记录
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const managerEntity = managerRepository.create({
        accountId: createdManagerAccount.id,
        name: `${managerAccount.loginName}_manager_name`,
        deactivatedAt: null,
        remark: `测试用 manager 身份记录 - ${managerAccount.loginName}`,
        createdBy: null,
        updatedBy: null,
      });
      await managerRepository.save(managerEntity);

      console.log('✅ 身份记录创建成功:', {
        coachId: coachEntity.id,
        customerId: customerEntity.id,
        managerId: managerEntity.id,
        coachAccountId: coachEntity.accountId,
        customerAccountId: customerEntity.accountId,
        managerAccountId: managerEntity.accountId,
      });
    } catch (error) {
      console.error('❌ 创建身份测试账户失败:', error);
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

  describe('Coach 身份完整测试', () => {
    it('应该支持 Coach 用户登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.coachUser.loginName,
        testAccountsPlaintext.coachUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.COACH);
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    it('应该正确返回 Coach 身份信息', async () => {
      const response = await performLogin(
        testAccountsPlaintext.coachUser.loginName,
        testAccountsPlaintext.coachUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.identity).toBeDefined();
      expect(data?.login.identity.id).toBeDefined();
      expect(data?.login.identity.name).toContain('coach_name');
      expect(data?.login.identity.remark).toContain('测试用 coach 身份记录');
      expect(data?.login.identity.employmentStatus).toBeDefined();
    });

    it('应该正确返回 Coach 用户信息', async () => {
      const response = await performLogin(
        testAccountsPlaintext.coachUser.loginName,
        testAccountsPlaintext.coachUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.userInfo).toBeDefined();
      expect(data?.login.userInfo.nickname).toContain('coachuser_nickname');
      expect(data?.login.userInfo.email).toBe(testAccountsPlaintext.coachUser.loginEmail);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.COACH);
      expect(data?.login.userInfo.userState).toBe(UserState.ACTIVE);
    });

    it('应该验证 Coach 身份记录与数据库一致', async () => {
      const response = await performLogin(
        testAccountsPlaintext.coachUser.loginName,
        testAccountsPlaintext.coachUser.loginPassword,
      );

      const { data } = response.body;
      const coachRepository = dataSource.getRepository(CoachEntity);
      const coachEntity = await coachRepository.findOne({
        where: { accountId: parseInt(data?.login.accountId) },
      });

      expect(coachEntity).toBeDefined();
      expect(data?.login.identity.id).toBe(coachEntity?.id.toString());
      expect(data?.login.identity.name).toBe(coachEntity?.name);
      expect(data?.login.identity.remark).toBe(coachEntity?.remark);
    });
  });

  describe('Customer 身份完整测试', () => {
    it('应该支持 Customer 用户登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.customerUser.loginName,
        testAccountsPlaintext.customerUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.CUSTOMER);
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    it('应该正确返回 Customer 身份信息', async () => {
      const response = await performLogin(
        testAccountsPlaintext.customerUser.loginName,
        testAccountsPlaintext.customerUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.identity).toBeDefined();
      expect(data?.login.identity.id).toBeDefined();
      expect(data?.login.identity.name).toContain('customer_name');
      expect(data?.login.identity.contactPhone).toBe('13800138000');
      expect(data?.login.identity.preferredContactTime).toBe('09:00-18:00');
      expect(data?.login.identity.membershipLevel).toBe(MembershipLevel.NORMAL);
      expect(data?.login.identity.remark).toContain('测试用 customer 身份记录');
    });

    it('应该正确返回 Customer 用户信息', async () => {
      const response = await performLogin(
        testAccountsPlaintext.customerUser.loginName,
        testAccountsPlaintext.customerUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.userInfo).toBeDefined();
      expect(data?.login.userInfo.nickname).toContain('customeruser_nickname');
      expect(data?.login.userInfo.email).toBe(testAccountsPlaintext.customerUser.loginEmail);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.CUSTOMER);
      expect(data?.login.userInfo.userState).toBe(UserState.ACTIVE);
    });

    it('应该验证 Customer 身份记录与数据库一致', async () => {
      const response = await performLogin(
        testAccountsPlaintext.customerUser.loginName,
        testAccountsPlaintext.customerUser.loginPassword,
      );

      const { data } = response.body;
      const customerRepository = dataSource.getRepository(CustomerEntity);
      const customerEntity = await customerRepository.findOne({
        where: { accountId: parseInt(data?.login.accountId) },
      });

      expect(customerEntity).toBeDefined();
      expect(data?.login.identity.id).toBe(customerEntity?.id.toString());
      expect(data?.login.identity.name).toBe(customerEntity?.name);
      expect(data?.login.identity.contactPhone).toBe(customerEntity?.contactPhone);
      expect(data?.login.identity.preferredContactTime).toBe(customerEntity?.preferredContactTime);
      expect(data?.login.identity.membershipLevel).toBe(customerEntity?.membershipLevel);
      expect(data?.login.identity.remark).toBe(customerEntity?.remark);
    });
  });

  describe('Manager 身份完整测试', () => {
    it('应该支持 Manager 用户登录成功', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.MANAGER);
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    it('应该正确返回 Manager 身份信息', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.identity).toBeDefined();
      expect(data?.login.identity.id).toBeDefined();
      expect(data?.login.identity.name).toContain('manager_name');
      expect(data?.login.identity.remark).toContain('测试用 manager 身份记录');
      expect(data?.login.identity.employmentStatus).toBeDefined();
    });

    it('应该正确返回 Manager 用户信息', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.userInfo).toBeDefined();
      expect(data?.login.userInfo.nickname).toContain('manageruser_nickname');
      expect(data?.login.userInfo.email).toBe(testAccountsPlaintext.managerUser.loginEmail);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.MANAGER);
      expect(data?.login.userInfo.userState).toBe(UserState.ACTIVE);
    });

    it('应该验证 Manager 身份记录与数据库一致', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

      const { data } = response.body;
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const managerEntity = await managerRepository.findOne({
        where: { accountId: parseInt(data?.login.accountId) },
      });

      expect(managerEntity).toBeDefined();
      expect(data?.login.identity.id).toBe(managerEntity?.id.toString());
      expect(data?.login.identity.name).toBe(managerEntity?.name);
      expect(data?.login.identity.remark).toBe(managerEntity?.remark);
    });
  });

  describe('身份角色决策测试', () => {
    it('应该正确决策 Coach 角色', async () => {
      const response = await performLogin(
        testAccountsPlaintext.coachUser.loginName,
        testAccountsPlaintext.coachUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.role).toBe(IdentityTypeEnum.COACH);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.COACH);
    });

    it('应该正确决策 Customer 角色', async () => {
      const response = await performLogin(
        testAccountsPlaintext.customerUser.loginName,
        testAccountsPlaintext.customerUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.role).toBe(IdentityTypeEnum.CUSTOMER);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.CUSTOMER);
    });

    it('应该正确决策 Manager 角色', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

      const { data } = response.body;
      expect(data?.login.role).toBe(IdentityTypeEnum.MANAGER);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.MANAGER);
    });
  });

  describe('JWT Token 验证', () => {
    it('Coach 登录应该返回有效的 JWT Token', async () => {
      const response = await performLogin(
        testAccountsPlaintext.coachUser.loginName,
        testAccountsPlaintext.coachUser.loginPassword,
      );

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

    it('Customer 登录应该返回有效的 JWT Token', async () => {
      const response = await performLogin(
        testAccountsPlaintext.customerUser.loginName,
        testAccountsPlaintext.customerUser.loginPassword,
      );

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

    it('Manager 登录应该返回有效的 JWT Token', async () => {
      const response = await performLogin(
        testAccountsPlaintext.managerUser.loginName,
        testAccountsPlaintext.managerUser.loginPassword,
      );

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
