// test/jest-e2e.js

/** 集中开关：只运行这里列出的 e2e 文件（相对 test/ 的路径） */
// 注释/取消注释即可控制
const ENABLED_SPECS = [
  // '00-app/00-app.e2e-spec.ts',
  // '01-auth/auth-identity.e2e-spec.ts',
  // '01-auth/auth.e2e-spec.ts',
  // '02-register/register.e2e-spec.ts',
  // '03-roles-guard/roles-guard.e2e-spec.ts',
  // '04-course/course-catalogs.e2e-spec.ts',
  // '04-course/create-series-draft.e2e-spec.ts',
  // '04-course/payout-rules.e2e-spec.ts',
  // '05-verification-record/verification-record.e2e-spec.ts',
  // '05-verification-record/verification-record-types.e2e-spec.ts',
  // '05-verification-record/verification-record-invite.e2e-spec.ts',
  // '06-identity-management/identity-management.e2e-spec.ts',
  // '06-identity-management/learner-management.e2e-spec.ts',
  // '06-identity-management/customer-management.e2e-spec.ts',
  // '06-identity-management/coach-management.e2e-spec.ts',
  // '06-identity-management/manager-management.e2e-spec.ts',
  // '07-pagination-sort-search/pagination.e2e-spec.ts',
  // '07-pagination-sort-search/learners-pagination.e2e-spec.ts',
  // '07-pagination-sort-search/sort.e2e-spec.ts',
  // '07-pagination-sort-search/search.e2e-spec.ts',
  // '08-integration-events/outbox-dispatcher.e2e-spec.ts',
  '08-integration-events/course-workflows.e2e-spec.ts',
];

/** 可选：命令行临时指定（逗号分隔）
 *  E2E_SPECS="03-roles-guard/roles-guard.e2e-spec.ts,01-auth/auth.e2e-spec.ts"
 */
const fromEnv = (process.env.E2E_SPECS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const selected = (fromEnv.length ? fromEnv : ENABLED_SPECS).map((p) => `<rootDir>/test/${p}`);

const fallbackPattern = ['<rootDir>/test/**/?(*.)e2e-spec.ts'];

// 为了确保 rootDir 解析稳定，使用绝对路径
const path = require('path');

module.exports = {
  preset: 'ts-jest',
  // 原来是 '../'，改为绝对路径更稳妥
  rootDir: path.resolve(__dirname, '..'),
  testEnvironment: 'node',

  moduleFileExtensions: ['ts', 'js', 'json'],

  // 关键：文件级开关
  testMatch: selected.length ? selected : fallbackPattern,

  testPathIgnorePatterns: ['/node_modules/', '\\.skip\\.ts$', '/__.*\\.skip__/', '/.*\\.skip/'],

  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },

  setupFiles: ['tsconfig-paths/register'],

  globalSetup: '<rootDir>/test/global-setup-e2e.ts',
  globalTeardown: '<rootDir>/test/global-teardown-e2e.ts',

  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@usecases/(.*)$': '<rootDir>/src/usecases/$1',
    '^@adapters/(.*)$': '<rootDir>/src/adapters/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@app-types/(.*)$': '<rootDir>/src/types/$1',
    '^src/(.*)$': '<rootDir>/src/$1',
  },

  testTimeout: 30000,

  // 串行执行由 CLI --runInBand 控制；避免与 CLI 互斥参数冲突
  // 如需并发可移除此配置，改用 CLI 侧控制
  // maxWorkers: 1,

  forceExit: true,
  detectOpenHandles: true,
};
