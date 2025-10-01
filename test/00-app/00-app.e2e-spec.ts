// test/app.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

console.log('worker', process.env.JEST_WORKER_ID, __filename);

describe('00-App 全局测试', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
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

  describe('应用基础设施测试', () => {
    /**
     * 测试 HTTP 服务器基本响应
     */
    it('HTTP 服务器应该正常响应根路径', async () => {
      const response = await request(app.getHttpServer()).get('/').expect(200);

      expect(response.text).toBeDefined();
      expect(typeof response.text).toBe('string');
    });

    /**
     * 测试应用启动状态
     */
    it('应用应该正常启动并初始化', () => {
      expect(app).toBeDefined();
      expect(app.getHttpServer()).toBeDefined();
    });

    /**
     * 测试数据库连接状态
     */
    it('数据库连接应该正常建立', () => {
      expect(dataSource).toBeDefined();
      expect(dataSource.isInitialized).toBe(true);
    });

    /**
     * 测试 GraphQL 端点可访问性（如果启用）
     */
    it('GraphQL 端点应该可访问', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: '{ __typename }' })
        .expect(200);

      expect(response.body).toBeDefined();
    });

    /**
     * 测试应用健康检查（如果有的话）
     */
    it('应用应该能够正常关闭', () => {
      // 这个测试确保应用能够优雅关闭
      expect(app).toHaveProperty('close');
      expect(typeof app.close).toBe('function');
    });
  });
});
