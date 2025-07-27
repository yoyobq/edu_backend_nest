// src/modules/common/common.module.ts

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';
import { TokenHelper } from './token/token.helper';

@Module({
  imports: [
    JwtModule, // 确保导入 JwtModule
    LoggerModule, // 导入 LoggerModule 以使用 PinoLogger
  ],
  providers: [TokenHelper],
  exports: [TokenHelper], // 导出以供其他模块使用
})
export class CommonModule {}
