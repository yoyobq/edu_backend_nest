// test/04-course/course-catalogs.e2e-spec.ts
import { CourseLevel } from '@app-types/models/course.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
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
  let managerAccountId: number;

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
      await dataSource.query('DELETE FROM course_catalogs WHERE course_level IN (?, ?, ?, ?, ?)', [
        CourseLevel.FITNESS,
        CourseLevel.WUSHU,
        CourseLevel.STRIKING,
        CourseLevel.SANDA,
        CourseLevel.MMA,
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

      // 记录管理员账号 ID，便于审计字段断言
      const accountRepo = dataSource.getRepository(AccountEntity);
      const managerAccount = await accountRepo.findOne({
        where: { loginName: testAccounts.manager.loginName },
      });
      if (!managerAccount) throw new Error('未找到测试管理员账号');
      managerAccountId = managerAccount.id;
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
    // 使用管理员账号作为审计字段来源
    const adminId = managerAccountId;

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
        existingCatalog.updatedBy = adminId;
        await courseCatalogRepository.save(existingCatalog);
      } else {
        // 创建新记录
        const newCatalog = courseCatalogRepository.create({
          courseLevel: catalog.courseLevel,
          title: catalog.title,
          description: catalog.description,
          deactivatedAt: null,
          createdBy: adminId,
          updatedBy: adminId,
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
              updatedBy
            }
          }
        }
      `;

      const updateResponse = await executeQuery(updateQuery, managerToken).expect(200);

      expect(updateResponse.body.data.updateCatalogDetails.success).toBe(true);
      expect(updateResponse.body.data.updateCatalogDetails.data.title).toBe(newTitle);
      expect(updateResponse.body.data.updateCatalogDetails.data.updatedBy).toBe(
        String(managerAccountId),
      );
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
              updatedBy
            }
          }
        }
      `;

      const updateResponse = await executeQuery(updateQuery, managerToken).expect(200);

      expect(updateResponse.body.data.updateCatalogDetails.success).toBe(true);
      expect(updateResponse.body.data.updateCatalogDetails.data.description).toBe(newDescription);
      expect(updateResponse.body.data.updateCatalogDetails.data.updatedBy).toBe(
        String(managerAccountId),
      );
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
            data { id description updatedBy }
          }
        }
      `;
      const updateResponse = await executeQuery(updateQuery, managerToken).expect(200);
      expect(updateResponse.body.data.updateCatalogDetails.success).toBe(true);
      expect(updateResponse.body.data.updateCatalogDetails.data.updatedBy).toBe(
        String(managerAccountId),
      );

      // 再次查询该项，检查 updatedAt 变更
      const afterListResponse = await executeQuery(listQuery).expect(200);
      const afterItem = afterListResponse.body.data.courseCatalogsList.items.find(
        (item: { courseLevel: CourseLevel; id: number; updatedAt: string }) =>
          item.id === wushuItem.id,
      );
      const afterUpdatedAt = new Date(afterItem.updatedAt).getTime();

      expect(afterUpdatedAt).toBeGreaterThan(beforeUpdatedAt);
    });

    /**
     * 更新负例：空标题应返回 CATALOG_TITLE_EMPTY
     */
    it('更新负例：空标题应返回 CATALOG_TITLE_EMPTY', async () => {
      // 获取一个体能训练目录项
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
        (item: { courseLevel: CourseLevel; id: number }) =>
          item.courseLevel === CourseLevel.FITNESS,
      );

      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${fitnessItem.id}, title: " " }) {
            success
            data { id title }
          }
        }
      `;

      const res = await executeQuery(updateQuery, managerToken).expect(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.errorCode).toBe('CATALOG_TITLE_EMPTY');
    });

    /**
     * 禁改字段：尝试更新 courseLevel 应被拒绝（GraphQL 校验失败）
     */
    it('禁改字段：更新 courseLevel 应被拒绝（GraphQL 校验失败）', async () => {
      const listQuery = `
        query { courseCatalogsList { items { id courseLevel } } }
      `;
      const listResponse = await executeQuery(listQuery).expect(200);
      const wushuItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: { courseLevel: CourseLevel; id: number }) => item.courseLevel === CourseLevel.WUSHU,
      );

      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${wushuItem.id}, courseLevel: STRIKING }) {
            success
            data { id }
          }
        }
      `;

      const res = await executeQuery(updateQuery, managerToken).expect(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
      expect(String(res.body.errors[0].message)).toContain('UpdateCatalogDetailsInput');
      expect(String(res.body.errors[0].message)).toContain('courseLevel');
    });

    /**
     * 禁改字段：尝试更新 deactivatedAt 应被拒绝（GraphQL 校验失败）
     */
    it('禁改字段：更新 deactivatedAt 应被拒绝（GraphQL 校验失败）', async () => {
      const listQuery = `
        query {
          courseCatalogsList {
            items {
              id
              courseLevel
              deactivatedAt
            }
          }
        }
      `;
      const listResponse = await executeQuery(listQuery).expect(200);
      const strikingItem = listResponse.body.data.courseCatalogsList.items.find(
        (item: { courseLevel: CourseLevel; id: number }) =>
          item.courseLevel === CourseLevel.STRIKING,
      );

      const updateQuery = `
        mutation {
          updateCatalogDetails(input: { id: ${strikingItem.id}, deactivatedAt: "2025-01-01T00:00:00.000Z" }) {
            success
            data { id }
          }
        }
      `;

      const res = await executeQuery(updateQuery, managerToken).expect(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
      expect(String(res.body.errors[0].message)).toContain('UpdateCatalogDetailsInput');
      expect(String(res.body.errors[0].message)).toContain('deactivatedAt');
    });
  });

  describe('分页与搜索：searchCourseCatalogs', () => {
    /**
     * OFFSET 模式分页查询
     * - 断言 items 数量不超过 pageSize
     * - 断言返回 total/page/pageSize
     * - OFFSET 模式下 pageInfo 为空
     */
    it('支持 OFFSET 模式分页查询（含 total）', async () => {
      const query = `
        query {
          searchCourseCatalogs(input: {
            pagination: { mode: OFFSET, page: 1, pageSize: 2, withTotal: true }
          }) {
            items { id courseLevel title description }
            total
            page
            pageSize
            pageInfo { hasNext nextCursor }
          }
        }
      `;

      const res = await executeQuery(query).expect(200);
      const payload = res.body.data.searchCourseCatalogs;

      expect(res.body.errors).toBeUndefined();
      expect(payload).toBeDefined();
      expect(Array.isArray(payload.items)).toBe(true);
      expect(payload.items.length).toBeLessThanOrEqual(2);
      expect(typeof payload.total).toBe('number');
      expect(payload.total).toBeGreaterThanOrEqual(3);
      expect(typeof payload.page).toBe('number');
      expect(typeof payload.pageSize).toBe('number');
      // OFFSET 模式 pageInfo 可为空或忽略游标
      // 若存在，hasNext/nextCursor 也允许被忽略
      if (payload.pageInfo) {
        expect(typeof payload.pageInfo.hasNext).toBe('boolean');
      }
    });

    /**
     * 关键词检索：标题/描述 模糊匹配
     * - 使用关键词 "武术" 应只返回 WUSHU 目录
     */
    it('支持关键词检索（title/description 模糊匹配）', async () => {
      const query = `
        query {
          searchCourseCatalogs(input: {
            pagination: { mode: OFFSET, page: 1, pageSize: 10, withTotal: true },
            query: "武术"
          }) {
            items { id courseLevel title description }
            total
          }
        }
      `;

      const res = await executeQuery(query).expect(200);
      const payload = res.body.data.searchCourseCatalogs;

      expect(res.body.errors).toBeUndefined();
      expect(payload).toBeDefined();
      expect(Array.isArray(payload.items)).toBe(true);
      expect(payload.items.length).toBe(1);
      expect(payload.items[0].courseLevel).toBe(CourseLevel.WUSHU);
      expect(typeof payload.total).toBe('number');
      expect(payload.total).toBe(1);
    });

    /**
     * CURSOR 模式分页查询
     * - 首次查询返回 limit 条数据，hasNext 为 true
     * - 使用 nextCursor 查询下一页，返回剩余数据，hasNext 为 false
     */
    it('支持 CURSOR 模式分页查询（游标翻页）', async () => {
      const firstQuery = `
        query {
          searchCourseCatalogs(input: {
            pagination: { mode: CURSOR, limit: 2 }
          }) {
            items { id courseLevel title }
            pageInfo { hasNext nextCursor }
          }
        }
      `;

      const firstRes = await executeQuery(firstQuery).expect(200);
      if (firstRes.body.errors) {
        // 打印 GraphQL 错误便于定位

        console.error('GraphQL 错误（游标第一页）:', firstRes.body.errors);
      }
      const firstPayload = firstRes.body.data?.searchCourseCatalogs;

      expect(firstRes.body.errors).toBeUndefined();
      expect(firstPayload).toBeDefined();
      expect(Array.isArray(firstPayload.items)).toBe(true);
      expect(firstPayload.items.length).toBe(2);
      expect(firstPayload.pageInfo).toBeDefined();
      expect(firstPayload.pageInfo.hasNext).toBe(true);
      expect(typeof firstPayload.pageInfo.nextCursor).toBe('string');

      const nextCursor = firstPayload.pageInfo.nextCursor as string;

      const secondQuery = `
        query {
          searchCourseCatalogs(input: {
            pagination: { mode: CURSOR, limit: 2, after: "${nextCursor}" }
          }) {
            items { id courseLevel title }
            pageInfo { hasNext nextCursor }
          }
        }
      `;

      const secondRes = await executeQuery(secondQuery).expect(200);
      if (secondRes.body.errors) {
        console.error('GraphQL 错误（游标第二页）:', secondRes.body.errors);
      }
      const secondPayload = secondRes.body.data?.searchCourseCatalogs;

      expect(secondRes.body.errors).toBeUndefined();
      expect(secondPayload).toBeDefined();
      expect(Array.isArray(secondPayload.items)).toBe(true);
      // 剩余 1 条（共 3 条）
      expect(secondPayload.items.length).toBe(1);
      expect(secondPayload.pageInfo).toBeDefined();
      expect(secondPayload.pageInfo.hasNext).toBe(false);
      // nextCursor 可为空或忽略
    });
  });

  describe('创建课程目录：createCatalog', () => {
    /**
     * 在每个创建测试前后清理 SANDA 目录，避免相互污染
     */
    beforeEach(async () => {
      await dataSource.query('DELETE FROM course_catalogs WHERE course_level = ?', [
        CourseLevel.SANDA,
      ]);
    });
    afterEach(async () => {
      await dataSource.query('DELETE FROM course_catalogs WHERE course_level = ?', [
        CourseLevel.SANDA,
      ]);
    });

    it('管理员可以创建新课程目录（返回 isNewlyCreated=true）', async () => {
      const title = '散打课程';
      const description = '面向基础的散打课程';
      const mutation = `
        mutation {
          createCatalog(input: { courseLevel: SANDA, title: "${title}", description: "${description}" }) {
            isNewlyCreated
            catalog {
              id
              courseLevel
              title
              description
              createdBy
              updatedBy
            }
          }
        }
      `;

      const res = await executeQuery(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.createCatalog.isNewlyCreated).toBe(true);
      const catalog = res.body.data.createCatalog.catalog;
      expect(catalog.courseLevel).toBe(CourseLevel.SANDA);
      expect(catalog.title).toBe(title);
      expect(catalog.description).toBe(description);
      expect(catalog.createdBy).toBe(String(managerAccountId));
      expect(catalog.updatedBy).toBe(String(managerAccountId));
    });

    it('重复创建同一等级幂等（第二次返回 isNewlyCreated=false）', async () => {
      const title = '散打课程';
      const mutation = `
        mutation {
          createCatalog(input: { courseLevel: SANDA, title: "${title}" }) {
            isNewlyCreated
            catalog { id courseLevel title updatedBy }
          }
        }
      `;

      const first = await executeQuery(mutation, managerToken).expect(200);
      expect(first.body.errors).toBeUndefined();
      expect(first.body.data.createCatalog.isNewlyCreated).toBe(true);
      const firstId = first.body.data.createCatalog.catalog.id as number;

      const second = await executeQuery(mutation, managerToken).expect(200);
      expect(second.body.errors).toBeUndefined();
      expect(second.body.data.createCatalog.isNewlyCreated).toBe(false);
      const secondId = second.body.data.createCatalog.catalog.id as number;
      expect(secondId).toBe(firstId);
      expect(second.body.data.createCatalog.catalog.updatedBy).toBe(String(managerAccountId));
    });

    it('并发创建同一等级幂等（只会创建一次）', async () => {
      const mutation = `
        mutation {
          createCatalog(input: { courseLevel: SANDA, title: "并发散打课程" }) {
            isNewlyCreated
            catalog { id courseLevel }
          }
        }
      `;

      const [r1, r2] = await Promise.all([
        executeQuery(mutation, managerToken).expect(200),
        executeQuery(mutation, managerToken).expect(200),
      ]);

      const p1 = r1.body.data.createCatalog;
      const p2 = r2.body.data.createCatalog;
      expect([p1.isNewlyCreated, p2.isNewlyCreated].filter(Boolean).length).toBe(1);
      expect(p1.catalog.id).toBe(p2.catalog.id);
      expect(p1.catalog.courseLevel).toBe(CourseLevel.SANDA);
      expect(p2.catalog.courseLevel).toBe(CourseLevel.SANDA);
    });

    /**
     * 创建负例：空标题应返回 CATALOG_TITLE_EMPTY
     */
    it('创建负例：空标题应返回 CATALOG_TITLE_EMPTY', async () => {
      // 预清理：确保 SANDA 等级不存在
      await dataSource.query('DELETE FROM course_catalogs WHERE course_level = ?', [
        CourseLevel.SANDA,
      ]);

      const mutation = `
        mutation {
          createCatalog(input: { courseLevel: SANDA, title: " " }) {
            isNewlyCreated
            catalog { id }
          }
        }
      `;

      const res = await executeQuery(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].extensions.errorCode).toBe('CATALOG_TITLE_EMPTY');
    });

    /**
     * 创建规则：description 为空串应规范化为 null，并验证数据库为 NULL
     */
    it('描述空串应存为 null（并验证数据库为 NULL）', async () => {
      // 预清理：确保 SANDA 等级不存在
      await dataSource.query('DELETE FROM course_catalogs WHERE course_level = ?', [
        CourseLevel.SANDA,
      ]);

      const title = '散打课程 - 空描述';
      const mutation = `
        mutation {
          createCatalog(input: { courseLevel: SANDA, title: "${title}", description: "" }) {
            isNewlyCreated
            catalog { id courseLevel title description }
          }
        }
      `;

      const res = await executeQuery(mutation, managerToken).expect(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.createCatalog.isNewlyCreated).toBe(true);
      const catalog = res.body.data.createCatalog.catalog;
      expect(catalog.courseLevel).toBe(CourseLevel.SANDA);
      expect(catalog.description).toBeNull();

      // 再查一遍确认数据库为 NULL
      const repo = dataSource.getRepository(CourseCatalogEntity);
      const entity = await repo.findOne({ where: { courseLevel: CourseLevel.SANDA } });
      expect(entity).toBeDefined();
      expect(entity!.description).toBeNull();
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
        mutation { deactivateCatalog(input: { id: ${fitnessId} }) { isUpdated catalog { id deactivatedAt updatedBy } } }
      `;
      const res = await executeQuery(mutate, managerToken).expect(200);
      expect(res.body.data.deactivateCatalog.isUpdated).toBe(true);
      expect(res.body.data.deactivateCatalog.catalog.deactivatedAt).not.toBeNull();
      expect(res.body.data.deactivateCatalog.catalog.updatedBy).toBe(String(managerAccountId));
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
        `mutation { reactivateCatalog(input: { id: ${fitnessId} }) { isUpdated catalog { id deactivatedAt updatedBy } } }`,
        managerToken,
      ).expect(200);
      expect(res.body.data.reactivateCatalog.isUpdated).toBe(true);
      expect(res.body.data.reactivateCatalog.catalog.deactivatedAt).toBeNull();
      expect(res.body.data.reactivateCatalog.catalog.updatedBy).toBe(String(managerAccountId));
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
