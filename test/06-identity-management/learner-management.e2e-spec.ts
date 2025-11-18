// test/06-identity-management/learner-management.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@src/app.module';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { LearnerOutput } from '../../src/adapters/graphql/identity-management/learner/dto/learner.arg';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import {
  AccountStatus,
  IdentityTypeEnum,
  LoginTypeEnum,
} from '../../src/types/models/account.types';
import { Gender, UserState } from '../../src/types/models/user-info.types';

type ApiLearner = Pick<LearnerOutput, 'id' | 'name' | 'customerId' | 'remark'>;

/**
 * 全面的学员管理 E2E 测试
 * 测试多角色权限控制、跨客户访问限制、业务场景覆盖
 */
describe('学员管理 E2E 测试 - 全面权限控制', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 测试角色和令牌
  let managerToken: string;
  let customerAToken: string;
  let customerBToken: string;
  let unauthorizedToken: string;

  // 测试实体
  let customerAEntity: CustomerEntity;
  let customerBEntity: CustomerEntity;

  // 测试数据追踪
  let createdLearnerIds: number[] = [];
  const createdAccountIds: number[] = [];

  /**
   * 创建测试账户的辅助函数
   */
  const createTestAccount = async (config: {
    loginName: string;
    loginEmail: string;
    loginPassword: string;
    identityType: IdentityTypeEnum;
    accessGroup: IdentityTypeEnum[];
  }) => {
    const account = await createAccountUsecase.execute({
      accountData: {
        loginName: config.loginName,
        loginEmail: config.loginEmail,
        loginPassword: config.loginPassword,
        status: AccountStatus.ACTIVE,
        identityHint: config.identityType,
      },
      userInfoData: {
        nickname: `${config.loginName}_nickname`,
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        email: config.loginEmail,
        signature: null,
        accessGroup: config.accessGroup,
        address: null,
        phone: null,
        tags: null,
        geographic: null,
        metaDigest: config.accessGroup,
        notifyCount: 0,
        unreadCount: 0,
        userState: UserState.ACTIVE,
      },
    });

    createdAccountIds.push(account.id);
    return account;
  };

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
   * 创建测试学员的辅助函数
   */
  const createTestLearner = async (customerId: number, name: string, createdBy: number | null) => {
    const learnerRepo = dataSource.getRepository(LearnerEntity);
    const learner = await learnerRepo.save(
      learnerRepo.create({
        customerId,
        name,
        gender: Gender.MALE,
        birthDate: '2010-01-01',
        avatarUrl: null,
        specialNeeds: null,
        countPerSession: 1,
        remark: `测试学员 - ${name}`,
        deactivatedAt: null,
        createdBy,
        updatedBy: createdBy,
      }),
    );
    createdLearnerIds.push(learner.id);
    return learner;
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

    // 清理现有数据
    await dataSource.getRepository(LearnerEntity).clear();
    await dataSource.getRepository(CustomerEntity).clear();
    await dataSource.getRepository(ManagerEntity).clear();

    // 创建 Manager 账户和身份
    const managerAccount = await createTestAccount({
      loginName: 'test_manager_comprehensive',
      loginEmail: 'manager_comprehensive@example.com',
      loginPassword: 'TestManager@2024',
      identityType: IdentityTypeEnum.MANAGER,
      accessGroup: [IdentityTypeEnum.MANAGER],
    });

    const managerRepo = dataSource.getRepository(ManagerEntity);
    await managerRepo.save(
      managerRepo.create({
        accountId: managerAccount.id,
        name: '测试管理员',
        deactivatedAt: null,
        remark: '全面测试用管理员',
        createdBy: null,
        updatedBy: null,
      }),
    );

    // 创建 Customer A 账户和身份
    const customerAAccount = await createTestAccount({
      loginName: 'test_customer_a',
      loginEmail: 'customer_a@example.com',
      loginPassword: 'TestCustomerA@2024',
      identityType: IdentityTypeEnum.CUSTOMER,
      accessGroup: [IdentityTypeEnum.CUSTOMER],
    });

    const customerRepo = dataSource.getRepository(CustomerEntity);
    customerAEntity = await customerRepo.save(
      customerRepo.create({
        accountId: customerAAccount.id,
        name: '测试客户A',
        contactPhone: '13800138001',
        preferredContactTime: '工作日 9:00-18:00',
        membershipLevel: 1,
        deactivatedAt: null,
        remark: '测试客户 A',
        createdBy: null,
        updatedBy: null,
      }),
    );

    // 创建 Customer B 账户和身份
    const customerBAccount = await createTestAccount({
      loginName: 'test_customer_b',
      loginEmail: 'customer_b@example.com',
      loginPassword: 'TestCustomerB@2024',
      identityType: IdentityTypeEnum.CUSTOMER,
      accessGroup: [IdentityTypeEnum.CUSTOMER],
    });

    customerBEntity = await customerRepo.save(
      customerRepo.create({
        accountId: customerBAccount.id,
        name: '测试客户B',
        contactPhone: '13800138002',
        preferredContactTime: '周末 10:00-16:00',
        membershipLevel: 2,
        deactivatedAt: null,
        remark: '测试客户 B',
        createdBy: null,
        updatedBy: null,
      }),
    );

    // 获取访问令牌
    managerToken = await getAccessToken('test_manager_comprehensive', 'TestManager@2024');
    customerAToken = await getAccessToken('test_customer_a', 'TestCustomerA@2024');
    customerBToken = await getAccessToken('test_customer_b', 'TestCustomerB@2024');

    // 创建无效令牌用于测试
    unauthorizedToken = 'invalid.jwt.token';
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
    // 每个测试前清理学员数据
    if (createdLearnerIds.length > 0) {
      const learnerRepo = dataSource.getRepository(LearnerEntity);
      await learnerRepo.delete(createdLearnerIds);
      createdLearnerIds = [];
    }
  });

  describe('权限控制测试', () => {
    describe('创建学员权限', () => {
      const createLearnerInput = {
        name: '权限测试学员',
        gender: Gender.MALE,
        birthDate: '2010-01-01',
        avatarUrl: 'https://example.com/avatar.jpg',
        specialNeeds: '无特殊需求',
        remark: '权限测试用学员',
      };

      it('Customer A 应该能够创建自己的学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation CreateLearner($input: CreateLearnerInput!) {
                createLearner(input: $input) {
                  id
                  name
                  customerId
                }
              }
            `,
            variables: { input: createLearnerInput },
          })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.createLearner).toBeDefined();
        expect(response.body.data.createLearner.customerId).toBe(customerAEntity.id);

        createdLearnerIds.push(response.body.data.createLearner.id);
      });

      it('未授权用户应该被拒绝创建学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${unauthorizedToken}`)
          .send({
            query: `
              mutation CreateLearner($input: CreateLearnerInput!) {
                createLearner(input: $input) {
                  id
                  name
                }
              }
            `,
            variables: { input: createLearnerInput },
          });

        expect(response.body.errors).toBeDefined();
        expect(response.body.errors[0].message).toContain('JWT 认证失败');
      });

      it('无令牌用户应该被拒绝创建学员', async () => {
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
            variables: { input: createLearnerInput },
          });

        expect(response.body.errors).toBeDefined();
      });
    });

    describe('查询学员权限', () => {
      beforeEach(async () => {
        // 为 Customer A 创建学员
        await createTestLearner(customerAEntity.id, '客户A学员1', customerAEntity.accountId);
        await createTestLearner(customerAEntity.id, '客户A学员2', customerAEntity.accountId);
        // 为 Customer B 创建学员
        await createTestLearner(customerBEntity.id, '客户B学员1', customerBEntity.accountId);
      });

      it('Manager 应该能够查询所有学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            query: `
              query Learners($input: ListLearnersInput!) {
                learners(input: $input) {
                  learners {
                    id
                    name
                    customerId
                  }
                  pagination {
                    total
                  }
                }
              }
            `,
            variables: {
              input: { page: 1, limit: 10 },
            },
          })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.learners.pagination.total).toBe(3);

        const allLearners: ApiLearner[] = response.body.data.learners.learners as ApiLearner[];
        const learnerNames = allLearners.map((l) => l.name);
        expect(learnerNames).toContain('客户A学员1');
        expect(learnerNames).toContain('客户A学员2');
        expect(learnerNames).toContain('客户B学员1');
      });

      it('Customer A 应该只能查询自己的学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              query Learners($input: ListLearnersInput!) {
                learners(input: $input) {
                  learners {
                    id
                    name
                    customerId
                  }
                  pagination {
                    total
                  }
                }
              }
            `,
            variables: {
              input: { page: 1, limit: 10 },
            },
          })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.learners.pagination.total).toBe(2);

        const learners: ApiLearner[] = response.body.data.learners.learners as ApiLearner[];
        learners.forEach((learner) => {
          expect(learner.customerId).toBe(customerAEntity.id);
        });

        const learnerNames = learners.map((l) => l.name);
        expect(learnerNames).toContain('客户A学员1');
        expect(learnerNames).toContain('客户A学员2');
        expect(learnerNames).not.toContain('客户B学员1');
      });

      it('Customer B 应该只能查询自己的学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerBToken}`)
          .send({
            query: `
              query Learners($input: ListLearnersInput!) {
                learners(input: $input) {
                  learners {
                    id
                    name
                    customerId
                  }
                  pagination {
                    total
                  }
                }
              }
            `,
            variables: {
              input: { page: 1, limit: 10 },
            },
          })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.learners.pagination.total).toBe(1);

        const learners = response.body.data.learners.learners;
        expect(learners[0].customerId).toBe(customerBEntity.id);
        expect(learners[0].name).toBe('客户B学员1');
      });
    });

    describe('更新学员权限', () => {
      let learnerA: LearnerEntity;
      let learnerB: LearnerEntity;

      beforeEach(async () => {
        learnerA = await createTestLearner(
          customerAEntity.id,
          '客户A学员',
          customerAEntity.accountId,
        );
        learnerB = await createTestLearner(
          customerBEntity.id,
          '客户B学员',
          customerBEntity.accountId,
        );
      });

      it('Manager 应该能够更新任意学员', async () => {
        const updateInput = {
          learnerId: learnerA.id,
          customerId: customerAEntity.id,
          name: 'Manager更新的学员名称',
          remark: 'Manager更新的备注',
        };

        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            query: `
              mutation UpdateLearner($input: UpdateLearnerInput!) {
                updateLearner(input: $input) {
                  id
                  name
                  remark
                }
              }
            `,
            variables: { input: updateInput },
          })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.updateLearner.name).toBe(updateInput.name);
        expect(response.body.data.updateLearner.remark).toBe(updateInput.remark);
      });

      it('Customer A 应该能够更新自己的学员', async () => {
        const updateInput = {
          learnerId: learnerA.id,
          name: '客户A更新的学员名称',
          remark: '客户A更新的备注',
        };

        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation UpdateLearner($input: UpdateLearnerInput!) {
                updateLearner(input: $input) {
                  id
                  name
                  remark
                }
              }
            `,
            variables: { input: updateInput },
          })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.updateLearner.name).toBe(updateInput.name);
      });

      it('Customer A 不应该能够更新 Customer B 的学员', async () => {
        const updateInput = {
          learnerId: learnerB.id,
          name: '尝试跨客户更新',
          remark: '这应该失败',
        };

        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation UpdateLearner($input: UpdateLearnerInput!) {
                updateLearner(input: $input) {
                  id
                  name
                }
              }
            `,
            variables: { input: updateInput },
          });

        expect(response.body.errors).toBeDefined();
        expect(response.body.errors[0].message).toContain('无权限访问该学员');
      });

      it('Customer B 不应该能够更新 Customer A 的学员', async () => {
        const updateInput = {
          learnerId: learnerA.id,
          name: '尝试跨客户更新',
          remark: '这应该失败',
        };

        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerBToken}`)
          .send({
            query: `
              mutation UpdateLearner($input: UpdateLearnerInput!) {
                updateLearner(input: $input) {
                  id
                  name
                }
              }
            `,
            variables: { input: updateInput },
          });

        expect(response.body.errors).toBeDefined();
        expect(response.body.errors[0].message).toContain('无权限访问该学员');
      });
    });

    describe('删除学员权限', () => {
      let learnerA: LearnerEntity;
      let learnerB: LearnerEntity;

      beforeEach(async () => {
        learnerA = await createTestLearner(
          customerAEntity.id,
          '客户A学员',
          customerAEntity.accountId,
        );
        learnerB = await createTestLearner(
          customerBEntity.id,
          '客户B学员',
          customerBEntity.accountId,
        );
      });

      it('Manager 应该能够删除任意学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            query: `
              mutation DeleteLearner($input: DeleteLearnerInput!) {
                deleteLearner(input: $input)
              }
            `,
            variables: {
              input: { learnerId: learnerA.id, customerId: customerAEntity.id },
            },
          })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.deleteLearner).toBe(true);

        // 验证软删除
        const learnerRepo = dataSource.getRepository(LearnerEntity);
        const deletedLearner = await learnerRepo.findOne({ where: { id: learnerA.id } });
        expect(deletedLearner?.deactivatedAt).toBeDefined();
      });

      it('Customer A 应该能够删除自己的学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation DeleteLearner($input: DeleteLearnerInput!) {
                deleteLearner(input: $input)
              }
            `,
            variables: {
              input: { learnerId: learnerA.id },
            },
          })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.deleteLearner).toBe(true);
      });

      it('Customer A 不应该能够删除 Customer B 的学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation DeleteLearner($input: DeleteLearnerInput!) {
                deleteLearner(input: $input)
              }
            `,
            variables: {
              input: { learnerId: learnerB.id },
            },
          });

        expect(response.body.errors).toBeDefined();
        expect(response.body.errors[0].message).toContain('无权限访问该学员');
      });
    });
  });

  describe('业务场景测试', () => {
    describe('数据隔离验证', () => {
      beforeEach(async () => {
        // 创建复杂的测试数据
        await createTestLearner(customerAEntity.id, '客户A学员1', customerAEntity.accountId);
        await createTestLearner(customerAEntity.id, '客户A学员2', customerAEntity.accountId);
        await createTestLearner(customerBEntity.id, '客户B学员1', customerBEntity.accountId);
        await createTestLearner(customerBEntity.id, '客户B学员2', customerBEntity.accountId);
        await createTestLearner(customerBEntity.id, '客户B学员3', customerBEntity.accountId);
      });

      it('分页查询应该正确隔离不同客户的数据', async () => {
        // Customer A 查询第一页
        const responseA = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              query Learners($input: ListLearnersInput!) {
                learners(input: $input) {
                  learners {
                    id
                    name
                    customerId
                  }
                  pagination {
                    total
                    page
                    limit
                  }
                }
              }
            `,
            variables: {
              input: { page: 1, limit: 1 },
            },
          })
          .expect(200);

        expect(responseA.body.data.learners.pagination.total).toBe(2);
        expect(responseA.body.data.learners.learners).toHaveLength(1);
        expect(responseA.body.data.learners.learners[0].customerId).toBe(customerAEntity.id);

        // Customer B 查询所有
        const responseB = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerBToken}`)
          .send({
            query: `
              query Learners($input: ListLearnersInput!) {
                learners(input: $input) {
                  learners {
                    id
                    name
                    customerId
                  }
                  pagination {
                    total
                  }
                }
              }
            `,
            variables: {
              input: { page: 1, limit: 10 },
            },
          })
          .expect(200);

        expect(responseB.body.data.learners.pagination.total).toBe(3);
        responseB.body.data.learners.learners.forEach((learner: any) => {
          expect(learner.customerId).toBe(customerBEntity.id);
        });
      });

      it('Manager 查询应该看到所有客户的学员', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            query: `
              query Learners($input: ListLearnersInput!) {
                learners(input: $input) {
                  learners {
                    id
                    name
                    customerId
                  }
                  pagination {
                    total
                  }
                }
              }
            `,
            variables: {
              input: { page: 1, limit: 10 },
            },
          })
          .expect(200);

        expect(response.body.data.learners.pagination.total).toBe(5);

        const allLearners2: ApiLearner[] = response.body.data.learners.learners as ApiLearner[];
        const customerIds = allLearners2.map((l) => l.customerId);
        expect(customerIds).toContain(customerAEntity.id);
        expect(customerIds).toContain(customerBEntity.id);
      });
    });

    describe('并发操作测试', () => {
      let testLearner: LearnerEntity;

      beforeEach(async () => {
        testLearner = await createTestLearner(
          customerAEntity.id,
          '并发测试学员',
          customerAEntity.accountId,
        );
      });

      it('并发更新同一学员应该保持数据一致性', async () => {
        const updatePromises = [
          request(app.getHttpServer())
            .post('/graphql')
            .set('Authorization', `Bearer ${customerAToken}`)
            .send({
              query: `
                mutation UpdateLearner($input: UpdateLearnerInput!) {
                  updateLearner(input: $input) {
                    id
                    name
                    remark
                  }
                }
              `,
              variables: {
                input: {
                  learnerId: testLearner.id,
                  name: '并发更新1',
                  remark: '第一次更新',
                },
              },
            }),
          request(app.getHttpServer())
            .post('/graphql')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({
              query: `
                mutation UpdateLearner($input: UpdateLearnerInput!) {
                  updateLearner(input: $input) {
                    id
                    name
                    remark
                  }
                }
              `,
              variables: {
                input: {
                  learnerId: testLearner.id,
                  customerId: customerAEntity.id,
                  name: '并发更新2',
                  remark: '第二次更新',
                },
              },
            }),
        ];

        const results = await Promise.all(updatePromises);

        // 两个请求都应该成功
        results.forEach((result) => {
          expect(result.status).toBe(200);
          expect(result.body.errors).toBeUndefined();
        });

        // 验证最终数据状态
        const learnerRepo = dataSource.getRepository(LearnerEntity);
        const finalLearner = await learnerRepo.findOne({ where: { id: testLearner.id } });
        expect(finalLearner).toBeDefined();
        expect(['并发更新1', '并发更新2']).toContain(finalLearner?.name);
      });
    });
  });

  describe('边界情况和异常场景', () => {
    describe('数据验证测试', () => {
      it('创建学员时应该验证必填字段', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
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
                // 缺少必填的 name 字段
                gender: Gender.MALE,
              },
            },
          });

        expect(response.body.errors).toBeDefined();
      });

      it('更新不存在的学员应该返回错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation UpdateLearner($input: UpdateLearnerInput!) {
                updateLearner(input: $input) {
                  id
                  name
                }
              }
            `,
            variables: {
              input: {
                learnerId: 99999, // 不存在的学员 ID
                name: '更新不存在的学员',
              },
            },
          });

        expect(response.body.errors).toBeDefined();
        expect(response.body.errors[0].message).toContain('学员不存在');
      });

      it('删除不存在的学员应该返回错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation DeleteLearner($input: DeleteLearnerInput!) {
                deleteLearner(input: $input)
              }
            `,
            variables: {
              input: {
                learnerId: 99999, // 不存在的学员 ID
              },
            },
          });

        expect(response.body.errors).toBeDefined();
        expect(response.body.errors[0].message).toContain('学员不存在');
      });
    });

    describe('幂等性测试', () => {
      let testLearner: LearnerEntity;

      beforeEach(async () => {
        testLearner = await createTestLearner(
          customerAEntity.id,
          '幂等性测试学员',
          customerAEntity.accountId,
        );
      });

      it('重复删除同一学员应该保持幂等性', async () => {
        // 第一次删除
        const firstDelete = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation DeleteLearner($input: DeleteLearnerInput!) {
                deleteLearner(input: $input)
              }
            `,
            variables: {
              input: { learnerId: testLearner.id },
            },
          })
          .expect(200);

        expect(firstDelete.body.data.deleteLearner).toBe(true);

        // 第二次删除同一学员
        const secondDelete = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            query: `
              mutation DeleteLearner($input: DeleteLearnerInput!) {
                deleteLearner(input: $input)
              }
            `,
            variables: {
              input: { learnerId: testLearner.id },
            },
          })
          .expect(200);

        // 第二次删除应该仍然返回成功（幂等性）
        expect(secondDelete.body.data.deleteLearner).toBe(true);
      });
    });
  });
});
