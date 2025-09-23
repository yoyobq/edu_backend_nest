// src/core/common/password/password.pbkdf2.helper.spec.ts
import { PasswordPbkdf2Helper } from './password.pbkdf2.helper';

describe('PasswordPbkdf2Helper', () => {
  it('应该使用 Node.js crypto 模块生成正确的哈希值', () => {
    // Arrange
    const password = 'guest';
    const salt = new Date('2023-03-15T10:18:09Z').toString();
    const expectedHash =
      'c3e10d4a4af293057b42eb10bbf05f436b0a771f8269cb689f8a2b361fbd28d2c5abc547bef1aaf349299be5453a4e62cb6135479d15fa8434841e4528940620';

    // Act
    const actualHash = PasswordPbkdf2Helper.hashPasswordWithCrypto(password, salt);

    // Assert
    expect(actualHash).toBe(expectedHash);
  });

  describe('verifyPasswordWithCrypto', () => {
    it('应该正确验证使用 Node.js crypto 生成的密码', () => {
      // Arrange
      const password = 'guest';
      const salt = new Date('2023-03-15T10:18:09Z').toString();
      const hashedPassword =
        'c3e10d4a4af293057b42eb10bbf05f436b0a771f8269cb689f8a2b361fbd28d2c5abc547bef1aaf349299be5453a4e62cb6135479d15fa8434841e4528940620';

      // Act
      const isValid = PasswordPbkdf2Helper.verifyPasswordWithCrypto(password, salt, hashedPassword);

      // Assert
      expect(isValid).toBe(true);
    });

    it('应该拒绝错误的密码', () => {
      // Arrange
      const wrongPassword = 'wrongpassword';
      const salt = '2023-03-15 10:18:09';
      const hashedPassword =
        'c3e10d4a4af293057b42eb10bbf05f436b0a771f8269cb689f8a2b361fbd28d2c5abc547bef1aaf349299be5453a4e62cb6135479d15fa8434841e4528940620';

      // Act
      const isValid = PasswordPbkdf2Helper.verifyPasswordWithCrypto(
        wrongPassword,
        salt,
        hashedPassword,
      );

      // Assert
      expect(isValid).toBe(false);
    });

    //   it('应该使 crypto-js 用给定的密码和盐值生成正确的哈希值', () => {
    //     // Arrange
    //     const password = 'guest';
    //     // 模拟从数据库获取的 Date 对象
    //     // const salt = '2023-03-15 10:18:09';
    //     // 转换为与老系统兼容的字符串格式
    //     const salt = new Date('2023-03-15T10:18:09Z').toString();
    //     const expectedHash =
    //       'c3e10d4a4af293057b42eb10bbf05f436b0a771f8269cb689f8a2b361fbd28d2c5abc547bef1aaf349299be5453a4e62cb6135479d15fa8434841e4528940620';

    //     // Act
    //     const actualHash = PasswordPbkdf2Helper.hashPassword(password, salt);

    //     // Assert
    //     expect(actualHash).toBe(expectedHash);
    //   });
    // });
  });
});
