// src/core/config/pagination.config.ts
// 分页相关配置（提供 HMAC 游标签名密钥）

const paginationConfig = () => ({
  pagination: {
    hmacSecret: process.env.PAGINATION_HMAC_SECRET || 'dev-placeholder-secret',
  },
});

export default paginationConfig;
