# 全局错误码与日志设计

## 1. 状态与目标

main 与 preload 的错误注册表、结构化 IPC、日志归集和受控遥测基础能力已实现；renderer-v2 尚未接入，页面端异常捕获、设置 UI 和完整生产遥测验证仍待完成。三个应用包共用错误契约；main 使用 electron-log，renderer-v2 后续通过 preload 受控桥接归集到 main。

用户已确认：**共用一个持久化等级，同时控制控制台与文件输出，默认 error；preload 也遵循同一等级。** 开发模式不自动放宽为 debug。

模块与存储见 [app-main 设计](./app-main-design.md)，总体依赖方向见 [架构文档](./architecture.md)。

## 2. 全局错误码表

本节是当前唯一的错误码设计清单，实施后在 app-shared 的 errors 公开入口提供对应注册表和类型；修改代码注册表时同步本表，增加唯一性和完整性测试。表中代码尚未全部实现，不要求现在为每个条目创建空处理器。

错误定义与每次抛出的信息分离：

- **code**：责任进程前缀加三位编号，例如 M002。M 表示 main，P 表示 preload，R 表示 renderer-v2；各前缀从 001 独立编号，不使用 000。
- **name**：稳定的全大写连字符名称，例如 APP-INITIALIZATION-FAILED；用于识别错误语义，不是每次动态生成的说明。
- **description**：可选的静态错误描述，解释此类错误，不包含具体抛出上下文。
- **errorId**：每次新故障生成的唯一标识，必填；不是错误码编号。
- **message**：可选的本次抛出说明，例如哪个启动步骤失败；不能用于识别错误类型。
- **taskId**：可选的抛出时业务 ID，可关联任务、操作或其他业务实例，不限于异步长任务。

前缀表示错误定义的责任进程，不表示当前接收方。main 错误传到 renderer 仍保持 M 编号；preload 的桥接传输故障使用 P 编号；renderer 自己的结果校验和 HTTP 请求故障使用 R 编号。日志中的 process 另行标识实际记录来源。

同类故障若确实在多个进程独立产生，分别登记对应前缀的定义，name 增加责任限定以保持全局唯一；不能仅因转发或展示就重新编号。共享工具的原始异常在调用者责任边界分类，已有 AppError 则保留其定义。

| code | name                            | description（可选）            | 使用边界 / 处理方向                      |
| ---- | ------------------------------- | ------------------------------ | ---------------------------------------- |
| M002 | APP-INITIALIZATION-FAILED       | 必需启动环节失败               | 启动协调提供诊断或恢复入口               |
| M001 | APP-UNEXPECTED-ERROR            | 无法分类的内部异常             | 最终兜底，保留内部 cause，不替代已知错误 |
| M003 | IPC-INVALID-ARGUMENT            | IPC 参数不符合契约             | 参数校验，拒绝执行                       |
| M004 | IPC-SOURCE-REJECTED             | 调用来源不被允许               | main 来源检查                            |
| P001 | IPC-TRANSPORT-FAILED            | 桥接调用无法完成               | channel 缺失、窗口销毁等传输异常         |
| R001 | IPC-RESULT-INVALID              | 返回 DTO 不符合契约            | 边界检查，不将无效结果视为成功           |
| M005 | STORE-READ-FAILED               | 配置读取失败                   | 权限、I/O 等错误                         |
| M006 | STORE-WRITE-FAILED              | 配置提交失败                   | 保留旧有效快照，不发送成功事件           |
| M007 | STORE-DATA-INVALID              | 已存数据损坏或违反 schema      | 保留原文件并提供恢复                     |
| M008 | STORE-MIGRATION-FAILED          | 数据迁移失败                   | 保留备份，不继续覆写                     |
| M009 | STORE-VERSION-UNSUPPORTED       | 数据版本高于程序支持           | 不降级覆写                               |
| M010 | SETTING-INVALID-VALUE           | 用户偏好值无效                 | setting 服务业务校验                     |
| M011 | PROFILE-NOT-READY               | 没有可用游戏环境               | 引导配置，不使 IPC 消失                  |
| M012 | PROFILE-GAME-NOT-FOUND          | 未发现游戏安装                 | 自动检测失败                             |
| M013 | PROFILE-GAME-ROOT-INVALID       | 候选目录不是有效游戏环境       | 不覆盖已有有效配置                       |
| M014 | PROFILE-CAPABILITY-UNAVAILABLE  | 当前游戏环境缺少所需执行能力   | 编辑器/启动器等能力不可用                |
| M015 | PROFILE-CHANGE-BLOCKED          | 本地任务期间禁止切换游戏环境   | 完成或取消任务后再修改                   |
| M016 | WINDOW-CREATE-FAILED            | 主窗口创建失败                 | 清理部分资源，可重试                     |
| M017 | WINDOW-LOAD-FAILED              | 界面加载失败                   | 提供加载诊断与重试                       |
| M018 | WINDOW-NOT-READY                | 当前没有可投递的就绪界面       | 可恢复事件排队或重新查询状态             |
| M019 | WINDOW-RENDERER-FAILED          | 页面进程崩溃或异常退出         | 恢复窗口并重新握手                       |
| M020 | DEEP-LINK-INVALID               | 协议链接结构或参数无效         | 不投递，不记录令牌                       |
| M021 | DEEP-LINK-QUEUE-FULL            | 待投递链接达到上限             | 明确报告，不无限保存                     |
| M022 | DIALOG-FAILED                   | 系统对话框失败                 | 用户取消不是此错误                       |
| M023 | SHELL-TARGET-INVALID            | URL/路径不符合打开约束         | 拒绝操作                                 |
| M024 | SHELL-OPEN-FAILED               | 系统打开目标失败               | 报告系统失败                             |
| M025 | TRAY-INITIALIZATION-FAILED      | 托盘初始化失败                 | 可选能力降级，不阻止窗口                 |
| M026 | UPDATER-UNAVAILABLE             | 当前运行环境不支持更新         | 开发模式/不支持的平台等                  |
| M027 | UPDATER-CHECK-FAILED            | 更新检查失败                   | 保留当前版本                             |
| M028 | UPDATER-DOWNLOAD-FAILED         | 更新下载失败                   | 允许重试                                 |
| M029 | UPDATER-INSTALL-FAILED          | 更新安装启动失败               | 保留诊断                                 |
| M030 | FILESYSTEM-OPERATION-FAILED     | 未被业务错误分类的文件操作失败 | 保留内部操作及底层错误代码               |
| M031 | FILESYSTEM-PATH-REJECTED        | 目标不在允许目录内             | 拒绝读写                                 |
| M032 | ARCHIVE-INVALID                 | 压缩包无效                     | 不进入安装阶段                           |
| M033 | ARCHIVE-METADATA-MISSING        | 包缺少元数据                   | 引导修复内容包                           |
| M034 | ARCHIVE-METADATA-INVALID        | 元数据字段或格式无效           | 返回可展示的校验信息                     |
| M035 | ARCHIVE-FORMAT-UNSUPPORTED      | 不支持的归档或压缩能力         | 不伪装为包损坏                           |
| M036 | ARCHIVE-EXTRACT-FAILED          | 解压失败                       | 清理暂存目录，保留原目标                 |
| M037 | CONTENT-TYPE-UNSUPPORTED        | 操作不支持该内容类型/管理格式  | 不静默返回成功                           |
| M038 | CONTENT-SCAN-FAILED             | 内容库扫描失败                 | 单包坏数据应隔离为 warning               |
| M039 | CONTENT-INSTALL-FAILED          | 内容安装失败                   | 关联任务恢复或回滚                       |
| M040 | CONTENT-UNINSTALL-FAILED        | 内容卸载失败                   | 刷新并报告实际状态                       |
| M041 | CAMPAIGN-ACTIVATION-FAILED      | 战役激活失败                   | 恢复原内容，或明确需人工恢复             |
| M042 | CAMPAIGN-DEACTIVATION-FAILED    | 取消激活失败                   | 不更新为已取消状态                       |
| M043 | CAMPAIGN-RECOVERY-FAILED        | 战役恢复失败                   | 不声称恢复成功                           |
| M044 | GAME-LAUNCH-FAILED              | 游戏或编辑器启动失败           | 捕获进程错误并反馈                       |
| M045 | WORKSHOP-METADATA-WRITE-FAILED  | 内容包元数据写入失败           | 不继续上传错误产物                       |
| M046 | WORKSHOP-HASH-FAILED            | 文件摘要计算失败               | 不继续上传                               |
| M047 | WORKSHOP-UPLOAD-FAILED          | 工坊上传失败                   | 不将 Error 当成功 data                   |
| M048 | WORKSHOP-DOWNLOAD-FAILED        | 工坊下载失败                   | 清理或保留可恢复的 part 文件             |
| R002 | NETWORK-REQUEST-FAILED          | 未被领域分类的 HTTP/网络错误   | 不直接采用第三方错误码                   |
| R003 | NETWORK-TIMEOUT                 | 网络请求超时                   | 允许按业务条件重试                       |
| M049 | TASK-CANCELLED                  | 用户取消长任务                 | 终止结果，不默认输出 error               |
| M050 | TASK-TIMEOUT                    | 操作超时                       | 清理资源并报告状态                       |
| M051 | TASK-CONFLICT                   | 同一资源已有互斥任务           | 用户稍后重试                             |
| M052 | LOGGING-CONFIGURATION-FAILED    | 日志等级应用失败               | 偏好更新整体失败并恢复旧值               |
| M053 | LOGGING-TRANSPORT-FAILED        | 日志输出目标失败               | 有界非递归降级，不调用同一故障 transport |
| M054 | TELEMETRY-INITIALIZATION-FAILED | Sentry 初始化或身份绑定失败    | 保留授权选择，报告未生效                 |
| M055 | TELEMETRY-DISABLE-FAILED        | 遥测 SDK 清理或关闭失败        | 维持发送门控关闭，报告诊断               |

规则：

- 新增错误先登记，code 和 name 均全局唯一、不改义、不重新分配；在所属前缀下追加编号，禁止依表格顺序自动重编号。废弃条目注明替代，不复用。
- code 格式为 `^[MPR][0-9]{3}$`，name 使用全大写单词和连字符；编号容量不足时另行修订规范，不能静默改变格式。
- description 可以省略；静态 description 与本次 message 不互相覆盖，也不自动拼成一个字段。
- code/name/description 由注册表确定，抛出者只能选择定义并传入本次上下文，不能动态伪造定义。
- 第三方异常的 code（如 ENOENT、Axios code）只作为底层诊断，不自动成为全局码。
- 未知异常在最近的责任边界转换为合适的领域错误，最终才使用 M001（APP-UNEXPECTED-ERROR）。
- 普通取消、无更新、空内容列表等不是意外故障；可以作为状态返回，不为控制流程抛异常。
- 错误码、日志级别、UI 提示是三个维度。M011（PROFILE-NOT-READY） 这类预期拒绝不必每次输出 error。

## 3. 错误对象与跨进程契约

共享契约目标：

```ts
type ErrorDefinition = {
  readonly code: ErrorCode
  readonly name: ErrorName
  readonly description?: string
}

type ErrorOccurrence = {
  errorId: string
  message?: string
  taskId?: string
}

type AppErrorDto = ErrorDefinition & ErrorOccurrence

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorDto }
```

ErrorCode 和 ErrorName 来源于共享注册表；上面的结构是字段说明，实际类型与运行时校验必须保证 code/name/description 属于同一登记定义，不能任意组合。

实现期提供 AppError（继承 Error）及 normalizeError。AppError 的 name 使用登记名称，保留 code、description、errorId、taskId 与内部 cause。Error 基类的 message 始终是字符串：调用者未提供说明时使用空字符串，序列化 DTO 时省略 message；不将静态 description 自动写入 message。

抛出示例（目标 API，尚未实现）：

```ts
const definition = {
  code: 'M002',
  name: 'APP-INITIALIZATION-FAILED',
  description: '必需启动环节失败',
} as const

throw new AppError(definition, {
  message: '初始化游戏环境失败',
  taskId: 'startup-session-42',
})
```

AppError 在新故障构造时生成 errorId，例如 UUID。对应 IPC DTO：

```json
{
  "code": "M002",
  "name": "APP-INITIALIZATION-FAILED",
  "description": "必需启动环节失败",
  "errorId": "67db917a-147f-4225-87bd-538b53d8ff2a",
  "message": "初始化游戏环境失败",
  "taskId": "startup-session-42"
}
```

示例内联定义仅展示字段；实际调用使用共享注册表中的定义，不在调用点重复登记。message 和 taskId 未提供时从 DTO 省略，description 未登记时也省略。

- 应用自行抛出的异常必须携带登记错误码，不再裸抛字符串或无代码的 Error。
- 接获平台/第三方 throw 或 promise rejection 时，不要求修改第三方代码；在应用边界 normalize 并分配 errorId。
- 同一故障在多层传播时保留 code/name/description/errorId/message/taskId，不反复创建新错误编号；额外诊断上下文写入日志，不覆写原始抛出信息。
- 新的恢复失败可产生新的错误码/errorId，并在内部日志关联原始故障。
- cause、stack、原始 response 和内部路径只进入经过脱敏的诊断日志，不直接通过 IPC 返回。
- renderer 根据 code 选择本地化提示；无对应文案时依次使用安全 message、静态 description、name 作为回退。业务分支只依赖 code，不依赖可变文本。
- UI 可展示 code/name/errorId 方便用户反馈，默认不展示堆栈。
- HTTP 返回错误需转换为本应用契约，不直接信任服务端字符串作为注册表成员。

## 4. 日志门面与归集

### 输出职责

```text
main logger ───────────────────────────> electron-log/main
preload logger → 受控日志桥接 ───────────> main 日志接收器
renderer logger → 受控日志桥接 ──────────> main 日志接收器
                                             │
                                  共用等级 → console + file
```

采用 main 集中 transport 的方案：renderer-v2 的日志最终由 electron-log 输出到 main 控制台和应用日志文件。不再同时复制到 DevTools 控制台，避免同一日志重复。

renderer 不导入 electron-log/main、不直接写日志文件，也不直接访问 ipcRenderer。此方案通过自有受控桥接使用 electron-log，无需启用 electron-log 自带的 renderer/preload 注入通道；实施时不要同时启用自动注入和自有桥接。若未来改为 electron-log/renderer，需整体替换传输方案并验证沙箱与等级过滤，不能并行重复输出。

建议公开门面：logger.error、warn、info、verbose、debug、silly；错误记录提供 reportError，接收 AppError 或待规范化异常。调用处显式使用所属模块 scope，不直接散落 console.log 或依赖原始 electron-log 对象。

preload 只包装桥接诊断，不实现游戏业务；自身异常发生在主世界 API 暴露之前时，通过隔离世界的受控发送函数直接投递，不依赖 renderer 的 window.scnexus。

### 结构化记录

每条记录至少包含 timestamp、level、process、scope 和日志文本。故障记录包含 code、name、errorId，按实际值附加 description、message、taskId。日志文本可使用 name 作为回退，但不能因此补写原本未提供的错误 message。taskId 表示本次业务 ID，普通任务日志也可用它关联操作。必要上下文采用明确字段，不 stringify 任意巨大对象。

```text
[时间] [error] [main] [campaign]
code=M041 name=CAMPAIGN-ACTIVATION-FAILED errorId=... taskId=... message=...
```

- main 接收器校验所属 WebContents/窗口、等级枚举、字段类型、长度及批次大小；process 标记由可信入口补充，不信任 renderer 自报 main。
- renderer 日志采用单向发送，不让每条日志等待一个 invoke；等级修改、查询仍使用请求/响应。
- 即使 renderer 未 ready 也可接收其日志，业务 ready 握手不阻塞诊断。
- renderer/preload 的启动诊断使用有界队列，桥接可用后发送；main 最终过滤等级。队列达到上限时不得无限增长。
- 禁止记录令牌、认证深链接原文、密码、完整授权头和不必要的个人路径；在门面/接收器和写入前统一脱敏。
- 文件路径和轮转由 main 配置，用户只调整等级，不通过普通 IPC 指定任意日志输出文件。
- 日志写入失败不改变原业务操作结果；降级可一次性输出到独立 stderr，避免递归尝试同一 transport。

### 避免重复记录

负责最终处理故障的边界记录一次：main IPC handler、任务执行边界、应用启动边界或 renderer 本地错误边界。

服务可以补充非错误上下文，但不得每层 catch 都记录同一错误。main 已记录并通过 IPC 返回的错误，renderer 负责展示，不再重复 reportError。preload 仅在传输失败时记录自己的错误，不能把正常业务失败再包装成 P001（IPC-TRANSPORT-FAILED）。

## 5. 全局等级与设置流程

支持 electron-log 标准等级：error、warn、info、verbose、debug、silly，默认 error。不在初期增加 off/禁用日志选项。

级别表示阈值：warn 输出 error 和 warn；debug 输出 error、warn、info、verbose、debug。console.level 与 file.level 始终使用同一有效值。

持久化字段为 setting.logLevel。建议 IPC：logging:get-config、logging:set-level；设置 handler 委托 setting 的业务流程，不直接修改 Store。UI 从有效快照读取等级，在提交成功前不声称已生效。

### 启动

1. 创建 logging 时先以 error 初始化两个 transport，不依赖 setting。
2. 打开/迁移 setting，读取并验证保存等级。
3. 装配器将有效等级应用到 logging，然后把配置快照同步给 renderer。
4. 没有配置时使用并保存默认值；存储损坏或不可写时以 error 降级，但明确报告配置未恢复，不能假装保存成功。

### 更新

所有 main 内部或 IPC 发起的日志等级修改都经过同一个协调流程，串行执行：

```text
校验等级 → 保存候选偏好 → 应用两个 transport
→ 更新有效 setting/logging 快照 → 发布变更 → 返回成功
```

保存失败：两个 transport 和公开快照仍用旧值，不发布成功事件。

transport 应用失败：恢复已修改 transport 和旧持久化偏好，返回 M052（LOGGING-CONFIGURATION-FAILED）；若恢复也失败，显式报告实际生效/持久化状态，保留诊断，不给 UI 虚假的一致结果。跨存储与 transport 没有底层事务，这一补偿路径需要单独测试。

renderer/preload 不维护另一个独立等级设置，main 接收器是最终过滤点。前端可显示当前等级，但不能仅在 Pinia 中修改而不调用 main。

## 6. 异常入口

- main：启动协调、IPC handler、任务执行器、进程错误；未捕获异常用于最后诊断并进入安全退出/恢复流程，不默认继续执行文件修改。
- preload：桥接初始化、invoke 传输失败、订阅包装失败；不吞掉原调用失败。
- renderer-v2：Vue errorHandler、window error、unhandledrejection、Axios 与 desktop API 的本地边界。返回的业务错误不重复当未处理异常抛出。
- 对同一异常的 Vue/window/unhandledrejection 重叠捕获去重，避免同一 errorId 连续写入。
- 用户取消作为普通终止状态或 M049（TASK-CANCELLED），默认 error 下不输出取消记录。

## 7. 验证与迁移

至少验证：

- 注册表 code/name 分别唯一、格式正确，二者映射不可任意组合；所有应用主动 throw 路径使用登记定义，未知第三方异常被规范化。
- 新故障生成唯一 errorId；message/taskId/description 缺省时 DTO 可合法省略，且 description 不冒充 message。
- 错误跨三进程保留定义与本次抛出信息，责任前缀不因转发变化；cause/stack/敏感数据不出现在 IPC DTO。
- 默认 error；切换 warn/debug 等阈值后 main、preload、renderer 的 console/file 输出一致。
- 重启保留等级；非法等级、保存失败和应用失败不显示成功。
- renderer reload 后日志桥接可用；启动日志不会依赖页面业务 ready。
- 主进程业务失败只记录一次，桥接断开/未知 channel 作为独立传输失败。
- file transport 故障不形成递归日志，队列/输入长度限制生效。

迁移时先建立表和门面，再逐模块替换旧 throw 与 console 调用。旧错误字符串通过集中兼容映射保留，未完成迁移前不直接破坏旧 renderer；所有映射和新 UI 契约需有测试。

## 8. 用户授权的遥测与 Sentry

### 边界与默认行为

遥测由独立 telemetry 模块负责，同样包含 index.ts、telemetry.ipc.ts、telemetry.ts。setting 保存 telemetryEnabled，默认 false；模块按明确授权初始化，不在应用 import 或启动入口无条件初始化 Sentry。

- false 或设置无法可靠读取时，不初始化 Sentry、不绑定用户、不发送事件。
- true 时为用户启用 Sentry：main 负责 SDK 生命周期，通过受控初始化将 renderer-v2 错误能力接入；preload 只提供桥接诊断，不运行第三份独立上报器。
- 使用已保存 clientId 作为匿名安装身份（如 Sentry user.id），不是登录账户身份，不默认附带姓名、邮箱或访问令牌。匿名安装标识仍属于可关联数据，需要向用户说明用途。
- DSN 缺失或 SDK 初始化失败时，不声称遥测已启用；通过有效状态反馈给 UI。开发/测试不应实际发送事件，使用模拟 transport 验证。
- 本地 electron-log 与遥测独立：errorId/code/name 保持一致，本地日志等级不决定是否授权，也不自动把 debug 日志上传为 breadcrumb。
- 默认只上报诊断所需错误，不自动启用性能追踪、会话回放、文件附件或个人信息收集。
- Sentry 事件用 code/name/errorId 关联故障，业务 taskId 仅在脱敏且适合上传时附加；异常 stack、URL、路径及上下文统一脱敏，不上传认证深链接原文。

### 开关生命周期

telemetry 提供 getStatus，区分 savedEnabled 与实际运行状态（disabled、starting、enabled、failed）。telemetry:set-enabled 委托 setting 协调流程；通用偏好 patch 不可绕过该流程。其他 main 模块只捕获并报告错误，不能替用户开启遥测。

开启：校验明确授权 → 保存 true → 初始化受控 SDK 并绑定 clientId → 同步有效状态。保存失败不初始化；初始化失败保留用户已保存的授权选择，但报告 failed 和登记错误，用户可重试或关闭，不能返回“已生效”。再次启动只有已保存 true 才重试初始化。不回传开启之前收集的错误或日志。

关闭：先撤销 main/renderer 上报入口及统一发送门控 → 清理身份和未发送队列 → 关闭/释放 SDK → 保存 false → 同步有效状态。不能使用会主动 flush 待发事件的默认关闭方式替代撤销；实现时针对选定 Sentry 版本验证关闭与队列行为。已发出的在途请求不能承诺撤回。

关闭后的门控必须阻止继续发送，包括仍在处理中的异常及自动集成。若 SDK 清理失败，仍保持发送关闭并报告诊断；若保存 false 失败，当前会话保持关闭、UI 明确显示未持久化，不能声称重启后一定关闭。此时用户需要重试保存，不能自动恢复本会话上报。

renderer 初始化前、关闭后或重新加载时读取有效授权状态，不根据本地 Pinia/旧 localStorage 自行初始化 SDK。renderer/main 同一故障按 errorId 去重，避免同一 IPC 失败同时由两个 SDK 重复上报。

### 错误定义与验证

在全局表追加 M054 / TELEMETRY-INITIALIZATION-FAILED、M055 / TELEMETRY-DISABLE-FAILED；配置持久化失败保留 STORE-WRITE-FAILED 的定义，不覆盖为遥测错误。

验证默认无请求、开启后绑定身份、关闭后门控与队列清理、SDK 失败不显示已生效、关闭保存失败保持本会话关闭、重启与 reload 尊重保存选择、敏感上下文过滤及重复事件去重。不得用真实用户数据或真实网络上报作为普通单元测试。

## 9. 依据

- [electron-log 初始化文档](https://github.com/megahertz/electron-log/blob/master/docs/initialize.md)：v5 的 renderer 日志归集到 main，以及自动注入、手动 preload、直接 IPC 等不同方式。本文选择自有受控桥接，不依赖其内部 channel 名称作为应用契约。
- electron-log 具体版本在实施期按 Electron 44 的兼容性选择并锁定；本文不同时要求升级未指定的主版本。

新增主进程初始化错误码：

| code | name                              | description                  |
| ---- | --------------------------------- | ---------------------------- |
| M056 | GAME-DISCOVERY-FAILED             | 游戏目录自动发现失败         |
| M057 | GAME-DIRECTORY-PREPARATION-FAILED | 游戏管理目录创建失败         |
| M058 | GAME-MODULE-INITIALIZATION-FAILED | 游戏或内容依赖模块初始化失败 |

更新阶段沿用 M027/M028/M029（检查/下载/安装），不将所有错误都归为下载失败。
