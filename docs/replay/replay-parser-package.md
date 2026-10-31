# @scnexus/replay-parser

## 目标

`@scnexus/replay-parser` 是一个独立的 TypeScript 包，负责为 SC2 replay 提供可复用的识别、目录、元数据和事件入口解析能力。

## 模块设计

### 1. file-scan

负责识别：

- `.SC2Replay` 文件
- 是否存在 MPQ header
- 文件大小、扩展名和合法性

### 2. archive-components

负责维护 replay 内部组件列表，例如：

- `replay.details`
- `replay.initData`
- `replay.attributes.events`
- `replay.game.events`
- `replay.message.events`
- `replay.tracker.events`
- `replay.gamemetadata.json`

### 3. metadata-parser

负责抽取元信息，包括：

- map name
- base build
- player / race / result / team / slot
- duration
- game version

### 4. analysis-entry

负责生成高层分析对象的入口；理论上，事件流和统计层都可以从这里接入。

## 设计原则

- 解析器对不同目标分离：metadata 与 analysis 分开
- 对未知协议做 `unsupported` 而不是伪装成已支持
- 所有输出保存 `protocolVersion` 与 `algorithmVersion`
- 不在 parser 中硬编码违背用户隐私的上线数据上传逻辑

## 公开 API

```ts
import {
  inspectReplayFile,
  looksLikeReplay,
  REPLAY_COMPONENTS,
  REPLAY_FILE_EXTENSIONS,
} from '@scnexus/replay-parser'

const result = await inspectReplayFile('C:/replays/game1.SC2Replay', {
  header: userDataBytes,
  components: { 'replay.details': detailsBytes },
  availableComponents: ['replay.details', 'replay.initData', 'replay.game.events'],
})
console.log(result.status)
console.log(result.summary.mapName)
```

## build-specific 组件 API

```ts
import {
  parseReplayAttributes,
  parseReplayInitData,
  parseReplayTrackerEvents,
  UnsupportedReplayBuildError,
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  SUPPORTED_REPLAY_BASE_BUILDS,
} from '@scnexus/replay-parser'

// host 负责只读 MPQ 解压；baseBuild 必须来自 parseReplayHeader，不是显示版本的 build。
const attributes = parseReplayAttributes(attributeBytes)
const initData = parseReplayInitData(initDataBytes, header.baseBuild)
const tracker = parseReplayTrackerEvents(trackerBytes, header.baseBuild)
```

- initData 完整协议精确注册 `70154`、`98310`，没有最新版本、相邻版本或未知 build fallback；`98370` 仅有显式 tracker 兼容配置（见验证边界），不支持其 initData。未注册值抛出 `UnsupportedReplayBuildError`，包含 `code: 'UNSUPPORTED_REPLAY_BUILD'` 与 `baseBuild`；未知 tracker 事件或兼容配置的未验证字段抛出 `UnsupportedReplayProtocolError`，host 记为不支持而非损坏；截断等损坏输入和资源超限抛出 Error，由 host 转换为 IPC DTO。
- `ReplayInitData`：`{ baseBuild, protocolVersion, algorithmVersion, data }`；`data.m_syncLobbyState` 保留原始协议字段名，包含用户、gameDescription（例如 `m_gameSpeed`）及 lobby/slot 信息。
- `ReplayTrackerEvents`：相同版本戳，加 `events: ReplayTrackerEvent[]`。事件含 `eventId`、完整 `eventType`、累积 `gameLoop`、原始字段 `data`。实现全部十类 tracker 事件（0–9）：PlayerStats、UnitBorn、UnitDied、UnitOwnerChange、UnitTypeChange、Upgrade、UnitInit、UnitDone、UnitPositions、PlayerSetup。tracker 流使用 Versioned 编码，不是 game/message 的 bit-packed 编码；没有 user-id 前缀。
- `ReplayAttributes`：`{ protocolVersion: 'attributes-v1', algorithmVersion, source, mapNamespace, attributes }`；每项 `ReplayAttribute` 为 `{ namespace, attributeId, scope, value }`，保留重复项。`value` 是反序并去两端零字节后的 FourCC，而非 UI 标签。严格校验头部声明数量。
- `ReplayProtocolValue` 是 JSON-safe 递归值：安全整数使用 number，超出安全范围的整数使用十进制 string；blob 使用 `ReplayBlob = { kind: 'blob', hex, text }`（非 UTF-8 时 text=null）；bitarray 使用 `{ bitLength, value }`，value 为无损十进制 string；optional 为 null。不会泄露 Map、Uint8Array 或 bigint 至 IPC/JSON。字段名不是翻译后的产品 DTO，host/共享层负责业务映射。
- 完整协议的 `protocolVersion` 为 `s2protocol-${baseBuild}`；98370 tracker 为 `tracker-98370-compatible-98310-v1`，同时返回 `compatibility: { referenceBaseBuild: 98310, scope: 'tracker-only', verifiedFieldTags: true }`，不冒充官方98370协议。`REPLAY_PROTOCOL_ALGORITHM_VERSION` 当前为 `1.1.0`。持久化分析时保存两者，并由 host 绑定录像 contentHash；算法改变需要提升版本，不能仅按文件路径复用结果。本次版本提升会使旧的“不支持”缓存失效。
- 固定预算：initData/attributes 最大 4 MiB，tracker 最大 32 MiB；每个协议解码器最多 1,000,000 节点、64 层；数组与事件最多 100,000 项，bitarray 最多 65,536 位。Versioned 单值另有 100,000 节点预算。失败不返回伪完整结果。initData 拒绝多余完整尾字节，允许协议的末字节对齐 padding。

现有 `inspectReplayFile` 仍只编排 header/details 元数据，不自动运行这些较重的组件 API，也不因精确协议注册而将录像标成 full。游戏速度代码、tracker 原始统计字段和单位事件不等同于已完成 APM、build order、真实时间换算或战术分析。

## 98370 tracker 局部兼容验证

截至本次核对，官方版本目录仅到98310，公开代码检索没有找到 `protocol98370.py`，因此**没有注册官方98370完整协议**。公开基准为 Blizzard 自动化发布的 [commit 901804e41283269d43d7bfc3b8dc5be2a9dd350a](https://github.com/Blizzard/s2protocol/commit/901804e41283269d43d7bfc3b8dc5be2a9dd350a) 中的 [protocol98310.py](https://github.com/Blizzard/s2protocol/blob/901804e41283269d43d7bfc3b8dc5be2a9dd350a/s2protocol/versions/protocol98310.py)，源文件 SHA-256 为 `2941e39e970c21bfa7bb9c5c6d340c09366a5743f223b516fe19443f67c578e5`。本地安装的官方 Python s2protocol 文件与该固定源文件哈希完全一致。

`build98370-tracker.ts` 仅保留上述 tracker 可达的25个类型及事件表，不包含 initData。tracker 为自描述 Versioned 数据；98370配置逐层校验已知字段 tag 和必需字段，拒绝未知事件、未知字段及缺少必需字段，不静默丢弃新字段。该检查表示已验证的字段投影，不表示上游声明98370兼容。支持范围不推广至 initData、game/message 或未来 build。

实际本机用户录像（baseBuild98370，5.0.15.98370）只读对拍：官方 `decode_replay_tracker_events` 与本实现的581个事件、事件ID、gameLoop及全部 data 字段一致，最后 gameLoop11740。事件数量为 `0:151, 1:261, 2:47, 4:1, 5:15, 6:46, 7:38, 8:20, 9:2`；样本**没有覆盖ID3 owner-change**，因此不声称覆盖全部98370事件。归一化后递归按键排序的紧凑 UTF-8 JSON SHA-256 为 `d564d99213babc9797ff98402fdbe802b2f3eee4acf8fce147359ce66f00752d`（blob保留 kind/hex/text，移除官方事件内部元数据后映射 eventId/eventType/gameLoop/data）。

随后通过 main 的 `analyzeLocalReplay` 直接读取同一原路径：状态 `partial`，initData明确不支持；两名玩家分别得到75/76个经济采样点及93/46个生产时间线节点。主进程报告 tracker-only兼容警告。原文件大小和修改时间检查不变，录像、组件、玩家数据未复制、未上传或纳入仓库；本结果仅证明这份样本的局部兼容。

可复验的只读本地集成测试为 `replay-local-validation.test.ts`：设置 `SCNEXUS_LOCAL_REPLAY` 指向原录像，再运行 `pnpm --filter @scnexus/app-main test src\\modules\\replay\\__test__\\replay-local-validation.test.ts --silent=false --reporter=verbose`。可设置 `SCNEXUS_TRACKER_ORACLE_SHA256` 为独立官方 oracle 得到的归一化哈希，检查整个事件投影；不设置原路径时测试跳过，不能视为真实样本覆盖。正常回归另覆盖精确build派发、兼容stamp、字段拒绝、截断错误和主进程“不支持/损坏”分类。

## 主进程 tracker 业务投影

`packages/app-main/src/modules/replay/replay-insights.ts` 的 `buildReplayInsights(tracker, players)` 将 tracker 转为版本化 `ReplayInsights`，不改变 parser 的原始事件 API。输入与输出均最多 100,000 个事件；超限抛错，不静默截断。时间保留 game loop，按每游戏秒 16 loops 理解，不换算 Faster 实际时间。每位玩家的经济与生产事件按时间稳定排序。

- 只有 `SPlayerSetupEvent.m_slotId + 1` 与 details 元数据的 `ReplayPlayer.slot` 明确匹配时才关联姓名；`m_playerId` 是 tracker 玩家 ID，`m_userId` 是独立的游戏事件用户 ID，不能作为 details 数组下标。未设置、未匹配或冲突的关联保留 `playerId`，`slot/name` 为 null；不会凭数组顺序猜测身份，不为只有 setup 的观察者生成空曲线。
- 经济使用 `m_stats.m_scoreValueMineralsCurrent/VespeneCurrent`、`MineralsCollectionRate/VespeneCollectionRate`、`WorkersActiveCount`、`FoodUsed/FoodMade`、`MineralsUsedCurrentArmy/VespeneUsedCurrentArmy`。只有 food 除以 4096（保留半人口）；采集率保留记录的资源/游戏分钟，不对 Faster 速度二次缩放。缺失、负数、非数值返回 null，零值保留。不从军队价值推造花费、采集总量或结算资源得分。
- `unit-born` 是实体出现，不等同于下达训练指令；可能包含临时或脚本实体。`construction-started/completed` 是 DTO 名称，对应 UnitInit/UnitDone，**也包括折跃单位，不专指建筑施工**；界面应显示通用的生产开始/完成。未经游戏数据分类不推断建筑、正常训练、临时单位或战术含义，不合并为训练总数。
- UnitDone 只关联同一 index/recycle 的已知 UnitInit；死亡、完成和 tag index 回收清理状态。归属按 upkeep 玩家，捕获更新后续完成归属；类型变化更新完成时的原始 ID，但不额外制造出生/变形生产事件。loop 0 的出生、初始化与奖励升级不进入生产时间线，也不将 loop 0 初始化后的完成伪作本局开工。
- 升级来自 Upgrade 的 `m_upgradeTypeName/m_count`（记录的升级次数，不是推导等级）。名称取 parser blob 的 UTF-8 `text` 原始 ID，不伪装为本地化游戏数据；无法解码或缺失名称的事件不展示。

字段与 tag 依据下文官方协议；food 定点及 UnitInit/Done 的折跃语义交叉参考 [sc2reader tracker events](https://github.com/ggtracker/sc2reader/blob/master/sc2reader/events/tracker.py)。

## 计划中的后续能力

- 游戏数据支持的单位分类、本地化与结算汇总 DTO
- game/message 事件与 APM、指令型 build order（当前未实现）

## 当前实现状态

解析包不访问文件系统，也不依赖 MPQ、Electron 或 Vue。调用方提供 user-data header 及组件字节，`inspectReplayFile(path, input)` 编排解析；单独调用 `looksLikeReplay` 或不提供 input 仍仅为扩展名候选识别，返回 `unsupported`，不虚构 metadata。

已实现：

- `decodeVersioned`：自描述 Versioned 编码的有界读取，包括整数、blob、数组、结构、optional 与 choice；整数用 bigint 避免 64 位精度损失，限制嵌套、节点数与字节范围。
- `parseReplayHeader`：检查 SC2 签名，提取四段版本、base build 与 elapsed game loops。
- `parseReplayDetails`：按自描述字段 tag 提取地图、玩家、种族、队伍与胜败，排除观察者；无明确胜败时返回 null，不推断平局。
- 组件 `found` 来自调用方实际探测或提供的字节，不从静态清单推断。
- 解出基础信息返回 `partial` / `metadata-only`；字节结构损坏返回 `corrupt`，仍保留其他成功解析的组件信息；不声称 `full` 或任何 build 的事件兼容性。

`durationSeconds = elapsedGameLoops / 16` 是**游戏时间**，不是 Faster 速度的实际经过秒数。

`playedAt` 来自 details tag 5 的 `m_timeUTC`（Windows FILETIME，自 1601-01-01 起的 100 ns tick），用 bigint 减去 Unix epoch 偏移并转换成 UTC ISO。缺失、零值或不可表示的时间返回 null，不用 m_timeLocalOffset 再次偏移，也不从文件名/mtime 推测；renderer 仅在展示时本地化。显式组件解析可获得 initData 游戏速度，但基础列表仍使用游戏时长，尚未做历史版本及速度差异的实际经过时间换算，不能自行按 22.4 loops/s 推算所有录像。

主进程 `replay-inspection` 通过项目现有 TypeScript MPQ 适配器只读打开录像，读取 user-data 与最大 4 MiB 的 details，并关闭句柄。不引入新的 StormLib npm 依赖。BZIP2 压缩由内部 `@scnexus/bzip2-wasm` 提供，使用官方 libbz2 编译的 WASM 与独立 TS 封装，不依赖 `seek-bzip` 或第三方 WASM npm 产物。codec 以同步、有界、严格单流解压接口嵌入主进程/worker bundle，常规运行无需 Docker 或 C 工具链；重新编译 WASM 才需构建工具，来源与维护流程见 [bzip2-wasm README](../../packages/bzip2-wasm/README.md)。原始 libbz2 的许可证随应用打包保留。通用 codec 另外提供压缩、增量流、生命周期及显式拼接流选项；MPQ 适配器仍只使用默认严格单流解压，不允许拼接流、尾随数据或修改 ZIP/MPQ 压缩策略。未知压缩方法通过 warnings 暴露；文件访问错误向上传递。压缩层与协议层可独立扩展，后续如需 StormLib 可在主进程替换适配器，无需修改 parser。

## 协议依据与验证边界

字段 tag 和 Versioned 编码依据 Blizzard 官方 [s2protocol decoders](https://github.com/Blizzard/s2protocol/blob/master/s2protocol/decoders.py)、[protocol70154](https://github.com/Blizzard/s2protocol/blob/master/s2protocol/versions/protocol70154.py) 与 [protocol98310](https://github.com/Blizzard/s2protocol/blob/master/s2protocol/versions/protocol98310.py) 对照独立实现。只纳入 initData/tracker 可达的最小类型数据与 tracker ID 表，未纳入游戏/消息协议表或上游可执行解码器；这部分 MIT 许可数据保留 `packages/replay-parser/LICENSE.s2protocol`。运行时不引入 Python。自描述 header/details 与 build-specific bit-packed initData 必须分开，不能把当前读取能力推广为所有 build 的完整兼容。

回归测试包括自构建的 Versioned 数据、实际 MPQ 容器的压缩组件读取、SC2 带 padding 的 user-data 布局、损坏文件及截断输入。另以官方仓库公开样本 `2018-11-29_Z_iaguz_VS_P_Luneth.SC2Replay` 手工验证：地图 Lost and Found LE，版本 4.7.1.70326，base build 70154，Zerg 负 / Protoss 胜。样本不纳入仓库，不声称这些样本构成全面版本覆盖。

组件基础实现另对同一官方样本做过完整对拍：initData 4,046 字节，所有字段与官方 `decode_replay_initdata` 深比较一致（gameSpeed=4）；attributes 2,037 字节、156 项全部比较一致；tracker 94,093 字节、1,875 个事件，每个事件类型、gameLoop 和全部 data 字段与官方 decoder 深比较一致，最终 gameLoop=13,216，覆盖全部十类事件。各 ID 数量为 `0:167, 1:653, 2:368, 3:2, 4:365, 5:36, 6:129, 7:125, 8:28, 9:2`。初次对拍在 host 侧用 Python mpyq 提取组件；现已在 MPQ reader 加入有界 BZIP2 解压，并通过打包后的 Electron worker 直接读取同一真实录像验证：156 属性、1,875 tracker 事件，三个组件全部完成，不再需要 Python 提取。运行时未引入 Python，fixture、原始玩家数据及对拍输出不纳入包。98310 已按官方精确协议表注册并通过完整 synthetic initData 和 tracker 测试，**尚无该 build 的真实样本对拍**，不等价于真实样本覆盖。

组件实现验证命令：`pnpm --filter @scnexus/replay-parser test`（24 tests passed）、`pnpm --filter @scnexus/replay-parser typecheck`（passed）、`pnpm --filter @scnexus/replay-parser lint`（oxlint + ESLint passed）。
