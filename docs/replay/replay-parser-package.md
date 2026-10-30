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

## 计划中的后续能力

- `parseInitData`：补充 lobby、游戏速度及槽位信息
- `parseTrackerTimeline`：生成可聚合的经济/单位序列
- `calculateReplaySummary`：生成战术性摘要

## 当前实现状态

解析包不访问文件系统，也不依赖 MPQ、Electron 或 Vue。调用方提供 user-data header 及组件字节，`inspectReplayFile(path, input)` 编排解析；单独调用 `looksLikeReplay` 或不提供 input 仍仅为扩展名候选识别，返回 `unsupported`，不虚构 metadata。

已实现：

- `decodeVersioned`：自描述 Versioned 编码的有界读取，包括整数、blob、数组、结构、optional 与 choice；整数用 bigint 避免 64 位精度损失，限制嵌套、节点数与字节范围。
- `parseReplayHeader`：检查 SC2 签名，提取四段版本、base build 与 elapsed game loops。
- `parseReplayDetails`：按自描述字段 tag 提取地图、玩家、种族、队伍与胜败，排除观察者；无明确胜败时返回 null，不推断平局。
- 组件 `found` 来自调用方实际探测或提供的字节，不从静态清单推断。
- 解出基础信息返回 `partial` / `metadata-only`；字节结构损坏返回 `corrupt`，仍保留其他成功解析的组件信息；不声称 `full` 或任何 build 的事件兼容性。

`durationSeconds = elapsedGameLoops / 16` 是**游戏时间**，不是 Faster 速度的实际经过秒数。当前未解析 initData 的游戏速度，界面须明确标记游戏时长，不能自行按 22.4 loops/s 推算所有录像的真实时长。

主进程 `replay-inspection` 通过项目现有 TypeScript MPQ 适配器只读打开录像，读取 user-data 与最大 4 MiB 的 details，并关闭句柄。不引入新的 StormLib npm 依赖。未知压缩方法通过 warnings 暴露；文件访问错误向上传递。压缩层与协议层可独立扩展，后续如需 StormLib 可在主进程替换适配器，无需修改 parser。

## 协议依据与验证边界

字段 tag 和 Versioned 编码依据 Blizzard 官方 [s2protocol decoders](https://github.com/Blizzard/s2protocol/blob/master/s2protocol/decoders.py) 与 [protocol98310](https://github.com/Blizzard/s2protocol/blob/master/s2protocol/versions/protocol98310.py) 对照实现；没有复制整个协议表或引入 Python 运行时。自描述 header/details 与 build-specific bit-packed events 必须分开，不能把当前读取能力推广为所有 build 的完整兼容。

回归测试包括自构建的 Versioned 数据、实际 MPQ 容器的压缩组件读取、SC2 带 padding 的 user-data 布局、损坏文件及截断输入。另以官方仓库公开样本 `2018-11-29_Z_iaguz_VS_P_Luneth.SC2Replay` 手工验证：地图 Lost and Found LE，版本 4.7.1.70326，base build 70154，Zerg 负 / Protoss 胜。样本不纳入仓库，不声称这些样本构成全面版本覆盖。
