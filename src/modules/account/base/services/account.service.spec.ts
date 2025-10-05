/* eslint-disable max-lines-per-function */
// src/modules/account/base/services/account.service.spec.ts

import { DomainError } from '@core/common/errors/domain-error';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PROFILE_PROVIDER_MAP_TOKEN } from '../constants/provider-tokens';
import { AccountEntity } from '../entities/account.entity';
import { UserInfoEntity } from '../entities/user-info.entity';
import { AccountSecurityService } from './account-security.service';
import { AccountService } from './account.service';

describe('AccountService - 密码预处理功能', () => {
  let service: AccountService;

  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockAccountSecurityService = {
    // 模拟方法
  };

  const mockProviderMap = new Map();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(UserInfoEntity),
          useValue: mockRepository,
        },
        {
          provide: AccountSecurityService,
          useValue: mockAccountSecurityService,
        },
        {
          provide: PROFILE_PROVIDER_MAP_TOKEN,
          useValue: mockProviderMap,
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
    // Repository instances are available but not used in these tests
    module.get<Repository<AccountEntity>>(getRepositoryToken(AccountEntity));
    module.get<Repository<UserInfoEntity>>(getRepositoryToken(UserInfoEntity));
  });

  it('应该被正确定义', () => {
    expect(service).toBeDefined();
  });

  describe('hashPasswordWithTimestamp - 密码预处理', () => {
    const testDate = new Date('2024-01-01T00:00:00Z');

    it('应该成功哈希正常密码', () => {
      const password = 'MySecurePassword123!';

      const result = AccountService.hashPasswordWithTimestamp(password, testDate);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('应该拒绝空密码', () => {
      expect(() => AccountService.hashPasswordWithTimestamp('', testDate)).toThrow(DomainError);
      expect(() => AccountService.hashPasswordWithTimestamp('', testDate)).toThrow(
        '密码不能为空或纯空白字符',
      );
    });

    it('应该拒绝纯空白字符密码', () => {
      expect(() => AccountService.hashPasswordWithTimestamp('   ', testDate)).toThrow(DomainError);
      expect(() => AccountService.hashPasswordWithTimestamp('   ', testDate)).toThrow(
        '密码不能为空或纯空白字符',
      );

      expect(() => AccountService.hashPasswordWithTimestamp('\t\n  ', testDate)).toThrow(
        DomainError,
      );
      expect(() => AccountService.hashPasswordWithTimestamp('\t\n  ', testDate)).toThrow(
        '密码不能为空或纯空白字符',
      );
    });

    it('应该拒绝包含首尾空格的密码', () => {
      expect(() =>
        AccountService.hashPasswordWithTimestamp(' MySecurePassword123!', testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.hashPasswordWithTimestamp(' MySecurePassword123!', testDate),
      ).toThrow('密码首尾不能包含空格');

      expect(() =>
        AccountService.hashPasswordWithTimestamp('MySecurePassword123! ', testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.hashPasswordWithTimestamp('MySecurePassword123! ', testDate),
      ).toThrow('密码首尾不能包含空格');

      expect(() =>
        AccountService.hashPasswordWithTimestamp('  MySecurePassword123!  ', testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.hashPasswordWithTimestamp('  MySecurePassword123!  ', testDate),
      ).toThrow('密码首尾不能包含空格');
    });

    it('应该正确处理 NFKC 规范化 - 全角字符', () => {
      const fullWidthPassword = 'ＭｙＳｅｃｕｒｅＰａｓｓｗｏｒｄ１２３！';
      const normalPassword = 'MySecurePassword123!';

      const fullWidthResult = AccountService.hashPasswordWithTimestamp(fullWidthPassword, testDate);
      const normalResult = AccountService.hashPasswordWithTimestamp(normalPassword, testDate);

      // 全角字符应该被规范化为半角字符，产生相同的哈希
      expect(fullWidthResult).toBe(normalResult);
    });

    it('应该拒绝包含特殊 Unicode 空格的密码', () => {
      // 不间断空格 (U+00A0)
      expect(() =>
        AccountService.hashPasswordWithTimestamp('MySecurePassword123!\u00A0', testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.hashPasswordWithTimestamp('MySecurePassword123!\u00A0', testDate),
      ).toThrow('密码首尾不能包含空格');

      // 全角空格 (U+3000)
      expect(() =>
        AccountService.hashPasswordWithTimestamp('\u3000MySecurePassword123!', testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.hashPasswordWithTimestamp('\u3000MySecurePassword123!', testDate),
      ).toThrow('密码首尾不能包含空格');
    });
  });

  describe('verifyPassword - 密码预处理', () => {
    const testDate = new Date('2024-01-01T00:00:00Z');
    const normalPassword = 'MySecurePassword123!';
    let hashedPassword: string;

    beforeAll(() => {
      hashedPassword = AccountService.hashPasswordWithTimestamp(normalPassword, testDate);
    });

    it('应该成功验证正确的密码', () => {
      const result = AccountService.verifyPassword(normalPassword, hashedPassword, testDate);

      expect(result).toBe(true);
    });

    it('应该拒绝错误的密码', () => {
      const wrongPassword = 'WrongPassword123!';

      const result = AccountService.verifyPassword(wrongPassword, hashedPassword, testDate);

      expect(result).toBe(false);
    });

    it('应该拒绝空密码验证', () => {
      expect(() => AccountService.verifyPassword('', hashedPassword, testDate)).toThrow(
        DomainError,
      );
      expect(() => AccountService.verifyPassword('', hashedPassword, testDate)).toThrow(
        '密码不能为空或纯空白字符',
      );
    });

    it('应该拒绝纯空白字符密码验证', () => {
      expect(() => AccountService.verifyPassword('   ', hashedPassword, testDate)).toThrow(
        DomainError,
      );
      expect(() => AccountService.verifyPassword('   ', hashedPassword, testDate)).toThrow(
        '密码不能为空或纯空白字符',
      );
    });

    it('应该拒绝包含首尾空格的密码验证', () => {
      expect(() =>
        AccountService.verifyPassword(' MySecurePassword123!', hashedPassword, testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.verifyPassword(' MySecurePassword123!', hashedPassword, testDate),
      ).toThrow('密码首尾不能包含空格');

      expect(() =>
        AccountService.verifyPassword('MySecurePassword123! ', hashedPassword, testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.verifyPassword('MySecurePassword123! ', hashedPassword, testDate),
      ).toThrow('密码首尾不能包含空格');
    });

    it('应该正确验证 NFKC 规范化的密码', () => {
      const fullWidthPassword = 'ＭｙＳｅｃｕｒｅＰａｓｓｗｏｒｄ１２３！';

      // 全角字符应该被规范化为半角字符，能够验证成功
      const result = AccountService.verifyPassword(fullWidthPassword, hashedPassword, testDate);

      expect(result).toBe(true);
    });

    it('应该拒绝包含特殊 Unicode 空格的密码验证', () => {
      // 不间断空格 (U+00A0)
      expect(() =>
        AccountService.verifyPassword('MySecurePassword123!\u00A0', hashedPassword, testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.verifyPassword('MySecurePassword123!\u00A0', hashedPassword, testDate),
      ).toThrow('密码首尾不能包含空格');

      // 全角空格 (U+3000)
      expect(() =>
        AccountService.verifyPassword('\u3000MySecurePassword123!', hashedPassword, testDate),
      ).toThrow(DomainError);
      expect(() =>
        AccountService.verifyPassword('\u3000MySecurePassword123!', hashedPassword, testDate),
      ).toThrow('密码首尾不能包含空格');
    });
  });

  describe('密码哈希和验证的一致性', () => {
    const testDate = new Date('2024-01-01T00:00:00Z');

    it('应该确保哈希和验证使用相同的预处理逻辑', () => {
      const testCases = [
        'MySecurePassword123!',
        'ＭｙＳｅｃｕｒｅＰａｓｓｗｏｒｄ１２３！', // 全角字符
        'MySecure①②③Password!', // 兼容字符
        'MySecure密码123!', // 中文字符
        'MySecure🔒Password123!', // emoji
      ];

      testCases.forEach((password) => {
        const hashedPassword = AccountService.hashPasswordWithTimestamp(password, testDate);
        const isValid = AccountService.verifyPassword(password, hashedPassword, testDate);

        expect(isValid).toBe(true);
      });
    });

    it('应该确保不同形式的相同密码产生相同结果', () => {
      const normalPassword = 'MySecurePassword123!';
      const fullWidthPassword = 'ＭｙＳｅｃｕｒｅＰａｓｓｗｏｒｄ１２３！';

      const normalHash = AccountService.hashPasswordWithTimestamp(normalPassword, testDate);
      const fullWidthHash = AccountService.hashPasswordWithTimestamp(fullWidthPassword, testDate);

      // 应该产生相同的哈希
      expect(normalHash).toBe(fullWidthHash);

      // 交叉验证应该都成功
      expect(AccountService.verifyPassword(normalPassword, normalHash, testDate)).toBe(true);
      expect(AccountService.verifyPassword(fullWidthPassword, normalHash, testDate)).toBe(true);
      expect(AccountService.verifyPassword(normalPassword, fullWidthHash, testDate)).toBe(true);
      expect(AccountService.verifyPassword(fullWidthPassword, fullWidthHash, testDate)).toBe(true);
    });
  });
});
