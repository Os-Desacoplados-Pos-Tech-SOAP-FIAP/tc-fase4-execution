// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    // Artefatos e código não-TS de aplicação ficam de fora do lint.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Projeto usa `any` pontualmente (mocks/Prisma); não bloquear o build por isso.
      '@typescript-eslint/no-explicit-any': 'off',
      // Variáveis não usadas são warning (prefixo _ para ignorar intencionais).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Globais do Jest apenas em arquivos de teste, evitando mascarar uso
    // acidental dessas globais no código de produção (src/**).
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
);
