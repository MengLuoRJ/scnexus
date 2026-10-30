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

## 8. 下一步执行顺序

1. 先完成 `@scnexus/replay-parser` 的基础识别与 metadata 结构
2. 完成 app-main 的 replay library 目录扫描/导入/删除能力
3. 将解析任务接到主进程、本地索引和 SQLite 结构中
4. 才继续实现经济/军队/APM 曲线等高层分析

## 9. 当前已落地与使用方式

- renderer-v2 侧栏提供「录像」页面：启动时仅加载数据库中已有索引，不扫描玩家文件夹。
- 「扫描目录」通过原生目录选择器手动递归索引；「添加录像」索引一个现有文件，不复制到应用目录。现阶段不自动发现账户录像目录、不启动 watcher。
- 「导入录像包」选择 zip/7z/rar 与目标文件夹，只读取其中 `.SC2Replay` 普通文件，放入目标下独立的新子目录，避免覆盖旧文件；其他附件不落盘。不自动定位 Battle.net 账户目录，目标由用户明确选择。
- 导入拒绝不安全路径、链接、重复/大小写冲突路径，最多 2000 个录像、单个 128 MiB、总计 1 GiB；复制阶段失败清理新目录。复制成功后若索引遇到 I/O 错误，已复制录像保留以便手动重扫，不声称跨文件系统与 SQLite 的全局事务。
- 列表可按文件名、路径、地图、玩家搜索，显示真实基础 metadata、支持状态及 warnings；删除必须确认，明确删除本地文件而非只移除列表。
- 使用 shared ReplayApi → preload 明确方法 → renderer `ipcs/replay` 封装。主进程验证调用来源及参数；录像模块不依赖游戏安装配置而注册。
- 主进程只读 MPQ，parser 解码 header/details，结果写入 `node:sqlite`；不会执行 Python、上传录像或计算伪造分析指标。
- 本文前面的 hash、统计 schema、任务队列、导出打包、播放/复盘是目标能力，尚未全部实现。当前字段以 shared `replay.type` 和实际 SQLite 表为准。

真实样本与协议边界见 [解析包文档](./replay-parser-package.md)，持久化方案见 [数据库文档](./replay-database.md)。
