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

完整目标架构、IPC 契约及迁移顺序见 [架构文档](./docs/architecture.md)。本文规定开发方式，架构文档规定包职责和运行边界。

以下为目标基线，不表示当前 manifest、构建脚本和业务已完成升级。本阶段只建设文档，不修改依赖与代码。

- 开发环境：Node.js 26、pnpm monorepo。
- 构建与打包：Vite 8（Rolldown）、Electron 44、electron-builder 36。
- 主进程：electron-store、electron-log。
- 新界面：Vue 3（组合式 API）、Vue Router 5、Pinia、Axios、Nuxt UI（`@nuxt/ui`）、VueUse。
- TypeScript 及插件版本在工具链升级时按兼容性确定，不继续将旧版固定为新架构要求。

Node 26 是开发工具链基线；主进程和 preload 以 Electron 内嵌运行时为准。目标依赖升级时确认版本可用性及兼容性，不静默更换版本。

## 包边界

- `packages/app-main`：应用生命周期、窗口、本地服务、文件与游戏进程、持久化、日志及 IPC handler。
- `packages/app-preload`：通过 contextBridge 暴露受控 IPC API；不承载业务或直接操作游戏文件。
- `packages/app-renderer-v2`：后续界面开发入口，负责页面、路由、界面状态和 HTTP 请求。
- `packages/app-renderer`：暂时保留参考，非必要不增加新功能；迁移时不直接破坏旧运行入口。
- `packages/app-shared`：共享类型、DTO、错误码和纯契约逻辑，不依赖 Electron、Node 文件系统或 Vue。

运行包之间不导入彼此源码。跨进程使用 IPC，共享契约通过辅助包公开导出使用。不要复制旧 renderer 的隐式依赖或未经验证的实现。

## 工作区与验证

- 使用 pnpm，在依赖所属包声明依赖；内部依赖使用 `workspace:*`。
- 保持根目录 pnpm-lock.yaml，不引入新的 npm/yarn 锁文件。
- 不把依赖提升后偶然可用的包当作已声明依赖。
- 使用现有包级命令和根目录编排；新目标脚本尚未实现时，不把它们描述为已存在。
- 构建、类型检查和测试分别验证，Vite 构建不能代替类型检查。
- 每次运行检查记录具体命令和结果；无测试文件不等于测试覆盖。
- 文档修改只检查文档一致性和链接，不安装依赖或运行全量打包。

## Vue.js 代码编写和页面开发

新界面在 `packages/app-renderer-v2` 中使用 Vue 3（组合式 API）和 TypeScript 开发；旧 renderer 不要求在本阶段按新规范重写。

所有 Vue 文件（`.vue`）和单文件组件（SFC）**必须**使用组合式 API（Composition API）进行开发，并使用 `<script lang="ts" setup>` 标签。

页面优先使用 Nuxt UI 组件及其配套样式体系，不将旧 renderer 的 UnoCSS 作为 v2 默认要求；局部 CSS 使用 `<style scoped>`。Nuxt UI 以 Vue/Vite 集成方式使用，不因此引入 Nuxt 服务端。

renderer-v2 各类操作完成后的成功、失败等结果提示优先使用 Nuxt UI toast；需要用户确认、决策或持续查看的流程使用对话框，持久性上下文警告使用内联提示，不用常驻页面提示替代短暂的操作反馈。

使用 Vue 模板引用时，命名应以 `ref` 开头，例如 `refButton`、`refInput`；优先使用 `useTemplateRef`。需要显式类型时区分 DOM 元素、组件实例与组件 props，不用 props 类型标注实例引用，也不为简单引用额外引入类型辅助依赖。

定义组件 props 时，优先以 `props.xxx` 访问，需要默认值时使用 `withDefaults`，保持项目内写法一致。

组件编写后，可尝试为其定义名字，使用 `defineOptions({ name: 'XXX' })` 进行处理，组件名应遵守所在路径+文件夹名称的规范；例如：`/src/components/MyComponent/MyComponent.vue` 对应的组件名应为 `MyComponent`，`src/views/my-views/list.vue` 对应的组件名应为 `MyViewsList`，`src/views/my-views/components/AnotherComponent.vue` 对应的组件名应为 `MyViewsAnotherComponent`。

仅在当前包已配置自动导入插件并生成类型声明时使用自动导入，否则显式导入 Vue、Pinia 和 VueUse API。类型使用 `import type`，不假定旧 renderer 的插件在 v2 自动生效。

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

本文的 `src` 路径均相对于所属包。使用 store 时显式导入；仅在当前包已配置相应自动导入时省略。

## IPC 与本地操作

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

- 保留 Vue I18n 的多语言方向，简体中文为源语言，英文与繁体中文按功能迁移。
- 语言资源相对于 renderer 包存放于 `src/locales`，按语言和业务模块组织。
- 文本键使用扁平结构，例如 `campaign.manage.install.title`。
- v2 的插件接入、语言初始化及资源迁移需明确实现，不能把旧 renderer 配置视为已存在。
- 当前尚无独立国际化流程文档；需要细化时另行建设，不引用不存在的规范文件。

参考 [Vue I18n 文档](https://vue-i18n.intlify.dev/)。
