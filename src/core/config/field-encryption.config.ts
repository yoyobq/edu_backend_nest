/**
 * 加密相关配置
 * 注意：生产环境应从环境变量中读取密钥，下面的默认值仅用于开发/本地
 */
export const FIELD_ENCRYPTION_CONFIG = {
  // AES-128 需要 16 字节（128 位）的密钥
  KEY: process.env.FIELD_ENCRYPTION_KEY ?? 'A9c3D7f1H5jL0xZ2',

  // AES CBC 模式需要 16 字节（128 位）的初始化向量
  IV: process.env.FIELD_ENCRYPTION_IV ?? 'R3uX6yB9eH2kM5oQ',

  /**
   * 加密算法配置
   */
  META: {
    ALGORITHM: 'AES-128-CBC',
    KEY_LENGTH: 16, // 字节
    IV_LENGTH: 16, // 字节
  } as const,
};
