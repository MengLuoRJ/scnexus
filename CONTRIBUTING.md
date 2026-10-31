# 「星际枢纽」贡献指南

中文 | [English](./CONTRIBUTING.english.md)

感谢你愿意尝试为本项目做出贡献，期待你的卓越参与！

在开始贡献前敬请阅读本贡献指南，并阅读本项目的[贡献者公约](./CODE_OF_CONDUCT.md)。

## 开发环境

- Node.js 26 及以上
- pnpm 11 及以上

```bash
pnpm install
pnpm run dev
```

本仓库为 pnpm monorepo，各包职责、代码规范与界面尺寸要求见 [AGENTS.md](./AGENTS.md)；构建、Electron 隔离冒烟及打包验证命令见[构建指南](./docs/building.md)。

### 🛠 应用程序开发技术栈

- Electron 45 + electron-builder
- Vite 8 + Vue.js 3（组合式 API）+ Vue Router + Pinia + VueUse
- Nuxt UI 4 + Tailwind CSS 4
- TypeScript + Vitest

## 贡献代码

所有 Pull Request 均提交至 `main` 分支。提交前请在本地完成验证：

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
```

测试可只运行改动涉及的包（例如 `pnpm run test:main`），但类型检查与静态检查须完整通过。界面改动请在 1000×700 主窗口尺寸下确认布局与显示效果。

## 贡献文档

- 本仓库 `docs/` 目录存放应用程序的开发文档，包括架构设计、构建方式、程序包格式与后端接入说明，随代码一并评审。
- 面向用户的使用文档由独立的 [scnexus-docs](https://github.com/MengLuoRJ/scnexus-docs) 仓库维护；此类内容的新增与调整请在该仓库对 `main` 分支提交 Pull Request。

## 翻译指南

本项目采用 [vue-i18n](https://vue-i18n.intlify.dev/) 进行用户界面翻译本地化，如果希望参与项目中相关国际化和翻译本地化开发，请先了解该插件的相关工作机制并浏览相关文档。

相关翻译文件位于 `packages/app-renderer-v2/src/locales` 目录下，按语言（`zh`、`zh-Hant`、`en`）与业务模块组织，文本键使用扁平结构。

- 新增或修改文案时，请同步维护三套语言资源并保持键名一致；繁体中文与简体中文采用相同文本，仅转换汉字。
- 翻译贡献同样提交至 `main` 分支。
