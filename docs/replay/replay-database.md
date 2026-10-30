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

当前实现采用 SQLite 文件存储，路径位于应用数据目录下的 `SCNexusStorage/replay.db`。这让我们在后续增加分析任务、时间线事件、构建统计时，不需要立即重构数据库结构。

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

- 自动扫描入口保留，但不激活；需要由调用方手动触发。
- 数据库只保存结构化、可复用的结果，不保存临时对象。
- 解析器 package 负责判断文件是否属于 replay；数据库负责存储和查询。
- `table` 结构允许后续扩展更复杂的 `tracker` / `timeline` / `aggregate` 数据。
