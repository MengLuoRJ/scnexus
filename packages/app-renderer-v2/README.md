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

## 下载管理

`/downloads` 无需登录，关闭 Workshop 后仍可访问，GitHub 历史始终显示。手动新建、工坊页下载及 `download=true` 深链共用全局下载向导：**输入来源 → 确认获取信息 → 预览 → 确认下载**。获取预览不会创建传输任务；取消预览也不会开始下载。

- GitHub：输入 `https://github.com/owner/repository` 和分支（默认 `main`），`previewGithub` 展示根目录 `package.json` 基本资料；确认时以 `previewId` 下载已固定的 revision。
- 工坊：输入 SCNID，从 `apiWorkshopDetail` 提取标题、简介、SCNID 和当前审核版本，不复制富文本详情；确认时使用预览中的 `approvedVersionId`，不重新追随最新版本。要求登录且启用 Workshop；未登录跳转个人中心并保留来源意图，不自动启用开关。账号或开关变化使旧工坊预览失效。
- 列表分“进行中”和“历史记录”，展示名称、来源、创建/完成时间、进度、字节与速度；历史持久化及账号隔离由 main 负责。运行任务先暂停或取消才能删除。删除前调用 `inspectDownload`：文件存在时选择“仅删除记录”或“记录和文件”，不存在时只删除记录；成功后刷新，忽略迟到的已删除任务事件。
- 仅运行 → 完成转换触发全局 toast，初次加载历史不提示。支持战役、自制作品与依赖包；不自动安装，点击“安装”继续既有内容分析及冲突确认流程。

任务记录保存在 `.scnexus`，新下载文件使用设置中的下载目录，每个任务保留创建时的位置。下载管理顶部“打开下载位置”打开当前设置目录；无桌面桥接时禁用。旧任务文件不自动搬移。

下载桥接封装集中在 `src/ipcs/workshop.ts`，向导状态位于 `src/stores/workshop.ts`，全局对话框为 `src/components/workshop/DownloadWizard.vue`。

## 创作工具

侧栏和工具首页统一称为“创作工具”。各工具子页面共用标题栏右侧的“返回创作工具”入口，返回 `/editor-toolbox`；内容区域不再重复放置返回按钮，工具首页不显示该入口。

## 协议与声明

设置页的“基本设置 → 帮助与服务”和“协议与声明”均保留用户协议与隐私政策链接，通过桌面 IPC 在系统浏览器打开。

第三方开源许可采用独立折叠列表，默认只展示组件名称，点击或通过键盘展开后显示实际安装版本（内嵌代码显示所属产物版本或上游 commit）、许可标识、来源和完整原文，版权声明随原文保留；再次操作可收起，展开一项不影响其他项。构建插件 `scripts/third-party-licenses.ts` 从 main、preload、renderer 的直接生产依赖读取许可证，按名称与版本去重；另外明确收录直接分发的 Electron、7-Zip、Tabler 图标、libbz2、Emscripten runtime 和 s2protocol 派生定义。**不递归组件的传递依赖，也不展开 Electron/Chromium 的内部组件**，该列表不是完整的传递依赖合规清单。第一方包及仅开发工具不列为第三方组件。

页面不读取 `THIRD-PARTY-NOTICES.md`。所有正文经 Vite 虚拟模块打包，可离线阅读，按纯文本展示而非执行 HTML；直接依赖缺少许可文件或正文为空时构建失败，不能静默遗漏。Tabler 原文固定来自对应上游版本；7-Zip 的分发声明和 unRAR 限制完整保留，并附 GNU LGPL 2.1 正文。相关原文保存在 `scripts/licenses/`，升级组件时同步核对。该页不替代分发包本身应保留的许可证文件或其他授权义务。

## 录像经济图表

录像分析的经济曲线使用 `vccs`，由其必需的 `motion-v` peer dependency 驱动动画，遵循系统减少动态效果偏好。图表宽度随容器变化，高度固定为 220px；玩家颜色与指标线型保持一致，图例按钮支持键盘操作及独立显隐，隐藏曲线不改变全局坐标范围。

横轴使用真实游戏循环数（每秒 16 个），Tooltip 仅展示该时间的实际采样，不按不同玩家的数组索引对齐或插值。缺失值及含缺失值的降采样区间保持断线，孤立采样显示圆点；每位玩家每项指标仍最多显示 1000 个实际采样点。数据转换在 `src/views/replay/insights.ts`，不依赖 SVG 像素坐标。

## 语言资源

语言资源按语言与模块存放在 `src/locales/{zh,en,zh-Hant}/{module}.json`，模块名取扁平键的首段，例如 `downloads.openLocation` 位于 `downloads.json`。每种语言的 `index.ts` 显式导入并合并全部模块；新增模块时须同步更新三个语言入口，保持三语键集合一致，不使用旧单体 JSON 或兼容壳。

`src/locales/index.ts` 导出运行时 `i18n` 与完整扁平资源 `messages`，默认语言和回退语言均为 `zh`。测试按需导入 `src/locales/zh` 等合并结果，不单独拼接工坊资源。`src/locales/__tests__/locales.test.ts` 检查模块归属、重复键、入口完整性、三语键集合、语言加载及回退。

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

### 在线分析

日志与隐私设置提供默认开启的“在线分析”，与错误遥测独立。启用后main静默注册/复用访客并约30秒心跳；离线暂停，网络恢复继续，服务端故障退避。关闭停止统计请求及调度，保留访客凭证。该模式不考虑窗口前后台，不能解释为持续前台操作时长。
