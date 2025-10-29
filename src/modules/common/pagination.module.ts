// src/modules/common/pagination.module.ts
// 绑定分页器与游标签名器实现，并导出 PaginationService

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaginationService } from './pagination.service';
import { PAGINATION_TOKENS } from './tokens/pagination.tokens';

import { HmacCursorSigner } from '@src/infrastructure/security/hmac-signer';
import { TypeOrmPaginator } from '@src/infrastructure/typeorm/pagination/typeorm-paginator';

@Module({
  providers: [
    {
      provide: PAGINATION_TOKENS.CURSOR_SIGNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('pagination.hmacSecret');
        const nodeEnv = config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
        if (!secret) {
          if (nodeEnv === 'production') {
            throw new Error('pagination.hmacSecret is required in production');
          }
          return new HmacCursorSigner('dev-placeholder-secret');
        }
        return new HmacCursorSigner(secret);
      },
    },
    {
      provide: PAGINATION_TOKENS.PAGINATOR,
      inject: [PAGINATION_TOKENS.CURSOR_SIGNER],
      useFactory: (signer: HmacCursorSigner) =>
        // ★ 更安全：没有显式映射时返回 null，强制调用方提供 resolveColumn
        new TypeOrmPaginator(signer, (_field: string) => null),
    },
    PaginationService,
  ],
  exports: [PAGINATION_TOKENS.PAGINATOR, PAGINATION_TOKENS.CURSOR_SIGNER, PaginationService],
})
export class PaginationModule {}
