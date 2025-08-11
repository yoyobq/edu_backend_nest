// src/modules/thirdPartyAuth/third-party-auth.module.ts
import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountModule } from '../account/account.module';
import { ThirdPartyAuthEntity } from '../account/entities/third-party-auth.entity';
import { AuthModule } from '../auth/auth.module';

import { WeAppProvider } from './providers/weapp.provider';
import { ThirdPartyAuthResolver } from './third-party-auth.resolver';
import { ThirdPartyAuthService } from './third-party-auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ThirdPartyAuthEntity]),
    HttpModule,
    ConfigModule,
    forwardRef(() => AccountModule), // 若存在循环依赖更安全；无循环也可保留
    forwardRef(() => AuthModule),
  ],
  providers: [
    ThirdPartyAuthService,
    ThirdPartyAuthResolver,
    WeAppProvider, // ⬅️ 注册 WeAppProvider
  ],
  exports: [ThirdPartyAuthService],
})
export class ThirdPartyAuthModule {}
