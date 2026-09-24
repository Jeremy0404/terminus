import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

const CORE_FORBIDDEN_IMPORTS = {
  patterns: [
    {
      group: ['**/adapters/**', '**/adapters'],
      message: 'The domain and application layers never import adapters; depend on a port instead.',
    },
    {
      group: ['hono', 'hono/*', '@hono/*', 'drizzle-orm', 'drizzle-orm/*', 'better-sqlite3', 'zod'],
      message: 'Infrastructure libraries belong in adapters, not in the core.',
    },
    {
      group: ['node:*'],
      message: 'Node I/O belongs in adapters, not in the core.',
    },
  ],
  paths: ['child_process', 'fs', 'fs/promises', 'path', 'os', 'net', 'http', 'https'].map((name) => ({
    name,
    message: 'Node I/O belongs in adapters, not in the core.',
  })),
};

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo', '.claude/**', 'prototypes/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/daemon/src/domain/**/*.ts', 'apps/daemon/src/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-imports': ['error', CORE_FORBIDDEN_IMPORTS] },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
