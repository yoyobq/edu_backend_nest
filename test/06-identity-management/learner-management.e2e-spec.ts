// test/06-identity-management/learner-management.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { TokenHelper } from '@core/common/token/token.helper';
import { AppModule } from '@src/app.module';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { LoginTypeEnum } from '../../src/types/models/account.types';
import { Gender } from '../../src/types/models/user-info.types';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 学员管理 E2E 测试
 * 测试学员的增删改查功能和权限控制
 */
describe('学员管理 E2E 测试', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 测试账户相关变量
  let customerAccessToken: string;
  let customerAccountId: number;
  let customerEntity: CustomerEntity | null;
  let createdLearnerIds: number[] = [];

  /**
   * 获取访问令牌的辅助函数
   */
  const getAccessToken = async (loginName: string, loginPassword: string): Promise<string> => {
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
            ip: '127.0.0.1',
          },
        },
      })
      .expect(200);

    return response.body.data.login.accessToken as string;
  };

  /**
   * 获取当前账户 ID 的辅助函数
   */
  const getMyAccountId = (accessToken: string): number => {
    // 从 app 中获取 TokenHelper 实例
    const tokenHelper = app.get(TokenHelper);

    // 解码 JWT token 获取 payload
    const payload = tokenHelper.decodeToken({ token: accessToken });

    if (!payload || !payload.sub) {
      throw new Error(`无法从 JWT token 中获取 accountId: ${accessToken.substring(0, 20)}...`);
    }

    return payload.sub;
  };

  beforeAll(async () => {
    // 初始化 GraphQL Schema
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);

    // 清理并创建测试账户
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource, createAccountUsecase });

    // 获取客户访问令牌
    customerAccessToken = await getAccessToken(
      testAccountsConfig.customer.loginName,
      testAccountsConfig.customer.loginPassword,
    );

    // 获取客户账户 ID 和实体
    customerAccountId = getMyAccountId(customerAccessToken);
    const customerRepo = dataSource.getRepository(CustomerEntity);
    customerEntity = await customerRepo.findOne({ where: { accountId: customerAccountId } });

    if (!customerEntity) {
      throw new Error('测试客户实体未找到');
    }
  });

  afterAll(async () => {
    // 清理测试数据
    if (createdLearnerIds.length > 0) {
      const learnerRepo = dataSource.getRepository(LearnerEntity);
      await learnerRepo.delete(createdLearnerIds);
    }

    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // 每个测试前清理之前创建的学员
    if (createdLearnerIds.length > 0) {
      const learnerRepo = dataSource.getRepository(LearnerEntity);
      await learnerRepo.delete(createdLearnerIds);
      createdLearnerIds = [];
    }

    // 清理所有现有的学员记录，确保测试环境干净
    const learnerRepo = dataSource.getRepository(LearnerEntity);
    await learnerRepo.clear();
  });

  describe('创建学员', () => {
    /**
     * 测试成功创建学员
     */
    it('应该成功创建学员', async () => {
      const createLearnerInput = {
        name: '测试学员',
        gender: Gender.MALE,
        birthDate: '2010-01-01',
        avatarUrl: 'https://example.com/avatar.jpg',
        specialNeeds: '无特殊需求',
        remark: '测试用学员',
      };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation CreateLearner($input: CreateLearnerInput!) {
              createLearner(input: $input) {
                id
                name
                gender
                birthDate
                avatarUrl
                specialNeeds
                countPerSession
                remark
                createdAt
                updatedAt
              }
            }
          `,
          variables: {
            input: createLearnerInput,
          },
        });

      // 添加调试信息
      if (response.status !== 200) {
        console.log('Response status:', response.status);
        console.log('Response body:', JSON.stringify(response.body, null, 2));
      }

      expect(response.status).toBe(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data).toBeDefined();

      const result = response.body.data.createLearner;
      expect(result.id).toBeDefined();
      expect(result.name).toBe(createLearnerInput.name);
      expect(result.gender).toBe(createLearnerInput.gender);
      expect(result.birthDate).toBe(createLearnerInput.birthDate);
      expect(result.avatarUrl).toBe(createLearnerInput.avatarUrl);
      expect(result.specialNeeds).toBe(createLearnerInput.specialNeeds);
      expect(result.remark).toBe(createLearnerInput.remark);
      expect(result.countPerSession).toBe(1);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      // 记录创建的学员 ID 用于清理
      createdLearnerIds.push(result.id);

      // 验证数据库中的记录
      const learnerRepo = dataSource.getRepository(LearnerEntity);
      const learner = await learnerRepo.findOne({ where: { id: result.id } });
      expect(learner).toBeDefined();
      if (learner && customerEntity) {
        expect(learner.customerId).toBe(customerEntity.id);
        expect(learner.name).toBe(createLearnerInput.name);
      }
    });

    /**
     * 测试未授权访问
     */
    it('应该拒绝未授权的访问', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation CreateLearner($input: CreateLearnerInput!) {
              createLearner(input: $input) {
                id
                name
              }
            }
          `,
          variables: {
            input: {
              name: '测试学员',
              gender: Gender.MALE,
            },
          },
        });

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('分页查询学员列表', () => {
    beforeEach(async () => {
      // 创建多个测试学员
      if (!customerEntity) return;

      const learnerRepo = dataSource.getRepository(LearnerEntity);
      const learners = [];

      for (let i = 1; i <= 5; i++) {
        learners.push(
          learnerRepo.create({
            customerId: customerEntity.id,
            name: `测试学员${i.toString().padStart(2, '0')}`,
            gender: i % 3 === 0 ? Gender.FEMALE : i % 3 === 1 ? Gender.MALE : Gender.SECRET,
            birthDate: `201${i % 10}-0${(i % 9) + 1}-${(i % 28) + 1}`,
            avatarUrl: i % 2 === 0 ? `https://example.com/avatar${i}.jpg` : null,
            specialNeeds: i % 3 === 0 ? `特殊需求${i}` : null,
            countPerSession: 1,
            remark: `测试备注${i}`,
            deactivatedAt: null,
            createdBy: customerAccountId,
            updatedBy: customerAccountId,
          }),
        );
      }

      const savedLearners = await learnerRepo.save(learners);
      createdLearnerIds.push(...savedLearners.map((l) => l.id));
    });

    /**
     * 测试基本分页查询
     */
    it('应该支持基本分页查询', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            query Learners($input: ListLearnersInput!) {
              learners(input: $input) {
                learners {
                  id
                  name
                  gender
                  birthDate
                  createdAt
                }
                pagination {
                  page
                  limit
                  total
                  totalPages
                  hasNext
                  hasPrev
                }
              }
            }
          `,
          variables: {
            input: {
              page: 1,
              limit: 10,
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data).toBeDefined();

      const result = response.body.data.learners;
      expect(result.learners).toHaveLength(5);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);

      // 验证学员数据
      result.learners.forEach((learner: any) => {
        expect(learner.id).toBeDefined();
        expect(learner.name).toMatch(/^测试学员\d{2}$/);
        expect(learner.gender).toMatch(/^(MALE|FEMALE|SECRET)$/);
        expect(learner.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(learner.createdAt).toBeDefined();
      });
    });
  });

  describe('更新学员', () => {
    let testLearnerId: number;

    beforeEach(async () => {
      if (!customerEntity) return;

      // 创建测试学员
      const learnerRepo = dataSource.getRepository(LearnerEntity);
      const learner = await learnerRepo.save(
        learnerRepo.create({
          customerId: customerEntity.id,
          name: '原始学员名称',
          gender: Gender.FEMALE,
          birthDate: '2012-06-15',
          avatarUrl: null,
          specialNeeds: '原始特殊需求',
          countPerSession: 1,
          remark: '原始备注',
          deactivatedAt: null,
          createdBy: customerAccountId,
          updatedBy: customerAccountId,
        }),
      );
      testLearnerId = learner.id;
      createdLearnerIds.push(testLearnerId);
    });

    /**
     * 测试成功更新学员信息
     */
    it('应该成功更新学员信息', async () => {
      const updateInput = {
        learnerId: testLearnerId,
        name: '更新后的学员名称',
        gender: Gender.MALE,
        birthDate: '2011-03-20',
        avatarUrl: 'https://example.com/new-avatar.jpg',
        specialNeeds: '更新后的特殊需求',
        remark: '更新后的备注',
      };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation UpdateLearner($input: UpdateLearnerInput!) {
              updateLearner(input: $input) {
                id
                name
                gender
                birthDate
                avatarUrl
                specialNeeds
                remark
                updatedAt
              }
            }
          `,
          variables: {
            input: updateInput,
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data).toBeDefined();

      const result = response.body.data.updateLearner;
      expect(result.id).toBe(testLearnerId);
      expect(result.name).toBe(updateInput.name);
      expect(result.gender).toBe(updateInput.gender);
      expect(result.birthDate).toBe(updateInput.birthDate);
      expect(result.avatarUrl).toBe(updateInput.avatarUrl);
      expect(result.specialNeeds).toBe(updateInput.specialNeeds);
      expect(result.remark).toBe(updateInput.remark);

      // 验证数据库中的更新
      const learnerRepo = dataSource.getRepository(LearnerEntity);
      const updatedLearner = await learnerRepo.findOne({ where: { id: testLearnerId } });
      if (updatedLearner) {
        expect(updatedLearner.name).toBe(updateInput.name);
        expect(updatedLearner.gender).toBe(updateInput.gender);
      }
    });
  });

  describe('删除学员', () => {
    let testLearnerId: number;

    beforeEach(async () => {
      if (!customerEntity) return;

      // 创建测试学员
      const learnerRepo = dataSource.getRepository(LearnerEntity);
      const learner = await learnerRepo.save(
        learnerRepo.create({
          customerId: customerEntity.id,
          name: '删除测试学员',
          gender: Gender.MALE,
          birthDate: '2014-12-25',
          avatarUrl: null,
          specialNeeds: null,
          countPerSession: 1,
          remark: '删除测试备注',
          deactivatedAt: null,
          createdBy: customerAccountId,
          updatedBy: customerAccountId,
        }),
      );
      testLearnerId = learner.id;
      createdLearnerIds.push(testLearnerId);
    });

    /**
     * 测试成功删除学员
     */
    it('应该成功删除学员（软删除）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation DeleteLearner($input: DeleteLearnerInput!) {
              deleteLearner(input: $input)
            }
          `,
          variables: {
            input: {
              learnerId: testLearnerId,
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data).toBeDefined();
      expect(response.body.data.deleteLearner).toBe(true);

      // 验证学员被软删除
      const learnerRepo = dataSource.getRepository(LearnerEntity);
      const deletedLearner = await learnerRepo.findOne({ where: { id: testLearnerId } });
      if (deletedLearner) {
        expect(deletedLearner.deactivatedAt).toBeDefined();
        expect(deletedLearner.deactivatedAt).toBeInstanceOf(Date);
      }
    });
  });
});
