// src/modules/thirdPartyAuth/third-party-auth.module.ts
import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { ThirdPartyAuthEntity } from '../account/entities/third-party-auth.entity';
import { AuthModule } from '../auth/auth.module';
import { ThirdPartyAuthResolver } from './third-party-auth.resolver';
import { ThirdPartyAuthService } from './third-party-auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ThirdPartyAuthEntity]),
    HttpModule,
    ConfigModule,
    AccountModule,
    forwardRef(() => AuthModule), // 使用 forwardRef 避免循环依赖
  ],
  providers: [ThirdPartyAuthService, ThirdPartyAuthResolver],
  exports: [ThirdPartyAuthService],
})
export class ThirdPartyAuthModule {}
