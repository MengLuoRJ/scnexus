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

const result = await inspectReplayFile('C:/replays/game1.SC2Replay')
console.log(result.status)
console.log(result.summary.mapName)
```

## 计划中的后续能力

- `parseReplayHeader`：读取协议头信息
- `parseInitData`：抽取玩家/队伍/地图/版本
- `parseTrackerTimeline`：生成可聚合的经济/单位序列
- `calculateReplaySummary`：生成战术性摘要

## 当前实现状态

当前仅实现扩展名候选识别、静态组件清单与 metadata 类型契约。`inspectReplayFile` 尚未读取文件内容，不验证 MPQ header，不检测实际组件，不解码协议。因此 `.SC2Replay` 路径的 `detected: true` 只表示扩展名匹配，返回 `unsupported`，未知字段为 `null`、玩家为空、所有组件 `found: false`；非录像扩展名同样返回 `unsupported`，但 `detected: false`。不返回虚构地图、版本、时长或玩家。上文模块设计及版本字段是目标设计，并非已经完成的能力。
