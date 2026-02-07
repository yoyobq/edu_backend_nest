import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { CustomerEntity } from '../../src/modules/account/identities/training/customer/account-customer.entity';
import { login, postGql } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('Overdue Customers (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerAccessToken: string;
  let customerAccessToken: string;

  beforeAll(async () => {
    initGraphQLSchema();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource, includeKeys: ['manager', 'customer'] });

    managerAccessToken = await login({
      app,
      loginName: testAccountsConfig.manager.loginName,
      loginPassword: testAccountsConfig.manager.loginPassword,
      type: LoginTypeEnum.PASSWORD,
      audience: AudienceTypeEnum.DESKTOP,
    });

    customerAccessToken = await login({
      app,
      loginName: testAccountsConfig.customer.loginName,
      loginPassword: testAccountsConfig.customer.loginPassword,
      type: LoginTypeEnum.PASSWORD,
      audience: AudienceTypeEnum.DESKTOP,
    });

    const repo = dataSource.getRepository(CustomerEntity);
    await repo.save([
      {
        name: 'OVERDUE_CASE_A',
        accountId: null,
        contactPhone: null,
        preferredContactTime: null,
        remark: null,
        remainingSessions: -2,
        membershipLevel: 1,
      },
      {
        name: 'OVERDUE_CASE_B',
        accountId: null,
        contactPhone: null,
        preferredContactTime: null,
        remark: null,
        remainingSessions: -1,
        membershipLevel: 1,
      },
      {
        name: 'OVERDUE_CASE_C',
        accountId: null,
        contactPhone: null,
        preferredContactTime: null,
        remark: null,
        remainingSessions: 0,
        membershipLevel: 1,
      },
      {
        name: 'OVERDUE_CASE_D',
        accountId: null,
        contactPhone: null,
        preferredContactTime: null,
        remark: null,
        remainingSessions: 3,
        membershipLevel: 1,
      },
    ] as Partial<CustomerEntity>[]);
  }, 60000);

  afterAll(async () => {
    await cleanupTestAccounts(dataSource);
    if (app) await app.close();
  });

  it('manager 查询欠费客户列表应按欠费升序返回', async () => {
    const query = `
      query OverdueCustomers($input: ListOverdueCustomersInput!) {
        overdueCustomers(input: $input) {
          customers { id name remainingSessions }
          pagination { page limit total totalPages }
        }
      }
    `;

    const resp = await postGql({
      app,
      query,
      token: managerAccessToken,
      variables: { input: { page: 1, limit: 10 } },
    }).expect(200);

    if (resp.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(resp.body.errors)}`);

    const customers = resp.body.data.overdueCustomers.customers as Array<{
      name: string;
      remainingSessions: number;
    }>;
    const remainingList = customers.map((c) => Number(c.remainingSessions));

    expect(remainingList.every((v) => v <= 0)).toBe(true);
    expect(remainingList).toEqual([...remainingList].sort((a, b) => a - b));
  });

  it('非 manager 查询欠费客户列表应失败', async () => {
    const query = `
      query OverdueCustomers($input: ListOverdueCustomersInput!) {
        overdueCustomers(input: $input) {
          customers { id name remainingSessions }
          pagination { page limit total totalPages }
        }
      }
    `;

    const resp = await postGql({
      app,
      query,
      token: customerAccessToken,
      variables: { input: { page: 1, limit: 10 } },
    }).expect(200);

    expect(resp.body.errors).toBeDefined();
  });
});
