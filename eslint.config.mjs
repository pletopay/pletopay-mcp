import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const nodeGlobals = { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', fetch: 'readonly' };

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/generated/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/require-await': 'off',
      'no-console': 'error',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: { globals: nodeGlobals },
  },
  prettier,
);
