// src/modules/third-party-auth/third-party-auth.module.ts
import { HttpModule } from '@nestjs/axios';
import { Module, Provider, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountModule } from '@modules/account/account.module';
import { AuthModule } from '@modules/auth/auth.module';
import { ThirdPartyAuthEntity } from '@src/modules/account/base/entities/third-party-auth.entity';

import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { GetWeappPhoneUsecase } from '@usecases/third-party-accounts/get-weapp-phone.usecase';
import { GenerateWeappQrcodeUsecase } from '@usecases/third-party-accounts/generate-weapp-qrcode.usecase';
import { BindThirdPartyAccountUsecase } from '@usecases/third-party-accounts/bind-third-party-account.usecase';
import { UnbindThirdPartyAccountUsecase } from '@usecases/third-party-accounts/unbind-third-party-account.usecase';
import { ResolveThirdPartyIdentityUsecase } from '@usecases/third-party-accounts/resolve-third-party-identity.usecase';
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
    GetWeappPhoneUsecase, // 添加新的 usecase
    GenerateWeappQrcodeUsecase,
    BindThirdPartyAccountUsecase,
    UnbindThirdPartyAccountUsecase,
    ResolveThirdPartyIdentityUsecase,
  ],
  exports: [
    ThirdPartyAuthService,
    GetWeappPhoneUsecase,
    GenerateWeappQrcodeUsecase,
    BindThirdPartyAccountUsecase,
    UnbindThirdPartyAccountUsecase,
    ResolveThirdPartyIdentityUsecase,
  ], // 导出 usecase
})
export class ThirdPartyAuthModule {}
