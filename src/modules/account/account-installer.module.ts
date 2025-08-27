import { Module } from '@nestjs/common';
import { AccountModule } from './account.module';

/**
 * 账户安装器模块（非全局）
 * - 只在这里调用一次 AccountModule.forRoot(...) 完成装配
 * - 通过 re-export，让下游模块都能拿到 AccountModule 的导出（AccountService、PROFILE_PROVIDER_MAP_TOKEN 等）
 * - 如果以后要切换 preset（school/training/custom），只改这里即可
 */
@Module({
  imports: [
    // 👇 按需要选择预设
    AccountModule.forRoot({ preset: 'training' }),
    // 或者：
    // AccountModule.forRoot({ preset: 'school' }),
    // AccountModule.forRoot({ preset: 'custom', identities: ['staff', 'manager'] }),
  ],
  // 关键点：直接导出 AccountModule，本模块的下游即可获得它“导出的所有 provider”
  //（包括 AccountService、FetchIdentityByRoleUsecase、PROFILE_PROVIDER_MAP_TOKEN 等）
  exports: [AccountModule],
})
export class AccountInstallerModule {}
