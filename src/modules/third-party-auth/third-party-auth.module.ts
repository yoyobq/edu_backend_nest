// src/modules/thirdPartyAuth/third-party-auth.module.ts
import { HttpModule } from '@nestjs/axios';
import { Module, Provider, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountModule } from '@modules/account/account.module';
import { ThirdPartyAuthEntity } from '@modules/account/entities/third-party-auth.entity';
import { AuthModule } from '@modules/auth/auth.module';

import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { ThirdPartyAuthResolver } from '../../adapters/graphql/third-party-accounts/third-party-auth.resolver';
import { ThirdPartyProvider } from './interfaces/third-party-provider.interface';
import { WeAppProvider } from './providers/weapp.provider';
import { WechatProvider } from './providers/wechat.provider';
import { PROVIDER_MAP, ThirdPartyAuthService } from './third-party-auth.service';

/**
 * 第三方认证提供者映射工厂
 * 创建平台类型到具体提供者实现的映射关系
 */
const providerMapFactory: Provider = {
  provide: PROVIDER_MAP,
  useFactory: (weapp: WeAppProvider, wechat: WechatProvider) => {
    // 构建第三方平台类型到提供者实现的映射
    const map = new Map<ThirdPartyProviderEnum, ThirdPartyProvider>([
      [weapp.provider, weapp],
      [wechat.provider, wechat],
      // TODO: 添加更多第三方平台支持 (GitHub、Google、QQ 等)
    ]);
    return map;
  },
  inject: [WeAppProvider, WechatProvider],
};

/**
 * 第三方认证模块
 * 提供统一的第三方平台认证、绑定、解绑等功能
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ThirdPartyAuthEntity]),
    HttpModule,
    ConfigModule,
    forwardRef(() => AccountModule),
    forwardRef(() => AuthModule),
  ],
  providers: [
    WeAppProvider,
    WechatProvider,
    providerMapFactory,
    ThirdPartyAuthService,
    ThirdPartyAuthResolver,
  ],
  exports: [ThirdPartyAuthService],
})
export class ThirdPartyAuthModule {}
