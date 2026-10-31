# Replay Database

## 目标

在不做自动扫描的前提下，Replay 模块仍然需要为本地录像建立稳定、可查询、可扩展的持久化层。该层负责保存：

- 录像文件索引
- 基本 metadata 摘要
- 解析状态与 warnings
- 后续分析任务的 run 记录

## 层次

```text
replay-library
  └─ 读目录 / 导入 / 删除 / 索引

replay-parser
  └─ 文件识别 / metadata contract

replay-db
  └─ SQLite 持久化，保存文件与聚合结果
```

## 方案说明

当前实现使用 Electron 主进程运行时内置的 `node:sqlite`（`DatabaseSync`），直接打开应用数据目录下的 `SCNexusStorage/replay.db`。不依赖 `sql.js`、WASM 资源或额外的原生 npm 扩展。开发 Node 和打包 Electron 的内置 Node 需分别验证支持 `node:sqlite`，不能只看开发工具链版本。

### 选型与持久化

- 早期 `sql.js` 实现将数据库载入内存，每次修改后整库导出；这不适合持续增长的录像库，因此改为直接文件读写。
- 使用 WAL、外键约束与 5 秒 busy timeout；单条 upsert 自动提交，删除录像索引及关联 run 在同一事务完成。
- 初始化幂等，同一个实例复用连接；退出应用时关闭连接。数据库初始化失败直接报错，不将损坏文件或权限错误当作空库。
- 通过 `PRAGMA user_version` 标记 schema 版本，目前为 3。版本 0/1/2 在事务内补充可空 `played_at`（真实对局 UTC 时间）；旧版同时补充可空 `content_hash` 与索引，保留旧记录 UUID 与 metadata；旧记录重新索引后补齐 SHA-256。拒绝打开高于当前支持版本的库。
- `sql.js` 导出的文件本身是 SQLite 格式，保留原路径与既有表，不重新导入或清空历史记录。切换前应备份已有数据库；旧实现写入的占位 metadata 不会自动变成真实信息，需要重新索引。
- 按 path upsert 保留已有 UUID，并返回数据库中实际保存的记录。查询按修改时间倒序排列。
- 同步 SQL 用于索引与解析结果提交；MPQ 组件读取、BZIP2 解压和组件解码在独立 worker，最多两个不同录像并行，同一 UUID 合并并发请求。每任务 60 秒超时、worker V8 old-space 上限 256 MiB、序列化结果上限 32 MiB，应用退出时终止任务。initData/attributes 各限 4 MiB、tracker 限 16 MiB/100,000 事件。SQLite 不逐事件写入，当前保存有界 JSON 结果；后续高层时间线/聚合再设计专用表及查询。

`replay_runs` 当前保存显式触发的组件解析结果（`kind = components`）。每个录像仅保留最近一次结果，不逐事件展开成统计表。结果包含源文件 SHA-256、parserVersion、baseBuild、状态、warnings、解析时间与 initData/attributes/tracker 的 JSON-safe 数据。重新索引内容发生变化后，旧 hash 对应结果不再返回；写入时也核对当前索引 hash，防止并发任务覆盖新内容结果。此结果不是 APM/经济曲线等高层统计。

表设计目前包括：

1. `replay_files`
   - `id`：UUID
   - `path`：本地绝对路径
   - `file_name`：文件名
   - `extension`：扩展名
   - `size_bytes`：文件大小
   - `mtime_ms`：文件修改时间戳，不作对局时间使用
   - `played_at`：来自 replay.details.m_timeUTC 的 UTC ISO 时间；缺失、无效或尚未重索引的旧记录为 null。
   - `content_hash`：录像字节 SHA-256，可空；不同路径的相同文件保留独立 UUID，重复查询按 hash 分组，不自动删除或合并文件。
   - `status`：`supported|partial|unsupported|corrupt`
   - `support_level`：`full|metadata-only|unsupported`
   - `map_name` / `game_version` / `base_build` / `duration_seconds`
   - `players_json` / `warnings_json`
   - `created_at` / `updated_at`

2. `replay_runs`
   - 当前组件解析用 `kind = components`，结果存于 `details_json`；重分析事务替换该录像旧组件结果。
   - 删除文件索引时同步删除关联 run；保留扩展其他任务种类的空间。

## 原则

- 当前目录扫描仅由调用方手动触发；自动扫描/监听仍是后续计划，不启动 watcher。
- 删除仅接受已索引的普通 `.SC2Replay` 文件，不递归删除目录；文件已不存在时允许清除失效索引，其他文件错误保留索引并向上传递。
- 数据库只保存结构化、可复用的结果，不保存临时对象。
- 解析器 package 负责判断文件是否属于 replay；数据库负责存储和查询。
- `table` 结构允许后续扩展更复杂的 `tracker` / `timeline` / `aggregate` 数据。
