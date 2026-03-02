// src/modules/account/account-installer.module.ts
import { Module, Provider } from '@nestjs/common';
import { AccountModule } from './account.module';

/** 可注入的配置 Token（使用 Symbol 避免字符串冲突） */
export const IDENTITY_PRIORITY_TOKEN = Symbol('IDENTITY_PRIORITY_TOKEN');

/** 预设顺序（可按需调整） */
export const DEFAULT_IDENTITY_PRIORITY = {
  perAudience: {
    training: ['manager', 'coach', 'customer', 'learner'],
    school: ['staff', 'student'],
  },
  fallback: ['manager', 'coach', 'staff', 'student', 'customer', 'learner'],
  hintAutoPromote: false,
  hintAutoPromoteOnReactivate: false,
} as const;

/** 通过值推导的类型 */
export type IdentityPriorityConfig = typeof DEFAULT_IDENTITY_PRIORITY;

/** 从常量推导的受众类型（避免手写联合类型） */
export type Audience = keyof typeof DEFAULT_IDENTITY_PRIORITY.perAudience;

/** 从常量推导的身份键类型（避免手写联合类型） */
export type IdentityKey = (typeof DEFAULT_IDENTITY_PRIORITY.fallback)[number];

// eslint-disable-next-line @typescript-eslint/naming-convention
const IdentityPriorityProvider: Provider = {
  provide: IDENTITY_PRIORITY_TOKEN,
  useValue: DEFAULT_IDENTITY_PRIORITY,
};

/**
 * 账户安装器模块（非全局）
 * - 只在这里调用一次 AccountModule.forRoot(...) 完成装配
 * - 通过 re-export，让下游模块都能拿到 AccountModule 的导出（AccountService、PROFILE_PROVIDER_MAP_TOKEN 等）
 * - 如果以后要切换 preset（school/training/custom），只改这里即可
 * - 新增：提供身份优先级配置，可通过 IDENTITY_PRIORITY_TOKEN 注入使用
 */
@Module({
  imports: [
    // 👇 统一启用测试所需身份：包含 training
    // 为避免遗漏，采用 custom 显式列出，覆盖 E2E 中使用的所有身份
    AccountModule.forRoot({
      preset: 'custom',
      identities: ['staff', 'student', 'coach', 'manager', 'customer', 'learner'],
    }),
  ],
  providers: [IdentityPriorityProvider],
  // 关键点：直接导出 AccountModule，本模块的下游即可获得它\"导出的所有 provider\"
  //（包括 AccountService、FetchIdentityByRoleUsecase、PROFILE_PROVIDER_MAP_TOKEN 等）
  // 新增：导出身份优先级配置 Provider
  exports: [AccountModule, IdentityPriorityProvider],
})
export class AccountInstallerModule {}

/*
用法示例（任意 Service 内）：
import { Inject, Injectable } from '@nestjs/common';
@Injectable()
class IdentityHintUpdater {
  constructor(
    @Inject(IDENTITY_PRIORITY_TOKEN)
    private readonly priority: IdentityPriorityConfig,
  ) {}
  // this.priority.perAudience.training / school / fallback 可直接使用
  // TypeScript 会自动推导出正确的类型，包括 readonly 约束
}
*/
