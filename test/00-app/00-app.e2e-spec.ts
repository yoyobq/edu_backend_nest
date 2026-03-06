import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/api/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';

describe('00-App 全局测试', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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

  it('HTTP 服务器应该正常响应根路径', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.text).toBeDefined();
    expect(typeof response.text).toBe('string');
  });

  it('应用应该正常启动并初始化', () => {
    expect(app).toBeDefined();
    expect(app.getHttpServer()).toBeDefined();
  });

  it('数据库连接应该正常建立', () => {
    expect(dataSource).toBeDefined();
    expect(dataSource.isInitialized).toBe(true);
  });

  it('GraphQL 端点应该可访问', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ __typename }' })
      .expect(200);

    expect(response.body).toBeDefined();
  });

  it('应用应该能够正常关闭', () => {
    expect(app).toHaveProperty('close');
    expect(typeof app.close).toBe('function');
  });
});
