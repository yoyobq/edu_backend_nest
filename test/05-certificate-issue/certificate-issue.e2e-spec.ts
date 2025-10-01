// test/05-certificate-issue/certificate-issue.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { MembershipLevel } from '@app-types/models/training.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { AppModule } from '@src/app.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { VerificationRecordEntity } from '@src/modules/verification-record/verification-record.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';

/**
 * 证书验证码签发 E2E 测试
 * - Manager 签发验证码（token）
 * - 外部验证（无需登录）
 * - 学员消费（需登录、并且 targetAccountId 匹配）
 */
describe('证书验证码签发 E2E 测试', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 测试数据
  let managerAccessToken: string;
  const learnerAccountIds: number[] = [];
  const learnerEntities: LearnerEntity[] = [];

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);

    await createTestAccounts();

    // 获取 manager 的访问令牌
    managerAccessToken = await getAccessToken('manager@test.com', 'password123');
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  /**
   * 创建测试账户
   */
  async function createTestAccounts(): Promise<void> {
    // 创建 Manager 用户
    const createdManagerAccount = await createAccountUsecase.execute({
      accountData: {
        loginName: 'manager_test',
        loginEmail: 'manager@test.com',
        loginPassword: 'password123',
        status: AccountStatus.ACTIVE,
        identityHint: IdentityTypeEnum.MANAGER,
      },
      userInfoData: {
        nickname: 'manager_test_nickname',
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        email: 'manager@test.com',
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
      name: 'manager_test_name',
      deactivatedAt: null,
      remark: '测试用 manager 身份记录',
      createdBy: null,
      updatedBy: null,
    });
    await managerRepository.save(managerEntity);

    // 创建 Customer 用户
    const createdCustomerAccount = await createAccountUsecase.execute({
      accountData: {
        loginName: 'customer_test',
        loginEmail: 'customer@test.com',
        loginPassword: 'password123',
        status: AccountStatus.ACTIVE,
        identityHint: IdentityTypeEnum.CUSTOMER,
      },
      userInfoData: {
        nickname: 'customer_test_nickname',
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        email: 'customer@test.com',
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
      name: 'customer_test_name',
      contactPhone: '13800138000',
      preferredContactTime: '09:00-18:00',
      membershipLevel: MembershipLevel.NORMAL,
      deactivatedAt: null,
      remark: '测试用 customer 身份记录',
      createdBy: null,
      updatedBy: null,
    });
    await customerRepository.save(customerEntity);

    // 创建 Learner 用户
    const createdLearnerAccount = await createAccountUsecase.execute({
      accountData: {
        loginName: 'learner_test',
        loginEmail: 'learner@test.com',
        loginPassword: 'password123',
        status: AccountStatus.ACTIVE,
        identityHint: IdentityTypeEnum.LEARNER,
      },
      userInfoData: {
        nickname: 'learner_test_nickname',
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        email: 'learner@test.com',
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
      customerId: customerEntity.id,
      name: 'learner_test_name',
      gender: Gender.SECRET,
      birthDate: null,
      avatarUrl: null,
      specialNeeds: null,
      countPerSession: 1,
      remark: '测试用 learner 身份记录',
      createdBy: null,
      updatedBy: null,
    });
    await learnerRepository.save(learnerEntity);

    // 存储 learner 信息供测试使用
    learnerAccountIds.push(createdLearnerAccount.id);
    learnerEntities.push(learnerEntity);
  }

  /**
   * 清理测试数据
   */
  async function cleanupTestData(): Promise<void> {
    const entities = [
      VerificationRecordEntity,
      LearnerEntity,
      ManagerEntity,
      CustomerEntity,
      UserInfoEntity,
      AccountEntity,
    ];

    for (const entity of entities) {
      await dataSource.getRepository(entity).delete({});
    }
  }

  /**
   * 获取访问令牌
   * @param email 邮箱
   * @param password 密码
   * @returns 访问令牌
   */
  async function getAccessToken(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer() as App)
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
            loginName: email,
            loginPassword: password,
            type: 'PASSWORD',
            audience: 'DESKTOP',
            ip: '127.0.0.1',
          },
        },
      })
      .expect(200);

    if (!response.body.data?.login?.accessToken) {
      throw new Error(`登录失败: ${JSON.stringify(response.body)}`);
    }

    return response.body.data.login.accessToken as string;
  }

  describe('单个验证码签发', () => {
    it('应该成功签发单个验证码', async () => {
      // 重新获取新的访问令牌以确保有效性
      console.log('重新获取 manager 访问令牌...');
      const freshManagerToken = await getAccessToken('manager@test.com', 'password123');
      console.log('新的 manager token 长度:', freshManagerToken.length);
      console.log('新的 manager token 预览:', freshManagerToken.substring(0, 50) + '...');

      // 确保学员账户 ID 不为空
      expect(learnerEntities[0].accountId).not.toBeNull();
      console.log('目标学员账户 ID:', learnerEntities[0].accountId);

      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${freshManagerToken}`)
        .send({
          query: `
            mutation IssueSingleCertificate($input: IssueSingleCertificateInput!) {
              issueSingleCertificate(input: $input) {
                certificates {
                  recordId
                  targetAccountId
                  token
                }
                totalIssued
              }
            }
          `,
          variables: {
            input: {
              certificateType: 'COURSE_COMPLETION_CERTIFICATE', // 使用正确的枚举值
              targetAccountId: learnerEntities[0].accountId,
              title: '课程完成证书', // 必填字段
              issuer: '测试培训机构', // 必填字段
              description: '完成培训课程获得的证书',
              subjectType: 'LEARNER',
              subjectId: learnerEntities[0].id,
              expiresInHours: 8760, // 1年有效期
            },
          },
        })
        .expect(200);

      // 详细的响应日志
      console.log('响应状态:', response.status);
      console.log('完整响应体:', JSON.stringify(response.body, null, 2));

      // 检查错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      // 检查 data 是否存在
      expect(response.body.data).toBeDefined();
      expect(response.body.data).not.toBeNull();

      const result = response.body.data.issueSingleCertificate;
      expect(result).toBeDefined();
      expect(result.certificates).toHaveLength(1);
      expect(result.certificates[0].recordId).toBeDefined();
      expect(result.certificates[0].token).toBeDefined();
      expect(result.certificates[0].targetAccountId).toBe(learnerEntities[0].accountId);
      expect(result.totalIssued).toBe(1);

      // 验证数据库中的验证记录
      const verificationRecordRepository = dataSource.getRepository(VerificationRecordEntity);

      // 确保学员有关联的账户 ID
      expect(learnerEntities[0].accountId).not.toBeNull();

      const record = await verificationRecordRepository.findOne({
        where: {
          targetAccountId: learnerEntities[0].accountId!,
        },
      });

      expect(record).toBeDefined();
      expect(record!.status).toBe('ACTIVE');
    });
    it('应该成功为学员签发课程完成验证码', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation IssueSingleCertificate($input: IssueSingleCertificateInput!) {
              issueSingleCertificate(input: $input) {
                certificates {
                  recordId
                  token
                  targetAccountId
                }
                totalIssued
              }
            }
          `,
          variables: {
            input: {
              // GraphQL 枚举用字符串字面量
              certificateType: 'COURSE_COMPLETION_CERTIFICATE',
              targetAccountId: learnerAccountIds[0],
              subjectType: 'LEARNER',
              subjectId: learnerEntities[0].id,
              title: '课程完成证书',
              description: '恭喜您完成了本课程的学习',
              issuer: '测试培训机构',
              courseId: 1001,
              score: 95,
              grade: 'A',
            },
          },
        });

      // 如果响应不是 200，打印错误信息以便调试
      if (response.status !== 200) {
        console.error('GraphQL 错误响应:', JSON.stringify(response.body, null, 2));
      }

      // 添加更详细的调试信息
      console.log('完整响应:', JSON.stringify(response.body, null, 2));
      console.log('响应状态:', response.status);
      console.log('data 字段:', response.body.data);

      expect(response.status).toBe(200);

      // 先检查 data 是否存在
      expect(response.body.data).toBeDefined();
      expect(response.body.data).not.toBeNull();

      expect(response.body.data.issueSingleCertificate).toBeDefined();
      expect(response.body.data.issueSingleCertificate.certificates).toHaveLength(1);
      expect(response.body.data.issueSingleCertificate.certificates[0].recordId).toBeGreaterThan(0);
      expect(response.body.data.issueSingleCertificate.certificates[0].token).toBeDefined();
      expect(response.body.data.issueSingleCertificate.certificates[0].targetAccountId).toBe(
        learnerAccountIds[0],
      );
      expect(response.body.data.issueSingleCertificate.totalIssued).toBe(1);

      // 验证数据库中的验证记录
      const verificationRecordRepository = dataSource.getRepository(VerificationRecordEntity);
      const record = await verificationRecordRepository.findOne({
        where: { targetAccountId: learnerAccountIds[0] },
      });

      expect(record).toBeDefined();
      expect(record!.status).toBe('ACTIVE'); // 用字符串断言
    });

    it('应该拒绝为不存在的账户签发验证码', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation IssueSingleCertificate($input: IssueSingleCertificateInput!) {
              issueSingleCertificate(input: $input) {
                recordId
                token
                targetAccountId
              }
            }
          `,
          variables: {
            input: {
              certificateType: 'COURSE_COMPLETION_CERTIFICATE',
              targetAccountId: 999999,
              subjectType: 'LEARNER',
              title: '测试证书',
              issuer: '测试机构',
            },
          },
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('账户不存在');
    });
  });

  describe('批量验证码签发', () => {
    it('应该成功为多个学员批量签发培训完成验证码', async () => {
      const targets = learnerAccountIds.map((accountId, index) => ({
        targetAccountId: accountId,
        subjectType: 'LEARNER',
        subjectId: learnerEntities[index].id,
      }));

      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation IssueBatchCertificates($input: IssueBatchCertificatesInput!) {
              issueBatchCertificates(input: $input) {
                certificates {
                  recordId
                  token
                  targetAccountId
                }
                totalIssued
              }
            }
          `,
          variables: {
            input: {
              certificateType: 'TRAINING_CERTIFICATE',
              targets,
              commonPayload: {
                title: '培训完成证书',
                description: '恭喜您完成了培训课程',
                issuer: '测试培训机构',
                courseId: 2001,
              },
            },
          },
        })
        .expect(200);

      // 检查错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data).not.toBeNull();

      const result = response.body.data.issueBatchCertificates;
      expect(result).toBeDefined();
      expect(result.certificates).toHaveLength(learnerAccountIds.length);
      expect(result.totalIssued).toBe(learnerAccountIds.length);

      // 验证每个验证码
      for (let i = 0; i < learnerAccountIds.length; i++) {
        const certificate = result.certificates[i];
        expect(certificate.recordId).toBeGreaterThan(0);
        expect(certificate.token).toBeDefined();
        expect(certificate.targetAccountId).toBe(learnerAccountIds[i]);
      }

      // 验证数据库中的验证记录
      const verificationRecordRepository = dataSource.getRepository(VerificationRecordEntity);
      const records = await verificationRecordRepository.find({
        where: { type: 'TRAINING_CERTIFICATE' as any },
      });

      expect(records).toHaveLength(learnerAccountIds.length);
      records.forEach((record) => {
        expect(record.status).toBe('ACTIVE');
        expect(learnerAccountIds).toContain(record.targetAccountId!);
      });
    });

    it('应该处理部分失败的批量签发', async () => {
      const targets = [
        {
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
        },
        {
          targetAccountId: 999999, // 不存在的账户
          subjectType: 'LEARNER',
          subjectId: 999,
        },
      ];

      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation IssueBatchCertificates($input: IssueBatchCertificatesInput!) {
              issueBatchCertificates(input: $input) {
                recordId
                token
                targetAccountId
              }
            }
          `,
          variables: {
            input: {
              certificateType: 'SKILL_CERTIFICATION',
              targets,
              commonPayload: {
                title: '技能认证证书',
                issuer: '测试认证机构',
              },
            },
          },
        });

      // 应该返回错误，因为包含无效的目标账户
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('验证码验证和消费', () => {
    let testToken: string;
    let testRecordId: number;

    beforeEach(async () => {
      // 先签发一个测试验证码
      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation IssueSingleCertificate($input: IssueSingleCertificateInput!) {
              issueSingleCertificate(input: $input) {
                certificates {
                  recordId
                  token
                  targetAccountId
                }
                totalIssued
              }
            }
          `,
          variables: {
            input: {
              certificateType: 'ACHIEVEMENT_BADGE',
              targetAccountId: learnerAccountIds[0],
              subjectType: 'LEARNER',
              subjectId: learnerEntities[0].id,
              title: '成就徽章',
              issuer: '测试机构',
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.issueSingleCertificate.certificates).toHaveLength(1);
      expect(response.body.data.issueSingleCertificate.certificates[0].recordId).toBeGreaterThan(0);
      expect(response.body.data.issueSingleCertificate.certificates[0].token).toBeDefined();
      expect(response.body.data.issueSingleCertificate.certificates[0].targetAccountId).toBe(
        learnerAccountIds[0],
      );
      expect(response.body.data.issueSingleCertificate.totalIssued).toBe(1);

      testRecordId = response.body.data.issueSingleCertificate.certificates[0].recordId;
      testToken = response.body.data.issueSingleCertificate.certificates[0].token;
    });

    it('应该能够验证有效的验证码', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .send({
          query: `
            query VerifyCertificate($token: String!) {
              verifyCertificate(token: $token) {
                valid
                record {
                  id
                  type
                  status
                  targetAccountId
                }
              }
            }
          `,
          variables: {
            token: testToken,
          },
        })
        .expect(200);

      expect(response.body.data.verifyCertificate.valid).toBe(true);
      expect(response.body.data.verifyCertificate.record.id).toBe(testRecordId);
      expect(response.body.data.verifyCertificate.record.status).toBe('ACTIVE');
    });

    it('应该能够消费验证码', async () => {
      const learnerAccessToken = await getAccessToken('learner1@test.com', 'password123');

      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${learnerAccessToken}`)
        .send({
          query: `
            mutation ConsumeCertificate($token: String!) {
              consumeCertificate(token: $token) {
                success
                message
                record {
                  id
                  status
                  consumedAt
                }
              }
            }
          `,
          variables: {
            token: testToken,
          },
        })
        .expect(200);

      expect(response.body.data.consumeCertificate.success).toBe(true);
      expect(response.body.data.consumeCertificate.record.status).toBe('CONSUMED');
      expect(response.body.data.consumeCertificate.record.consumedAt).toBeDefined();

      // 验证数据库状态
      const verificationRecordRepository = dataSource.getRepository(VerificationRecordEntity);
      const record = await verificationRecordRepository.findOne({
        where: { id: testRecordId },
      });

      expect(record!.status).toBe('CONSUMED');
      expect(record!.consumedAt).toBeDefined();
    });

    it('应该拒绝重复消费已使用的验证码', async () => {
      const learnerAccessToken = await getAccessToken('learner1@test.com', 'password123');

      // 第一次消费
      await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${learnerAccessToken}`)
        .send({
          query: `
            mutation ConsumeCertificate($token: String!) {
              consumeCertificate(token: $token) {
                success
                message
              }
            }
          `,
          variables: {
            token: testToken,
          },
        })
        .expect(200);

      // 第二次消费应该失败（返回 success=false 而不是抛错）
      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${learnerAccessToken}`)
        .send({
          query: `
            mutation ConsumeCertificate($token: String!) {
              consumeCertificate(token: $token) {
                success
                message
              }
            }
          `,
          variables: {
            token: testToken,
          },
        })
        .expect(200);

      expect(response.body.data.consumeCertificate.success).toBe(false);
      expect(response.body.data.consumeCertificate.message).toContain('已被消费');
    });
  });

  describe('错误处理', () => {
    it('应该拒绝无效的证书类型', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation IssueSingleCertificate($input: IssueSingleCertificateInput!) {
              issueSingleCertificate(input: $input) {
                certificates {
                  recordId
                  token
                }
                totalIssued
              }
            }
          `,
          variables: {
            input: {
              certificateType: 'INVALID_TYPE', // 非法枚举
              targetAccountId: learnerAccountIds[0],
              title: '测试证书',
              issuer: '测试机构',
            },
          },
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('无效');
    });

    it('应该拒绝未授权的请求', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/graphql')
        .send({
          query: `
            mutation IssueSingleCertificate($input: IssueSingleCertificateInput!) {
              issueSingleCertificate(input: $input) {
                certificates {
                  recordId
                  token
                }
                totalIssued
              }
            }
          `,
          variables: {
            input: {
              certificateType: 'COURSE_COMPLETION_CERTIFICATE',
              targetAccountId: learnerAccountIds[0],
              title: '测试证书',
              issuer: '测试机构',
            },
          },
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('未授权');
    });
  });
});
