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
- 通过 `PRAGMA user_version` 标记 schema 版本，目前为 5。版本 0/1/2/3/4 在事务内补齐 `profile_handle`、`category` 及范围索引；旧版同时补齐可空 `played_at`（真实对局 UTC 时间）与 `content_hash` 与索引，保留旧记录 UUID 与 metadata；旧记录重新索引后补齐 SHA-256。拒绝打开高于当前支持版本的库。
- v5 新增可空 `coop_json` 和 `replay_inspections(content_hash, parser_version, details_json)`，不改 path 唯一约束。旧记录没有当前识别缓存时，重新扫描会重新解码并重分类，UUID 不变。扫描始终重新计算 SHA-256，仅在 hash 与独立 `REPLAY_INSPECTION_VERSION` 都相同时复用 metadata/合作识别，不依靠文件名、mtime 或大小命中缓存。
- `sql.js` 导出的文件本身是 SQLite 格式，保留原路径与既有表，不重新导入或清空历史记录。切换前应备份已有数据库；旧实现写入的占位 metadata 不会自动变成真实信息，需要重新索引。
- 按 path upsert 保留已有 UUID，并返回数据库中实际保存的记录。查询按修改时间倒序排列。
- 同步 SQL 用于索引与解析结果提交；MPQ 组件读取、BZIP2 解压和组件解码在独立 worker，最多两个不同录像并行，同一 UUID 合并并发请求。每任务 60 秒超时、worker V8 old-space 上限 256 MiB、序列化结果上限 32 MiB，应用退出时终止任务。initData/attributes 各限 4 MiB、tracker 限 16 MiB/100,000 事件。SQLite 不逐事件写入，当前保存有界 JSON 结果；后续高层时间线/聚合再设计专用表及查询。

- 生产环境直接加载构建后的 worker；开发环境通过固定引导代码加载 `tsx` 和 TypeScript worker。录像记录统一通过 `workerData.record` 传递，开发模块地址也通过 `workerData` 传递，不拼接到可执行代码中。

`capabilities` 保存 initData/attributes/tracker/game/message 各自的 available/partial/missing/unsupported/corrupt 状态、decoder 策略名称及 sourceBuild。协议 build 仅用于适用组件的表选择，不作为整体分析总开关；通用 tracker 解码方案也有独立版本戳。`replay_runs` 当前保存显式触发的组件解析结果（`kind = components`）。`analyzeReplay` 显式请求也先验证物理范围、当前文件 SHA-256 和 `REPLAY_ANALYSIS_VERSION`，有效缓存直接返回，不再启动 worker；内容变更但未重索引则拒绝分析。每个录像仅保留最近一次结果，不逐事件展开成统计表。结果包含源文件 SHA-256、parserVersion、baseBuild、状态、warnings、解析时间与 initData/attributes/tracker 的 JSON-safe 数据。重新索引内容发生变化后，旧 hash 对应结果不再返回；写入时也核对当前索引 hash，防止并发任务覆盖新内容结果。解析结果现同时保存版本化 `insights`：按 tracker PlayerSetup 映射的玩家经济采样及生产/升级事件时间线。`parserVersion` 包含业务投影算法版本，旧原始组件缓存会失效，需要玩家显式重新分析；打开详情不自动计算。另保存原始动作频率指标和分页聊天 DTO；initData/game/message 保存实际协议及 verified/unverified 兼容标记。邻近协议结果不作为自动合作分类或标准时长回推的已验证依据。原始 APM 不等于官方 EAPM；仍不生成官方结算总分或保证精确的下令建造时间。

- `replay_files` 保存 `profile_handle`、`category`；同一 SQLite 文件按这两个字段分区查询，不按账号 ID 划分、不为每个资料复制数据库。解析 run 仍外键关联唯一录像 ID，访问 run 前检查该录像资料/类型和当前物理目录。旧记录缺归属为 null，不出现在资料库；重新扫描实际目录后补齐，不默认归到当前选择。

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
   - `players_json` / `warnings_json` / 可空 `coop_json`
   - `created_at` / `updated_at`

2. `replay_runs`
   - 当前组件解析用 `kind = components`，结果存于 `details_json`；重分析事务替换该录像旧组件结果。
   - 删除文件索引时同步删除关联 run；保留扩展其他任务种类的空间。

3. `replay_inspections`
   - 以 SHA-256 与独立识别/协议版本联合为主键，保存 metadata 与合作摘要；不同路径相同内容可复用，源文件每次扫描仍需读取 hash。
   - 这是内容缓存，不是范围授权；读取、删除、观看、分析及导出仍验证记录所属资料/虚拟分类和物理路径。

## 合作任务虚拟分类

`Coop` 与 `Multiplayer` 共用资料下的 `Replays/Multiplayer` 物理目录，不创建 `Replays/Coop`。只有已解码 initData 的 `m_syncLobbyState.m_gameDescription.m_isCoopMode === true` 确认合作，false 为非合作，缺失/不支持/解码失败为 unknown。普通 Multiplayer 排除已确认合作，unknown 保留其中。Campaign/Challenge 不参与虚拟重分类。

扫描任一虚拟分类都会索引整个共享目录，再只返回所选分类；旧 Multiplayer 记录可因此移入 Coop，且保持 UUID。单文件导入与 archive 导入必须匹配用户所选虚拟分类：Coop 拒绝普通或 unknown，Multiplayer 拒绝已确认合作，错误中说明不匹配。失败清理新复制/解压文件，archive 整批校验再写记录，不留下部分成功项，也不改写合作标记。原始外部文件不修改。

识别不根据文件名、地图名、玩家数量猜测；快速扫描只读取有界 initData，不扫描 tracker 推断。上游协议缺字段、未知 build、损坏 initData 均不承诺识别；不声称已实现所有合作地图或上游修正规则。摘要中的 mutators 等无法可靠识别的值明确 unknown，深入分析的具体支持边界见 [合作分析说明](../../packages/replay-parser/COOP.md)。

## 原则

- 当前目录扫描仅由调用方手动触发；自动扫描/监听仍是后续计划，不启动 watcher。
- 删除仅接受已索引的普通 `.SC2Replay` 文件，不递归删除目录；文件已不存在时允许清除失效索引，其他文件错误保留索引并向上传递。
- 数据库只保存结构化、可复用的结果，不保存临时对象。
- 解析器 package 负责判断文件是否属于 replay；数据库负责存储和查询。
- `table` 结构允许后续扩展更复杂的 `tracker` / `timeline` / `aggregate` 数据。

## 当前统计与后续深度结果边界

当前跨场统计基于当前档案/当前分类全部已扫描录像，不随文字搜索变化；非空 contentHash 去重。胜率为 win/(win+loss)，draw/unknown 单列；对种族仅明确1v1，地图战绩含团队；趋势按真实 played_at 的 UTC 月份，无日期只计总数，不用 mtime_ms 补齐。无 hash 的记录分别计数，不按路径或昵称去重。具体样本分母及验收见 [录像分析设计](../replay-analysis-design.md)。

统计由现有录像记录在 renderer 聚合，未新增专用统计表或查询 API。当前分析 JSON 已保存计分、生命周期、原始动作频率、生产及聊天结果；这些不等于完整交战模型、官方 EAPM 或 AI 复盘。现有版本/hash 失效机制继续有效，新增存储结构须另行迁移和验证。
