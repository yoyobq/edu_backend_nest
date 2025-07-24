// test/app.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('00-App 全局测试', () => {
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

  describe('应用基础设施测试', () => {
    it('HTTP 服务器应该正常响应', async () => {
      const response = await request(app.getHttpServer()).get('/').expect(200);
      expect(response).toBeDefined();
    });
    /**
     * 测试应用启动状态
     */
    it('应用应该正常启动', () => {
      expect(app).toBeDefined();
      expect(dataSource.isInitialized).toBe(true);
    });

    /**
     * 测试全局数据源配置
     */
    it('全局 testDataSource 应该已被定义', () => {
      expect(global.testDataSource).toBeDefined();
    });

    /**
     * 测试数据库实体注册
     */
    it('全局 testDataSource 中注册的实体应该被可查询', async () => {
      if (global.testDataSource) {
        // 注意此处使用字符串名称而不是类引用
        const accountRepo = global.testDataSource.getRepository('AccountEntity');
        const accountCount = await accountRepo.count();
        expect(accountCount).toBeDefined();
      }
    });
  });
});
