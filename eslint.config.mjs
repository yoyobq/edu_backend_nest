// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginBoundaries from 'eslint-plugin-boundaries';
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
    plugins: {
      boundaries: eslintPluginBoundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'adapters-common', pattern: 'src/adapters/graphql/decorators', mode: 'folder' },
        { type: 'adapters-common', pattern: 'src/adapters/graphql/guards', mode: 'folder' },
        { type: 'adapters-common', pattern: 'src/adapters/graphql/common', mode: 'folder' },
        { type: 'adapters-common', pattern: 'src/adapters/graphql/schema', mode: 'folder' },
        { type: 'adapters-common', pattern: 'src/adapters/graphql/*.ts', mode: 'file' },
        {
          type: 'adapters-scope',
          pattern: 'src/adapters/graphql/*',
          mode: 'folder',
          capture: ['adapterScope'],
        },
        {
          type: 'adapters-integration',
          pattern: 'src/adapters/integration-events',
          mode: 'folder',
        },
        { type: 'usecases', pattern: 'src/usecases/**' },
        {
          type: 'modules-queries',
          pattern: 'src/modules/*/**/queries',
          mode: 'folder',
          capture: ['moduleScope'],
        },
        {
          type: 'modules-queries',
          pattern: 'src/modules/*/**/*.query.service.ts',
          mode: 'file',
          capture: ['moduleScope'],
        },
        {
          type: 'modules-services',
          pattern: 'src/modules/*/**/services',
          mode: 'folder',
          capture: ['moduleScope'],
        },
        {
          type: 'modules-services',
          pattern: 'src/modules/*/**/service',
          mode: 'folder',
          capture: ['moduleScope'],
        },
        { type: 'infrastructure', pattern: 'src/infrastructure/**' },
        { type: 'core', pattern: 'src/core/**' },
        { type: 'types', pattern: 'src/types/**' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: 'adapters-scope',
              allow: [
                'adapters-common',
                ['adapters-scope', { adapterScope: '${from.adapterScope}' }],
                'usecases',
                'core',
                'types',
              ],
            },
            { from: 'adapters-common', allow: ['adapters-common', 'core', 'types'] },
            { from: 'adapters-integration', allow: ['usecases', 'core', 'types'] },
            {
              from: 'usecases',
              allow: ['usecases', 'modules-queries', 'modules-services', 'core', 'types'],
            },
            {
              from: 'modules-queries',
              allow: [['modules-queries', { moduleScope: '${from.moduleScope}' }], 'core', 'types'],
            },
            {
              from: 'modules-services',
              allow: [
                ['modules-services', { moduleScope: '${from.moduleScope}' }],
                'infrastructure',
                'core',
                'types',
              ],
            },
            { from: 'infrastructure', allow: ['infrastructure', 'core', 'types'] },
            {
              from: 'core',
              allow: ['core', 'types'],
            },
            { from: 'types', allow: ['types'] },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
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
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: ['src/types/**', '@src/types/**', '**/src/types/**'],
        },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', 100],
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
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@nestjs/*',
            'graphql',
            'typeorm',
            'src/types/**',
            '@src/types/**',
            '**/src/types/**',
          ],
        },
      ],
    },
  },
  {
    files: ['src/usecases/**/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', 200],
    },
  },
  {
    files: ['test/**/*.ts', '**/*.spec.ts', '**/*.test.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'off',
    },
  },
);
