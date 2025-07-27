// src/modules/common/constants/encryption.constants.ts

/**
 * 加密相关常量
 * 注意：在生产环境中，这些密钥应该从环境变量中读取
 */

// AES-128 需要 16 字节（128位）的密钥
export const ENCRYPTION_KEY = 'A9c3D7f1H5jL0xZ2';

// AES CBC 模式需要 16 字节（128位）的初始化向量
export const ENCRYPTION_IV = 'R3uX6yB9eH2kM5oQ';

/**
 * 加密字段元数据键
 */
export const ENCRYPTED_FIELDS_KEY = 'custom:encrypted_fields';

/**
 * 加密算法配置
 */
export const ENCRYPTION_CONFIG = {
  ALGORITHM: 'AES-128-CBC',
  KEY_LENGTH: 16, // 字节
  IV_LENGTH: 16, // 字节
} as const;
