// test/04-course/course-catalogs.e2e-spec.ts
import { CourseLevel } from '@app-types/models/course.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { CourseCatalogEntity } from '@src/modules/course-catalogs/course-catalog.entity';
import { AudienceTypeEnum, LoginTypeEnum } from '@src/types/models/account.types';
import request from 'supertest';
import { DataSource } from 'typeorm';
// 导入统一账号配置
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('课程目录模块 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerToken: string;
  let coachToken: string;
  // 删除未使用的 guestToken 变量

  // 使用统一账号配置
  const testAccounts = {
    manager: testAccountsConfig.manager,
    coach: testAccountsConfig.coach,
    guest: testAccountsConfig.guest,
  };

  // 测试课程目录数据
  const testCatalogs = [
    {
      courseLevel: CourseLevel.FITNESS,
      title: '体能训练课程',
      description: '提高身体素质的基础课程',
    },
    {
      courseLevel: CourseLevel.WUSHU,
      title: '武术基础课程',
      description: '传统武术入门课程',
    },
    {
      courseLevel: CourseLevel.STRIKING,
      title: '搏击技巧课程',
      description: '学习基本搏击技巧',
    },
  ];

  beforeAll(async () => {
    try {
      // 初始化 GraphQL Schema
      initGraphQLSchema();

      // 创建测试模块
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();

      // 获取数据源
      dataSource = app.get(DataSource);

      // 验证数据源连接
      if (!dataSource.isInitialized) {
        await dataSource.initialize();
      }

      // 清理并准备测试数据
      await prepareTestData();

      // 登录测试用户获取 token
      await loginTestUsers();
    } catch (error) {
      throw new Error(`测试初始化失败: ${String(error)}`);
    }
  });

  afterAll(async () => {
    try {
      // 清理测试数据
      await cleanupTestData();
    } catch (error) {
      // 在 afterAll 中保留 console.error，避免影响测试清理
      console.error('afterAll 清理失败:', error);
    } finally {
      // 确保应用正确关闭
      if (app) {
        await app.close();
      }
    }
  });

  /**
   * 准备测试数据
   */
  const prepareTestData = async (): Promise<void> => {
    // 清理现有数据
    await cleanupTestData();

    // 创建测试账号
    await createTestAccounts();

    // 创建测试课程目录
    await createTestCatalogs();
  };

  /**
   * 清理测试数据
   */
  const cleanupTestData = async (): Promise<void> => {
    if (!dataSource || !dataSource.isInitialized) {
      console.warn('数据源未初始化，跳过清理');
      return;
    }

    try {
      // 清理课程目录（先清理，避免外键约束）
      await dataSource.query('DELETE FROM course_catalogs WHERE course_level IN (?, ?, ?)', [
        CourseLevel.FITNESS,
        CourseLevel.WUSHU,
        CourseLevel.STRIKING,
      ]);

      // 使用统一的账号清理函数
      await cleanupTestAccounts(dataSource);
    } catch (error) {
      console.error('清理测试数据失败:', error);
      // 不抛出错误，允许测试继续
    }
  };

  /**
   * 创建测试账户
   */
  const createTestAccounts = async (): Promise<void> => {
    try {
      // 使用统一的账号创建函数
      await seedTestAccounts({
        dataSource,
        includeKeys: ['manager', 'coach', 'guest'],
      });
    } catch (error) {
      console.error('创建测试账户失败:', error);
      throw error;
    }
  };

  /**
   * 创建测试课程目录
   */
  const createTestCatalogs = async (): Promise<void> => {
    const courseCatalogRepository = dataSource.getRepository(CourseCatalogEntity);

    // 使用 save 操作替代 upsert，避免 TypeORM 实体 ID 问题
    for (const catalog of testCatalogs) {
      // 先查找是否存在
      const existingCatalog = await courseCatalogRepository.findOneBy({
        courseLevel: catalog.courseLevel,
      });

      if (existingCatalog) {
        // 更新现有记录
        existingCatalog.title = catalog.title;
        existingCatalog.description = catalog.description;
        existingCatalog.deactivatedAt = null;
        await courseCatalogRepository.save(existingCatalog);
      } else {
        // 创建新记录
        const newCatalog = courseCatalogRepository.create({
          courseLevel: catalog.courseLevel,
          title: catalog.title,
          description: catalog.description,
          deactivatedAt: null,
        });
        await courseCatalogRepository.save(newCatalog);
      }
    }
  };

  /**
   * 登录测试用户获取 token
   */
  const loginTestUsers = async (): Promise<void> => {
    const loginUser = async (loginName: string, loginPassword: string): Promise<string> => {
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
              audience: AudienceTypeEnum.DESKTOP, // 使用枚举值而不是字符串
            },
          },
        })
        .expect(200);

      return response.body.data.login.accessToken as string;
    };

    managerToken = await loginUser(
      testAccounts.manager.loginName,
      testAccounts.manager.loginPassword,
    );
    coachToken = await loginUser(testAccounts.coach.loginName, testAccounts.coach.loginPassword);
    // 删除下面这行
    // guestToken = await loginUser(testAccounts.guest.loginName, testAccounts.guest.loginPassword);
  };

  /**
   * 执行 GraphQL 查询
   */
  const executeQuery = (query: string, token?: string): request.Test => {
    const req = request(app.getHttpServer()).post('/graphql').send({ query });

    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }

    return req;
  };

  describe('获取课程目录列表', () => {
    it('应该返回所有有效的课程目录', async () => {
      const query = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
              title
              description
              createdAt
              updatedAt
              deactivatedAt
            }
          }
        }
      `;

      const response = await executeQuery(query).expect(200);

      expect(response.body.data.courseCatalogsList).toBeDefined();
      expect(response.body.data.courseCatalogsList.items).toBeInstanceOf(Array);
      expect(response.body.data.courseCatalogsList.items.length).toBe(testCatalogs.length);

      // 验证返回的课程目录包含所有测试数据
      const returnedLevels = response.body.data.courseCatalogsList.items.map(
        (item: { courseLevel: CourseLevel }) => item.courseLevel, // 添加明确的类型定义
      );
      expect(returnedLevels).toContain(CourseLevel.FITNESS);
      expect(returnedLevels).toContain(CourseLevel.WUSHU);
      expect(returnedLevels).toContain(CourseLevel.STRIKING);
    });
  });

  describe('更新课程目录详情', () => {
    afterEach(async () => {
      // 每个更新测试后恢复原始数据
      await createTestCatalogs();
    });

    it('应该允许管理员更新课程目录标题', async () => {
      // 先获取课程目录列表
      const listQuery = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
              title
            }
          }
        }
      `;

      const listResponse = await executeQuery(listQuery).expect(200);
      const fitnessItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: any) => item.courseLevel === CourseLevel.FITNESS,
      );

      // 更新课程目录标题
      const newTitle = '更新后的体能训练课程';
      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${fitnessItem.id}, title: "${newTitle}" }) {
            success
            message
            data {
              id
              title
              description
            }
          }
        }
      `;

      const updateResponse = await executeQuery(updateQuery, managerToken).expect(200);

      expect(updateResponse.body.data.updateCatalogDetails.success).toBe(true);
      expect(updateResponse.body.data.updateCatalogDetails.data.title).toBe(newTitle);
    });

    it('应该允许管理员更新课程目录描述', async () => {
      // 先获取课程目录列表
      const listQuery = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
              description
            }
          }
        }
      `;

      const listResponse = await executeQuery(listQuery).expect(200);
      const wushuItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: any) => item.courseLevel === CourseLevel.WUSHU,
      );

      // 更新课程目录描述
      const newDescription = '更新后的武术课程描述，包含更多详细信息';
      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${wushuItem.id}, description: "${newDescription}" }) {
            success
            message
            data {
              id
              title
              description
            }
          }
        }
      `;

      const updateResponse = await executeQuery(updateQuery, managerToken).expect(200);

      expect(updateResponse.body.data.updateCatalogDetails.success).toBe(true);
      expect(updateResponse.body.data.updateCatalogDetails.data.description).toBe(newDescription);
    });

    it('非管理员不应该能够更新课程目录', async () => {
      // 先获取课程目录列表
      const listQuery = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
            }
          }
        }
      `;

      const listResponse = await executeQuery(listQuery).expect(200);
      const strikingItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: any) => item.courseLevel === CourseLevel.STRIKING,
      );

      // 尝试使用教练账号更新课程目录
      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${strikingItem.id}, title: "未授权的更新" }) {
            success
            message
            data {
              id
              title
            }
          }
        }
      `;

      const updateResponse = await executeQuery(updateQuery, coachToken).expect(200);

      // 应该返回权限错误
      expect(updateResponse.body.errors).toBeDefined();
      expect(updateResponse.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(updateResponse.body.errors[0].message).toContain('仅管理员可以更新课程目录');
    });

    it('未登录用户不应该能够更新课程目录', async () => {
      // 先获取课程目录列表
      const listQuery = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
            }
          }
        }
      `;

      const listResponse = await executeQuery(listQuery).expect(200);
      const fitnessItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: any) => item.courseLevel === CourseLevel.FITNESS,
      );

      // 尝试未登录更新课程目录
      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${fitnessItem.id}, title: "未授权的更新" }) {
            success
            message
            data {
              id
              title
            }
          }
        }
      `;

      const updateResponse = await executeQuery(updateQuery).expect(200);

      // 应该返回认证错误
      expect(updateResponse.body.errors).toBeDefined();
      expect(updateResponse.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('应该验证更新字段至少有一项', async () => {
      // 先获取课程目录列表
      const listQuery = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
            }
          }
        }
      `;

      const listResponse = await executeQuery(listQuery).expect(200);
      const fitnessItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: any) => item.courseLevel === CourseLevel.FITNESS,
      );

      // 尝试不提供任何更新字段
      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${fitnessItem.id} }) {
            success
            message
            data {
              id
              title
            }
          }
        }
      `;

      const updateResponse = await executeQuery(updateQuery, managerToken).expect(200);

      // 应该返回验证错误
      expect(updateResponse.body.errors).toBeDefined();
      expect(updateResponse.body.errors[0].extensions.errorCode).toBe('NO_UPDATABLE_FIELDS');
      expect(updateResponse.body.errors[0].message).toContain('至少需要提供 title 或 description');
    });

    it('更新后 updatedAt 应自动维护为更晚的时间', async () => {
      // 先获取课程目录列表，选取武术课程项
      const listQuery = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
              title
              description
              updatedAt
            }
          }
        }
      `;

      const listResponse = await executeQuery(listQuery).expect(200);
      const wushuItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: { courseLevel: CourseLevel; id: number; updatedAt: string }) =>
          item.courseLevel === CourseLevel.WUSHU,
      );

      const beforeUpdatedAt = new Date(wushuItem.updatedAt).getTime();

      // 等待片刻防止时间戳分辨率导致相等
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // 执行一次更新（修改描述）
      const newDescription = '验证 updatedAt 自动维护的描述';
      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${wushuItem.id}, description: "${newDescription}" }) {
            success
            data { id description }
          }
        }
      `;
      const updateResponse = await executeQuery(updateQuery, managerToken).expect(200);
      expect(updateResponse.body.data.updateCatalogDetails.success).toBe(true);

      // 再次查询该项，检查 updatedAt 变更
      const afterListResponse = await executeQuery(listQuery).expect(200);
      const afterItem = afterListResponse.body.data.courseCatalogsList.items.find(
        (item: { courseLevel: CourseLevel; id: number; updatedAt: string }) =>
          item.id === wushuItem.id,
      );
      const afterUpdatedAt = new Date(afterItem.updatedAt).getTime();

      expect(afterUpdatedAt).toBeGreaterThan(beforeUpdatedAt);
    });
  });

  describe('下线 / 重新激活课程目录', () => {
    let fitnessId: number;

    beforeEach(async () => {
      // 确保有最新的目录数据
      await createTestCatalogs();

      // 获取体能训练目录 ID
      const listQuery = `
        query { courseCatalogsList { items { id courseLevel deactivatedAt } } }
      `;
      const listResp = await executeQuery(listQuery).expect(200);
      fitnessId = listResp.body.data.courseCatalogsList.items.find(
        (i: { courseLevel: CourseLevel; id: number }) => i.courseLevel === CourseLevel.FITNESS,
      ).id;
    });

    it('管理员可以下线课程目录，并返回 isUpdated=true', async () => {
      const mutate = `
        mutation { deactivateCatalog(input: { id: ${fitnessId} }) { isUpdated catalog { id deactivatedAt } } }
      `;
      const res = await executeQuery(mutate, managerToken).expect(200);
      expect(res.body.data.deactivateCatalog.isUpdated).toBe(true);
      expect(res.body.data.deactivateCatalog.catalog.deactivatedAt).not.toBeNull();
    });

    it('重复下线幂等，返回 isUpdated=false', async () => {
      // 先下线一次
      await executeQuery(
        `mutation { deactivateCatalog(input: { id: ${fitnessId} }) { isUpdated } }`,
        managerToken,
      ).expect(200);

      // 再下线一次，幂等
      const res = await executeQuery(
        `mutation { deactivateCatalog(input: { id: ${fitnessId} }) { isUpdated } }`,
        managerToken,
      ).expect(200);
      expect(res.body.data.deactivateCatalog.isUpdated).toBe(false);
    });

    it('管理员可以重新激活课程目录，并返回 isUpdated=true', async () => {
      // 确保先处于下线
      await executeQuery(
        `mutation { deactivateCatalog(input: { id: ${fitnessId} }) { isUpdated } }`,
        managerToken,
      ).expect(200);

      const res = await executeQuery(
        `mutation { reactivateCatalog(input: { id: ${fitnessId} }) { isUpdated catalog { id deactivatedAt } } }`,
        managerToken,
      ).expect(200);
      expect(res.body.data.reactivateCatalog.isUpdated).toBe(true);
      expect(res.body.data.reactivateCatalog.catalog.deactivatedAt).toBeNull();
    });

    it('重复激活幂等，返回 isUpdated=false', async () => {
      // 先确保激活
      await executeQuery(
        `mutation { reactivateCatalog(input: { id: ${fitnessId} }) { isUpdated } }`,
        managerToken,
      ).expect(200);

      const res = await executeQuery(
        `mutation { reactivateCatalog(input: { id: ${fitnessId} }) { isUpdated } }`,
        managerToken,
      ).expect(200);
      expect(res.body.data.reactivateCatalog.isUpdated).toBe(false);
    });

    it('非管理员（教练）无权限下线目录', async () => {
      const res = await executeQuery(
        `mutation { deactivateCatalog(input: { id: ${fitnessId} }) { isUpdated } }`,
        coachToken,
      ).expect(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('未登录用户不允许下线或激活目录', async () => {
      const res1 = await executeQuery(
        `mutation { deactivateCatalog(input: { id: ${fitnessId} }) { isUpdated } }`,
      ).expect(200);
      expect(res1.body.errors).toBeDefined();
      expect(res1.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');

      const res2 = await executeQuery(
        `mutation { reactivateCatalog(input: { id: ${fitnessId} }) { isUpdated } }`,
      ).expect(200);
      expect(res2.body.errors).toBeDefined();
      expect(res2.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('操作不存在的目录应返回业务错误', async () => {
      const notExistId = 999999;
      const res = await executeQuery(
        `mutation { deactivateCatalog(input: { id: ${notExistId} }) { isUpdated } }`,
        managerToken,
      ).expect(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.errorCode).toBe('CATALOG_NOT_FOUND');
    });
  });

  describe('根据课程等级查询课程目录', () => {
    it('应该能够根据课程等级查询到对应的课程目录', async () => {
      const query = `
        query {
          courseCatalogByLevel(input: { courseLevel: FITNESS }) {
            id
            courseLevel
            title
            description
            createdAt
            updatedAt
            deactivatedAt
          }
        }
      `;

      const response = await executeQuery(query).expect(200);

      expect(response.body.data.courseCatalogByLevel).toBeDefined();
      expect(response.body.data.courseCatalogByLevel.courseLevel).toBe(CourseLevel.FITNESS);
      expect(response.body.data.courseCatalogByLevel.title).toBe('体能训练课程');
    });

    it('查询不存在的课程等级应该返回 null', async () => {
      // 先删除一个课程目录来测试不存在的情况
      const listQuery = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
            }
          }
        }
      `;

      const listResponse = await executeQuery(listQuery).expect(200);
      const fitnessItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: any) => item.courseLevel === CourseLevel.FITNESS,
      );

      // 临时删除该课程目录
      await dataSource.query('DELETE FROM course_catalogs WHERE id = ?', [fitnessItem.id]);

      const query = `
        query {
          courseCatalogByLevel(input: { courseLevel: FITNESS }) {
            id
            courseLevel
            title
          }
        }
      `;

      const response = await executeQuery(query).expect(200);
      expect(response.body.data.courseCatalogByLevel).toBeNull();

      // 恢复数据
      await createTestCatalogs();
    });
  });
});
