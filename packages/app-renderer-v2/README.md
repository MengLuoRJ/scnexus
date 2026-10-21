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

## 后端账号接入

账号入口为 `/account`，模块名称为“个人中心”。侧边栏底部仅显示占位头像与服务器昵称，未登录显示空头像与“未登录”；折叠后保留头像和悬停提示。个人中心不再使用外层卡片或全局最大宽度限制，铺满内容区域。未登录时使用独立登录/注册/找回密码布局，登录后显示基于真实用户、会话和权限信息的 dashboard，不展示未接入的统计。支持邮箱登录、MFA 登录、注册邀请策略、注册挑战、忘记密码、用户/权限自查和退出。本地游戏功能不要求登录。HTTP 业务适配在 `src/apis/`，认证操作通过 `src/ipcs/auth.ts` 交主进程完成；Access 仅在内存，Refresh 不进入 renderer。生产目标固定为 `https://api.scnexus.net`，尚未部署；开发目标为 `http://127.0.0.1:3000`。完整架构、契约来源及验收边界见 [后端接入方案](../../docs/server-integration.md)。

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

### 玩家资料与成长

个人中心只向玩家展示昵称、邮箱及经验等级，不展示用户/会话ID、角色权限等诊断信息。支持按后端字符规则编辑昵称（NFC、8–16码点，Zod输入验证），成功后侧栏同步服务器返回的昵称；邮箱为只读。每日签到以北京时间日界和服务器返回结果为准，每日首次奖励10经验，重复不累加，网络失败不重置旧数据显示。业务HTTP写操作不自动重放。

个人中心按 1000×700 主窗口验收：资料与经验固定等宽两列，压缩头部及卡片间距，不显示昵称下方宣传说明或手动刷新入口；资料和经验由既有状态初始化、操作结果、跨日及恢复可见流程同步。长邮箱允许受控换行，昵称编辑展开不改变两列结构。
