// src/core/jwt/jwt.module.ts

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Algorithm } from 'jsonwebtoken';

/**
 * JWT 核心模块
 * 提供 JWT 相关的配置和服务
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<string>('jwt.expiresIn'),
          algorithm: config.get<string>('jwt.algorithm') as Algorithm,
          issuer: config.get<string>('jwt.issuer'),
          audience: config.get<string>('jwt.audience'),
        },
      }),
    }),
  ],
  exports: [JwtModule],
})
export class CoreJwtModule {}
