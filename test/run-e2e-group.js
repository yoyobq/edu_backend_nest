// test/run-e2e-group.js
const { spawnSync } = require('child_process');

const jestConfig = require('./jest-e2e.js');

/**
 * 解析逗号分隔的文件列表
 * @param {string | undefined} raw 原始环境变量
 * @returns {string[]}
 */
const parseCsv = (raw) =>
  (raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * 将分组 needs 对象转为逗号分隔字符串
 * @param {Record<string, boolean> | undefined} needs 依赖映射
 * @returns {string}
 */
const parseNeeds = (needs) =>
  Object.entries(needs || {})
    .filter((entry) => entry[1] === true)
    .map((entry) => entry[0])
    .join(',');

/**
 * 按分组逐个文件执行 E2E，避免单进程加载全部 schema 引发冲突
 * @returns {void}
 */
const run = () => {
  const groups = jestConfig.__GROUPS || {};
  const groupName = process.argv[2] || process.env.E2E_GROUP || 'core';
  const group = groups[groupName];

  if (!group) {
    console.error(`Unknown E2E group: ${groupName}`);
    process.exit(1);
  }

  const needs = process.env.E2E_NEEDS || parseNeeds(group.needs);
  const specsFromEnv = parseCsv(process.env.E2E_SPECS);
  const specs = specsFromEnv.length ? specsFromEnv : group.specs;
  for (const spec of specs) {
    console.log(`\n▶ Running ${groupName}: ${spec}`);
    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'e2e',
      E2E_GROUP: groupName,
      E2E_SPECS: spec,
      E2E_NEEDS: needs,
    };

    const result = spawnSync(
      'npx',
      ['jest', '-c', './test/jest-e2e.js', '--runInBand', '--detectOpenHandles'],
      {
        stdio: 'inherit',
        env,
      },
    );

    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
};

run();
