// src/modules/account/account.module.ts
/**
 * AccountModule（动态装配版，精简类型）
 * ------------------------------------------------------------
 * - base 永远启用；identities（staff/student/coach/...）按需插拔
 * - forRoot(options) 决定启用哪些身份包
 * - 身份 Provider 采用“每身份唯一 token”（Symbol）注册；在本模块内部聚合为 Map(identity -> provider)
 * - 对外只导出 PROFILE_PROVIDER_MAP_TOKEN（聚合后的 Map），不导出底层 token
 */

import { FieldEncryptionModule } from '@core/field-encryption/field-encryption.module';
import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountEntity } from './base/entities/account.entity';
import { UserInfoEntity } from './base/entities/user-info.entity';
import { AccountService } from './base/services/account.service';

import {
  PROFILE_PROVIDER_MAP_TOKEN, // 对外：聚合 Map token
  PROFILE_PROVIDER_TOKEN, // 内部：每身份唯一 token（Symbol）
} from './base/constants/provider-tokens';

// 如这些 GraphQL 类型迁入各身份包，请移除以下 side-effect import，避免关闭身份后 schema 残留
import '@src/adapters/graphql/account/enums/login-history.types';

// 可选用例
import { FetchIdentityByRoleUsecase } from '@usecases/account/fetch-identity-by-role.usecase';
import { FetchUserInfoUsecase } from '@usecases/account/fetch-user-info.usecase';
import { GetAccountByIdUsecase } from '@usecases/account/get-account-by-id.usecase';
import { GetVisibleUserInfoUsecase } from '@usecases/account/get-visible-user-info.usecase';
import { UpdateVisibleUserInfoUsecase } from '@usecases/account/update-visible-user-info.usecase';

// 身份包模块
import { AccountSecurityService } from './base/services/account-security.service';
import { StaffIdentityModule, StudentIdentityModule } from './identities/school';
import {
  CoachIdentityModule,
  CustomerIdentityModule,
  LearnerIdentityModule,
  ManagerIdentityModule,
} from './identities/training';

/** 预设：school / training / custom */
export type IdentityPreset = 'school' | 'training' | 'custom';

/** 身份标记（小写，便于配置） */
export type IdentityFlag = 'staff' | 'student' | 'coach' | 'manager' | 'customer' | 'learner';

/** Nest imports 的精简联合类型（够用且无 any） */
type NestModuleImport = Type<unknown> | DynamicModule;

/** forRoot 入参 */
export interface AccountModuleOptions {
  preset?: IdentityPreset; // 'school' | 'training' | 'custom'
  identities?: IdentityFlag[]; // preset = 'custom' 时生效
}

/** 预设 -> 身份列表 */
const PRESET_MAP: Record<Exclude<IdentityPreset, 'custom'>, IdentityFlag[]> = {
  school: ['staff', 'student'],
  training: ['coach', 'manager', 'customer', 'learner'],
};

/** 身份 -> 对应 Nest 模块 */
const IDENTITY_TO_MODULE: Partial<Record<IdentityFlag, NestModuleImport>> = {
  staff: StaffIdentityModule,
  student: StudentIdentityModule,
  coach: CoachIdentityModule,
  manager: ManagerIdentityModule,
  customer: CustomerIdentityModule,
  learner: LearnerIdentityModule,
};

/** 小写标记 -> 唯一 Provider token（Symbol） */
const FLAG_TO_TOKEN: Readonly<Record<IdentityFlag, symbol>> = {
  staff: PROFILE_PROVIDER_TOKEN.STAFF,
  student: PROFILE_PROVIDER_TOKEN.STUDENT,
  coach: PROFILE_PROVIDER_TOKEN.COACH,
  manager: PROFILE_PROVIDER_TOKEN.MANAGER,
  customer: PROFILE_PROVIDER_TOKEN.CUSTOMER,
  learner: PROFILE_PROVIDER_TOKEN.LEARNER,
};

@Module({})
export class AccountModule {
  /**
   * 动态账户模块
   * - 未传或 custom+空 identities 时，仅启用 base
   */
  static forRoot(
    options: AccountModuleOptions = { preset: 'custom', identities: [] },
  ): DynamicModule {
    // 1) 解析最终启用的身份列表
    const list: IdentityFlag[] =
      options.preset && options.preset !== 'custom'
        ? PRESET_MAP[options.preset]
        : (options.identities ?? []);

    // 2) 导入对应身份模块（过滤 undefined）
    const identityModules: NestModuleImport[] = list
      .map((k) => IDENTITY_TO_MODULE[k])
      .filter((m): m is NestModuleImport => m !== undefined);

    // 3) 计算需要注入的身份 Provider token（Symbol 数组）
    const injectTokens: symbol[] = list.map((flag) => FLAG_TO_TOKEN[flag]);

    // 4) 聚合工厂：把若干身份 Provider 汇总成 Map(identity -> provider)
    const providerMapFactory: Provider = {
      provide: PROFILE_PROVIDER_MAP_TOKEN,
      useFactory: (
        ...providers: import('./base/interfaces/account-profile-provider.interface').AccountProfileProvider<unknown>[]
      ): Map<
        string,
        import('./base/interfaces/account-profile-provider.interface').AccountProfileProvider<unknown>
      > => {
        const map = new Map<
          string,
          import('./base/interfaces/account-profile-provider.interface').AccountProfileProvider<unknown>
        >();
        for (const p of providers) {
          if (p?.identity) map.set(p.identity, p);
        }
        return map;
      },
      inject: injectTokens, // 动态注入，仅包含启用身份的 token
    };

    return {
      module: AccountModule,
      imports: [
        TypeOrmModule.forFeature([AccountEntity, UserInfoEntity]), // base 实体
        FieldEncryptionModule,
        ...identityModules, // 启用的身份模块
      ],
      providers: [
        AccountService,
        AccountSecurityService,
        FetchIdentityByRoleUsecase,
        FetchUserInfoUsecase, // 添加这一行
        GetAccountByIdUsecase,
        GetVisibleUserInfoUsecase,
        UpdateVisibleUserInfoUsecase,
        providerMapFactory, // 聚合 Map
      ],
      exports: [
        TypeOrmModule,
        AccountService,
        FetchIdentityByRoleUsecase,
        FetchUserInfoUsecase, // 添加这一行
        GetAccountByIdUsecase,
        GetVisibleUserInfoUsecase,
        UpdateVisibleUserInfoUsecase,
        PROFILE_PROVIDER_MAP_TOKEN, // 对外只暴露聚合后的 Map
      ],
    };
  }
}
