// test/utils/test-accounts.ts
import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { MembershipLevel } from '@app-types/models/training.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { StaffEntity } from '@src/modules/account/identities/school/staff/account-staff.entity';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { DataSource } from 'typeorm';

export interface TestAccountConfig {
  loginName: string;
  loginEmail: string;
  loginPassword: string;
  status: AccountStatus;
  accessGroup: IdentityTypeEnum[];
  identityType: IdentityTypeEnum;
  customerProfile?: {
    contactPhone: string;
    preferredContactTime: string;
    membershipLevel: MembershipLevel;
  };
}

export const testAccountsConfig: Record<string, TestAccountConfig> = {
  staff: {
    loginName: 'teststaff',
    loginEmail: 'staff@example.com',
    loginPassword: 'testStaff@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.STAFF],
    identityType: IdentityTypeEnum.STAFF,
  },
  manager: {
    loginName: 'testmanager',
    loginEmail: 'manager@example.com',
    loginPassword: 'testManager@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.MANAGER],
    identityType: IdentityTypeEnum.MANAGER,
  },
  coach: {
    loginName: 'testcoach',
    loginEmail: 'coach@example.com',
    loginPassword: 'testCoach@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.COACH],
    identityType: IdentityTypeEnum.COACH,
  },
  admin: {
    loginName: 'testadmin',
    loginEmail: 'admin@example.com',
    loginPassword: 'testAdmin@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.ADMIN, IdentityTypeEnum.REGISTRANT],
    // ✅ 修正：与 roles-guard.e2e-spec.ts 保持一致，使用 REGISTRANT
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  customer: {
    loginName: 'testcustomer',
    loginEmail: 'customer@example.com',
    loginPassword: 'testCustomer@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.CUSTOMER],
    identityType: IdentityTypeEnum.CUSTOMER,
  },
  learner: {
    loginName: 'testlearner',
    loginEmail: 'learner@example.com',
    loginPassword: 'testLearner@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.LEARNER],
    identityType: IdentityTypeEnum.LEARNER,
  },
  guest: {
    loginName: 'testguest',
    loginEmail: 'guest@example.com',
    loginPassword: 'testGuest@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.GUEST, IdentityTypeEnum.REGISTRANT],
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  emptyRoles: {
    loginName: 'testempty',
    loginEmail: 'empty@example.com',
    loginPassword: 'testEmpty@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [], // 空数组，符合测试期望
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  coachCustomer: {
    loginName: 'testcoachcustomer',
    loginEmail: 'coachcustomer@example.com',
    loginPassword: 'testCoachCustomer@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.COACH, IdentityTypeEnum.CUSTOMER],
    identityType: IdentityTypeEnum.COACH,
  },
};

/**
 * 清理所有与测试账号相关的数据
 * （按外键方向：先身份表 → user_info → account）
 */
export const cleanupTestAccounts = async (dataSource: DataSource): Promise<void> => {
  await dataSource.getRepository(StaffEntity).clear(); // 先清 Staff（不依赖其他 FK）
  await dataSource.getRepository(LearnerEntity).clear(); // ✅ 新增：先清 Learner（有 FK 指向 Customer）
  await dataSource.getRepository(CustomerEntity).clear(); // ✅ 新增：再清 Customer
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
  createAccountUsecase?: CreateAccountUsecase | null;
  // 可选：显式指定要创建哪些 key，不传则全量
  includeKeys?: Array<keyof typeof testAccountsConfig>;
}): Promise<void> => {
  const { dataSource, createAccountUsecase, includeKeys } = opts;
  const list = includeKeys ?? Object.keys(testAccountsConfig);
  // 用于存储创建的账号ID，方便后续补充身份表
  const createdMap = new Map<string, number>();

  // 第一步：创建所有账号
  await Promise.all(
    list.map(async (key) => {
      const cfg = testAccountsConfig[key];
      const result = await createAccountCore(dataSource, createAccountUsecase || null, cfg);
      createdMap.set(key, result.accountId);
    }),
  );

  // 第二步：创建身份记录
  for (const key of list) {
    const cfg = testAccountsConfig[key];
    const accountId = createdMap.get(key);
    if (!accountId) continue;

    await createIdentityForAccount(dataSource, {
      key,
      cfg,
      accountId,
      createAccountUsecase: createAccountUsecase || null,
      createdMap,
    });
  }
};

/**
 * 为账号创建对应的身份记录
 */
const createIdentityForAccount = async (
  dataSource: DataSource,
  params: {
    key: string;
    cfg: TestAccountConfig;
    accountId: number;
    createAccountUsecase: CreateAccountUsecase | null;
    createdMap: Map<string, number>;
  },
): Promise<void> => {
  const { cfg, accountId, createAccountUsecase, createdMap } = params;

  // Manager 身份
  if (cfg.identityType === IdentityTypeEnum.MANAGER) {
    await createManagerIdentity(dataSource, cfg, accountId);
  }
  // Coach 身份
  else if (cfg.identityType === IdentityTypeEnum.COACH) {
    await createCoachIdentity(dataSource, cfg, accountId);
  }
  // Staff 身份
  else if (cfg.identityType === IdentityTypeEnum.STAFF) {
    await createStaffIdentity(dataSource, cfg, accountId);
  }
  // Customer 身份
  else if (
    cfg.identityType === IdentityTypeEnum.CUSTOMER ||
    cfg.accessGroup.includes(IdentityTypeEnum.CUSTOMER)
  ) {
    await createCustomerIdentity(dataSource, cfg, accountId);
  }
  // Learner 身份
  else if (cfg.identityType === IdentityTypeEnum.LEARNER) {
    await createLearnerIdentity({
      dataSource,
      cfg,
      accountId,
      createAccountUsecase,
      createdMap,
    });
  }
};

/**
 * 创建 Staff 身份
 */
const createStaffIdentity = async (
  dataSource: DataSource,
  cfg: TestAccountConfig,
  accountId: number,
): Promise<void> => {
  const repo = dataSource.getRepository(StaffEntity);
  const exists = await repo.findOne({ where: { accountId } });
  if (!exists) {
    // StaffEntity.id 是 varchar(8)，GraphQL 会通过 parseStaffId 转为 number
    // 这里采用一个简单的纯数字字符串，符合 parseStaffId 要求
    const staffId = '10000001';
    await repo.save(
      repo.create({
        id: staffId,
        accountId,
        name: `${cfg.loginName}_staff_name`,
        departmentId: 101,
        remark: `测试用 staff 身份记录 - ${cfg.loginName}`,
        jobTitle: '教师',
      }),
    );
  }
};

/**
 * 创建 Manager 身份
 */
const createManagerIdentity = async (
  dataSource: DataSource,
  cfg: TestAccountConfig,
  accountId: number,
): Promise<void> => {
  const repo = dataSource.getRepository(ManagerEntity);
  const exists = await repo.findOne({ where: { accountId } });
  if (!exists) {
    await repo.save(
      repo.create({
        accountId,
        name: `${cfg.loginName}_manager_name`,
        deactivatedAt: null,
        remark: `测试用 manager 身份记录 - ${cfg.loginName}`,
        createdBy: null,
        updatedBy: null,
      }),
    );
  }
};

/**
 * 创建 Coach 身份
 */
const createCoachIdentity = async (
  dataSource: DataSource,
  cfg: TestAccountConfig,
  accountId: number,
): Promise<void> => {
  const repo = dataSource.getRepository(CoachEntity);
  const exists = await repo.findOne({ where: { accountId } });
  if (!exists) {
    await repo.save(
      repo.create({
        accountId,
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
};

/**
 * 创建 Customer 身份
 */
const createCustomerIdentity = async (
  dataSource: DataSource,
  cfg: TestAccountConfig,
  accountId: number,
): Promise<void> => {
  const repo = dataSource.getRepository(CustomerEntity);
  const exists = await repo.findOne({ where: { accountId } });
  if (!exists) {
    const p = cfg.customerProfile ?? {
      contactPhone: '13800138000',
      preferredContactTime: '09:00-18:00',
      membershipLevel: 1,
    };
    await repo.save(
      repo.create({
        accountId,
        name: `${cfg.loginName}_customer_name`,
        contactPhone: p.contactPhone,
        preferredContactTime: p.preferredContactTime,
        membershipLevel: p.membershipLevel,
        deactivatedAt: null,
        remark: `测试用 customer 身份记录 - ${cfg.loginName}`,
        createdBy: null,
        updatedBy: null,
      }),
    );
  }
};

/**
 * 创建 Learner 身份
 */
const createLearnerIdentity = async (params: {
  dataSource: DataSource;
  cfg: TestAccountConfig;
  accountId: number;
  createAccountUsecase: CreateAccountUsecase | null;
  createdMap: Map<string, number>;
}): Promise<void> => {
  const { dataSource, cfg, accountId, createAccountUsecase, createdMap } = params;
  const learnerRepo = dataSource.getRepository(LearnerEntity);
  const learnerExists = await learnerRepo.findOne({ where: { accountId } });

  if (learnerExists) return;

  // 确保存在一个 Customer 供关联
  const customerRepo = dataSource.getRepository(CustomerEntity);
  let customer = await customerRepo.findOne({ where: { id: 1 } });

  if (!customer) {
    // 若 DB 尚无 customer，则用预设的 customer 自动补一份
    customer = await ensureCustomerExists(dataSource, createAccountUsecase, createdMap);
  }

  // 创建 Learner 身份
  await learnerRepo.save(
    learnerRepo.create({
      accountId,
      customerId: customer.id,
      name: `${cfg.loginName}_learner_name`,
      gender: Gender.SECRET,
      birthDate: null,
      avatarUrl: null,
      specialNeeds: '测试用特殊需求',
      countPerSession: 1,
      deactivatedAt: null,
      remark: `测试用 learner 身份记录 - ${cfg.loginName}`,
      createdBy: null,
      updatedBy: null,
    }),
  );
};

/**
 * 确保存在 Customer 记录
 */
const ensureCustomerExists = async (
  dataSource: DataSource,
  createAccountUsecase: CreateAccountUsecase | null,
  _createdMap: Map<string, number>,
): Promise<CustomerEntity> => {
  const customerCfg = testAccountsConfig.customer;
  const customerRepo = dataSource.getRepository(CustomerEntity);

  // 1) 账号+user_info
  const existedAccount = await dataSource
    .getRepository(AccountEntity)
    .findOne({ where: { loginName: customerCfg.loginName } });

  const customerAccountId =
    existedAccount?.id ??
    (await createAccountCore(dataSource, createAccountUsecase, customerCfg)).accountId;

  // 2) Customer 身份
  const p = customerCfg.customerProfile ?? {
    contactPhone: '13800138000',
    preferredContactTime: '09:00-18:00',
    membershipLevel: 1,
  };

  return customerRepo.save(
    customerRepo.create({
      accountId: customerAccountId,
      name: `${customerCfg.loginName}_customer_name`,
      contactPhone: p.contactPhone,
      preferredContactTime: p.preferredContactTime,
      membershipLevel: p.membershipLevel,
      deactivatedAt: null,
      remark: `测试用 customer 身份记录 - ${customerCfg.loginName}`,
      createdBy: null,
      updatedBy: null,
    }),
  );
};

/**
 * 创建账号的核心逻辑（可被复用）
 * @returns 创建的账号ID
 */
const createAccountCore = async (
  dataSource: DataSource,
  createAccountUsecase: CreateAccountUsecase | null,
  cfg: TestAccountConfig,
): Promise<{ accountId: number }> => {
  if (createAccountUsecase) {
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
        metaDigest: cfg.accessGroup,
        notifyCount: 0,
        unreadCount: 0,
        userState: UserState.ACTIVE,
      },
    });
    return { accountId: created.id };
  }

  // 回落路径：不依赖 Usecase（直接 repo）
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

  return { accountId: temp.id };
};
