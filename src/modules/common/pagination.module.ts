// src/modules/common/pagination.module.ts
// 绑定分页器与游标签名器实现，并导出 PaginationService

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaginationService } from './pagination.service';
import { PAGINATION_TOKENS } from './tokens/pagination.tokens';

import { HmacCursorSigner } from '@src/infrastructure/security/hmac-signer';
import { TypeOrmPaginator } from '@src/infrastructure/typeorm/pagination/typeorm-paginator';

@Module({
  imports: [TypeOrmModule],
  providers: [
    {
      provide: PAGINATION_TOKENS.CURSOR_SIGNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('pagination.hmacSecret');
        if (!secret) {
          // 允许缺省情况下使用一个占位符，但在生产必须配置
          return new HmacCursorSigner('dev-placeholder-secret');
        }
        return new HmacCursorSigner(secret);
      },
    },
    {
      provide: PAGINATION_TOKENS.PAGINATOR,
      inject: [PAGINATION_TOKENS.CURSOR_SIGNER],
      useFactory: (signer: HmacCursorSigner) =>
        new TypeOrmPaginator(signer, (field: string) => field),
    },
    PaginationService,
  ],
  exports: [PAGINATION_TOKENS.PAGINATOR, PAGINATION_TOKENS.CURSOR_SIGNER, PaginationService],
})
export class PaginationModule {}
