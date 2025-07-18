// test/app.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/**
 * GraphQL 响应接口定义
 */
interface GraphQLResponse {
  data?: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __schema?: {
      types: Array<{ name: string }>;
    };
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // 获取数据源用于测试数据管理
    dataSource = moduleFixture.get<DataSource>(DataSource);

    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // 每个测试前清理数据库
    if (dataSource && dataSource.isInitialized) {
      await dataSource.synchronize(true);
    }
  });

  describe('基础功能测试', () => {
    it('/ (GET) - 应该返回 Hello World!', () => {
      return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
    });

    it('/graphql (POST) - 应该支持 GraphQL 查询', () => {
      return request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: '{ __schema { types { name } } }',
        })
        .expect(200)
        .expect((res) => {
          const body = res.body as GraphQLResponse;
          expect(body.data).toBeDefined();
          expect(body.data?.__schema).toBeDefined();
        });
    });
  });

  describe('健康检查', () => {
    it('应用应该正常启动', () => {
      expect(app).toBeDefined();
      expect(dataSource.isInitialized).toBe(true);
    });
  });
});
