# SCNexus Contributing Guide

[中文](./CONTRIBUTING.md) | English

Thank you for your interest in contributing to this project, and look forward to your positive participation.

Please read this Contributing Guide before you start contributing, and also the [Code of Conduct](./CODE_OF_CONDUCT.english.md) of this project.

## Development Environment

- Node.js 26 or later
- pnpm 11 or later

```bash
pnpm install
pnpm run dev
```

This repository is a pnpm monorepo. Package responsibilities, coding conventions and window size requirements are described in [AGENTS.md](./AGENTS.md); build, Electron isolated smoke test and packaging verification commands are documented in the [Build Guide](./docs/building.md).

### 🛠 Application Development Technology Stack

- Electron 45 + electron-builder
- Vite 8 + Vue.js 3 (Composition API) + Vue Router + Pinia + VueUse
- Nuxt UI 4 + Tailwind CSS 4
- TypeScript + Vitest

## Contributing Code

All Pull Requests should be submitted to the `main` branch. Please complete the following verification locally before submitting:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
```

Tests may be limited to the affected packages (for example `pnpm run test:main`), but type checking and static analysis must pass in full. Please verify interface changes at the 1000×700 main window size.

## Contributing Documentation

- The `docs/` directory of this repository holds the application's development documentation, including architecture design, build instructions, package format and server integration notes. It is reviewed together with the code.
- User-facing documentation is maintained in the separate [scnexus-docs](https://github.com/MengLuoRJ/scnexus-docs) repository; submit Pull Requests for such content to the `main` branch of that repository.

## Contributing Translations

This project uses [vue-i18n](https://vue-i18n.intlify.dev/) to perform user interface localization. If you would like to participate in the project's internationalization and localization development, please first go through the plugin's features and learn the related documentation.

Related translation files are located in the `packages/app-renderer-v2/src/locales` directory, organized by language (`zh`, `zh-Hant`, `en`) and business module, with flat text keys.

- When adding or changing text, please update all three language resources and keep the keys identical. Traditional Chinese uses the same text as Simplified Chinese with characters converted only.
- Translation contributions are also submitted to the `main` branch.
