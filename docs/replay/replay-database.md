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
- 通过 `PRAGMA user_version` 标记 schema 版本，目前为 1。兼容版本 0 的既有表，拒绝打开高于当前支持版本的库；未来 schema 变化需增加显式迁移。
- `sql.js` 导出的文件本身是 SQLite 格式，保留原路径与既有表，不重新导入或清空历史记录。切换前应备份已有数据库；旧实现写入的占位 metadata 不会自动变成真实信息，需要重新索引。
- 按 path upsert 保留已有 UUID，并返回数据库中实际保存的记录。查询按修改时间倒序排列。
- 同步 SQL 仅用于当前短小的索引操作；大量事件写入、复杂聚合与长耗时分析后续放入 worker，不在主线程逐事件执行。

本轮不新增统计表或执行分析任务，`replay_runs` 仅为结构预留。

表设计目前包括：

1. `replay_files`
   - `id`：UUID
   - `path`：本地绝对路径
   - `file_name`：文件名
   - `extension`：扩展名
   - `size_bytes`：文件大小
   - `mtime_ms`：修改时间戳
   - `status`：`supported|partial|unsupported|corrupt`
   - `support_level`：`full|metadata-only|unsupported`
   - `map_name` / `game_version` / `base_build` / `duration_seconds`
   - `players_json` / `warnings_json`
   - `created_at` / `updated_at`

2. `replay_runs`
   - 预留给后续 metadata / analysis / aggregation task 的执行记录。
   - `kind` 可扩展为 `inspect`、`metadata`、`analysis` 等。

## 原则

- 当前目录扫描仅由调用方手动触发；自动扫描/监听仍是后续计划，不启动 watcher。
- 删除仅接受已索引的普通 `.SC2Replay` 文件，不递归删除目录；文件已不存在时允许清除失效索引，其他文件错误保留索引并向上传递。
- 数据库只保存结构化、可复用的结果，不保存临时对象。
- 解析器 package 负责判断文件是否属于 replay；数据库负责存储和查询。
- `table` 结构允许后续扩展更复杂的 `tracker` / `timeline` / `aggregate` 数据。
