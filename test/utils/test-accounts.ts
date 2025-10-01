// test/utils/test-accounts.ts
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { AccountStatus, IdentityTypeEnum } from '@src/types/models/account.types';
import { Gender, UserState } from '@src/types/models/user-info.types';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { DataSource } from 'typeorm';

export interface TestAccountConfig {
  loginName: string;
  loginEmail: string;
  loginPassword: string;
  status: AccountStatus;
  accessGroup: IdentityTypeEnum[];
  identityType: IdentityTypeEnum;
}

export const testAccountsConfig: Record<string, TestAccountConfig> = {
  manager: {
    loginName: 'testmanager',
    loginEmail: 'manager@example.com',
    loginPassword: 'password123',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.MANAGER],
    identityType: IdentityTypeEnum.MANAGER,
  },
  coach: {
    loginName: 'testcoach',
    loginEmail: 'coach@example.com',
    loginPassword: 'password123',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.COACH],
    identityType: IdentityTypeEnum.COACH,
  },
  admin: {
    loginName: 'testadmin',
    loginEmail: 'admin@example.com',
    loginPassword: 'password123',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.ADMIN],
    // ✅ 修正：与 roles-guard.e2e-spec.ts 保持一致，使用 REGISTRANT
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  customer: {
    loginName: 'testcustomer',
    loginEmail: 'customer@example.com',
    loginPassword: 'password123',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.CUSTOMER],
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  guest: {
    loginName: 'testguest',
    loginEmail: 'guest@example.com',
    loginPassword: 'password123',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.GUEST],
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  emptyRoles: {
    loginName: 'testempty',
    loginEmail: 'empty@example.com',
    loginPassword: 'password123',
    status: AccountStatus.ACTIVE,
    accessGroup: [], // 空数组，符合测试期望
    identityType: IdentityTypeEnum.REGISTRANT,
  },
};

/**
 * 清理所有与测试账号相关的数据
 * （按外键方向：先身份表 → user_info → account）
 */
export const cleanupTestAccounts = async (dataSource: DataSource): Promise<void> => {
  await dataSource.getRepository(ManagerEntity).clear();
  await dataSource.getRepository(CoachEntity).clear();
  await dataSource.getRepository(UserInfoEntity).clear();
  await dataSource.getRepository(AccountEntity).clear();
};

/**
 * 造数入口（优先用 Usecase；无 Usecase 时走 repo 回落）
 * - 不写 metaDigest，交由系统内部一致性逻辑生成
 * - 对需要的身份（MANAGER/COACH）补齐身份表
 */
export const seedTestAccounts = async (opts: {
  dataSource: DataSource;
  createAccountUsecase?: CreateAccountUsecase;
  // 可选：显式指定要创建哪些 key，不传则全量
  includeKeys?: Array<keyof typeof testAccountsConfig>;
}): Promise<void> => {
  const { dataSource, createAccountUsecase, includeKeys } = opts;
  const list = includeKeys ?? Object.keys(testAccountsConfig);

  for (const key of list) {
    const cfg = testAccountsConfig[key];

    if (createAccountUsecase) {
      // ✅ 首选：走 Usecase（最贴近真实流程）
      const created = await createAccountUsecase.execute({
        accountData: {
          loginName: cfg.loginName,
          loginEmail: cfg.loginEmail,
          loginPassword: cfg.loginPassword,
          status: cfg.status,
          identityHint: cfg.identityType,
        },
        userInfoData: {
          nickname: `${cfg.loginName}_nickname`,
          gender: Gender.SECRET,
          birthDate: null,
          avatarUrl: null,
          email: cfg.loginEmail,
          signature: null,
          accessGroup: cfg.accessGroup,
          address: null,
          phone: null,
          tags: null,
          geographic: null,
          // ✅ 设置 metaDigest 与 accessGroup 保持一致，避免安全检查失败
          metaDigest: cfg.accessGroup,
          notifyCount: 0,
          unreadCount: 0,
          userState: UserState.ACTIVE,
        },
      });

      // 身份补齐
      if (cfg.identityType === IdentityTypeEnum.MANAGER) {
        await dataSource.getRepository(ManagerEntity).save(
          dataSource.getRepository(ManagerEntity).create({
            accountId: created.id,
            name: `${cfg.loginName}_manager_name`,
            deactivatedAt: null,
            remark: `测试用 manager 身份记录 - ${cfg.loginName}`,
            createdBy: null,
            updatedBy: null,
          }),
        );
      } else if (cfg.identityType === IdentityTypeEnum.COACH) {
        await dataSource.getRepository(CoachEntity).save(
          dataSource.getRepository(CoachEntity).create({
            accountId: created.id,
            name: `${cfg.loginName}_coach_name`,
            level: 1,
            description: `测试用 coach 描述 - ${cfg.loginName}`,
            avatarUrl: null,
            specialty: '篮球',
            deactivatedAt: null,
            remark: `测试用 coach 身份记录 - ${cfg.loginName}`,
            createdBy: null,
            updatedBy: null,
          }),
        );
      }
      continue;
    }

    // ⬇ 回落路径：不依赖 Usecase（直接 repo）
    const accountRepo = dataSource.getRepository(AccountEntity);
    const userInfoRepo = dataSource.getRepository(UserInfoEntity);

    // 1) 先插入占位账号，拿到 createdAt
    const temp = await accountRepo.save(
      accountRepo.create({
        loginName: cfg.loginName,
        loginEmail: cfg.loginEmail,
        loginPassword: 'temp', // 占位
        status: cfg.status,
        identityHint: cfg.identityType,
      }),
    );
    // 2) 根据 createdAt 计算散列并回写
    const hashed = AccountService.hashPasswordWithTimestamp(cfg.loginPassword, temp.createdAt);
    await accountRepo.update(temp.id, { loginPassword: hashed });

    // 3) 写 user_info（设置 metaDigest 与 accessGroup 保持一致）
    await userInfoRepo.save(
      userInfoRepo.create({
        accountId: temp.id,
        nickname: `${cfg.loginName}_nickname`,
        gender: Gender.SECRET,
        email: cfg.loginEmail,
        accessGroup: cfg.accessGroup,
        // ✅ 设置 metaDigest 与 accessGroup 保持一致，避免安全检查失败
        metaDigest: cfg.accessGroup,
        notifyCount: 0,
        unreadCount: 0,
        userState: UserState.ACTIVE,
      }),
    );

    // 4) 身份补齐
    if (cfg.identityType === IdentityTypeEnum.MANAGER) {
      await dataSource.getRepository(ManagerEntity).save(
        dataSource.getRepository(ManagerEntity).create({
          accountId: temp.id,
          name: `${cfg.loginName}_manager_name`,
          deactivatedAt: null,
          remark: `测试用 manager 身份记录 - ${cfg.loginName}`,
          createdBy: null,
          updatedBy: null,
        }),
      );
    } else if (cfg.identityType === IdentityTypeEnum.COACH) {
      await dataSource.getRepository(CoachEntity).save(
        dataSource.getRepository(CoachEntity).create({
          accountId: temp.id,
          name: `${cfg.loginName}_coach_name`,
          level: 1,
          description: `测试用 coach 描述 - ${cfg.loginName}`,
          avatarUrl: null,
          specialty: '篮球',
          deactivatedAt: null,
          remark: `测试用 coach 身份记录 - ${cfg.loginName}`,
          createdBy: null,
          updatedBy: null,
        }),
      );
    }
  }
};
