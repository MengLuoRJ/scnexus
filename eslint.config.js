import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vitest from '@vitest/eslint-plugin'
import oxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      '**/build/**',
      '**/vendor/**',
      '**/coverage/**',
      '**/release/**',
      '**/.cache/**',
      '**/.nuxt-ui/**',
      'packages/standard/.types-test-*/**',
      '.electron-smoke-*/**',
      '**/auto-imports.d.ts',
      '**/components.d.ts',
      '.agents/**',
    ],
  },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: [
      'packages/app-main/**',
      'packages/app-preload/**',
      'packages/node-casclib/**',
      'packages/node-stormlib/**',
      'scripts/**',
      '**/*.config.*',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/app-preload/src/**', 'packages/app-renderer-v2/src/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/__test__/**', '**/__tests__/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    ...vitest.configs.recommended,
    files: [
      'packages/app-main/**/*.test.ts',
      'packages/app-renderer-v2/**/*.test.ts',
      'packages/app-renderer-v2/**/*.spec.ts',
      'test/**/*.test.ts',
    ],
  },
  ...oxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
  skipFormatting,
)
