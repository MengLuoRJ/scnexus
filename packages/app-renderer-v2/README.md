# app-renderer-v2

SCNexus 唯一桌面界面，后续页面与功能均在此包维护。旧 `app-renderer`（v1）已移除，历史实现可通过 Git 历史或 `v001` 分支查看。

## 架构定位与当前状态

- 目标技术栈：Vue 3、Vue Router 5、Pinia、Axios、Nuxt UI（`@nuxt/ui`）、VueUse，使用 Vite 8 / Rolldown 构建。
- 开发环境目标：Node.js 26、pnpm monorepo。本文不代表依赖与工具链升级已完成。
- 本包负责页面、路由、界面状态和 HTTP 请求；本地游戏操作通过 app-preload 的受控 IPC API 交由 app-main 执行。
- 根目录开发、构建、类型检查和测试脚本以及主窗口均使用本包；单独运行 Vite 开发服务不等于完整 Electron 环境。
- 已接入 Nuxt UI 插件、样式及受控桌面桥接；业务可用范围以当前页面和 IPC 实现为准。
- 自动导入、Pinia 持久化和旧权限指令不默认可用；按当前包实际配置使用。

参见 [目标架构](../../docs/architecture.md) 与 [开发规范](../../AGENTS.md)。

## IPC 调用约定

桌面 IPC 请求、单向发送与事件订阅统一放在 `src/ipcs/`，按业务模块封装并从 `index.ts` 导出。所有导出函数均以 `ipcXXX` 命名，例如 `ipcCustomizeList`、`ipcCampaignOnInstallProgress`，不使用 `apiXXX`。桥接访问、DTO 快照、结果校验与订阅清理放在 `src/ipcs/internal/`；页面、Store 和 composable 只调用封装，不直接调用 preload 桥接。环境可用性检查不属于 IPC 请求。HTTP 请求与此目录分开维护。

## 战役库管理

战役页面顶部的“战役库管理”视图展示当前游戏目录下的全部战役安装记录，支持按四类战役筛选、查看包详情与文件树、定位目录、激活 / 切换、取消激活和卸载。文件操作复用现有预览、冲突决策及确认对话框；无地图源的外部记录不可激活。

统计概览按安装记录中的 `fileCount`、`files` 和 `bytes` 汇总战役数量、双文件计数及内容大小，并展示各战役分类的大小占比和 SCNexus / CCM 分布。安装分析、安装结果、战役管理总览 / 分类 / 列表 / 详情及自定义内容列表 / 详情均分别展示“标准文件数量”和“识别文件数量”：

- 标准文件数量沿用 `fileCount`，每个物理文件独立计数，包括 `.SC2Map` / `.SC2Mod` 组目录内部的文件。
- 识别文件数量从 `files` 推导：共享纯函数 `resourcePath` 统一路径分隔符为 `/`，截取至首个 `.SC2Map` / `.SC2Mod` 路径组件（扩展名不区分大小写）；`countRecognizedFiles` 按此路径忽略大小写去重。因此每个资源组整体计为 1，普通散文件也独立计数。来源分析从 `sourceTree` 的物理文件叶节点推导识别数量，不新增 DTO 必填字段。
- 安装进度继续按物理文件展示 `completedFiles / totalFiles`，不使用识别数量替代。

两种统计随刷新、扫描及安装 / 卸载后的记录更新，不重复计入激活副本，也不统计备份或未记录文件，因此不是实际磁盘占用扫描。CCM 记录无法恢复的模组清单也不在其统计中。

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
