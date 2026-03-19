// @ts-check
import eslint from '@eslint/js';
import eslintPluginBoundaries from 'eslint-plugin-boundaries';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
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
      'boundaries/dependency-nodes': ['import'],
      'boundaries/elements': [
        { type: 'adapters-common', pattern: 'src/adapters/api/graphql/decorators', mode: 'folder' },
        { type: 'adapters-common', pattern: 'src/adapters/api/graphql/guards', mode: 'folder' },
        { type: 'adapters-common', pattern: 'src/adapters/api/graphql/common', mode: 'folder' },
        { type: 'adapters-common', pattern: 'src/adapters/api/graphql/schema', mode: 'folder' },
        { type: 'adapters-common', pattern: 'src/adapters/api/graphql/*.ts', mode: 'file' },
        {
          type: 'api-adapters-scope',
          pattern: 'src/adapters/api/graphql/*',
          mode: 'folder',
          capture: ['adapterScope'],
        },
        {
          type: 'worker-adapters-scope',
          pattern: 'src/adapters/worker/*',
          mode: 'folder',
          capture: ['adapterScope'],
        },
        {
          type: 'adapters-integration',
          pattern: 'src/adapters/api/integration-events',
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
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: { type: 'api-adapters-scope' },
              allow: [
                { to: { type: 'adapters-common' } },
                {
                  to: {
                    type: 'api-adapters-scope',
                    captured: { adapterScope: '{{from.adapterScope}}' },
                  },
                },
                { to: { type: 'usecases' } },
                { to: { type: 'core' } },
                { to: { type: 'types' } },
              ],
            },
            {
              from: { type: 'worker-adapters-scope' },
              allow: [
                {
                  to: {
                    type: 'worker-adapters-scope',
                    captured: { adapterScope: '{{from.adapterScope}}' },
                  },
                },
                { to: { type: 'usecases' } },
                { to: { type: 'core' } },
                { to: { type: 'types' } },
              ],
            },
            {
              from: { type: 'adapters-common' },
              allow: [
                { to: { type: 'adapters-common' } },
                { to: { type: 'core' } },
                { to: { type: 'types' } },
              ],
            },
            {
              from: { type: 'adapters-integration' },
              allow: [
                { to: { type: 'usecases' } },
                { to: { type: 'core' } },
                { to: { type: 'types' } },
              ],
            },
            {
              from: { type: 'usecases' },
              allow: [
                { to: { type: 'usecases' } },
                { to: { type: 'modules-queries' } },
                { to: { type: 'modules-services' } },
                { to: { type: 'core' } },
                { to: { type: 'types' } },
              ],
            },
            {
              from: { type: 'modules-queries' },
              allow: [
                {
                  to: {
                    type: 'modules-queries',
                    captured: { moduleScope: '{{from.moduleScope}}' },
                  },
                },
                { to: { type: 'core' } },
                { to: { type: 'types' } },
              ],
            },
            {
              from: { type: 'modules-services' },
              allow: [
                {
                  to: {
                    type: 'modules-services',
                    captured: { moduleScope: '{{from.moduleScope}}' },
                  },
                },
                { to: { type: 'infrastructure' } },
                { to: { type: 'core' } },
                { to: { type: 'types' } },
              ],
            },
            {
              from: { type: 'infrastructure' },
              allow: [
                { to: { type: 'infrastructure' } },
                { to: { type: 'core' } },
                { to: { type: 'types' } },
              ],
            },
            {
              from: { type: 'core' },
              allow: [{ to: { type: 'core' } }, { to: { type: 'types' } }],
            },
            {
              from: { type: 'types' },
              allow: [{ to: { type: 'types' } }],
            },
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
