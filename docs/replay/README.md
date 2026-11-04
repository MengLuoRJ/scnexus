# Replay Center

本目录记录 SCNexus 的录像管理与分析设计方案，目标是把 `.SC2Replay` 文件当作受管理的本地资产，而不是临时文件。

## 当前状态

已实现本地录像管理、官方93个build的组件解码与未知版本有界试解、39项计分曲线、基础击杀/APM/单位统计、开始＋完成生产记录、聊天、跨场统计及调用游戏观看录像。合作模式已有分类和基础分析，专用规则仍不完整。完成程度、验证证据及未实现项见[架构文档第10节](./replay-architecture.md)。AI复盘仍仅设计。

统计范围为当前档案/当前分类全部已扫描录像，不随文字搜索变化；contentHash 去重；胜率 win/(win+loss)，draw/unknown 单列；对种族仅明确1v1，地图含团队；趋势按真实 playedAt UTC 月份，无日期只计总数。

## 目标（含后续计划，不代表全部已实现）

- 支持识别本地录像目录和压缩包中的录像文件
- 支持索引、筛选、导入、删除、重命名与归档
- 支持最小可用的 replay metadata 抽取
- 将解析能力拆为 MPQ / Components / Metadata / Analysis 四层
- 在桌面端保持本地优先、可验证、可恢复

## 设计原则

1. 先保证「管理能力」可靠，再做「深度分析」
2. 区分「文件识别」「基础信息解析」「事件分析」「聚合统计」
3. 明确版本不支持时返回 `unsupported` / `partial` / `failed`，不静默回退
4. 以本地 SQLite 和本地文件索引为主，上传/社区对比归后续扩展

## 文档索引

- [replay-architecture.md](./replay-architecture.md) — 架构与能力拆分
- [replay-parser-package.md](./replay-parser-package.md) — `@scnexus/replay-parser` 包设计
- [training-start-research.md](./training-start-research.md) — 实际训练开始时间的源码证据、限定还原方案与实验矩阵
- [replay-database.md](./replay-database.md) — 本地 SQLite 数据结构与 replay 持久化设计

- [录像分析分阶段设计](../replay-analysis-design.md) — 已确认统计口径、观看验收与后续指标证据要求
- [AI 设计](../ai-assistant-design.md#录像复盘-ai-设计本轮不实现) — 数据授权、外部发送与只读证据工具（本轮不实现）

## 关键原则

- 录像文件不是“视频”，而是包含协议结构和事件流的压缩存档。
- 当前主进程复用已有 TypeScript MPQ 读取器；容器读取与语义解析分层，后续如需 StormLib 可替换主进程适配器。
- 未知 build 与损坏文件必须显式标记，不要把“最近协议”伪装成“兼容”。
