# Replay Architecture

## 1. 目标与边界

SCNexus 的录像能力应当分层落地：

- 文件管理：发现、扫描、导入、删除、打包、索引
- 解析：读取 MPQ 内部成员，抽取基本信息与事件结构
- 分析：构建时间线、经济信息、单位损失等统计
- 展示：列表、筛选、聚合、复盘界面

优先实现本地可靠性，不做云端上传/社区对比。

## 2. 分层设计

```text
app-renderer-v2
  └─ 播放器、库列表、筛选、复盘摘要、统计面板

app-main
  ├─ replay-library 模块：目录扫描、导入/导出、索引更新
  ├─ replay-parser 调度：解析任务和回调
  └─ replay-db：本地 SQLite、缓存与索引

@scnexus/replay-parser
  ├─ file detector
  ├─ component byte contracts (MPQ I/O in app-main)
  ├─ metadata parser
  ├─ event stream parser
  └─ aggregate calculator
```

## 3. 解析器包职责

`@scnexus/replay-parser` 负责提供可重用的协议和文件分析能力，重点包括：

- `.SC2Replay` 文件识别
- 主进程提供的 MPQ 组件字节与组件清单的语义处理（不自行打开 MPQ）
- 基础 metadata 抽取
- 事件流、tracker、game/message 的结构化入口
- 统一的 `ReplayFileStatus` / `ReplaySummary`

该包不强行承诺“万能兼容所有 build”；它负责正确区分：

- `supported`
- `partial`
- `unsupported`
- `corrupt`

## 4. 录像管理模块职责

录像管理模块应位于 app-main，职责包括：

- 指定录像目录
- 递归扫描目录下的 `.SC2Replay`
- 识别打包文件（如 `.zip` / `.7z`）并将其中的录像自动解压到目标目录
- 生成文件索引、大小、修改时间与 hash
- 删除、打包、清理和导入操作
- 与 replay-parser 协调生成分析任务

## 5. 解析流程

```text
录像文件
  ↓
扩展名与文件头检测
  ↓
MPQ / archive component inventory
  ↓
基础 metadata 抽取
  ↓
events / tracker / message 入口识别
  ↓
summary + analysis task
```

## 6. 数据模型

### 6.1 replay file

```ts
export type ReplayFileStatus = 'supported' | 'partial' | 'unsupported' | 'corrupt'

export type ReplayFileRecord = {
  id: string
  path: string
  fileName: string
  sizeBytes: number
  modifiedAt: number
  hash: string
  status: ReplayFileStatus
  baseBuild: number | null
  mapName: string | null
  gameVersion: string | null
  durationSeconds: number | null
  players: ReplayPlayerSummary[]
}
```

### 6.2 parser result

```ts
export type ReplayAnalysis = {
  filePath: string
  status: ReplayFileStatus
  detected: boolean
  hasMpqHeader: boolean
  supportLevel: 'full' | 'metadata-only' | 'unsupported'
  components: ReplayComponent[]
  summary: ReplaySummary
  warnings: string[]
}
```

## 7. 关键原则

- 让解析器首先输出“可信的基础信息”，再做高层分析。
- 对缺失字段和未知 build 的处理必须清晰，不做静默回退。
- 本地数据库保存的是解析结果和聚合统计，上传只作为后续选项。
- 分析器必须保留 `algorithmVersion` 和 `protocolVersion`，便于后续校准。

## 8. 初始执行顺序（前三项已落地，后续进度见第 10 节）

1. 先完成 `@scnexus/replay-parser` 的基础识别与 metadata 结构
2. 完成 app-main 的 replay library 目录扫描/导入/删除能力
3. 将解析任务接到主进程、本地索引和 SQLite 结构中
4. 才继续实现经济/军队/APM 曲线等高层分析

## 9. 当前已落地与使用方式

- renderer-v2 侧栏提供「录像」页面：启动时仅加载数据库中已有索引，不扫描玩家文件夹。
- 「扫描目录」通过原生目录选择器手动递归索引；「添加录像」索引一个现有文件，不复制到应用目录。现阶段不自动发现账户录像目录、不启动 watcher。
- 「导入录像包」选择 zip/7z/rar 与目标文件夹，只读取其中 `.SC2Replay` 普通文件，放入目标下独立的新子目录，避免覆盖旧文件；其他附件不落盘。不自动定位 Battle.net 账户目录，目标由用户明确选择。
- 导入拒绝不安全路径、链接、重复/大小写冲突路径，最多 2000 个录像、单个 128 MiB、总计 1 GiB；复制阶段失败清理新目录。复制成功后若索引遇到 I/O 错误，已复制录像保留以便手动重扫，不声称跨文件系统与 SQLite 的全局事务。
- 列表可按文件名、路径、地图、玩家搜索。每个录像严格两行：地图与真实对局时间；玩家名、种族与各玩家胜负。长内容省略并提供完整文本提示，完整 metadata、路径、状态、warnings 及删除/解析操作移至详情弹窗。没有“我的账号”绑定时不推断单一视角胜败。
- 对局时间读取 details.m_timeUTC（Windows FILETIME）并转换为 UTC ISO 字符串持久化，UI 按本地时间显示；不叠加 m_timeLocalOffset，不以文件修改时间代替。旧记录显示未知，手动重新索引后补齐。
- 删除必须确认，明确删除本地文件而非只移除列表。
- 使用 shared ReplayApi → preload 明确方法 → renderer `ipcs/replay` 封装。主进程验证调用来源及参数；录像模块不依赖游戏安装配置而注册。
- 主进程只读 MPQ，parser 解码 header/details，结果写入 `node:sqlite`；不会执行 Python、上传录像或计算伪造分析指标。
- 目录候选识别读取系统 Documents 下 `StarCraft II/Accounts/<account>/<region>-S2-<realm>-<id>/Replays` 的目录结构，返回现存普通目录；不进入录像文件、不自动索引，也不启动 watcher。任意其他自定义目录仍可通过手动扫描指定。
- 索引流式计算 SHA-256 并检查读取前后大小/mtime/ctime；相同内容不同位置分别保留，可查询重复组，绝不自动去重删除。
- 导出根据已索引 UUID 选择 1–2000 个录像，最多 1 GiB；复制到暂存目录并验证 hash 后生成 ZIP，相同文件名加序号避免冲突。源文件缺失/变化或旧记录无 hash 时拒绝导出并提示重新索引。完整 ZIP 通过同卷硬链接发布，目标已存在时拒绝覆盖，文件系统不支持硬链接时明确失败；暂存目录清理。不复制应用数据库、分析缓存或其他私人文件。
- 新底层能力通过明确的 ReplayApi（discoverDirectories/listDuplicates/exportArchive/analyze/getAnalysis）及 renderer IPC 封装提供。

### renderer 管理与解析入口

- 「识别录像目录」仅列出候选目录，用户点击「扫描此目录」才建立索引；不在页面加载时探测或扫描。
- 「只看重复录像」按已索引 hash 查询重复组并标记各文件，不合并、不自动删除。提示用户：变更文件需重新索引后更新分组。
- 每个录像可勾选，选择跨搜索和重复筛选保留；工具栏显示总选择数，可清空。删除或刷新后移除已不存在的 UUID。
- 「导出 ZIP」使用受控的原生保存对话框（固定 ZIP 过滤器），取消不导出；仅向导出服务传入已选 UUID 和目标路径。界面明确说明 2000 个 / 1 GiB、旧记录须重新索引、不覆盖已有文件；保存对话框选择已有路径不意味着服务允许覆盖。
- 「解析组件」显式启动 worker，完成后展示持久化结果；「解析详情」只调用 getAnalysis，不隐式启动分析。空结果提示尚未解析或 hash/算法版本失效，读取失败单独显示错误，不当作空结果。
- 详情展示源文件 hash、parserVersion、baseBuild、解析时间、协议/算法版本、状态及 warnings。`completed` 表述为组件解码完成，不等同于完整对局分析；原始 initData 预览以及属性/tracker 分页保留协议字段名。
- 属性及 tracker 每页最多 20 项，展开查看原始记录；单个预览最多 12,000 字符，截断显式标记，不把整个 tracker 数组一次渲染进 DOM。协议数据始终以转义文本展示，不执行录像中的标记。
- 新 UI 使用 Nuxt UI 与 zh/en/zh-Hant 文本，在 1000×700 基准检查长路径、候选目录及详情弹窗。自动扫描、自动分析和高层统计图表均未启用。

- `analyze(id)` 显式触发 initData / attributes / tracker 原始结构解析，在 worker 中读取和解码；`completed` 仅代表三个组件均已解码，不代表完整录像分析。未知 baseBuild 仍可解析无版本依赖的 attributes，其他组件以 warnings 标记不支持。`getAnalysis(id)` 同时检查算法版本及实际文件 hash；内容变化须先重新索引。源文件访问失败向上传递，不吞为成功。
- 主进程 MPQ 读取支持原始、ZLIB 和 BZIP2 单一压缩；BZIP2 使用纯 JS `seek-bzip` 并限制输出大小，未支持的压缩组合明确报错。
- 本文前面的统计 schema、任务队列、播放/复盘是目标能力，尚未全部实现。当前字段以 shared `replay.type` 和实际 SQLite 表为准。

真实样本与协议边界见 [解析包文档](./replay-parser-package.md)，持久化方案见 [数据库文档](./replay-database.md)。

## 10. 设计对照与剩余计划（2026-10-31）

### 已完成的基础，不等同于全部产品目标

- 本地库：标准账户目录候选识别、手动扫描/添加、SHA-256、重复组、导入/导出 ZIP、确认删除与 SQLite 索引。
- metadata：地图、版本/baseBuild、游戏时长、真实 UTC 对局时间、玩家/种族/队伍/胜负；旧索引须手动重扫补齐新字段。
- 协议基础：header/details、attributes、自描述 Versioned 与 bit-packed 解码器；精确注册 70154/98310 的 initData 和十类 tracker 事件。
- 运行与界面：有界 worker、结果版本戳/hash 失效、原始组件持久化、候选目录/重复筛选/导出/显式解析、两行列表及详情弹窗。

### 仍需实现，按依赖顺序推进

| 优先级 | 目标 | 当前缺口 / 验收条件 |
|---|---|---|
| P1 | 协议与样本覆盖 | 98310 只有合成测试；补真实对拍与更多实际 baseBuild，确认多队伍、观察者、断线/无结果、历史录像。未知版本继续显式不支持，不按相邻表猜测。 |
| P1 | 玩家身份与统计口径 | 建立用户选择的本地玩家/账户映射，区分参与者/观察者/队伍；选定 game loop、实际时间、胜败/未知和模式口径，才能给出“我的胜率”。 |
| P1 | tracker 业务投影 | 原始 PlayerStats/单位事件转为经济与军队采样、单位生命周期/归属变化/损失记录、升级及生产完成时间线；单位 tag 回收、变形、幻象与无成本对象不能直接算成损失。 |
| P1 | 分析存储与版本化 | 当前仅保存最近一次原始 JSON；增加按内容身份关联的业务结果、算法迁移/重算、统计查询索引，避免重复文件重复计入同一对局；需要真实数据对拍。 |
| P2 | game/message 事件与 APM | 尚未解码 game/message，不能从 tracker 推算 APM；补动作分类、速度换算、聊天/离开等事件，明确原始/有效 APM 定义。 |
| P2 | 建造顺序与统计界面 | tracker 可提供完成/出生时间，不一定是下令时间；结合 game 事件与版本化数据定义建造顺序。增加经济/军队/APM 曲线及单位损失等业务界面。 |
| P2 | 聚合与筛选 | 对局矩阵、地图/种族战绩、时间范围/模式/对手等维度聚合；现有搜索与重复过滤不等于这些功能。 |
| P2 | 库管理补齐 | 文档中的重命名、移动/归档、失效索引清理尚未提供专用流程；手动重扫有入口但不等于完整变更同步。导入仍是用户选择目标目录，未做按账户选择的安装流程或文件拖入导入。 |
| P2 | 任务体验与大库 | 当前有两个 worker 并发、超时和按 UUID 合并，不是持久任务队列；后续补批量解析、进度/主动取消、错误重试、分页/虚拟列表、数据库查询分页与更大样本的性能验证。 |
| P3 | 启动游戏观看录像 | 尚无录像专用游戏启动/观看流程；先验证本机游戏版本匹配与失败提示，不将原始协议详情称作录像播放。 |

### 明确延期，不在当前轮次偷偷启用

- 文件夹监听、自动扫描、自动分析：保留现有显式入口，待用户确认后实施。
- 全量上传、社区种族/地图胜率与跨玩家比较：保留产品计划，尚无服务端、授权隐私流程、去重/反作弊或上传实现。

建议下一轮优先完成 P1 的 tracker 业务投影与统计口径，再做曲线；不先用原始事件计数拼出 APM 或胜率。
