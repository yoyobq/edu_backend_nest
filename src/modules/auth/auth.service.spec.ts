// src/modules/auth/auth.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountStatus, LoginTypeEnum } from 'src/types/models/account.types';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AccountEntity } from '../account/entities/account.entity';
import { AuthService } from './auth.service';
import { AuthLoginArgs } from './dto/auth.args';

/**
 * 认证服务测试
 */
// eslint-disable-next-line max-lines-per-function
describe('AuthService', () => {
  let service: AuthService;
  let repository: Repository<AccountEntity>;

  // 模拟账户数据
  const mockAccount: AccountEntity = {
    id: 1,
    loginName: 'testuser',
    loginEmail: 'test@example.com',
    loginPassword: 'password123',
    status: AccountStatus.ACTIVE,
    recentLoginHistory: null,
    identityHint: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 模拟被禁用的账户
  const mockBannedAccount: AccountEntity = {
    ...mockAccount,
    id: 2,
    loginName: 'banneduser',
    loginEmail: 'banned@example.com',
    status: AccountStatus.BANNED,
  };

  /**
   * 创建模拟的 QueryBuilder
   */
  const createMockQueryBuilder = (
    mockResult: AccountEntity | null,
  ): Partial<SelectQueryBuilder<AccountEntity>> => ({
    where: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(mockResult),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    repository = module.get<Repository<AccountEntity>>(getRepositoryToken(AccountEntity));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login - 成功场景', () => {
    /**
     * 测试用户名登录成功
     */
    it('should return success when login with username', async () => {
      const mockQueryBuilder = createMockQueryBuilder(mockAccount);

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as SelectQueryBuilder<AccountEntity>);

      const loginArgs: AuthLoginArgs = {
        loginName: 'testuser',
        loginPassword: 'password123',
        type: LoginTypeEnum.PASSWORD,
      };

      const result = await service.login(loginArgs);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(1);
      expect(result.errorMessage).toBeUndefined();
    });

    /**
     * 测试邮箱登录成功
     */
    it('should return success when login with email', async () => {
      // 1. 构造模拟的查询器
      const mockQueryBuilder = createMockQueryBuilder(mockAccount);

      // 2. 替换 repository.createQueryBuilder 的实际行为为 mock 行为
      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as SelectQueryBuilder<AccountEntity>);

      // 3. 构造输入参数
      const loginArgs: AuthLoginArgs = {
        loginName: 'test@example.com',
        loginPassword: 'password123',
        type: LoginTypeEnum.PASSWORD,
      };

      // 4. 调用实际服务
      const result = await service.login(loginArgs);

      // 5. 断言返回结果
      expect(result.success).toBe(true);
      expect(result.userId).toBe(1);
    });
  });

  describe('login - 账户相关错误', () => {
    /**
     * 测试账户不存在
     */
    it('should return error when account does not exist', async () => {
      const mockQueryBuilder = createMockQueryBuilder(null);

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as SelectQueryBuilder<AccountEntity>);

      const loginArgs: AuthLoginArgs = {
        loginName: 'nonexistent',
        loginPassword: 'password123',
        type: LoginTypeEnum.PASSWORD,
      };

      const result = await service.login(loginArgs);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('账户不存在');
      expect(result.userId).toBeUndefined();
    });

    /**
     * 测试账户被禁用
     */
    it('should return error when account is banned', async () => {
      const mockQueryBuilder = createMockQueryBuilder(mockBannedAccount);

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as SelectQueryBuilder<AccountEntity>);

      const loginArgs: AuthLoginArgs = {
        loginName: 'banneduser',
        loginPassword: 'password123',
        type: LoginTypeEnum.PASSWORD,
      };

      const result = await service.login(loginArgs);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('账户已被禁用');
      expect(result.userId).toBeUndefined();
    });
  });

  describe('login - 密码相关错误', () => {
    /**
     * 测试密码错误
     */
    it('should return error when password is incorrect', async () => {
      const mockQueryBuilder = createMockQueryBuilder(mockAccount);

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as SelectQueryBuilder<AccountEntity>);

      const loginArgs: AuthLoginArgs = {
        loginName: 'testuser',
        loginPassword: 'wrongpassword',
        type: LoginTypeEnum.PASSWORD,
      };

      const result = await service.login(loginArgs);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('密码错误');
      expect(result.userId).toBeUndefined();
    });

    /**
     * 测试空密码
     */
    it('should return error when password is empty', async () => {
      const mockQueryBuilder = createMockQueryBuilder(mockAccount);

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as SelectQueryBuilder<AccountEntity>);

      const loginArgs: AuthLoginArgs = {
        loginName: 'testuser',
        loginPassword: '',
        type: LoginTypeEnum.PASSWORD,
      };

      const result = await service.login(loginArgs);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('密码错误');
    });
  });

  describe('login - 输入参数边界测试', () => {
    /**
     * 测试空用户名
     */
    it('should return error when login name is empty', async () => {
      const mockQueryBuilder = createMockQueryBuilder(null);

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as SelectQueryBuilder<AccountEntity>);

      const loginArgs: AuthLoginArgs = {
        loginName: '',
        loginPassword: 'password123',
        type: LoginTypeEnum.PASSWORD,
      };

      const result = await service.login(loginArgs);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('账户不存在');
    });

    /**
     * 测试特殊字符用户名
     */
    it('should handle special characters in login name', async () => {
      const mockQueryBuilder = createMockQueryBuilder(null);

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as SelectQueryBuilder<AccountEntity>);

      const loginArgs: AuthLoginArgs = {
        loginName: 'user@#$%',
        loginPassword: 'password123',
        type: LoginTypeEnum.PASSWORD,
      };

      const result = await service.login(loginArgs);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('账户不存在');
    });
  });
});
