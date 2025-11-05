// test/01-auth/auth-identity.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { StaffEntity } from '@src/modules/account/identities/school/staff/account-staff.entity';
import { IdentityTypeEnum, LoginTypeEnum } from '@src/types/models/account.types';
import { MembershipLevel } from '@src/types/models/training.types';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { UserState } from '@app-types/models/user-info.types';
import { AppModule } from '@src/app.module';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * Auth 身份测试 E2E 测试 - 专门测试 Coach、Customer、Manager 和 Learner 身份
 */
describe('Auth Identity (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 直接使用统一测试账号配置
  const { coach, customer, manager, learner, staff } = testAccountsConfig;

  beforeAll(async () => {
    // 初始化 GraphQL Schema
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);

    await app.init();

    // 使用统一的测试账号创建函数
    await seedTestAccounts({
      dataSource,
      createAccountUsecase,
      includeKeys: ['coach', 'customer', 'manager', 'learner', 'staff'],
    });

    console.log('✅ 使用统一测试账号创建成功');
  }, 30000);

  afterAll(async () => {
    // 清理测试账号
    await cleanupTestAccounts(dataSource);

    if (app) {
      await app.close();
    }
  });

  // 注释掉原来的创建测试账户函数
  /*
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

      // 创建 Learner 用户
      const learnerAccount = testAccountsPlaintext.learnerUser;
      const createdLearnerAccount = await createAccountUsecase.execute({
        accountData: {
          loginName: learnerAccount.loginName,
          loginEmail: learnerAccount.loginEmail,
          loginPassword: learnerAccount.loginPassword,
          status: learnerAccount.status,
          identityHint: IdentityTypeEnum.LEARNER,
        },
        userInfoData: {
          nickname: `${learnerAccount.loginName}_nickname`,
          gender: Gender.SECRET,
          birthDate: null,
          avatarUrl: null,
          email: learnerAccount.loginEmail,
          signature: null,
          accessGroup: [IdentityTypeEnum.LEARNER],
          address: null,
          phone: null,
          tags: null,
          geographic: null,
          metaDigest: [IdentityTypeEnum.LEARNER],
          notifyCount: 0,
          unreadCount: 0,
          userState: UserState.ACTIVE,
        },
      });

      // 为 Learner 用户创建对应的身份记录
      const learnerRepository = dataSource.getRepository(LearnerEntity);
      const learnerEntity = learnerRepository.create({
        accountId: createdLearnerAccount.id,
        customerId: customerEntity.id, // 关联到之前创建的 customer
        name: `${learnerAccount.loginName}_learner_name`,
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        specialNeeds: '测试用特殊需求',
        countPerSession: 1,
        deactivatedAt: null,
        remark: `测试用 learner 身份记录 - ${learnerAccount.loginName}`,
        createdBy: null,
        updatedBy: null,
      });
      await learnerRepository.save(learnerEntity);

      console.log('✅ 身份记录创建成功:', {
        coachId: coachEntity.id,
        customerId: customerEntity.id,
        managerId: managerEntity.id,
        learnerId: learnerEntity.id,
        coachAccountId: coachEntity.accountId,
        customerAccountId: customerEntity.accountId,
        managerAccountId: managerEntity.accountId,
        learnerAccountId: learnerEntity.accountId,
      });
    } catch (error) {
      console.error('❌ 创建身份测试账户失败:', error);
      throw error;
    }
  };
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
                userInfoId: id
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
                  staffId: id
                  name
                  remark
                  jobTitle
                  departmentId
                  employmentStatus
                }
                ... on CoachType {
                  coachId: id
                  name
                  remark
                  employmentStatus
                }
                ... on ManagerType {
                  managerId: id
                  name
                  remark
                  employmentStatus
                }
                ... on CustomerType {
                  customerId: id
                  name
                  contactPhone
                  preferredContactTime
                  membershipLevel
                  remark
                }
                ... on LearnerType {
                  learnerId: id
                  accountId
                  learnerCustomerId: customerId
                  name
                  gender
                  birthDate
                  avatarUrl
                  specialNeeds
                  countPerSession
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
      const response = await performLogin(coach.loginName, coach.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.COACH);
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    it('应该正确返回 Coach 身份信息', async () => {
      const response = await performLogin(coach.loginName, coach.loginPassword);

      const { data } = response.body;
      expect(data?.login.identity).toBeDefined();
      expect(data?.login.identity.coachId).toBeDefined();
      expect(data?.login.identity.name).toContain('coach_name');
      expect(data?.login.identity.remark).toContain('测试用 coach 身份记录');
      expect(data?.login.identity.employmentStatus).toBeDefined();
    });

    it('应该正确返回 Coach 用户信息', async () => {
      const response = await performLogin(coach.loginName, coach.loginPassword);

      const { data } = response.body;
      expect(data?.login.userInfo).toBeDefined();
      expect(data?.login.userInfo.nickname).toBeDefined();
      expect(data?.login.userInfo.email).toBe(coach.loginEmail);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.COACH);
      expect(data?.login.userInfo.userState).toBe(UserState.ACTIVE);
    });

    it('应该验证 Coach 身份记录与数据库一致', async () => {
      const response = await performLogin(coach.loginName, coach.loginPassword);

      const { data } = response.body;
      const coachRepository = dataSource.getRepository(CoachEntity);
      const coachEntity = await coachRepository.findOne({
        where: { accountId: parseInt(data?.login.accountId) },
      });

      expect(coachEntity).toBeDefined();
      expect(data?.login.identity.coachId).toBe(coachEntity?.id);
      expect(data?.login.identity.name).toBe(coachEntity?.name);
      expect(data?.login.identity.remark).toBe(coachEntity?.remark);
    });
  });

  describe('Staff 身份完整测试', () => {
    it('应该支持 Staff 用户登录成功', async () => {
      const response = await performLogin(staff.loginName, staff.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.STAFF);
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    it('应该正确返回 Staff 身份信息', async () => {
      const response = await performLogin(staff.loginName, staff.loginPassword);

      const { data } = response.body;
      expect(data?.login.identity).toBeDefined();
      expect(data?.login.identity.staffId).toBeDefined();
      expect(data?.login.identity.name).toContain('staff_name');
      expect(data?.login.identity.remark).toContain('测试用 staff 身份记录');
      expect(data?.login.identity.jobTitle).toBe('教师');
      expect(data?.login.identity.employmentStatus).toBeDefined();
      // GraphQL schema 中 StaffType.id 是 Int，parseStaffId 将 varchar 工号解析为数字
      expect(typeof data?.login.identity.staffId).toBe('number');
    });

    it('应该正确返回 Staff 用户信息', async () => {
      const response = await performLogin(staff.loginName, staff.loginPassword);

      const { data } = response.body;
      expect(data?.login.userInfo).toBeDefined();
      expect(data?.login.userInfo.nickname).toBeDefined();
      expect(data?.login.userInfo.email).toBe(staff.loginEmail);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.STAFF);
      expect(data?.login.userInfo.userState).toBe(UserState.ACTIVE);
    });

    it('应该验证 Staff 身份记录与数据库一致', async () => {
      const response = await performLogin(staff.loginName, staff.loginPassword);

      const { data } = response.body;
      const staffRepository = dataSource.getRepository(StaffEntity);
      const staffEntity = await staffRepository.findOne({
        where: { accountId: parseInt(data?.login.accountId) },
      });

      expect(staffEntity).toBeDefined();
      // staffEntity.id 是 varchar 工号，GraphQL 返回的是解析后的数字 staffId
      expect(data?.login.identity.staffId).toBe(parseInt(staffEntity!.id));
      expect(data?.login.identity.name).toBe(staffEntity?.name);
      expect(data?.login.identity.remark).toBe(staffEntity?.remark);
      expect(data?.login.identity.departmentId).toBe(staffEntity?.departmentId);
      expect(data?.login.identity.jobTitle).toBe(staffEntity?.jobTitle);
    });
  });

  describe('Customer 身份完整测试', () => {
    it('应该支持 Customer 用户登录成功', async () => {
      const response = await performLogin(customer.loginName, customer.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.CUSTOMER);
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    it('应该正确返回 Customer 身份信息', async () => {
      const response = await performLogin(customer.loginName, customer.loginPassword);

      const { data } = response.body;
      expect(data?.login.identity).toBeDefined();
      expect(data?.login.identity.customerId).toBeDefined();
      expect(data?.login.identity.name).toContain('customer_name');
      expect(data?.login.identity.contactPhone).toBe('13800138000');
      expect(data?.login.identity.preferredContactTime).toBe('09:00-18:00');
      expect(data?.login.identity.membershipLevel).toBe(MembershipLevel.NORMAL);
      expect(data?.login.identity.remark).toContain('测试用 customer 身份记录');
    });

    it('应该正确返回 Customer 用户信息', async () => {
      const response = await performLogin(customer.loginName, customer.loginPassword);

      const { data } = response.body;
      expect(data?.login.userInfo).toBeDefined();
      expect(data?.login.userInfo.nickname).toBeDefined();
      expect(data?.login.userInfo.email).toBe(customer.loginEmail);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.CUSTOMER);
      expect(data?.login.userInfo.userState).toBe(UserState.ACTIVE);
    });

    it('应该验证 Customer 身份记录与数据库一致', async () => {
      const response = await performLogin(customer.loginName, customer.loginPassword);

      const { data } = response.body;
      const customerRepository = dataSource.getRepository(CustomerEntity);
      const customerEntity = await customerRepository.findOne({
        where: { accountId: parseInt(data?.login.accountId) },
      });

      expect(customerEntity).toBeDefined();
      expect(data?.login.identity.customerId).toBe(customerEntity?.id);
      expect(data?.login.identity.name).toBe(customerEntity?.name);
      expect(data?.login.identity.contactPhone).toBe(customerEntity?.contactPhone);
      expect(data?.login.identity.preferredContactTime).toBe(customerEntity?.preferredContactTime);
      expect(data?.login.identity.membershipLevel).toBe(customerEntity?.membershipLevel);
      expect(data?.login.identity.remark).toBe(customerEntity?.remark);
    });
  });

  describe('Manager 身份完整测试', () => {
    it('应该支持 Manager 用户登录成功', async () => {
      const response = await performLogin(manager.loginName, manager.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.MANAGER);
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    it('应该正确返回 Manager 身份信息', async () => {
      const response = await performLogin(manager.loginName, manager.loginPassword);

      const { data } = response.body;
      expect(data?.login.identity).toBeDefined();
      expect(data?.login.identity.managerId).toBeDefined();
      expect(data?.login.identity.name).toContain('manager_name');
      expect(data?.login.identity.remark).toContain('测试用 manager 身份记录');
      expect(data?.login.identity.employmentStatus).toBeDefined();
    });

    it('应该正确返回 Manager 用户信息', async () => {
      const response = await performLogin(manager.loginName, manager.loginPassword);

      const { data } = response.body;
      expect(data?.login.userInfo).toBeDefined();
      expect(data?.login.userInfo.nickname).toBeDefined();
      expect(data?.login.userInfo.email).toBe(manager.loginEmail);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.MANAGER);
      expect(data?.login.userInfo.userState).toBe(UserState.ACTIVE);
    });

    it('应该验证 Manager 身份记录与数据库一致', async () => {
      const response = await performLogin(manager.loginName, manager.loginPassword);

      const { data } = response.body;
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const managerEntity = await managerRepository.findOne({
        where: { accountId: parseInt(data?.login.accountId) },
      });

      expect(managerEntity).toBeDefined();
      expect(data?.login.identity.managerId).toBe(managerEntity?.id);
      expect(data?.login.identity.name).toBe(managerEntity?.name);
      expect(data?.login.identity.remark).toBe(managerEntity?.remark);
    });
  });

  describe('Learner 身份完整测试', () => {
    it('应该支持 Learner 用户登录成功', async () => {
      const response = await performLogin(learner.loginName, learner.loginPassword);

      const { data } = response.body;
      expect(data?.login.accountId).toBeDefined();
      expect(data?.login.accessToken).toBeDefined();
      expect(data?.login.refreshToken).toBeDefined();
      expect(data?.login.role).toBe(IdentityTypeEnum.LEARNER);
      expect(typeof data?.login.accessToken).toBe('string');
      expect(typeof data?.login.refreshToken).toBe('string');
    });

    it('应该正确返回 Learner 身份信息', async () => {
      const response = await performLogin(learner.loginName, learner.loginPassword);

      const { data } = response.body;
      expect(data?.login.identity).toBeDefined();
      expect(data?.login.identity.learnerId).toBeDefined();
      expect(data?.login.identity.name).toBeDefined();
      expect(data?.login.identity.learnerCustomerId).toBeDefined();
      expect(typeof data?.login.identity.countPerSession).toBe('number');
      expect(data?.login.identity.specialNeeds).toBeDefined();
      expect(data?.login.identity.remark).toBeDefined();
    });

    it('应该正确返回 Learner 用户信息', async () => {
      const response = await performLogin(learner.loginName, learner.loginPassword);

      const { data } = response.body;
      expect(data?.login.userInfo).toBeDefined();
      expect(data?.login.userInfo.nickname).toBeDefined();
      expect(data?.login.userInfo.email).toBe(learner.loginEmail);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.LEARNER);
      expect(data?.login.userInfo.userState).toBe(UserState.ACTIVE);
    });

    it('应该验证 Learner 身份记录与数据库一致', async () => {
      const response = await performLogin(learner.loginName, learner.loginPassword);

      const { data } = response.body;
      const learnerRepository = dataSource.getRepository(LearnerEntity);
      const learnerEntity = await learnerRepository.findOne({
        where: { accountId: parseInt(data?.login.accountId) },
      });

      expect(learnerEntity).toBeDefined();
      expect(data?.login.identity.learnerId).toBe(learnerEntity?.id);
      expect(data?.login.identity.name).toBe(learnerEntity?.name);
      expect(data?.login.identity.learnerCustomerId).toBe(learnerEntity?.customerId);
      expect(typeof data?.login.identity.countPerSession).toBe('number');
      expect(data?.login.identity.specialNeeds).toBe(learnerEntity?.specialNeeds);
      expect(data?.login.identity.remark).toBe(learnerEntity?.remark);
    });
  });

  describe('身份角色决策测试', () => {
    it('应该正确决策 Coach 角色', async () => {
      const response = await performLogin(coach.loginName, coach.loginPassword);

      const { data } = response.body;
      expect(data?.login.role).toBe(IdentityTypeEnum.COACH);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.COACH);
    });

    it('应该正确决策 Customer 角色', async () => {
      const response = await performLogin(customer.loginName, customer.loginPassword);

      const { data } = response.body;
      expect(data?.login.role).toBe(IdentityTypeEnum.CUSTOMER);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.CUSTOMER);
    });

    it('应该正确决策 Manager 角色', async () => {
      const response = await performLogin(manager.loginName, manager.loginPassword);

      const { data } = response.body;
      expect(data?.login.role).toBe(IdentityTypeEnum.MANAGER);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.MANAGER);
    });

    it('应该正确决策 Learner 角色', async () => {
      const response = await performLogin(learner.loginName, learner.loginPassword);

      const { data } = response.body;
      expect(data?.login.role).toBe(IdentityTypeEnum.LEARNER);
      expect(data?.login.userInfo.accessGroup).toContain(IdentityTypeEnum.LEARNER);
    });
  });

  describe('JWT Token 验证', () => {
    it('Coach 登录应该返回有效的 JWT Token', async () => {
      const response = await performLogin(coach.loginName, coach.loginPassword);

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
      const response = await performLogin(customer.loginName, customer.loginPassword);

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
      const response = await performLogin(manager.loginName, manager.loginPassword);

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

    it('Learner 登录应该返回有效的 JWT Token', async () => {
      const response = await performLogin(learner.loginName, learner.loginPassword);

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

  afterAll(async () => {
    try {
      // 检查数据库连接状态，只有在连接有效时才进行清理
      if (dataSource && dataSource.isInitialized) {
        await cleanupTestAccounts(dataSource);
      }
    } catch (error) {
      console.error('afterAll 清理失败:', error);
    } finally {
      // 确保应用正确关闭，添加延迟以允许 WebSocket 服务器优雅关闭
      if (app) {
        try {
          await app.close();
          // 给 WebSocket 服务器一些时间来完成清理
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (closeError) {
          console.warn('应用关闭时出现警告:', closeError);
        }
      }
    }
  });
});
