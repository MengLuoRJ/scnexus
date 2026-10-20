# 桌面应用架构

## 1. 文档范围与状态

本文定义 SCNexus 桌面应用的目标架构及后续建设顺序。main 与 preload 的基础模块、存储及桥接重构已开始实施；v2 界面和整个工具链的目标对齐尚未完成，具体实施状态见 [app-main 设计](./app-main-design.md)。

本文中的“目标”“应”“建议目录”表示后续实施约定，不代表已经完成。依赖的实际安装版本以各包的 manifest 和根目录锁文件为准；不能仅根据本文判断运行环境已升级。

## 2. 技术基线

| 层次          | 目标技术                   | 职责                                      |
| ------------- | -------------------------- | ----------------------------------------- |
| 开发环境      | Node.js 26                 | 安装、构建、测试和开发工具运行            |
| 工作区        | pnpm monorepo              | 工作区依赖、统一锁文件、包级命令          |
| 构建          | Vite 8 / Rolldown          | 主进程、preload、renderer 构建            |
| 桌面运行时    | Electron 44                | 主进程、隔离桥接、Chromium 页面           |
| 打包          | electron-builder 36        | 应用资源、安装包及发布产物                |
| 主进程持久化  | electron-store v11         | 本地配置及小规模结构化状态                |
| 应用日志      | electron-log               | main 归集三进程日志，共用等级，默认 error |
| UI            | Vue 3、Vue Router 5、Pinia | 组件、路由、界面状态                      |
| 前端基础能力  | Axios、VueUse              | HTTP 请求与组合式工具                     |
| UI 组件与样式 | Nuxt UI（`@nuxt/ui`）      | Vue 组件及其配套样式体系                  |

注意：

- Node 26 是开发工具链基线，不表示 Electron 内嵌 Node 的版本。主进程与 preload 的运行能力应以 Electron 44 实际运行时为准。
- renderer 的构建目标应匹配 Electron 的 Chromium，不按宿主 Node 设置。
- Nuxt UI 用于普通 Vue/Vite 应用，不因此引入 Nuxt 服务端、SSR 或 Nitro。
- Vite 8 使用 Rolldown；迁移时检查现有插件、external、输出格式和打包结果，不盲目复制旧 Rollup 配置。
- electron-builder 36 是目标版本；实施升级时需确认该版本的可用性和 Electron 兼容性。发现阻塞时记录并讨论，不静默替换目标。
- 除上述明确的主版本外，TypeScript、测试工具及插件的具体版本在实施时按兼容性确定。

## 3. 包职责与依赖方向

桌面应用由三个运行包构成：

| 包                         | 职责                                                                        | 不应承担的职责                               |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/app-main`        | 应用生命周期、窗口、本地服务、文件系统、游戏进程、持久化、日志、IPC handler | 页面状态、Vue 组件、界面交互编排             |
| `packages/app-preload`     | 通过 contextBridge 暴露受控 IPC API，封装调用和订阅                         | 游戏业务逻辑、直接操作文件、保存业务状态     |
| `packages/app-renderer-v2` | 页面、路由、Pinia、HTTP 请求、用户交互与任务状态展示                        | 直接使用 Node/Electron、直接修改本地游戏文件 |

`packages/app-renderer-v2` 是唯一 renderer 运行与维护入口。旧 `packages/app-renderer`（v1）已删除，其代码保留在 Git 历史及 `v001` 分支；不再保留旧包依赖、工具链或运行入口。

`packages/app-shared` 是三个运行包可复用的契约辅助包，不是第四个应用进程。可放 IPC 类型、DTO、错误码及不依赖运行环境的纯校验逻辑；不能引入 Electron、Node 文件系统或 Vue。

其他工作区包（标准与归档工具等）保留其独立职责。此次文档建设不要求删除、升级或接入这些包。

```text
renderer-v2 ──受控 API──> preload ──IPC──> main
     │                                      │
     └──Axios──> 远程服务                   ├──electron-store
                                            ├──electron-log
                                            └──本地文件 / 游戏进程

main、preload、renderer-v2 ──类型与契约──> app-shared
```

运行包不得导入其他运行包的源码。跨进程通信只走契约；工作区辅助包通过其公开导出使用，不通过相邻包内部路径访问。

## 4. 主进程组织

优先在现有业务模块内明确边界，不为了分层立即重写全部模块。

建议逐步组织为：

```text
src/
  index.ts                 应用入口与装配
  modules/
    window/                窗口创建及生命周期
    logging/               日志归集与等级应用
    telemetry/             用户授权后的 Sentry 遥测
    <domain>/
      index.ts             init、生命周期装配及能力导出
      <domain>.ipc.ts      设置 IPC、参数校验、转换结果
      <domain>.ts          具体实现与 main 内部业务能力
      <其他实现>.ts        按实际需要拆分
  stores/                  electron-store 读写与迁移
  utils/                   无生命周期、无全局状态的基础工具
```

规则：

- 保留现有业务能力；common 中的 app、deep-link、dialog、shell、tray、updater 分别迁为一级模块，window 也作为独立模块。
- setting 与 scii-game-setting（原 profile）保留独立业务模块，共享存储基础设施；main 内部与 IPC 修改都走各自服务，不直接暴露 Store。
- 模块划分、窗口握手、存储迁移及装配顺序见 [app-main 设计](./app-main-design.md)。
- 入口负责装配，不承载安装、扫描等业务逻辑。
- IPC handler 是适配层，不直接堆叠长流程。
- 服务不依赖 BrowserWindow；业务事件由主进程适配层转发给界面。
- 每个模块必须包含 index.ts、对应的 xxx.ipc.ts 和 xxx.ts；其他实现文件按需增加。不引入无实际需要的 factory 或 DI 容器。
- handler 应始终注册。游戏尚未配置时返回明确错误，而不是缺失 channel。
- 初始化失败必须有可诊断日志和可交互的错误状态；可选服务失败不应阻止整个应用打开。
- 退出、窗口销毁和重复初始化时，应释放所属监听器、任务及资源。

## 5. IPC 契约

### API 形式

目标是在 renderer 中提供一个命名空间 API，例如 `window.scnexus`。该名字及结构是目标约定，现有逐 channel 暴露方式在迁移期间继续存在。

```ts
interface DesktopApi {
  app: {
    getVersion(): Promise<IpcResult<string>>
  }
}

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorDto }
```

AppErrorDto 是共享契约，包含静态定义 code、name、可选 description，以及本次抛出的 errorId、可选 message、可选业务 taskId。code 采用责任进程前缀和三位编号（M/P/R），name 使用全大写连字符名称；定义和全局码表见 [日志与错误规范](./logging-and-errors.md)。

契约变更必须同步更新 main、preload、renderer-v2 与测试；不再为已移除的 v1 renderer 提供新兼容适配。

### 通信规则

- channel 使用 `domain:action`，事件使用一致的命名规则。
- preload 只暴露明确方法，不暴露任意 channel 的 `invoke`、`send` 或原始 `ipcRenderer`。
- main 对参数做运行时校验，并检查调用来源；类型声明不等于运行时可信。
- 返回值使用可序列化 DTO；不传递原始 Error、进程句柄、Stream 或 Electron event。
- 失败只有一种业务返回通道，不能把 Error 当作成功 data。
- 事件订阅返回取消函数；组件卸载时取消，不泄漏 Electron 原始事件。
- 多个并行长任务的事件必须带 taskId。短操作不强制包装为任务。
- 内部日志可记录诊断细节，面向 UI 的错误信息不包含令牌和不必要的敏感路径。

### 内容安装进度（已实现）

`campaign.install(selection)` 与 `customize.install(selection)` 接受可选的 `InstallSelection.taskId`（非空字符串，最长 200 字符）；省略时使用 `analysisId`。调用前订阅相应的 `campaign.onInstallProgress(listener)` / `customize.onInstallProgress(listener)`，返回取消函数；v2 适配器为 `apiCampaignOnInstallProgress` / `apiCustomizeOnInstallProgress`，同时在 Vue scope 销毁时取消订阅。IPC 事件 `campaign:install-progress` / `customize:install-progress` 只发给发起调用的 renderer，不暴露 Electron event。

共享 `InstallProgress` 包含 `taskId`、`analysisId`、`stage`、`completedFiles`、`totalFiles`、`currentFile` 和可选 `percent?: number`。阶段为 `preparing`、`extracting`、`copying`、`finalizing`、`completed` 或 `failed`。`extracting` 的 `percent` 仅转发 7z 实际回调，缺省表示不确定进度；不由文件数或定时器伪造。准备/解压阶段 UI 不显示文件计数；复制开始后总数固定。当前文件为相对游戏根目录的路径；阶段切换时当前文件为 null。

归档分析只列举条目并把必要的 package.json/metadata.txt 读入内存，不落盘、不读取或哈希资源正文。归档文件本身以流式 SHA256 在列举前、元数据读取后，以及确认安装后的解压前后和提交前复核。目录输入保留条目及内容哈希复核。确认模式及冲突选择后，用 UTF-8 清单、禁用通配符的单次 7z 批量解压到游戏同文件系统的隔离目录；拒绝路径越界、链接及多余输出。资源复用暂存文件，不按资源启动 7z；游戏目标冲突在长时间暂存后重新核验。

总数计入管理目录 payload、实际写入游戏目录的文件及描述文件/安装清单，不计选择保留的游戏目标、解压输出、事务备份和目录重命名本身。管理目录在暂存中完整构建，再以一次目录重命名提交；其包含的文件在提交成功后逐项计数，失败/取消回滚整个目录。CCM mod 的库 payload 与游戏目录仍分别计数，只有游戏目标需要复制；库资源从解压目录移动而非重复复制。进度按文件数（非字节或时间）计算；全部文件写入不代表安装成功，只有持久化提交和事务清理完成后才发送 `completed`。失败/取消发送 `failed`，其中完成数保留已执行写入数，不代表回滚后的存留文件数；调用结果仍通过 `IpcResult` 返回，订阅不能代替结果处理。

## 6. 数据与本地操作

### 持久化

- electron-store v11 仅在 main 使用，由 repository 封装，保存游戏配置、客户端设置和小规模本地状态；不启用 renderer 直接存储。
- 设置和游戏环境分开持久化，用户与 main 的修改统一经过服务；不暴露任意 key 写入。
- setting 包含客户端 ID、客户端最后成功更新时间、默认下载目录、显示语言、日志等级及遥测开关；业务字段全部位于顶层，不增加 preferences 包装。语言默认跟随系统并回退 zh-CN，遥测默认关闭。字段修改权限通过服务和 IPC 白名单控制，不依赖对象嵌套层级。
- utils 中原 logger/sentry 能力分别迁入 logging/telemetry 模块，独立初始化并通过模块入口使用。
- 用户启用遥测后才初始化 Sentry 并绑定客户端身份；撤销后停止捕获和发送。遥测与本地日志等级独立，详见 [日志与错误规范](./logging-and-errors.md)。
- 日志等级由 setting 保存，共用一个阈值控制三进程归集日志的控制台与文件输出，默认 error；具体补偿及同步流程见 [日志与错误规范](./logging-and-errors.md)。
- Pinia 保存 UI 状态与主进程数据的界面投影，不能成为游戏安装状态的另一份独立事实来源。
- 持久化字段应有默认值、运行时校验与 _schemaVersion；结构变更提供迁移策略。
- Profile 配置整体校验后再提交。切换游戏根目录时使相关缓存失效并刷新。
- 内容库及安装状态可从磁盘重建；Store 中的列表是缓存或索引，不能证明文件一定存在。
- 令牌等敏感信息不默认写入 electron-store、localStorage 或日志；需要持久化时单独设计存储方案。

### 文件操作

安装、激活和卸载属于可能破坏现有内容的操作，应按实际影响实施：

```text
校验输入与目标 → 唯一暂存目录 → 解压/准备
→ 校验产物 → 备份受影响内容 → 提交
→ 更新状态 → 清理；失败时恢复并报告
```

- 目标路径必须规范化并验证目录边界，不用字符串前缀作为目录归属判断。
- 只有“不存在”可按预期忽略，权限、占用和复制失败继续向上传递。
- 涉及同一游戏目标目录的修改互斥，避免并发激活或卸载。
- 长任务逐步提供进度、取消、超时及失败恢复；只有在可安全停止的阶段允许取消。
- 高频或大体积同步压缩、哈希、归档操作不放在主进程事件循环上。

## 7. renderer-v2 开发结构

建议目录：

```text
src/
  main.ts
  App.vue
  router/
  views/                  路由页面
  components/             复用组件
  composables/            组合式逻辑
  stores/                 Pinia setup stores
  apis/http/              Axios 客户端及远程 API
  apis/desktop/           桌面桥接适配
  assets/
```

- Vue 使用 Composition API 与 `<script setup lang="ts">`。
- 优先使用 Nuxt UI 组件及其配套样式体系；局部样式使用 scoped CSS。
- VueUse 用于适合的组合式工具，不为已有简单逻辑强制增加包装。
- Pinia 使用 setup store，按业务域划分；持久化插件不作为默认依赖。
- Axios 统一配置基础 URL、超时及错误转换，组件不重复创建客户端。
- HTTP 与桌面 IPC 分开封装，不通过同一个无类型 request 工具混用。
- 打包后通过本地文件加载页面时，路由优先采用 hash history；只有明确实现协议或回退机制后才使用其他模式。
- 自动导入只有在插件配置和生成类型已存在时才使用；否则显式导入。
- 不假定权限指令、国际化配置或旧 store 已在 v2 存在。已有国际化能力按功能迁移，不在新组件内新增无组织的多语言文本。

## 8. 开发与验证规范

- pnpm 是目标统一包管理器；工作区使用根目录 pnpm-lock.yaml，不引入新的 npm/yarn 锁文件。
- 依赖在使用它的包中声明，内部依赖使用 `workspace:*`；hoisted 布局不能代替依赖声明。
- `@nuxt/ui@4.11.3` 的发布清单缺少插件类型声明所需的 Vue peer；在 `pnpm-workspace.yaml` 用版本限定的 `packageExtensions` 补充 `vue: ^3.5.0`，让其绑定 renderer-v2 的 Vue，避免严格依赖布局下回退解析到旧 renderer 的 Vue 类型。升级 Nuxt UI 时检查上游是否已补齐，再调整或移除该扩展；不使用插件类型断言或全局 Vue 版本覆盖规避问题。
- 根目录保留开发脚本及 postinstall 直接使用的 Electron；Tabler 图标依赖由 renderer 包声明，electron-builder 由 app-main 声明。旧 `scnexus-standard` 类型依赖由 main（已有 devDependency）和 shared（公开类型依赖）各自声明，不由根目录兜底。应用打包目录为 app-main；根目录不保留另一套 electron-builder 配置。
- `pnpm build` 先刷新 Electron Node/Chromium target、构建 standard，再进行 shared/main/preload/v2 类型检查，最后构建 main/preload/renderer-v2。`pnpm build:app` 和 `pnpm build:app:release` 先同步版本，再生产构建，由 app-main 执行 electron-builder；前者生成未封装目录，后者生成安装包，均默认 `--publish never`。包级打包检查三个产物及版本存在且同步，不代替根目录完整构建。
- `pnpm test` 执行 standard 前置构建、构建配置契约测试、main/preload/v2 单元测试；删除把根级 Vitest 发现误称为 E2E 的 `test:e2e`。暂没有独立桌面 E2E 自动化。
- 通过 pnpm 工作区过滤执行包命令。根目录命令负责应用编排，包级命令负责自身职责。
- Vite 构建不代替 TypeScript 类型检查；两者都应作为验证步骤。
- 测试逐步覆盖纯逻辑、服务临时目录测试、IPC 契约、Vue 组件和 Electron 启动冒烟。
- 统一使用 Vitest。app-main 测试放在所属模块的 `__test__` 目录，文件命名为 `xxx.test.ts` 或 `xxx.spec.ts`；stores 与 utils 基础能力同样使用所属目录下的 `__test__`。
- “没有找到测试文件”不作为业务测试通过的证据。主进程使用包级 Vitest 配置，根目录 `pnpm run test:main` 调用包级测试，不允许无测试时静默通过。
- 打包验证应检查 preload 路径、renderer 静态资源、外部二进制和归档工具在安装包中的可用性。
- 修复使用最小相关验证；不为文档修改安装依赖或运行完整打包。

## 9. 当前差距与实施顺序

当前 pnpm isolated 布局下，Sentry 依赖由 electron-builder 的生产依赖收集器保留，不再手工复制 browser SDK。`@sentry/electron@8.1.0` 使用 conventions 0.23，而其 browser 11.4 使用 conventions 0.25；将 browser 强行复制到 electron 的 node_modules 会令它误解析到上层 0.23，导致启动时报 `SENTRY_IS_LOCALHOST` 导出缺失。两份 conventions 共存是正常的，不能只按包名去重。修复验证：`pnpm run test:build` 14 项通过；`pnpm --filter @scnexus/app-main build:app --config.directories.output="C:\Users\mengl\.copilot\session-state\6824866d-f5c6-422c-871a-abc5e0e6fc35\files\sentry-package-validation" --config.win.signAndEditExecutable=false` 通过，ASAR 中 browser 位于顶层并使用 conventions 0.25，electron 自身保留嵌套 conventions 0.23。真实 Electron 加载该 ASAR main（临时 userData、模拟打包标志及资源根）成功显示首页和 preload 桥接，无错误对话框、退出码 0；未执行 NSIS 安装、签名或真实遥测发送。

开发、生产页面及根目录构建/类型/测试入口已接入 renderer-v2，旧 renderer 已移除，应用只使用 renderer-v2。Node 26、Vite 8、Electron 44 已使用；electron-builder 当前仍为 26.15.3，未在本轮静默升级到目标 36。CI 应用安装包、真实安装升级和平台签名尚待独立验收。

后续分阶段实施，每阶段独立验收：

1. **工具链对齐**：Node 26、pnpm、Vite 8、Electron 44、electron-builder 36；确认插件、类型、开发启动及构建兼容。
2. **三包运行闭环**：开发和生产入口接入 v2，preload 可用，打包后静态页面正常加载；旧 renderer 已移除，历史代码通过 Git 查看。
3. **基础主进程与桥接**：electron-store、electron-log、配置生命周期、受控 API 及错误契约。
4. **逐业务迁移**：先游戏配置与基础页面，再内容导入、安装/激活，最后工坊等扩展；同时补正确性和失败恢复测试。

不在阶段一顺带迁移全部业务，不因为编写新架构文档删除旧功能，不把尚未实现的能力写为已完成。

## 10. campaign/customize 后续业务设计

campaign 战役包与 customize 自制作品保持独立。统一压缩包/文件夹分析，campaign 提供 SCNexus、CCM、自动识别三种模式，customize 提供 SCNexus、自动识别两种模式。campaign auto 要求所有层级均无 package.json 与 metadata.txt；customize auto 仅要求所有层级无 package.json（大小写不敏感，包含资源内部及同名目录）。旧 customize 领域 analyze 中 metadata.txt 不是描述文件，不阻止 auto，不读取或保留为 CCM 原文；新统一入口会先按外部 metadata.txt 分类或报告类型冲突。customize auto 接受唯一共同包装根下标准 Maps/Mods 层级的全部资源与 components，保留 Maps 任意子路径，不推断 campaign。

统一导入入口 `window.scnexus.content.analyze(input, descriptorChoice?)`（`content-package:analyze`，renderer `apiContentAnalyze`）直接返回分类后的 `IpcResult<AnalysisResult>`。资源外部 metadata.txt 表示 campaign，package.json 按内部 type；二者冲突返回 `M064/CONTENT_TYPE_CONFLICT`，界面选择 `package-json` 或 `metadata-txt` 后重发同一来源重新分析，并先切换至对应 `/campaign` 或 `/customize` 再预览。choice 仅在冲突时合法，未选描述文件不参与类型或预览解析；旧领域 analyze 保留兼容。坏头部、同名描述目录、多最外层有效根返回业务错误，不静默忽略或自动兜底。无外部描述文件时，任何资源外部标准 Maps/Campaign 目录（大小写不敏感、包装根、目录/归档空目录均计入，WOL 父目录含四类子树）分类 campaign，否则 customize；无有效内容或歧义仍按该类型诊断，不重新分类。components 内部描述文件不参与分类，但仍受上述严格 auto 门槛约束。一次分析复用同一源及哈希快照、缓存描述正文，不提前解压资源。

renderer 的 `useContentImportStore`（Pinia）持有统一分析请求、描述文件冲突和跨路由待接收结果；`M064` 时等待明确选择，再携带 choice 调用统一 API。成功后根据 `AnalysisResult.contentType` 导航，目标页面通过 `service.acceptAnalysis(result)` 一次接收现有完整结果，路由切换不重复 analyze。重新分析的成功 warnings 继续传给反馈层；取消和过期结果通过既有领域 cancel 清理共享主进程分析上下文。2026-10-13 的 Pinia + router 回归及 1000×660 mock browser 验证了 campaign 页面冲突选择 package-json 后切换 `/customize`、正确预览并允许安装；完整 renderer 16 文件 102 项测试及 renderer/main/preload 包级构建通过，renderer 类型检查仍有既有 `src/main.ts:19` Nuxt UI/Vue Plugin 类型不匹配。详细命令和分类矩阵见设计文档本次验证记录。

后续已通过上述 Nuxt UI Vue peer 扩展修复 `src/main.ts:19` 的 Plugin 类型冲突，入口代码不需要类型断言。验证：`pnpm --filter @scnexus/app-renderer-v2 type-check` 和 `pnpm --filter @scnexus/app-renderer-v2 build` 均通过；插件声明与应用解析到相同的 Vue 3.5.43。`pnpm install --frozen-lockfile --prefer-offline --ignore-scripts` 通过；纯离线安装因本地缺少 `@nuxt/devtools-kit` 的供应链检查元数据失败，允许补查元数据后通过，未升级依赖版本。VS Code 测试工具定向执行图标与内容导入对话框测试，3 项通过。

战役导入与激活分离。输入中的 package.json/metadata.txt 独立定位最外层有效包根并分别提供模式；CCM 来源也可转换为 SCNexus 安装。选 CCM 模式时保留 metadata.txt、不生成 package.json；选 SCNexus/自动模式时使用 SCNexusCustomizeData 管理目录，战役激活另写主地图 package.json。AnalysisResult 返回可为空的作者推荐模式及按模式分组、逐文件携带 conflictId 的 Map/Mod 冲突，用户决定覆盖/保留/取消。manager 仅推荐，manager_mode 已移除。新模型参考 standard 的 Package 类型，profile Store 已迁为 scii-game-setting，路径信息与内容业务已在 main/preload 实现；游戏版本检测仍未实现。customize 只提供 analyze/install/list/scan/prepareUninstall/uninstall（以及共享取消与进度订阅），直接安装到游戏目录，无激活或移动生命周期，不建立完整 payload/本地库副本或持久化原文件备份。保留冲突标记为 kept，不取得删除所有权；卸载跳过 kept，共享引用继续要求明确保留/删除选择。campaign 同一安装清单的 kept 也不取得删除所有权。

完整规则、现有代码依据和待决策项见 [campaign/customize 设计](./campaign-customize-design.md)。具体实现边界与验证结果见该文档的实施记录。

renderer-v2 的 `/customize` 路由提供自制作品列表、详情、刷新/扫描、来源分析安装与卸载。来源预览复用 `CampaignInstallModal` 的 `contentType='customize'` 分支，仅展示 SCNexus/自动识别两种模式，不展示战役类型、激活确认或激活操作。卸载先生成共享引用预览，再通过确认对话框收集 keep/delete 决策；提交期间显示 loading，成功/失败使用 toast 反馈，结果按 IPC 传输成功判断，不新增卸载结果 DTO。1000×660 的 mock browser 安装/卸载已验证不出现激活提示；真实游戏运行尚需环境验收。

## 11. 相关文档

- [战役包与自制作品设计](./campaign-customize-design.md)

- [app-main 模块与存储设计](./app-main-design.md)
- [全局错误码与日志设计](./logging-and-errors.md)

- [开发规范](../AGENTS.md)
- [v2 包说明](../packages/app-renderer-v2/README.md)
- [原生归档包维护](./native-packages.md)

## renderer-v2 IPC 适配层

renderer-v2 的 src/ipcs 按业务提供 apiXXX 方法，通过 index.ts 汇总；组件不直接访问 Electron 或任意 IPC channel。现代接口从 window.scnexus 获取，旧的 app 补充能力、dialog、shell、updater、workshop 经内部 internal/bridge.ts 白名单访问现行 preload，不引入已废弃的 profile 与旧 campaign/customize 操作。

src/ipcs/internal/ipc-common.ts 统一 IpcResult 校验，保留主进程错误 code/name/errorId/taskId；格式异常返回 R001，桥接不可用或调用失败返回 P001。所有调用都使用 IpcResult；旧 data/error/errorDetail 返回格式不再兼容。默认不绑定 UI toast，也不悄悄吞错；调用者检查 result.ok，或显式从 src/ipcs/internal/ipc-common 导入 unwrap（失败抛出原始错误 DTO）。logging.write 是现有单向发送方法，不伪造确认返回值。

事件适配只传业务数据并返回取消函数；Vue scope 中自动清理，scope 外调用者手动清理，取消函数幂等。文件拖放路径通过 getPathForFile 使用 Electron webUtils，不读取 File.path。

示例：

```ts
import { apiGameSettingInitialize, apiSettingOnChanged } from '@/ipcs'

const result = await apiGameSettingInitialize()
if (!result.ok) {
  // 将 result.error 交给界面统一错误展示。
}
const stop = apiSettingOnChanged((snapshot) => {
  // 更新界面投影。
})
// Vue scope 会自动清理；非 scope 使用时手动调用 stop()。
```

工坊尚未重构，上传返回 unknown，不把旧主进程的响应宣称为完善的成功契约；shell.openPath 的字符串错误仍按 Electron 原始返回值交给调用者判断。当前接口层不实现自动重试、Store 持久化或 UI 错误弹窗。

验证：renderer-v2 IPC 定向测试 5 项通过；pnpm --filter @scnexus/app-renderer-v2 type-check 通过；pnpm exec vite build --config packages/app-renderer-v2/vite.config.ts 通过。包级 oxfmt/build-only 曾因本地 bin 指向不存在的包文件失败，改用已有根目录工具验证，没有新增工具。main/preload 类型检查通过。

2026-10-08 IPC 返回契约统一：main 的 ipcHandle/ipcHandleRegister 均返回 IpcResult，删除 ipcHandleTyped 和内部旧格式分支；preload 的 invoke 统一执行返回校验及 P001/R001 转换；renderer-v2 删除 legacyRequest 与 legacy.ts，bridge.ts 仅负责尚处于顶层桥接的白名单访问，不转换旧返回格式。旧 renderer v1 不再兼容。工坊上传失败抛出规范错误，不作为成功 data 返回 Error；工坊其他业务重构仍延期。事件和单向日志发送不适用请求结果信封。

### renderer-v2 IPC 目录组织

src/ipcs 根目录只保留业务接口文件与业务导出 index.ts；公共请求、订阅及桥接辅助放 src/ipcs/internal，辅助测试位于 internal/**tests**；Window 桥接声明放 src/types/desktop.d.ts。unwrap 不从业务 index.ts 再导出，需显式从内部辅助模块导入。

后续自动导入扫描 src/ipcs/*.ts，排除 index.ts，不递归扫描 internal，不扫描 src/types。当前只整理结构，尚未启用自动导入；业务接口仍显式导入，名称和行为不变。文件路径获取 files.ts 保留为业务能力。

### renderer-v2 基本界面（2026-10-08）

Nuxt UI UApp 包裹根布局，左侧可折叠导航仅提供首页与设置，右侧内容独立滚动。使用 hash 路由兼容 Electron file 加载；没有复制旧 renderer 的布局或状态代码。首页为欢迎页。

设置页通过 src/ipcs 连接语言、下载目录、日志等级、遥测授权、游戏目录手动选择/重新检测、派生管理路径、版本与 Windows 更新、帮助链接。设置修改成功使用 Nuxt UI toast，不再在页面顶部常驻成功提示；操作失败也通过 toast 显示错误码、原因与 errorId。下载路径只读展示，通过“修改目录”选择并即时提交，取消选择不保存，删除多余保存按钮。下载目录、游戏根目录、内容管理目录、CCM 目录和日志目录均提供“打开目录”；日志目录由 `app:get-path('logs')` 返回，不由 renderer 猜测。复用受控 `shell:open-path`，其成功传输但返回非空错误字符串时同样提示打开失败。请求期间与路径为空时禁用打开入口。偏好保存失败后重读快照，避免界面与已持久化状态不一致。订阅由 scope 自动清理。浏览器没有 preload 时给出不可用提示，禁用本地操作，不模拟保存成功。

Vue I18n 显式接入，src/locales 提供中文、英文、繁体中文扁平资源；初始化及 setting 事件使用 main 返回的 effectiveLanguage。Nuxt UI 采用 Vue/Vite 插件，不引入 Nuxt 服务端，业务图标打包为本地资源。

验证：v2 类型检查与构建通过；IPC/国际化定向测试 7 项通过；浏览器检查欢迎页、导航折叠、设置路由和无桥接禁用状态。真实 Electron 设置保存、目录选择及 NSIS 更新端到端尚未验收。构建有主包超过 500kB 提示，未擅自进行无关拆包优化。

设置页分为三个 Tab：基本设置（语言、下载目录、版本更新和帮助）、游戏环境、日志与隐私。应用统一语言编码为 zh/en/zh-Hant，system 仍表示跟随系统；系统地区语言检测仍接受 en-GB、zh-TW、zh-Hant-HK 等系统标识并归一化。设置 Store 升至 v2，迁移旧 zh-CN/en-US/zh-TW，保留其他用户偏好与 revision；语言资源文件使用新编码命名。

界面密度：普通页面的 gap/space 优先使用 0.5、1、2，仅有明确视觉需求时使用 4 或以上。设置页卡片内边距和卡片/字段间距为 2，标签与控件间距为 1；布局内容内边距为 2，保留控件正常尺寸。欢迎页的大留白属于明确展示需求，不套用紧凑表单尺度。

侧栏独立于 src/layouts/components/AppSidebar.vue，自持展开状态与菜单；展开宽度 160px（约六个中文菜单字及图标留白），折叠宽度 64px。底部切换按钮仅图标，保留可访问名称；折叠导航通过 Nuxt UI link 插槽样式居中。侧栏和欢迎页使用 src/assets/logo.png，不使用示例 planet 图标作为品牌标识。

renderer IPC 参数必须是普通可序列化 DTO：安装、激活、移除的冲突选择以及设置/日志对象在调用 contextBridge 前使用 ipcSnapshot 快照，避免 Vue 嵌套 Proxy 无法跨隔离上下文传输产生 P001。该快照仅用于 JSON 业务 DTO，不用于 File、函数或订阅回调。响应式数组跨边界回归测试已覆盖。

renderer-v2 图标统一使用 Tabler。Vite 配置中的 ui.icons 覆盖 Nuxt UI 全部默认图标角色；Vite clientBundle 扫描业务图标并打包本地已声明的 @iconify-json/tabler，不运行时拉取。src/icons.ts 在挂载前关闭 Iconify 网络 fetch 回退（未打包图标返回本地 404，不发网络请求）；File/品牌图片不属于字体图标。新增动态图标需在 clientBundle.icons 显式声明。Vue、Vue Router 与 Iconify 采用 dedupe，保证应用和组件库共享运行时。生产预览设置页验证 11 个 SVG 图标显示，远程请求为 0；默认图标存在性与禁用网络测试 2 项通过。

图标打包仅开启 clientBundle.scan，不维护手动业务列表。当前 Nuxt UI 插件会自动将 ui.icons 映射加入本地 bundle，因此默认映射也无需重复传入 clientBundle.icons。

## 全仓库检查与格式化

根目录集中维护 .oxfmtrc.json、.oxlintrc.json 与 eslint.config.js（ESM，无需 TypeScript 配置加载器）。工具依赖集中到根 devDependencies，各包不维护独立版本/配置。Oxfmt 使用单引号、无分号、LF；Oxlint 负责通用 correctness，ESLint 补充 TypeScript/Vue/Vitest 规则，并通过 eslint-plugin-oxlint 禁用重叠规则，eslint-config-prettier 禁用格式规则。

环境按路径分层：main/preload/本地绑定包/scripts/构建配置启用 Node，renderer 源码启用浏览器，preload 源码兼具桥接环境，shared/standard 不默认启用 Node/浏览器。测试通用启用 Node；Vitest 推荐规则仅针对使用 Vitest 的包，不强制 node:test 原生绑定测试迁移。构建产物、vendor、缓存、自动生成声明和工具元数据排除。生成目录即使被 Git 跟踪也不检查。

命令：

- pnpm lint：只检查 Oxlint 与 ESLint，不修改代码（前一工具失败会停止串行命令，完整诊断可分别运行两项）。
- pnpm lint:oxlint / pnpm lint:eslint：分别检查。
- pnpm lint:fix：显式修复，两工具串行执行。
- pnpm format：格式化全仓库，禁用嵌套配置。
- pnpm format:check：只检查格式。
- pnpm --filter <包名> lint / lint:fix / format / format:check：限定包目录，调用根工具/配置。

删除 v1/v2 独立配置和重复工具依赖。根 pnpm-lock.yaml 不再被 gitignore 忽略，应随 manifest 变更一起维护（本轮不自动暂存/提交）。工具安装禁用生命周期脚本，未执行业务代码自动修复或全量格式化。

本轮验证：根配置与根 manifest 的 Oxfmt 检查通过；根 ESLint/Oxlint 配置可加载，包级 preload lint 委托生效；main/preload/v2 类型检查通过，git diff --check 通过。全仓库只读检查发现存量：Oxlint 137 项错误，ESLint 106 项错误，格式 320 个文件不符合规范，均退出 1；这是尚待第二阶段处理的真实问题，不声明全仓库 lint 通过。典型问题包括未使用导入、any 类型、重复键、测试 mock 类型、历史 Vue 代码规范。没有通过放宽所有规则使检查假通过。


### 构建与打包入口对齐（2026-10-12）

app-main 的 package.json 是唯一应用清单，main 字段仍为打包后的 packages/app-main/dist/index.js。electron-builder.mjs 基于包内 JSON 配置，并从实际安装的 Electron 包读取精确版本、通过 require.resolve 定位 regedit/vbs，兼容 hoisted 安装；生产 regedit 路径使用 process.resourcesPath。7z-bin 显式解包至 app.asar.unpacked。打包只包含 main/preload/v2 的 dist，旧 renderer 不进入产物。版本同步包含 v2，不再修改旧 renderer。Node/Chromium targets 直接读取 Electron process.versions.node/chrome，不再由 V8 推算。

验证：`pnpm build` 通过；`pnpm test` 全链路通过（构建契约 3 项、main 174 项、preload 7 项、v2 93 项）。原 v2 图标测试仅匹配双引号的错误已修正为同时接受单/双引号，使根测试入口能真实验证现有页面。未升级任何依赖版本。

未封装验收命令：`pnpm --filter @scnexus/app-main build:app --config.directories.output=../../release/build-flow-validation --config.win.signAndEditExecutable=false` 通过，使用 ASAR、未发布。真实 Electron 从该 ASAR 加载 v2 与 preload，window.scnexus 存在、欢迎页加载、打包的 7z.exe 执行成功；隔离 userData，不操作用户现有配置。此验收不包含 NSIS 安装器/图标签名、自动更新、macOS 或 Linux 打包。electron-builder 对其他平台 optional binding 给出提示，不影响本次 Windows x64 产物；跨平台需分别构建验证。


最终 root 编排验收：`pnpm run build:app --config.directories.output=../../release/build-flow-final --config.win.signAndEditExecutable=false` 通过。完整 ASAR main 入口的隔离启动额外验证了模块初始化；发现 hoisted 布局下 electron-builder 错误收集旧 renderer 的 @sentry/browser 版本，当时包配置显式保留 @sentry/electron 实际解析到的嵌套 browser SDK（不升级版本；该临时补丁在后续切回 isolated 布局后已移除，见下文）。修正后以真实 Electron 加载 ASAR main、模拟打包标志/资源根并使用临时 userData，初始化无错误、页面与桥接成功，退出码 0。该冒烟不是安装器安装验收；签名、图标写入及真实自动更新仍未执行。构建产生的 standard 已跟踪产物仅有格式/source-map 差异，本轮不保留无关生成物改动。


### 7z 目标平台过滤（2026-10-12）

7z-bin 保持原包及 path7z 接口，开发环境依然保留全部平台二进制；仅 electron-builder 的平台 files 负向过滤规则裁剪应用副本。win/linux/mac 分别匹配 bin/win、bin/linux、bin/mac，Windows/Linux 用 electron-builder 的 ${arch} 宏选择目标架构，不使用构建机 process.platform/process.arch。对应平台的 License.txt、Windows 的 7z.exe/7z.dll 与现有 dist/package.json 保留，其他平台或 CPU 目录不收集到 ASAR，也不复制到 app.asar.unpacked。asarUnpack 与运行时路径替换保持不变。不删除源依赖、pnpm 缓存或在打包后留下失效 ASAR 文件引用。

beforePack 先校验目标可执行文件、许可证和 Windows DLL，缺文件或不支持的平台/架构立即停止打包。当前支持 Windows/Linux x64、ia32、arm64；macOS x64、arm64、universal 共用包中经 Mach-O 头验证的 x64/arm64 universal 7zz。Linux ARM32 的包目录 arm 与 electron-builder armv7l 不同，本轮不默认兼容该别名，目标 armv7l 会明确拒绝，而非错误携带本机二进制。

验证：`pnpm run test:build` 14 项通过（含 Windows/Linux/macOS 九种目标、实际 builder FileMatcher 规则、目标资源缺失及不支持目标）；`pnpm --filter @scnexus/app-main build:app --config.directories.output=../../release/sevenzip-filter-check --config.win.signAndEditExecutable=false` Windows x64 未封装打包通过。检查 ASAR 与 unpacked 都只存在 bin/win/x64 的 7z.exe/7z.dll 和 bin/win/License.txt，源依赖仍有 win/linux/mac。执行产物 7z.exe 创建 ZIP、列举与解压，并比对内容通过。定向 ESLint/oxlint 与 git diff --check 通过。Linux/macOS 的选择规则有测试，未在本机实际构建/执行这些平台的产物；未上传或发布安装器。临时打包与验证目录结束后清理。
