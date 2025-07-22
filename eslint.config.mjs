// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // TypeScript 相关
      '@typescript-eslint/no-explicit-any': 'error', // 符合 strict 模式
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // 代码质量
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-const': 'error',
      'no-var': 'error',

      // 代码复杂度
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', 100],

      // 命名规范
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variableLike',
          format: ['camelCase', 'UPPER_CASE'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'property',
          format: ['camelCase', 'snake_case', 'UPPER_CASE'],
        },
        {
          selector: 'parameter',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
      ],
    },
  },
  // 在 e2e 测试文件中，TS 类型安全不是目标，也不可能让用户指定 类型安全，因此 eslint 类型规则应放宽
  {
    files: ['test/**/*.ts'],
    rules: {
      // 允许将 any 赋值给其他类型
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // 允许对 any 类型进行成员访问
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // 允许函数超过 100 行
      'max-lines-per-function': 'off',
      // 允许对 any 类型进行调用
      '@typescript-eslint/no-unsafe-call': 'off',
      // 允许不安全的参数
      '@typescript-eslint/no-unsafe-argument': 'off',
      // 允许对 any 类型进行索引
      '@typescript-eslint/no-unsafe-indexing': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // 允许使用 ！ 进行非空断言
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 允许导出的函数和方法不显式声明返回类型
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // 允许在测试中使用 console.log
      'no-console': 'off',
    },
  },
);
