import { ConfigFactory } from '@nestjs/config';

/**
 * 数据库配置工厂函数
 * 为 TypeORM 提供 MySQL 8.0 数据库连接配置
 */
const databaseConfig: ConfigFactory = () => ({
  mysql: {
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    timezone: process.env.DB_TIMEZONE || '+08:00',
    // 不根据 Entity 自动修改数据库
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    // MySQL 8.0 特定配置
    charset: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci',
    extra: {
      connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
      // 连接超时时间（毫秒）
      connectTimeout: 60000,
      // 是否等待连接释放
      waitForConnections: true,
      // 等待队列上限，0 为不限制
      queueLimit: 0,
    },
  },
});

export default databaseConfig;
