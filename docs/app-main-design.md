# app-main 模块与存储设计

## 1. 范围与状态

本文细化 [目标架构](./architecture.md)。保留现有业务能力，调整能力边界、窗口生命周期和存储访问方式，不以此次设计为理由删除原功能。

main 与 preload 已完成基础模块及内容业务重构：common 已拆分，window/logging/telemetry 模块化，Store 使用 electron-store v11 并显式初始化。campaign/customize 新解析、安装、激活及扫描已实现，窗口当前加载 v2，v2 内容交互未在本轮开发；工坊业务未重写。日志和错误处理见 [日志与错误规范](./logging-and-errors.md)。

## 2. 模块划分

移除 common 作为能力集合的业务边界，将其每项能力提到 modules 的一级目录；窗口管理也作为独立模块。

| 模块              | 能力与边界                                                  | 主要依赖                                   |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------ |
| app               | 应用版本、系统语言、应用路径等查询；不负责创建窗口          | Electron app                               |
| window            | 主窗口创建、加载、恢复、聚焦、关闭、renderer-ready 状态     | Electron BrowserWindow                     |
| deep-link         | 协议注册、首次启动/第二实例/open-url 入口、解析及待投递队列 | window                                     |
| dialog            | 文件和目录选择；统一绑定所属窗口                            | window、Electron dialog                    |
| shell             | 打开网页、路径、定位文件，校验协议和输入                    | Electron shell                             |
| tray              | 托盘创建、菜单、动作与销毁；保留原能力，是否启用单独控制    | window、应用退出协调                       |
| updater           | 检查、下载、安装与状态事件；不承载普通内容包下载            | window 事件适配、更新工具                  |
| setting           | 用户偏好与客户端设置，含统一日志等级                        | setting repository                         |
| scii-game-setting | 游戏环境配置、检测、验证、派生路径、配置变更                | scii-game-setting repository、游戏检测工具 |
| content-package   | 目录/归档读取、描述解析、冲突预览、文件操作与扫描           | 游戏路径服务、内容索引                     |
| campaign          | 战役库、激活、取消激活、恢复和卸载                          | profile、内容索引与文件工具                |
| customize         | 自定义地图/模组导入、安装、卸载及游戏启动                   | profile、内容索引与归档工具                |
| workshop          | 内容元数据、摘要、上传及后续下载                            | setting（下载目录）、网络与归档工具        |
| logging           | 日志入口、等级应用、各进程日志归集与脱敏                    | electron-log；通过装配接收等级             |
| telemetry         | 用户授权后的 Sentry 初始化、错误上报、身份绑定和关闭        | Sentry；通过装配接收遥测偏好               |

现有 utils/logger.ts 与 utils/sentry.ts 的能力分别迁入 modules/logging 和 modules/telemetry，不再作为 utils 中的全局有状态单例。两个模块遵循同一基础文件结构，通过 index.ts 初始化及导出能力；Sentry SDK 适配实现放在 telemetry 内部。

logging 负责本地日志输出和跨进程归集，telemetry 负责用户授权后的远程上报。二者不合并：关闭遥测不影响本地日志，日志阈值也不代表上报授权。utils 仅保留无生命周期、无全局状态的基础工具，不再负责日志或 Sentry 初始化。

logging 管理诊断能力，不持有 setting Store，也不在错误报告过程中调用 setting。存储错误不能递归触发存储写入。

每个 app-main 模块统一包含三个基础文件，额外实现按需要拆分：

- `index.ts`：模块 init、生命周期装配及公开能力导出。其他模块通过该入口访问，不导入内部实现文件。
- `xxx.ipc.ts`：注册该模块的 IPC，校验来源/参数、调用能力并转换 DTO；不承载具体业务实现。
- `xxx.ts`：该模块的具体实现与 main 内部业务能力；不再以 `xxx.service.ts` 作为基础文件名。
- 其他具体实现文件：按实际需要拆分检测、任务、适配等逻辑，由基础实现或入口组织。

没有面向 renderer 的能力时仍保留 `xxx.ipc.ts` 及注册入口，但不为满足目录结构制造无用 channel。

目标形态：

```text
src/
  index.ts
  bootstrap.ts
  modules/
    <module>/
      index.ts                 init、生命周期装配、能力导出
      <module>.ipc.ts          设置 IPC、校验参数、转换 DTO
      <module>.ts              具体实现与 main 内部业务能力
      <其他实现>.ts            按需要拆分的具体实现
    window/
    logging/
    telemetry/
    setting/
    scii-game-setting/
    content-package/
  stores/
    setting.ts / scii-game-setting.ts / <content>.ts
    store-repository.ts             受限读取与完整提交，无额外状态快照
    store-electron-backend.ts        electron-store 与启动迁移、备份
    store-schema.ts                 JSON Schema 通用字段与内容结构
  utils/                      通用文件与归档能力
```

三个基础文件是所有模块的统一约定，其余文件仅按实际需要创建。“服务”表示业务职责，不要求对应 `.service.ts` 文件。原 campaign/customize/workshop 能力逐步迁移，不做无关重写。

## 3. setting 与 scii-game-setting：独立模块，不合并业务

### 推荐结论

**都作为 module；共享 electron-store 基础设施，但不合并为一个配置业务模块或一个可任意修改的 Store。**

| 维度        | setting                                  | scii-game-setting                              |
| ----------- | ---------------------------------------- | ---------------------------------------------- |
| 内容        | 用户偏好、日志等级、下载目录、客户端标识 | 游戏安装目录、检测状态、派生执行路径与内容目录 |
| 修改频率    | 用户可频繁修改                           | 需要验证并影响整个本地业务环境                 |
| 校验        | 枚举、路径选择、偏好约束                 | 游戏目录、实际文件、执行能力与路径归属         |
| 后果        | 应用偏好立即生效                         | 使内容缓存失效，可能与正在执行的安装冲突       |
| main 调用者 | logging 装配、workshop 等                | campaign、customize、游戏启动等                |

合并只会减少文件数量，却让生命周期、校验和依赖混杂。若 UI 需要同时读取二者，可由 preload/renderer 聚合结果，不合并存储职责，也不引入所谓“全局配置万能模块”。

### setting 字段与修改归属

| 字段              | 含义与默认值                                                             | 修改归属                              |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------- |
| clientId          | 客户端安装标识，首次创建一次 UUID；迁移保留旧值                          | main 内部维护，UI 只读                |
| lastUpdatedAt     | 客户端最近成功完成版本更新的时间，Unix 毫秒时间戳；尚无已知更新时为 null | updater/启动版本确认流程，UI 只读     |
| downloadDirectory | 默认文件下载目录，首次使用系统 downloads 路径                            | 用户通过受控 IPC 修改，main 校验      |
| displayLanguage   | 显示语言选择，默认 system；显式选择支持的语言                            | 用户通过受控 IPC 修改                 |
| logLevel          | 全局输出阈值，默认 error                                                 | 用户或 main 通过日志等级协调流程修改  |
| telemetryEnabled  | 是否启用遥测，默认 false                                                 | 用户主动授权或撤销，通过受控 IPC 修改 |

_schemaVersion、_revision 是存储管理字段，不属于用户偏好。lastUpdatedAt 不随设置保存、更新检查或下载完成而变化；仅在新版本实际安装并成功启动确认后更新。实现时保留内部已确认版本信息以避免每次启动重复更新时间；初次安装不冒充一次版本更新，旧 LAST_UPDATED_TIME 不直接迁移为该值。

显示语言存储“选择策略”和运行时“有效语言”分离：system 按系统首选语言顺序匹配 zh-CN、en-US、zh-TW，英文变体归入 en-US，繁体中文变体归入 zh-TW，简体中文归入 zh-CN；无法匹配时回退 zh-CN。显式选择不被系统语言覆盖。renderer 从 setting 快照获得有效语言并设置 Vue I18n，不独立保存另一份语言偏好。

setting 业务字段全部采用顶层结构，不增加 preferences 包装层。字段层级不承担权限划分：设置快照只读返回，用户可修改字段明确限定为 downloadDirectory、displayLanguage、logLevel、telemetryEnabled；clientId、lastUpdatedAt、_schemaVersion、_revision 由 main 维护。下载目录、语言、日志及遥测修改统一走 setting 业务入口；涉及运行时副作用的字段不可绕过协调流程直接提交 Store。默认 false 不等于已授权，旧配置没有明确授权也按关闭处理。

### 两种入口，共用业务服务

```text
renderer → preload → setting/scii-game-setting IPC → service → repository
其他 main 模块 ───────────────────────→ service → repository
```

- main 模块直接调用服务，不绕 IPC，不访问 Store 实例。
- IPC 不暴露任意 key 的 set/get、整包替换或磁盘文件路径；只提供允许的查询和修改。
- setting 提供 getSnapshot、updatePreferences；clientId、lastUpdatedAt、_schemaVersion 等内部字段不可被 UI patch。logLevel 和 telemetryEnabled 修改必须走各自协调流程，通用偏好更新不能绕过该流程直接写这些字段。
- scii-game-setting 提供 getGameSnapshot、configureGame；不允许 UI 直接写 SUCCESS、派生路径或路径授权列表。
- main 内部写入也经过服务校验；内部维护动作提供明确方法，不给其他模块通用写权限。
- 返回独立的只读快照 DTO，调用者修改对象不应改变存储。
- 变更成功后发布带 _revision 的快照或失效事件，renderer 更新 Pinia；订阅必须支持取消。

scii-game-setting 的 configureGame 应串行化：检查任务互斥 → 验证候选目录 → 计算派生数据 → 提交配置 → 使旧缓存失效 → 发出变更。刷新失败独立报告，不伪装成配置写入失败；缓存标记为需要重建。

安装/激活开始时固定使用一个 scii-game-setting _revision 的配置快照，任务期间拒绝切换游戏根目录，防止中途混用新旧路径。

## 4. electron-store v11 与 repository

每个 Store 在自身文件中定义默认值、业务 schema、记录校验、迁移和 repository 创建。campaign.ts、customize.ts、campaign-active.ts 分别维护自己的规则，不使用统一内容 Store 工厂；扫描器按记录类型复用对应 Store 的校验。

store-schema.ts 仅提供版本、字符串、时间戳等通用 schema 片段；store-validation.ts 仅提供对象、字段集合、基础类型及绝对路径等通用工具，不包含 Package、安装清单或活动战役业务规则。原 store-content-schema.ts、store-content-validation.ts 已删除。

存储基础文件统一使用 `store-` 前缀：

| 文件                        | 职责                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `store-schema.ts`           | 定义复用 JSON Schema，由 electron-store 校验字段类型、枚举、范围和内容索引结构                      |
| `store-validation.ts`       | 保留 schema 之外的校验及旧数据迁移辅助，如绝对路径检查和旧字段检查；不替代 schema                   |
| `store-repository.ts`       | 提供初始化、快照读取、按 key 获取/更新和完整更新，维护内部版本字段与统一错误；不保存重复内存快照    |
| `store-electron-backend.ts` | 创建 electron-store 实例，启动时识别旧格式、备份和迁移，配置 schema；日常读写由 electron-store 执行 |

### 版本与运行边界

- 目标升级到 electron-store v11；它是原生 ESM，要求 Electron 30+，与 Electron 44 的目标范围匹配。
- 仅 main 创建 Store。即使库支持 renderer 使用，也不启用 Store.initRenderer，不向 preload/renderer 暴露存储能力。
- 在明确的启动阶段创建实例，不在模块 import 时读路径、建目录或写文件。
- 应用自有数据根目录为 `app.getPath('home')/.scnexus`（Windows 为 `%USERPROFILE%\.scnexus`），包含 `SCNexusStorage`、`auth`、`analytics`。启动时在任何业务存储初始化前，将旧 Electron `userData` 下这三个目录复制至同级暂存目录，成功后整体重命名提交；保留旧目录，不迁移游戏文件或下载文件。新根目录已存在时以其为准，不合并、不重新导入旧凭据；清空数据或退出账号后不会从旧目录复活。迁移失败阻止本次业务初始化，清理暂存并允许下次重试，不以空设置覆盖旧数据；拒绝迁移中的符号链接和非普通文件。不要预先手工创建空的新根目录。
- 不修改 Electron `userData`、`sessionData`、缓存、Local Storage、日志、崩溃数据及 safeStorage 操作系统密钥的位置。认证密文迁移后仍使用同一 Electron 加密环境；仅复制 `.scnexus` 到其他用户或机器不保证可解密。
- Store 的单文件原子写入不意味着多文件事务，也不意味着游戏文件与配置事务。

### 数据组织

setting、scii-game-setting 和内容索引继续分开保存。默认沿用原文件名：store-setting、store-profile、store-campaign、store-campaign-active、store-customize，避免升级时意外失去旧数据。

新模型采用明确字段，例如：

```text
SettingData
  _schemaVersion
  _revision
  clientId
  lastUpdatedAt             默认 null，仅成功更新后记录
  _lastConfirmedVersion      main 内部用于版本确认，默认 null
  downloadDirectory
  displayLanguage 默认 system
  logLevel       默认 error
  telemetryEnabled 默认 false

SciiGameSetting
  _schemaVersion
  _revision
  gameRoot                   已验证并提交的游戏目录
```

游戏存在性、当前版本、启动器是否可用等属于可变环境状态，启动/刷新时重新检测。优先由 gameRoot 派生路径，不持久化另一套可独立修改的路径；运行时维护检测快照供业务读取。授权目录从有效配置计算，不允许通过普通设置修改。

内容索引保持可重建缓存语义，不把“记录存在”当作“已经安装成功”。字段迁移不在本设计阶段直接执行。

### repository 规则

- 每类数据有自身 schema/defaults，限制对象结构与枚举，读写前进行业务校验。
- repository 提供 init、getSnapshot、getKey、updateKey、update，不导出 electron-store 原始实例。日常读取直接使用 electron-store 的 store，完整候选数据以一次 store 赋值提交；不自行 fs 读取/JSON 解析，不再维护一份内存 snapshot。返回值仍是隔离副本。
- 对一次更新构造完整候选对象，以 electron-store v11 的 schema、rootSchema.required 和 additionalProperties 校验通用类型、必需字段及未知字段；业务目录、语言、日志与授权的模块校验保留。_schemaVersion 由存储管理，_revision 随一次完整提交递增；不以多次 set 模拟事务。
- 服务负责业务语义、串行更新和变更事件，repository 只负责持久化与存储错误转换。
- _revision 在对应文件中递增；不能用不同文件的 _revision 比较全局时间顺序。
- 非必要不启用外部文件 watch，默认只允许 main 写入。若支持用户外部编辑，需要另行定义校验和冲突处理。
- 写失败不发成功事件，不改变对外有效快照。
- 损坏、权限和磁盘错误使用明确错误码。不得静默清空用户配置；备份损坏文件后再提供恢复选择。
- 失败的配置存储不阻止 logging 以 error 降级运行，但配置修改必须返回失败，不能假装已保存。

### 迁移设计

electron-store v11 文档明确提示内置 migrations 存在已知问题。采用应用自己的 _schemaVersion 与可测试迁移，不把应用版本号直接作为数据版本。

1. 仅在启动迁移前使用 fs 读取旧格式并检查数据版本；任一 _schemaVersion 或旧 schemaVersion 高于当前版本即拒绝打开，不备份、不覆写。当前格式由 electron-store schema 校验，缺失字段不以默认值掩盖。
2. 同时支持 v10 大写字段和本轮旧 schemaVersion/revision/lastConfirmedVersion 格式的一次迁移。旧小写模型只重命名内部字段为 _schemaVersion/_revision/_lastConfirmedVersion，保留业务数据与 revision；v10 的 CLIENT_ID 必须保留，clientId、lastUpdatedAt 不加下划线。
3. 旧文件无日志等级时补 error；无显示语言时补 system，无明确遥测授权时补 false。旧 LAST_UPDATED_TIME 的含义不能证明客户端更新完成，因此 lastUpdatedAt 初始化为 null；旧下载目录通过验证后保留。默认值不按开发/生产环境改变。
4. 迁移候选通过同一 electron-store schema 写入独立迁移文件；验证完成后备份原文件并替换，失败保留原始数据且清理迁移文件。fs 仅承担启动旧格式检查、备份、迁移文件提交及损坏恢复的必要操作；不配置 electron-store migrations。
5. 内容索引可标记待重建，不迁移无法信任的绝对路径缓存。
6. 重复启动迁移应幂等；失败不删除原数据、不继续按错误的新数据启动业务。
7. 新版本数据被旧程序打开时不降级覆写；提示不支持的数据版本或使用兼容策略。

备份与恢复策略在实施时补测试，包括首次运行、v10 数据、部分文件已迁移、坏 JSON、写入失败和降级。

## 5. 窗口模块

### 职责与内部 API

window 是唯一创建和维护主 BrowserWindow 的模块，避免其他模块根据 getAllWindows() 随意选择窗口。

主窗口默认尺寸和最小尺寸均为 1000×700（BrowserWindow 的窗口尺寸，不开启 useContentSize）。renderer-v2 使用 56px 标题栏与内容区独立滚动；首页按剩余高度居中，设置基本页将版本/帮助区并排，战役详情采用 220px 左栏与可收缩右栏，长包名/描述/路径换行。安装弹窗限制可视高度、正文独立滚动、底部确认按钮不随正文滚出；其他战役弹窗也允许长文本换行。布局用 1000×660 浏览器内容区保守模拟原生标题栏占用，并验证首页、设置的三个标签页、战役总览/详情和长文本、多文件树不会造成横向溢出。窗口测试断言首次创建与销毁后重建都使用默认/最小 1000×700；窗口、安装弹窗、来源选择与语言定向测试共 18 项通过。`pnpm run typecheck:main`、`pnpm --filter @scnexus/app-renderer-v2 type-check`、`pnpm --filter @scnexus/app-renderer-v2 build-only` 和定向 ESLint/oxlint 通过。浏览器模拟不替代真实 Electron 窗口边框与系统缩放验收。

建议服务方法：ensureMainWindow、restoreAndFocus、getStatus、sendWhenReady、dispose。尽量不向业务服务暴露 BrowserWindow；对话框的父窗口需求由适配层处理。

renderer 不接受任意窗口配置、URL 或 preload 路径；窗口 IPC 只暴露产品确有需要的操作。

### 生命周期

```text
absent → creating → loading → ready → closed
             └──失败──→ failed → 显式重试
```

- ensureMainWindow 使用一个共享创建 Promise，防止第二实例、activate 与启动并发创建多个窗口。
- closed 时清除引用、就绪状态与监听器；销毁对象不能继续发送消息。
- ready-to-show 只控制展示时机；业务事件投递依赖 renderer 完成订阅后的显式 ready 握手。
- 每次页面 reload 使握手失效，旧握手不得激活新页面；仅接受所属窗口当前页面的信号。
- deep-link 保存有界待投递队列，覆盖冷启动、第二实例和 open-url；不静默丢弃、不落盘登录令牌。
- deep-link 是需要重投的命令；更新状态等可查询快照的事件在握手后重新同步，不无限累积队列。
- 页面加载失败提供诊断与重试；renderer 崩溃/重载后重新握手并读取状态。
- 生命周期监听只注册一次，启动协调管理 app 生命周期，窗口模块管理窗口生命周期。

初期保持原产品行为：Windows/Linux 关闭最后窗口退出，macOS 保持应用并支持 activate 重建。托盘启用不自动改为关闭隐藏；如要改变，需要单独确认产品行为。

开发加载 v2 dev server，生产加载 v2 静态文件；迁移完成前保留旧入口兼容。nodeIntegration=false、contextIsolation=true，preload 路径固定，外链交给 shell 模块验证。

## 6. 装配顺序与依赖

```text
1. logging：无存储依赖的 error 启动日志
2. stores：打开、校验和迁移 setting/scii-game-setting
3. setting：读取日志偏好，装配器将等级应用到 logging
4. profile：构建游戏环境快照
5. window：注册生命周期与控制接口
6. app/dialog/shell/deep-link/tray/updater 及业务模块注册
7. 创建窗口 → preload 桥接 → renderer ready → 同步快照
```

协议的首次启动参数与早期 open-url 入口应在入口尽早捕获，稍后交给 deep-link；不能等到步骤 6 才开始监听而丢失事件。

setting 的普通变更由装配器分发；日志等级及遥测偏好在对应协调流程成功后发布。logging/telemetry 不反向读取或写入 setting。telemetry 在 setting 加载后按已保存授权状态启动，存储未恢复时保持关闭。模块内部服务用显式参数或轻量装配传入，不引入 DI 框架。

scii-game-setting 无有效游戏配置时，查询与配置接口仍可用；campaign/customize handler 也注册，但相关操作返回 M011（PROFILE-NOT-READY）。updater 不适用当前平台时返回明确能力状态。可选模块失败不导致窗口完全打不开。

## 7. 实施与验收

1. 建立共享错误码及日志门面，接入启动日志和统一等级。
2. 升级 electron-store v11，提供旧数据迁移、setting/scii-game-setting 服务与受限 IPC。
3. 重构 window，验证并发创建、关闭重建、ready 握手及冷启动深链接。
4. 将 common 能力迁到一级模块，保持现有 channel 兼容或同步迁移三个包。
5. 逐步让 campaign/customize/workshop 通过服务读取配置，移除原始 Store 耦合。

测试统一使用 Vitest，模块用例位于 `src/modules/<module>/__test__/xxx.test.ts`（也允许 `.spec.ts`）；基础能力用例位于 `src/stores/__test__` 和 `src/utils/<utility>/__test__`。包级 `test` 执行一次，`test:watch` 启动监听，根目录 `test:main` 委托包级命令。

存储测试使用项目目录内隔离的真实文件与已安装的 electron-store v11，验证真实 schema，而不是模拟 schema；只注入读取/写入及迁移备份/提交失败。生命周期清理和 mock 使用 Vitest API，测试目录自动清理。

至少覆盖：main 内部与 IPC 更新走同一校验、写失败不发成功事件、非法 profile 不覆盖有效配置、任务期间配置互斥、日志等级跨进程同步、旧数据保留、窗口失败和销毁后的行为。路径移动不是功能删除，不顺带删除原有更新、托盘或兼容内容格式能力。

## 8. 当前实现与验证

- 每个模块包含 index.ts、xxx.ipc.ts、xxx.ts；common 集合已移除。tray 只注册能力，默认不创建托盘，避免改变关闭行为。
- 旧 mainWindows.ts、utils/logger.ts、utils/sentry.ts 已删除，调用直接使用 window/logging/telemetry 模块入口；空的 compress-compatible.ts 及未使用的 Store 兼容包装已删除。旧 renderer 所需 channel 兼容集中保留在 IPC 层。
- Store repository 提供 init、getSnapshot、getKey、updateKey、update；内容索引和 setting 文件名保留；profile 原文件保留归档，运行存储迁为 store-scii-game-setting。每次写入验证并增加 _revision，迁移保留备份，损坏数据不静默重置。各 Store 独立尝试初始化，失败集中报告。schema 拒绝结构错误，日常数据读写由真实 electron-store 处理，不重复维护 snapshot。
- 设置新数据类型为 SettingData；旧 SettingStore 类型与旧大写字段查询保留兼容。内部增加 _lastConfirmedVersion，打包运行时以首次成功启动建立基线，后续确认版本升级才记录 lastUpdatedAt。
- preload 暴露 window.scnexus 的 app/window/setting/logging/telemetry/deepLink API，同时保留旧 channel 函数。备用 preload 不再暴露原始 ipcRenderer。
- 用户设置只允许四个可编辑顶层字段。setting.replace 是完整替换用户偏好，不是覆写 clientId 或数据版本；main 内部完整 Store 更新通过 repository。
- profile 已迁到 scii-game-setting，保存规范化 gameRoot 和只读管理根，派生能力快照由模块返回；旧 Profile 配置转换及全部 profile:* IPC/preload 已移除，界面仅使用 window.scnexus.gameSetting。旧文件只用于一次迁移，不作为运行配置读取入口。
- renderer 目前使用旧页面，preload 在页面加载后提供过渡性 ready 通知；v2 接入时改用订阅完成后的显式握手。不能将该过渡机制视为完整 v2 ready 生命周期。
- Sentry 默认不启用；生产包且 DSN 有效时按用户授权开启。使用无离线积压的受控 transport 门控，关闭时使旧代 transport 失效；错误经自有桥接归集，不启用自动 renderer SDK 注入。真实服务发送和安装包场景尚未验证。

已执行：

| 检查                                                                | 结果                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck:main`                                           | 通过                                                                                                              |
| `pnpm run typecheck:preload`                                        | 通过                                                                                                              |
| `pnpm run test:main`                                                | 5 个 Vitest 文件、25 项测试通过（含 14 项真实 electron-store 存储测试和 4 项 MPQ 测试）                           |
| `pnpm run build:main`                                               | 通过；原 Vite 配置仍有 native configLoader 迁移提示                                                               |
| `pnpm run build:preload`                                            | 通过；同上                                                                                                        |
| 上一轮 Electron 44 临时 userData 真实运行冒烟（本轮未重新执行）     | 首次启动及重启通过：默认设置、设置写入、只读字段拒绝、旧 API 兼容、单窗口、日志文件等级过滤和 clientId/等级持久化 |
| `pnpm exec vue-tsc --noEmit -p packages/app-renderer/tsconfig.json` | 未能完成：旧 vue-tsc 与当前 TypeScript 不兼容，出现 supportedTSExtensions 查找失败；本轮未修改旧 renderer 工具链  |

不包含实际游戏目录修改、真实 Sentry 网络上报、NSIS 更新安装、v2 界面或完整安装包验证。app-main 已移除 node:test 入口，统一由 Vitest 发现并执行上述用例。

## 9. 后续内容业务重构边界

[战役包与自制作品设计](./campaign-customize-design.md) 已定义新 Package 标准、分析模式、地图/模组映射、管理标记及扫描重建。profile Store 已迁为 scii-game-setting，customize/campaign/campaign-active Store 已改为 Package 与本地安装记录；旧字段仅作为迁移历史或旧界面查询适配保留。

描述读取和格式解析从 campaign/customize 分离，自动识别只预留位置。两种描述文件独立深入定位最外层有效包根，CCM 来源可选择原 CCM 或转换为 SCNexus。持久化按用户选择：CCM 用 metadata.txt，SCNexus/未来自动模式用 SCNexusCustomizeData 和 package.json。新增可为空的推荐模式与按模式分组、逐文件携带 conflictId 的 Map/Mod 冲突对，冲突选择覆盖/保留/取消；scii-game-setting 当前聚焦路径，版本检测暂不实现。对应 main、Store、共享类型及 preload 已实现，具体流程与最新验证记录以内容设计文档为准。

## 10. 依据

- [electron-store v11 文档](https://github.com/sindresorhus/electron-store/blob/v11.0.0/readme.md)：ESM、Electron 版本、schema、单文件原子写入及 migrations 限制。
- [日志与错误规范](./logging-and-errors.md)：错误码表、日志传输与等级更新流程。

## 初始化恢复与更新收尾（2026-10-08）

- Store 初始化按独立仓库收集错误；setting 仅在自己的仓库已初始化时装配。游戏配置 IPC 不依赖游戏目录已可用，启动失败后仍允许用户恢复。
- `window.scnexus.gameSetting.initialize(path?)` 重新打开游戏配置 Store；无参数重新验证保存目录或进行 Windows 注册表发现，带路径时校验指定目录。`configure(path)` 同样经过 Store 重试和目录校验；`refresh()` 只读能力快照，不重载 Store。
- 重试仅针对游戏配置及依赖它的游戏/内容模块，不重载全部 Store。打开新 Store 失败不替换可用旧实例；目录修改和重试与内容任务互斥。
- 成功保存配置后尝试初始化 campaign、campaign-active、customize 仓库，全部成功后再注册内容模块；成功模块不重复注册，失败可以在下一次 initialize/configure 后重试。业务 IPC 每次验证游戏路径，不能仅凭旧 gameRoot 字符串继续文件操作。
- 游戏自动发现失败使用 M056；管理目录创建失败使用 M057；内容依赖初始化失败使用 M058；保留 M011（未就绪）、M013（目录无效）和 Store 本身错误码。预期无游戏与无效目录可返回不可用能力；非预期错误不得被空 catch 隐藏。
- 托盘保持未接入，不在本轮启用菜单动作。自动识别模式与游戏版本检测继续延期。

### Windows 更新

维护 unavailable/idle/checking/available/downloading/downloaded/installing/failed 状态；通过 `updater:status` 查询。检查、下载、安装分别归类 M027/M028/M029；下载和安装验证前置状态，检查不能与下载或安装并行。

关闭 autoInstallOnAppQuit，避免普通退出隐式安装。明确安装请求先完成模块清理，再交给 electron-updater quitAndInstall；before-quit 在安装路径不再次 preventDefault，防止异步普通退出与安装重启流程竞争。真实 NSIS 更新仍需已打包应用验收。

### macOS 自更新设计（本轮不实现）

计划使用 electron-updater 的 MacUpdater；需已签名应用、适用的公证与发布流程，发布匹配版本和架构的 ZIP、latest-mac.yml 及安装 DMG。更新入口与状态/错误协议保持一致，但签名、权限、架构、重启流程必须在 macOS 上验收；当前非 Windows 环境明确返回不可用，不声明已支持 macOS 更新。

### 异常回滚与崩溃恢复

现行事务在普通异常或取消时使用磁盘备份回滚。强制结束、进程崩溃或断电无法执行 catch/finally；现有备份目录没有持久化操作清单，不能可靠自动恢复。

后续崩溃恢复需在文件改动前持久化目标、备份、操作阶段和 Store 提交状态，启动时发现未完成事务，经核验恢复或提示用户；失败保留证据，不自动删除。该能力本轮未实现。

### preload 文件职责

- src/index.ts：唯一构建入口，加载 ipc/index.ts，并暴露受控 webUtils。
- src/ipc-common.ts：内部共享的 invoke、invoke、subscribe、subscribeTyped 与 exposeApis；不向页面暴露任意 channel 调用。
- src/ipc/index.ts：集中加载业务桥接，保持原有初始化顺序。
- src/ipc/desktop.ts：组装并暴露 window.scnexus 受控 API；其他 ipc/*.ts 暂保留旧 renderer 兼容桥接。
- safety-index.ts 原先仅导入 index.ts，没有独立安全策略或行为，已移除源码与构建入口。仅产出 dist/index.mjs；不改变 IPC channel、页面方法或取消订阅方式。

验证：pnpm run typecheck:preload、pnpm run build:preload 均通过；模拟执行构建产物检查 59 个暴露入口、游戏初始化 invoke 和旧事件取消订阅通过。构建仍有既有 __dirname 配置警告，本轮不改无关工具链配置。

### 开发窗口加载诊断

pnpm dev 必须等待 preload 首次 writeBundle 后才启动 main watcher，首次 preload 构建不广播 full-reload；后续更新仍刷新页面。主进程重构建先等待旧 Electron 退出再启动新进程，超过 10 秒报错，避免新旧实例竞争。

M017 携带目标地址和 Electron 原始加载失败原因，保留 cause；不将所有加载失败归为构建竞态，也不通过无条件重试隐藏错误。窗口加载失败的原因输出与后续重建已有单元测试（2 项通过）。实际用户开发会话中的偶发失败仍需用增强日志确认。

2026-10-08 IPC 返回契约统一：main 的 ipcHandle/ipcHandleRegister 均返回 IpcResult，删除 ipcHandleTyped 和内部旧格式分支；preload 的 invoke 统一执行返回校验及 P001/R001 转换；renderer-v2 删除 legacyRequest 与 legacy.ts，bridge.ts 仅负责尚处于顶层桥接的白名单访问，不转换旧返回格式。旧 renderer v1 不再兼容。工坊上传失败抛出规范错误，不作为成功 data 返回 Error；工坊其他业务重构仍延期。事件和单向日志发送不适用请求结果信封。

窗口就绪由 renderer-v2 主动握手，不再由 preload 的旧 renderer 兼容逻辑自动通知。握手早于主页面加载完成时，main 暂存请求，did-finish-load 后才投递队列和通知监听者；导航、关闭和 renderer 崩溃清除待完成握手，避免把新页面误标为已就绪。没有窗口仍返回 M018。加载期握手与跨导航清理测试通过。

## macOS 第一阶段适配（2026-10-24）

- Windows 的注册表、exe、原启动参数保持原行为；darwin 使用独立 mac-game 模块。手动选择安装根或 `.app` 都归一到安装根，`.app` 必须是目录。Versions/Base 数字 build 从大到小寻找具有执行权限的 `SC2.app/Contents/MacOS/SC2`，缺少可执行文件的更高 build 不抢占有效旧 build；根 SC2.app 仅作后备入口。
- 自动发现依次读取 `~/Library/Application Support/Blizzard/StarCraft II/ExecuteInfo.txt`、兼容 Documents 下同名记录，截断 `/Versions/` 得到根；随后只读 Battle.net.config 的 `Client.Install.Default.s2.InstallPath`，最后检查 `/Applications/StarCraft II` 和 `~/Applications/StarCraft II`。候选均须重新验证。ExecuteInfo 不决定最终 build。配置大小有限制，坏 JSON 不当作安装位置。不运行 Spotlight、全盘扫描或猜测其他战网配置键；未匹配的机器使用手动选择。
- 游戏用户目录使用 `~/Library/Application Support/Blizzard/StarCraft II`，应用自有数据仍是 `~/.scnexus`，不修改 Electron userData。Banks 属于 Accounts 下各账户，当前功能尚不管理账户 Banks；mac 的 banksRoot/arcadeBanksRoot 返回空字符串表示未提供，绝不自动创建游戏根 Banks 或擅自选一个账户。
- 仅检测实际存在且有执行权限的 Switcher/编辑器候选；不存在时对应 capability=false，不把 `.app` 目录当可执行文件。已识别 bundle 通过 `/usr/bin/open -n -a <bundle> --args ...` 启动，参数逐项传递，不使用 shell；等待 open 的退出状态，不把 spawn 成功当作 LaunchServices 成功，也不把 open 的退出码当作游戏退出码。普通 mac 游戏启动不附 Windows 战网参数。没有可用 Switcher 时不猜测其他程序支持地图测试。
- Mac 原生应用/编辑/视图/窗口菜单保留 Cmd+Q/C/V/A 等系统行为。关闭最后窗口不退出及 Dock activate 恢复窗口沿用已有逻辑。菜单栏图标缩至18px，不额外占用文字标题；托盘 SCNexus 项可恢复窗口。暂不新增无来源的单色模板图标。
- 内容记录当前仍以 Maps/Mods 为规范逻辑路径。mac 配置提交前用可清理的临时目录检查游戏卷大小写行为，拒绝大小写敏感卷（含外置卷），避免与 lowercase maps/mods 形成两个物理目录；不声称已适配此类卷。既有权限/边界/事务回滚保护不放宽。普通大小写不敏感 APFS 下的真实 SC2 内容读写仍需 Mac 真机验收。
- 自动更新保持 mac 不可用，使用手动下载安装。签名、公证、Rosetta、安装或更新真实游戏都不由应用静默执行。打包配置与命令见 [building.md](./building.md)。

本轮 Windows 验证：主进程43文件390项通过、main类型检查及构建通过；改动文件ESLint与main Oxlint通过。测试使用真实临时文件夹验证最高build/入口选择、ExecuteInfo和配置读取，LaunchServices只验证命令构造，没有在Windows执行mac程序。尚未验收真实Mac窗口、Keychain、SC2/编辑器参数、战役安装激活恢复卸载闭环、用户账户Banks、TCC权限和DMG首次运行；这些是正式宣布支持前的真机验收项。
