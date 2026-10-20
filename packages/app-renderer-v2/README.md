# app-renderer-v2

SCNexus 新版桌面界面，后续页面与功能在此包开发。旧 `app-renderer` 暂时保留作为参考。

## 架构定位与当前状态

- 目标技术栈：Vue 3、Vue Router 5、Pinia、Axios、Nuxt UI（`@nuxt/ui`）、VueUse，使用 Vite 8 / Rolldown 构建。
- 开发环境目标：Node.js 26、pnpm monorepo。本文不代表依赖与工具链升级已完成。
- 本包负责页面、路由、界面状态和 HTTP 请求；本地游戏操作通过 app-preload 的受控 IPC API 交由 app-main 执行。
- 当前根目录应用构建和主窗口仍使用旧 renderer；单独运行本包的 Vite 开发服务不等于已接入 Electron。
- 当前配置尚未完成 Nuxt UI 插件及样式接入，也不能仅因安装依赖就认为桌面桥接和业务迁移已完成。
- 自动导入、Pinia 持久化和旧权限指令不默认可用；按当前包实际配置使用。

参见 [目标架构](../../docs/architecture.md) 与 [开发规范](../../AGENTS.md)。

## 战役库管理

战役页面顶部的“战役库管理”视图展示当前游戏目录下的全部战役安装记录，支持按四类战役筛选、查看包详情与文件树、定位目录、激活 / 切换、取消激活和卸载。文件操作复用现有预览、冲突决策及确认对话框；无地图源的外部记录不可激活。

统计概览按安装记录中的 `fileCount` 和 `bytes` 汇总战役数量、文件数及内容大小，并展示各战役分类的大小占比和 SCNexus / CCM 分布。统计随刷新、扫描及安装 / 卸载后的记录更新，不重复计入激活副本，也不统计备份或未记录文件，因此不是实际磁盘占用扫描。CCM 记录无法恢复的模组清单也不在其统计中。

以下为本包现有开发命令与工具说明，不代替整个桌面应用的启动与打包流程。

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
pnpm test:unit
```

### Lint with [ESLint](https://eslint.org/)

```sh
pnpm lint
```
