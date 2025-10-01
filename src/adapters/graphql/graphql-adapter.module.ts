// src/adapters/graphql/graphql-adapter.module.ts

import { AuthModule } from '@modules/auth/auth.module';
import { CourseCatalogsModule } from '@modules/course-catalogs/course-catalogs.module';
import { RegisterModule } from '@modules/register/register.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { VerificationRecordModule } from '@modules/verification-record/verification-record.module';
import { Module } from '@nestjs/common';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';

// Resolvers
import { AccountResolver } from './account/account.resolver';
import { AuthResolver } from './auth/auth.resolver';
import { CourseCatalogResolver } from './course-catalogs/course-catalog.resolver';
import { RegistrationResolver } from './registration/registration.resolver';
import { ThirdPartyAuthResolver } from './third-party-auth/third-party-auth.resolver';
import { VerificationRecordResolver } from './verification-record/verification-record.resolver';
import { CertificateVerificationResolver } from './verification-record/certificate-verification.resolver';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * GraphQL 适配器模块
 * 统一管理所有 GraphQL Resolvers 和相关的 Guards，遵循适配器层架构原则
 */
@Module({
  imports: [
    // 导入业务模块以获取服务
    AccountInstallerModule, // 或根据你的需求选择合适的预设
    AuthModule,
    RegisterModule,
    ThirdPartyAuthModule,
    CourseCatalogsModule, // 导入课程目录模块
    VerificationRecordModule, // 导入验证记录模块
  ],
  providers: [
    // 注册所有 GraphQL Resolvers
    AccountResolver,
    AuthResolver,
    RegistrationResolver,
    ThirdPartyAuthResolver,
    CourseCatalogResolver, // 注册课程目录 resolver
    VerificationRecordResolver, // 注册验证记录 resolver
    CertificateVerificationResolver, // 注册证书验证 resolver
    // 注册 GraphQL 相关的 Guards
    JwtAuthGuard,
  ],
  exports: [
    // 导出 resolvers 和 guards 供 AppModule 使用
    AccountResolver,
    AuthResolver,
    RegistrationResolver,
    ThirdPartyAuthResolver,
    CourseCatalogResolver, // 导出课程目录 resolver
    VerificationRecordResolver, // 导出验证记录 resolver
    CertificateVerificationResolver, // 导出证书验证 resolver
    JwtAuthGuard,
  ],
})
export class GraphQLAdapterModule {}
