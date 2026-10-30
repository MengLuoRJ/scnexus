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

当前版本为“可靠的基础识别 + 组件清单 + metadata contract”版，并没有声称完成官方协议的全部解码；它是为后续引入官方 `s2protocol` 或生成式协议表奠定结构。
