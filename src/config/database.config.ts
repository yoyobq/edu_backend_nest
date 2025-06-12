import { ConfigFactory } from '@nestjs/config';

/**
 * 数据库配置工厂函数
 * 为 TypeORM 提供 MariaDB 数据库连接配置
 */
const databaseConfig: ConfigFactory = () => ({
  mariadb: {
    type: 'mariadb',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    timezone: process.env.DB_TIMEZONE || '+08:00',
    // 不根据 Entity 自动修改数据库
    synchronize: 'false',
    logging: process.env.DB_LOGGING === 'true',
    extra: {
      connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
      // 连接池已满，等待超时
      connectTimeout: 60000,
      // 是否等待连接释放
      waitForConnections: true,
      // 等待队列上限，0 为不限制
      queueLimit: 0,
    },
  },
});

export default databaseConfig;
