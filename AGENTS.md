# AGENTS.md

## 文件目的

本文件为“星际枢纽”桌面应用程序（scnexus-client）的规范指导文件，制定所有开发人员和 AI 开发者（包括智能体）须要遵循的标准、风格和规范指导，其目的在于保持本项目代码的简洁性、鲁棒性、一致性、可维护性，以及便于各个开发者间理解和沟通。

## 基本准则

### 1. 编码之前充分思考

- 优先确定实际需求和设计方案，避免在编码前缺乏明确的目标和规划。
- 不要假设！如有任何困惑或出现歧义，及时询问，而不是猜测或随意处理。
- 如果存在更优的方法或方案，应适时主动提出异议和新方案，主动参与发起讨论和改进。

### 2. 编码过程保持简洁

- 优先尝试使用最少的代码解决目标问题，避免过度冗余和重复。
- 不要添加要求之外的功能！
- 不要为单次使用的代码创建抽象或复杂的结构。
- 不要为代码进行过度包装，特别对于配置类代码不要过度尝试减少代码。
- 不要为不可能的场景做过度的错误或边界处理。
- 不在没有实际要求的情况下创建“灵活性”和“可扩展性”的结构。

**检验标准：** 资深工程师会觉得这过于复杂吗？如果是，请简化。

### 3. 精准实施目标需求

- 确保编码内容都是目标需求所需要的实现。
- 优先匹配现有代码风格和实现思路。
- 如无必要，不要修改或影响相邻的代码、注释或格式。
- 如未明确要求，不要重构可以正常运行的代码。
- 如果发现现有实现存在问题或不足，可以提出讨论，但不要主动修改或删除。

## 架构与技术基线

完整架构、IPC 契约及实施记录见 [架构文档](./docs/architecture.md)。本文规定开发方式，架构文档规定包职责和运行边界。

以下为当前工具链基线，已在仓库中落地。升级依赖时同步更新本节，并确认版本可用性与兼容性。

- 开发环境：Node.js 26、pnpm 11 monorepo。
- 构建与打包：Vite 8（Rolldown）、Electron 45、electron-builder 26、tsdown（库构建）。
- 主进程：electron-store、electron-log。
- 界面：Vue 3（组合式 API）、Vue Router 5、Pinia、Axios、Nuxt UI（`@nuxt/ui`）、VueUse、Tailwind CSS 4。
- 质量工具：Vitest（测试）、oxlint 与 ESLint（静态检查）、oxfmt（格式化）。
- TypeScript 及插件版本在工具链升级时按兼容性确定，不继续将旧版固定为架构要求。

Node 26 是开发工具链基线；主进程和 preload 以 Electron 内嵌运行时为准（Electron 45 内嵌 Node.js 24、Chromium 156），不能用开发机 Node 版本代替运行时验证。依赖升级时确认版本可用性及兼容性，不静默更换版本。

## 包边界

- `packages/app-main`：应用生命周期、窗口、本地服务、文件与游戏进程、持久化、日志及 IPC handler。
- `packages/app-preload`：通过 contextBridge 暴露受控 IPC API；不承载业务或直接操作游戏文件。
- `packages/app-renderer-v2`：唯一 renderer 运行与维护入口，负责页面、路由、界面状态和 HTTP 请求。
- 旧 `packages/app-renderer`（v1）已从当前分支移除；历史实现通过 Git 历史或 `v001` 分支查看，不恢复其依赖和运行入口。
- `packages/app-shared`：共享类型、DTO、错误码和纯契约逻辑，不依赖 Electron、Node 文件系统或 Vue。
- `packages/standard`：对外发布的 `@scnexus/standard`，定义作品包标准、JSON Schema、校验器与解析器，可独立发布到 npm，供外部作者与工具消费。
- `packages/replay-parser`：录像文件识别、归档组件检查与元数据提取，不依赖 Electron。
- `packages/bzip2-wasm`：libbz2 的 WebAssembly 解码器，供录像解析使用。
- `packages/node-stormlib`、`packages/node-casclib`：MPQ/CASC 归档读写能力，通过 Git submodule 引入上游 StormLib、CascLib 源码；app-main 当前未声明依赖也未导入它们。

运行包之间不导入彼此源码。跨进程使用 IPC，共享契约通过辅助包公开导出使用。不要复制旧 renderer 的隐式依赖或未经验证的实现。

## 许可

- 应用与运行包（`app-main`、`app-preload`、`app-renderer-v2`、`app-shared`、`standard`）采用 BSD-3-Clause；工具与解析类包（`bzip2-wasm`、`replay-parser`、`node-stormlib`、`node-casclib`）采用 MIT。各包在自身 `package.json` 声明许可，不依赖根字段推断；对外发布的包须在包目录内放置 `LICENSE` 文本，使其随打包产物一并分发。
- 引入新依赖时确认许可兼容性；随应用分发的第三方组件、二进制与素材须登记在 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)，安全相关约定见 [SECURITY.md](./SECURITY.md)。

## 工作区与验证

- 使用 pnpm，在依赖所属包声明依赖；内部依赖使用 `workspace:*`。
- 保持根目录 pnpm-lock.yaml，不引入新的 npm/yarn 锁文件。
- 不把依赖提升后偶然可用的包当作已声明依赖。
- 使用现有包级命令和根目录编排；计划中的脚本尚未实现时，不把它们描述为已存在。
- 构建、类型检查和测试分别验证，Vite 构建不能代替类型检查。提交前运行 `pnpm run typecheck`、`pnpm run lint`、`pnpm run test`；仅改文档或配置时至少运行 `pnpm run format:check`。
- 生成文件（根目录与 renderer 包内的 `stats.html`、`packages/app-renderer-v2/auto-imports.d.ts` 与 `components.d.ts`）不入库，由开发或构建流程生成，不手工编辑也不再提交。
- 每次运行检查记录具体命令和结果；无测试文件不等于测试覆盖。
- 文档修改只检查文档一致性和链接，不安装依赖或运行全量打包。

## Vue.js 代码编写和页面开发

所有界面以桌面主窗口 **1000×700** 为设计和验收基准，计算侧栏、标题栏后的实际内容宽高。需要左右并排的区域保持同一行，不使用会在标准主窗口下意外切为单列的响应式断点；优先紧凑间距、受控文本换行和必要的内容滚动，避免拉伸变形或横向溢出。新增或调整界面须在该窗口尺寸验证。

所有界面在 `packages/app-renderer-v2` 中使用 Vue 3（组合式 API）和 TypeScript 开发，不再维护 v1 renderer。

所有 Vue 文件（`.vue`）和单文件组件（SFC）**必须**使用组合式 API（Composition API）进行开发，并使用 `<script lang="ts" setup>` 标签。

页面优先使用 Nuxt UI 组件及其配套样式体系，不将旧 renderer 的 UnoCSS 作为 v2 默认要求；局部 CSS 使用 `<style scoped>`。Nuxt UI 以 Vue/Vite 集成方式使用，不因此引入 Nuxt 服务端。

renderer-v2 各类操作完成后的成功、失败等结果提示优先使用 Nuxt UI toast；需要用户确认、决策或持续查看的流程使用对话框，持久性上下文警告使用内联提示，不用常驻页面提示替代短暂的操作反馈。

使用 Vue 模板引用时，命名应以 `ref` 开头，例如 `refButton`、`refInput`；优先使用 `useTemplateRef`。需要显式类型时区分 DOM 元素、组件实例与组件 props，不用 props 类型标注实例引用，也不为简单引用额外引入类型辅助依赖。

定义组件 props 时，优先以 `props.xxx` 访问，需要默认值时使用 `withDefaults`，保持项目内写法一致。

组件编写后，可尝试为其定义名字，使用 `defineOptions({ name: 'XXX' })` 进行处理，组件名应遵守所在路径+文件夹名称的规范；例如：`/src/components/MyComponent/MyComponent.vue` 对应的组件名应为 `MyComponent`，`src/views/my-views/list.vue` 对应的组件名应为 `MyViewsList`，`src/views/my-views/components/AnotherComponent.vue` 对应的组件名应为 `MyViewsAnotherComponent`。

renderer-v2 已通过 `@nuxt/ui/vite` 配置自动导入（Vue、Vue Router 及 `composables`、`stores`、`ipcs`、`apis`、`utils` 目录），但业务代码仍显式导入这些 API，不依赖生成声明；Nuxt UI 组件在模板中按组件名直接使用，无需导入。生成的 `auto-imports.d.ts` 与 `components.d.ts` 不入库，未生成时全部 API 显式导入。类型使用 `import type`，不假定旧 renderer 的插件在 v2 自动生效。

## 状态管理

本项目使用 Pinia 作为状态管理方案，所有 store 均放置在 `/src/stores/` 目录下，该目录下的每个文件都对应一个独立的 store 模块。

每个文件都应导出一个对应的 store 模块，模块名应采用 `useXXXStore` 的命名规范，其中 `XXX` 对应该 store 的功能或业务域。

本项目中的 Pinia store 应采用组合式 API（Composition API）的写法，即通过 `defineStore` 定义 store，定义 `ref` 来管理 state，定义 `computed` 来管理 getter，定义函数来管理 action，最后在返回对象中暴露 state、getter 和 action。

Pinia 管理界面状态和主进程数据的界面投影；本地游戏配置及安装状态由主进程管理。v2 不默认启用 Pinia 持久化插件，也不复制旧包的 `persist: true` 配置。确有持久化需求时先确定数据归属和保存方案，敏感信息不默认写入 localStorage。

Pinia Store 示例：

```ts
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', () => {
  const appReady = ref(false)
  function setAppReady(ready: boolean) {
    appReady.value = ready
  }
  return { appReady, setAppReady }
})
```

使用时，可以通过调用对应的 `useXXXStore` 方法获取 store 实例，例如：

```ts
const appStore = useAppStore()
appStore.setAppReady(true)
```

本文的 `src` 路径均相对于所属包。使用 store 时显式导入，与现有写法保持一致。

## IPC 与本地操作

- renderer-v2 的桌面 IPC 调用及事件订阅统一封装在 `packages/app-renderer-v2/src/ipcs/`，按业务模块组织，由 `index.ts` 统一导出；桥接和结果校验辅助逻辑放在 `ipcs/internal/`。
- IPC 层导出的函数统一以 `ipcXXX` 命名（例如 `ipcCustomizeList`），不使用 `apiXXX`；页面、Store 和 composable 通过这些封装调用，不在目录外直接调用 preload 桥接。HTTP API 与 IPC 分开，不混用命名或适配层。

- preload 只暴露明确的业务方法与订阅，不暴露任意 channel 调用或原始 ipcRenderer。
- main 校验参数和调用来源；共享 TypeScript 类型不能替代运行时校验。
- 通过可序列化 DTO 和统一错误码返回结果，不把 Error 当作成功 data。
- 事件订阅提供取消函数，组件卸载时清理；并行长任务使用 taskId 区分。
- 服务不直接操作窗口，由适配层发送业务事件。
- 文件修改校验规范化路径的目录边界；只忽略预期的不存在错误，不吞掉权限或文件占用错误。
- 安装和激活按需要提供暂存、备份、提交与失败恢复；同一目标目录的修改互斥。
- electron-store 持久化字段需要默认值、校验和版本迁移；electron-log 不记录令牌等敏感信息。

## HTTP 与权限边界

- Axios 客户端集中配置请求地址、超时及错误转换，与桌面 IPC 适配分开。
- 页面显示、菜单和路由守卫只控制 UI；远程授权由服务端验证，本地操作由 main 验证。
- 不假定 v2 已存在权限指令、动态菜单或 `usePermission`，不引入与当前产品无关的后台管理权限模型。

## 国际化

- 保留 Vue I18n 的多语言方向，简体中文为源语言，英文与繁体中文随功能同步维护。
- 繁体中文采用和简体中文相同的文本，仅将汉字转换为繁体汉字。
- 语言资源相对于 renderer 包存放于 `src/locales`，按语言和业务模块组织。
- 文本键使用扁平结构，例如 `campaign.manage.install.title`。
- v2 已完成 vue-i18n 接入、语言初始化与资源迁移，三套语言资源的键需保持一致；新增或修改文案时同步更新 `zh`、`zh-Hant`、`en`。
- 当前尚无独立国际化流程文档；需要细化时另行建设，不引用不存在的规范文件。

参考 [Vue I18n 文档](https://vue-i18n.intlify.dev/)。
