// 文件位置：test/08-integration-events/session-adjustments.e2e-spec.ts
import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  LoginTypeEnum,
} from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { CustomerService } from '../../src/modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '../../src/modules/account/identities/training/manager/manager.service';
import { SessionAdjustmentReasonType } from '../../src/modules/payout/session-adjustments/payout-session-adjustment.entity';
import { PayoutSessionAdjustmentsService } from '../../src/modules/payout/session-adjustments/payout-session-adjustments.service';
import { CreateAccountUsecase } from '../../src/usecases/account/create-account.usecase';
import { DeactivateManagerUsecase } from '../../src/usecases/identity-management/manager/deactivate-manager.usecase';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('Session Adjustments Search (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerToken: string;
  let customerToken: string;
  let coachToken: string;
  let learnerToken: string;
  let adjustmentsService: PayoutSessionAdjustmentsService;
  let customerId: number;
  let anotherCustomerId: number;
  let managerAccountId: number;
  let inactiveManagerToken: string;
  let inactiveManagerAccountId: number;
  let inactiveManagerId: number;
  let customerUnboundToken: string;

  beforeAll(async () => {
    initGraphQLSchema();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    adjustmentsService = moduleFixture.get<PayoutSessionAdjustmentsService>(
      PayoutSessionAdjustmentsService,
    );
    const customerService = moduleFixture.get<CustomerService>(CustomerService);

    await cleanupTestAccounts(dataSource);
    const createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase,
      includeKeys: ['manager', 'customer', 'coach', 'learner', 'guest'],
    });

    managerToken = await loginAndGetToken(
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );
    customerToken = await loginAndGetToken(
      testAccountsConfig.customer.loginName,
      testAccountsConfig.customer.loginPassword,
    );
    coachToken = await loginAndGetToken(
      testAccountsConfig.coach.loginName,
      testAccountsConfig.coach.loginPassword,
    );
    learnerToken = await loginAndGetToken(
      testAccountsConfig.learner.loginName,
      testAccountsConfig.learner.loginPassword,
    );

    customerId = await getCurrentCustomerId(app, customerToken);
    managerAccountId = await getCurrentAccountId(app, managerToken);

    const offlineCustomer = await customerService.saveCustomer(
      customerService.createCustomerEntity({
        accountId: null,
        name: 'E2E 客户 B',
        contactPhone: '13900000000',
        preferredContactTime: '晚间',
        membershipLevel: 1,
        remark: 'E2E 离线客户',
      }),
    );
    anotherCustomerId = offlineCustomer.id;
    const createdM2 = await createAccountUsecase.execute({
      accountData: {
        loginName: 'testmanager2',
        loginEmail: 'manager2@example.com',
        loginPassword: 'testManager2@2024',
        status: AccountStatus.ACTIVE,
        identityHint: IdentityTypeEnum.MANAGER,
      },
      userInfoData: {
        nickname: 'm2_nick',
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        email: 'manager2@example.com',
        signature: null,
        accessGroup: [IdentityTypeEnum.MANAGER],
        metaDigest: [IdentityTypeEnum.MANAGER],
        address: null,
        phone: null,
        tags: null,
        geographic: null,
        notifyCount: 0,
        unreadCount: 0,
        userState: UserState.ACTIVE,
      },
    });

    const managerSvc = moduleFixture.get(ManagerService);
    const { manager: m2Entity } = await managerSvc.createManager({
      accountId: createdM2.id,
      name: 'm2_nick',
      remark: 'E2E 辅助 manager',
      createdBy: null,
    });
    inactiveManagerId = m2Entity.id;
    inactiveManagerAccountId = createdM2.id;
    inactiveManagerToken = await loginAndGetToken('testmanager2', 'testManager2@2024');

    // 额外造一个 accessGroup 含 CUSTOMER 但不创建 CustomerEntity 的账号
    await createAccountUsecase.execute({
      accountData: {
        loginName: 'customer_unbound',
        loginEmail: 'customer-unbound@example.com',
        loginPassword: 'testCustomerUnbound@2024',
        status: AccountStatus.ACTIVE,
        identityHint: IdentityTypeEnum.CUSTOMER,
      },
      userInfoData: {
        nickname: 'customer_unbound_nick',
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        email: 'customer-unbound@example.com',
        signature: null,
        accessGroup: [IdentityTypeEnum.CUSTOMER],
        metaDigest: [IdentityTypeEnum.CUSTOMER],
        address: null,
        phone: null,
        tags: null,
        geographic: null,
        notifyCount: 0,
        unreadCount: 0,
        userState: UserState.ACTIVE,
      },
    });
    customerUnboundToken = await loginAndGetToken('customer_unbound', 'testCustomerUnbound@2024');

    // 造 6 条日志（两位不同客户，含 orderRef 与不同 reasonType）
    await adjustmentsService.appendAdjustment({
      customerId,
      deltaSessions: 1.234,
      beforeSessions: 10,
      afterSessions: 11.234,
      reasonType: SessionAdjustmentReasonType.PURCHASE,
      reasonNote: '购买课次',
      operatorAccountId: null,
      orderRef: 'ORDER-AAA-001',
    });
    await adjustmentsService.appendAdjustment({
      customerId,
      deltaSessions: -0.5,
      beforeSessions: 11.234,
      afterSessions: 10.734,
      reasonType: SessionAdjustmentReasonType.CORRECTION,
      reasonNote: '修正',
      operatorAccountId: null,
      orderRef: 'ORDER-BBB-002',
    });
    await adjustmentsService.appendAdjustment({
      customerId,
      deltaSessions: 3,
      beforeSessions: 10.734,
      afterSessions: 13.734,
      reasonType: SessionAdjustmentReasonType.GIFT,
      reasonNote: '赠送',
      operatorAccountId: null,
      orderRef: 'PROMO-CCC-003',
    });
    await adjustmentsService.appendAdjustment({
      customerId: anotherCustomerId,
      deltaSessions: 2,
      beforeSessions: 20,
      afterSessions: 22,
      reasonType: SessionAdjustmentReasonType.GIFT,
      reasonNote: '他人客户 - 赠送',
      operatorAccountId: managerAccountId,
      orderRef: 'WX-2025-0001',
    });
    await adjustmentsService.appendAdjustment({
      customerId: anotherCustomerId,
      deltaSessions: -1,
      beforeSessions: 22,
      afterSessions: 21,
      reasonType: SessionAdjustmentReasonType.CORRECTION,
      reasonNote: '他人客户 - 修正',
      operatorAccountId: managerAccountId,
      orderRef: 'WX-2025-0002',
    });
    await adjustmentsService.appendAdjustment({
      customerId: anotherCustomerId,
      deltaSessions: 5.5,
      beforeSessions: 21,
      afterSessions: 26.5,
      reasonType: SessionAdjustmentReasonType.PURCHASE,
      reasonNote: '他人客户 - 购买课次',
      operatorAccountId: managerAccountId,
      orderRef: 'WX-2025-0003',
    });
  });

  afterAll(async () => {
    await cleanupTestAccounts(dataSource);
    if (app) await app.close();
  });

  describe('正例', () => {
    it('MANAGER 正常查询，返回可包含不同 customerId 的记录', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) {
            items { id customerId orderRef }
            page pageSize total
          }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: { input: { pagination: { mode: 'OFFSET', page: 1, pageSize: 50 } } },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.searchSessionAdjustments.items as Array<{ customerId: number }>;
      const customerIds = Array.from(new Set(items.map((x) => x.customerId)));
      expect(customerIds.length).toBeGreaterThan(1);
    });

    it('客户身份只能看到自己的调整记录', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) {
            items { id customerId deltaSessions reasonType orderRef }
            page pageSize total
          }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          query,
          variables: {
            input: {
              pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
              sorts: [{ field: 'createdAt', direction: 'DESC' }],
            },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.searchSessionAdjustments.items;
      expect(Array.isArray(items)).toBe(true);
      if (items.length > 0) {
        expect(items.every((x: any) => x.customerId === customerId)).toBe(true);
      }
    });

    it('Customer 恶意传入别人 customerId 也只能看到自己的', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { customerId } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          query,
          variables: {
            input: {
              customerId: anotherCustomerId,
              pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
            },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.searchSessionAdjustments.items;
      expect(items.every((x: any) => x.customerId === customerId)).toBe(true);
    });

    it('支持文本搜索 orderRef 与 reasonType', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { orderRef reasonType } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: { query: 'promo', pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.searchSessionAdjustments.items;
      expect(items.some((x: any) => String(x.orderRef).toLowerCase().includes('promo'))).toBe(true);
    });

    it('支持精确过滤 orderRef 与排序 orderRef', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { orderRef } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: {
              orderRef: 'ORDER-AAA-001',
              pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
              sorts: [{ field: 'orderRef', direction: 'ASC' }],
            },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.searchSessionAdjustments.items;
      expect(items.every((x: any) => x.orderRef === 'ORDER-AAA-001')).toBe(true);
    });

    it('orderRef 输入包含空格应被清理并正常过滤', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { orderRef } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: {
              orderRef: '   ORDER-AAA-001   ',
              pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
              sorts: [{ field: 'orderRef', direction: 'ASC' }],
            },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.searchSessionAdjustments.items as Array<{ orderRef: string }>;
      expect(items.every((x) => x.orderRef === 'ORDER-AAA-001')).toBe(true);
    });

    it('CURSOR 模式：当未提供游标字符串时不抛错', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id } pageInfo { hasNext nextCursor } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: { input: { pagination: { mode: 'CURSOR', limit: 2 } } },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const pageInfo = res.body.data.searchSessionAdjustments.pageInfo;
      expect(pageInfo).toBeDefined();
    });

    it('reasonType 非法枚举被丢弃；合法值生效', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { reasonType } }
        }`;
      const bad = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: { reasonType: 'FOO', pagination: { mode: 'OFFSET', page: 1, pageSize: 50 } },
          },
        })
        .expect(200);
      expect(bad.body.errors).toBeUndefined();

      const good = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: { reasonType: 'GIFT', pagination: { mode: 'OFFSET', page: 1, pageSize: 50 } },
          },
        })
        .expect(200);
      expect(good.body.errors).toBeUndefined();
      const items = good.body.data.searchSessionAdjustments.items;
      expect(items.every((x: any) => x.reasonType === 'GIFT')).toBe(true);
    });

    it('Manager 按 customerId 精确筛选', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { customerId } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: { customerId, pagination: { mode: 'OFFSET', page: 1, pageSize: 50 } },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.searchSessionAdjustments.items;
      expect(items.every((x: any) => x.customerId === customerId)).toBe(true);
    });

    it('Customer 叠加 reasonType 过滤仅返回自己名下匹配记录', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { customerId reasonType } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          query,
          variables: {
            input: { reasonType: 'GIFT', pagination: { mode: 'OFFSET', page: 1, pageSize: 50 } },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const items = res.body.data.searchSessionAdjustments.items as any[];
      if (items.length > 0) {
        expect(items.every((x) => x.customerId === customerId && x.reasonType === 'GIFT')).toBe(
          true,
        );
      }
    });

    it('OFFSET 模式不解析 cursor（不抛错）', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: { input: { pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } } },
        })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
    });

    it('CURSOR 模式 + 有效 after（烟雾测试）', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id } pageInfo { nextCursor hasNext } }
        }`;
      const first = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ query, variables: { input: { pagination: { mode: 'CURSOR', limit: 2 } } } })
        .expect(200);
      expect(first.body.errors).toBeUndefined();
      const cursor = first.body.data.searchSessionAdjustments.pageInfo?.nextCursor as
        | string
        | undefined;
      const second = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: { input: { pagination: { mode: 'CURSOR', limit: 2, after: cursor } } },
        })
        .expect(200);
      expect(second.body.errors).toBeUndefined();
    });
  });

  describe('负例', () => {
    it('未登录访问 searchSessionAdjustments 返回 200 且包含错误', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id customerId deltaSessions orderRef } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query,
          variables: { input: { pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } } },
        })
        .expect(200);
      expect(res.body.errors).toBeDefined();
    });

    it('非活跃 MANAGER 被拒绝', async () => {
      const deactivate = app.get(DeactivateManagerUsecase);
      const result = await deactivate.execute(inactiveManagerAccountId, { id: inactiveManagerId });
      expect(result.isUpdated || result.manager.deactivatedAt).toBeTruthy();

      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${inactiveManagerToken}`)
        .send({
          query,
          variables: { input: { pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } } },
        })
        .expect(200);
      expect(res.body.errors).toBeDefined();
      const msg = res.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/仅活跃的 manager 可访问|ACCESS_DENIED/);
    });

    it('纯 COACH / 纯 LEARNER / guest 调用被拒绝', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id } }
        }`;
      const coachRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${coachToken}`)
        .send({
          query,
          variables: { input: { pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } } },
        })
        .expect(200);
      expect(coachRes.body.errors).toBeDefined();
      const learnerRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          query,
          variables: { input: { pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } } },
        })
        .expect(200);
      expect(learnerRes.body.errors).toBeDefined();
    });

    it('Customer 账号但未绑定 CustomerEntity 被拒绝', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerUnboundToken}`)
        .send({
          query,
          variables: { input: { pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } } },
        })
        .expect(200);
      expect(res.body.errors).toBeDefined();
      const msg = res.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/未绑定客户身份|ACCESS_DENIED/);
    });

    it('orderRef 超长应触发输入验证错误', async () => {
      const tooLong = 'A'.repeat(65);
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: { orderRef: tooLong, pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeDefined();
    });

    it('非法 customerId 触发输入验证错误', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id customerId } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: {
              customerId: -1,
              pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
            },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeDefined();
      const msg = res.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/customerId must not be less than 1/);
    });

    it('operatorAccountId 非法触发输入验证；合法生效', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { operatorAccountId } }
        }`;
      const bad = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: { operatorAccountId: 0, pagination: { mode: 'OFFSET', page: 1, pageSize: 10 } },
          },
        })
        .expect(200);
      expect(bad.body.errors).toBeDefined();
      const badMsg = bad.body.errors?.[0]?.message ?? '';
      expect(badMsg).toMatch(/operatorAccountId must not be less than 1/);

      const good = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: {
              operatorAccountId: managerAccountId,
              pagination: { mode: 'OFFSET', page: 1, pageSize: 10 },
            },
          },
        })
        .expect(200);
      expect(good.body.errors).toBeUndefined();
      const items = good.body.data.searchSessionAdjustments.items;
      expect(items.every((x: any) => x.operatorAccountId === managerAccountId)).toBe(true);
    });

    it('非法游标字符串触发 INVALID_CURSOR', async () => {
      const query = `
        query Search($input: SearchSessionAdjustmentsInputGql!) {
          searchSessionAdjustments(input: $input) { items { id } }
        }`;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query,
          variables: {
            input: { pagination: { mode: 'CURSOR', limit: 2, after: 'obviously-broken-token' } },
          },
        })
        .expect(200);
      expect(res.body.errors).toBeDefined();
      const msg = res.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/无效的游标字符串|INVALID_CURSOR/);
    });
  });

  describe('创建与更新（e2e）', () => {
    describe('正例', () => {
      it('MANAGER 创建课次调整记录成功', async () => {
        const mutation = `
          mutation Create($input: CreateSessionAdjustmentInputGql!) {
            createSessionAdjustment(input: $input) {
              id
              customerId
              deltaSessions
              beforeSessions
              afterSessions
              reasonType
              reasonNote
              operatorAccountId
              orderRef
            }
          }`;
        const variables = {
          input: {
            customerId,
            deltaSessions: 1.5,
            beforeSessions: 8,
            afterSessions: 9.5,
            reasonType: SessionAdjustmentReasonType.PURCHASE,
            reasonNote: 'E2E 创建',
            orderRef: 'E2E-ORDER-001',
          },
        };
        const res = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ query: mutation, variables })
          .expect(200);
        const body = res.body as {
          data?: {
            createSessionAdjustment?: {
              id: number;
              customerId: number;
              deltaSessions: string;
              beforeSessions: string;
              afterSessions: string;
              reasonType: string;
              reasonNote: string | null;
              operatorAccountId: number | null;
              orderRef: string | null;
            };
          };
          errors?: unknown;
        };
        if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
        const created = body.data?.createSessionAdjustment;
        expect(created).toBeDefined();
        expect(created?.customerId).toBe(customerId);
        expect(Number(created?.deltaSessions ?? 0)).toBeCloseTo(1.5, 6);
        expect(Number(created?.beforeSessions ?? 0)).toBeCloseTo(8, 6);
        expect(Number(created?.afterSessions ?? 0)).toBeCloseTo(9.5, 6);
        expect(created?.reasonType).toBe(SessionAdjustmentReasonType.PURCHASE);
        expect(created?.reasonNote).toBe('E2E 创建');
        expect(created?.orderRef).toBe('E2E-ORDER-001');
        const operatorId = created?.operatorAccountId ?? null;
        expect([managerAccountId, null]).toContain(operatorId);
      });

      it('MANAGER 更新课次调整记录成功', async () => {
        const createMutation = `
          mutation Create($input: CreateSessionAdjustmentInputGql!) {
            createSessionAdjustment(input: $input) { id }
          }`;
        const createVariables = {
          input: {
            customerId,
            deltaSessions: 1,
            beforeSessions: 5,
            afterSessions: 6,
            reasonType: SessionAdjustmentReasonType.GIFT,
            reasonNote: 'E2E 更新前',
          },
        };
        const createRes = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ query: createMutation, variables: createVariables })
          .expect(200);
        const createBody = createRes.body as {
          data?: { createSessionAdjustment?: { id: number } };
          errors?: unknown;
        };
        if (createBody.errors)
          throw new Error(`GraphQL 错误: ${JSON.stringify(createBody.errors)}`);
        const createdId = createBody.data?.createSessionAdjustment?.id ?? 0;
        expect(createdId).toBeGreaterThan(0);

        const updateMutation = `
          mutation Update($input: UpdateSessionAdjustmentInputGql!) {
            updateSessionAdjustment(input: $input) {
              id
              deltaSessions
              reasonType
              reasonNote
              orderRef
            }
          }`;
        const updateVariables = {
          input: {
            id: createdId,
            deltaSessions: 2.5,
            reasonType: SessionAdjustmentReasonType.CORRECTION,
            reasonNote: 'E2E 更新后',
            orderRef: 'E2E-ORDER-002',
          },
        };
        const updateRes = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ query: updateMutation, variables: updateVariables })
          .expect(200);
        const updateBody = updateRes.body as {
          data?: {
            updateSessionAdjustment?: {
              id: number;
              deltaSessions: string;
              reasonType: string;
              reasonNote: string | null;
              orderRef: string | null;
            };
          };
          errors?: unknown;
        };
        if (updateBody.errors)
          throw new Error(`GraphQL 错误: ${JSON.stringify(updateBody.errors)}`);
        const updated = updateBody.data?.updateSessionAdjustment;
        expect(updated?.id).toBe(createdId);
        expect(Number(updated?.deltaSessions ?? 0)).toBeCloseTo(2.5, 6);
        expect(updated?.reasonType).toBe(SessionAdjustmentReasonType.CORRECTION);
        expect(updated?.reasonNote).toBe('E2E 更新后');
        expect(updated?.orderRef).toBe('E2E-ORDER-002');
      });
    });

    describe('负例', () => {
      it('CUSTOMER 创建课次调整记录被拒绝', async () => {
        const mutation = `
          mutation Create($input: CreateSessionAdjustmentInputGql!) {
            createSessionAdjustment(input: $input) { id }
          }`;
        const variables = {
          input: {
            customerId,
            deltaSessions: 1,
            beforeSessions: 10,
            afterSessions: 11,
            reasonType: SessionAdjustmentReasonType.PURCHASE,
            reasonNote: 'E2E 拒绝',
          },
        };
        const res = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ query: mutation, variables })
          .expect(200);
        expect(res.body.errors).toBeDefined();
        const msg = res.body.errors?.[0]?.message ?? '';
        expect(msg).toMatch(/无权创建课次调整记录|ACCESS_DENIED/);
      });

      it('CUSTOMER 更新课次调整记录被拒绝', async () => {
        const createMutation = `
          mutation Create($input: CreateSessionAdjustmentInputGql!) {
            createSessionAdjustment(input: $input) { id }
          }`;
        const createVariables = {
          input: {
            customerId,
            deltaSessions: 1,
            beforeSessions: 3,
            afterSessions: 4,
            reasonType: SessionAdjustmentReasonType.GIFT,
          },
        };
        const createRes = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ query: createMutation, variables: createVariables })
          .expect(200);
        const createBody = createRes.body as {
          data?: { createSessionAdjustment?: { id: number } };
          errors?: unknown;
        };
        if (createBody.errors)
          throw new Error(`GraphQL 错误: ${JSON.stringify(createBody.errors)}`);
        const createdId = createBody.data?.createSessionAdjustment?.id ?? 0;
        expect(createdId).toBeGreaterThan(0);

        const updateMutation = `
          mutation Update($input: UpdateSessionAdjustmentInputGql!) {
            updateSessionAdjustment(input: $input) { id }
          }`;
        const updateVariables = {
          input: {
            id: createdId,
            reasonNote: 'E2E customer 更新',
          },
        };
        const updateRes = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ query: updateMutation, variables: updateVariables })
          .expect(200);
        expect(updateRes.body.errors).toBeDefined();
        const msg = updateRes.body.errors?.[0]?.message ?? '';
        expect(msg).toMatch(/无权更新课次调整记录|ACCESS_DENIED/);
      });
    });
  });

  const loginAndGetToken = async (loginName: string, loginPassword: string): Promise<string> => {
    const resp = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) { accessToken }
          }`,
        variables: {
          input: {
            loginName,
            loginPassword,
            type: LoginTypeEnum.PASSWORD,
            audience: AudienceTypeEnum.DESKTOP,
          },
        },
      })
      .expect(200);
    if (resp.body.errors) throw new Error(`登录失败: ${JSON.stringify(resp.body.errors)}`);
    return resp.body.data.login.accessToken as string;
  };

  const getCurrentCustomerId = async (app: INestApplication, token: string): Promise<number> => {
    const resp = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) { identity { ... on CustomerType { id } } }
          }`,
        variables: {
          input: {
            loginName: testAccountsConfig.customer.loginName,
            loginPassword: testAccountsConfig.customer.loginPassword,
            type: LoginTypeEnum.PASSWORD,
            audience: AudienceTypeEnum.DESKTOP,
          },
        },
      })
      .expect(200);
    if (resp.body.errors) throw new Error(`读取客户身份失败: ${JSON.stringify(resp.body.errors)}`);
    return resp.body.data.login.identity.id as number;
  };

  const getCurrentAccountId = async (app: INestApplication, token: string): Promise<number> => {
    const resp = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) { accountId }
          }`,
        variables: {
          input: {
            loginName: testAccountsConfig.manager.loginName,
            loginPassword: testAccountsConfig.manager.loginPassword,
            type: LoginTypeEnum.PASSWORD,
            audience: AudienceTypeEnum.DESKTOP,
          },
        },
      })
      .expect(200);
    if (resp.body.errors) throw new Error(`读取账户 ID 失败: ${JSON.stringify(resp.body.errors)}`);
    return resp.body.data.login.accountId as number;
  };
});
