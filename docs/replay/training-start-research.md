# StarCraft II Replay 普通单位训练开始时间还原研究

研究日期：2026-11-02  
状态：源码证据核验完成；尚未执行真实录像逐帧对照实验。

## 1. 结论摘要

**普通单位实际训练开始时间不能直接等同于训练指令时间，也不能直接等同于单位出生时间。现有证据支持分场景还原，但不足以支持“所有普通训练都不能恢复”或“都可以精确恢复”的断言。**

1. 官方 `s2protocol` 的已检查协议，提供 `SCmdEvent`、`SUnitBornEvent`、`SUnitInitEvent`、`SUnitDoneEvent` 等事件；tracker 事件表没有单独的通用 `TrainStarted` 事件。这个结论限于所检查的协议事件表，不等于证明其他证据不能间接恢复开始时间。[P1]
2. `sc2reader` 明确区分：普通陆战队员、跳虫、兵营式传送门训练的狂热者，以完成态进入游戏，产生 `UnitBornEvent`；建筑和折跃单位先产生 `UnitInitEvent`。它同时明确指出，普通 Born 单位没有与 Init/Done 类似的直接开工事件，训练命令只是最接近的相关事件。[R1]
3. `sc2reader` 给 Born 单位设置 `started_at = finished_at = event.frame`。因此，这个 API 字段名**不能证明普通单位的实训开始时间**。[R2]
4. Spawning Tool 确实实现了“出生时间减训练时长”，并对 chrono 等情况做调整；但源码明确称 chrono 算法为 approximation，并承认无法区分具体受加速建筑。它是可信的工程估计实例，而非普适精确还原的证明。[S1][S2]
5. 已检查的官方 **70154 和 98310 协议，Born 事件都包含可选 creator tag 与 creator ability 字段**。这比“只能按单位类型猜生产建筑”的说法更有希望，但字段的真实填充率、各机制下的含义，需要录像实验验证。[P2]
6. 可以优先交付“原始指令时间轴 + 实体 Init/Done/Born 观察时间轴”；对普通训练另设带条件、来源和置信等级的估计层。**本轮计划新增的指令时间轴不等于实训 start。**

## 2. 术语与证据等级

建议统一区分：

| 字段/概念                       | 含义                                      |
| ------------------------------- | ----------------------------------------- |
| `commandLoop`                   | 玩家发出训练/相关命令的 loop              |
| `initLoop`                      | tracker 首次观察到未完成实体初始化的 loop |
| `bornLoop`                      | tracker 观察到完成态单位出生的 loop       |
| `doneLoop`                      | tracker 观察到已初始化实体完成的 loop     |
| `estimatedTrainingStartLoop`    | 基于模型推导的普通训练实际开始 loop       |
| `observedTrainingStartInterval` | 通过实际游戏回放观察，夹定的开始区间      |

本文证据分级：

- **A：协议/实现直接证据。** 例如事件原始字段、源码赋值。
- **B：可信实现的明确解释或算法。** 例如 sc2reader 语义注释、Spawning Tool 推算实现。
- **C：待实验验证的模型推断。** 例如 creator 与具体队列槽位的绑定、某类 cocoon 的真实事件序列。

必须把“源码存在字段”“字段在录像中有值”“字段足以唯一还原开始时间”作为三个不同命题。

## 3. 官方 s2protocol 核验

### 3.1 `SCmdEvent` 不直接提供普通训练 start

98310 的 command 数据结构：

```text
m_cmdFlags
m_abil
m_data
m_sequence
m_otherUnit
m_unitGroup
```

能力字段包括 `m_abilLink`、`m_abilCmdIndex`、`m_abilCmdData`；目标数据可为无目标、点目标、单位目标或其他数据。上述结构**没有直接标记通用训练实际开始 loop 的字段**。[P3]

`sc2reader` 的 `CommandEvent` 注释将其定义为玩家向一个单位或一组单位发出命令时的事件，并解析 `queued` 等标志。这验证的是“命令记录”，不是命令被接受、已进入生产槽或已经产生训练进度。[R3]

特别注意：

- 不应把“没有 queued 标志”解释为“没有生产队列等待”。
- command 对应的选中单位组，不必等于最终承接生产的唯一建筑。
- target unit tag 是命令目标时，不能无条件当作生产者 tag。

后两项应通过选择状态、控制组状态、creator 与实际回放观察联合确认，而不是从字段名猜测。[P3][R3][R4]

### 3.2 `SUnitBornEvent`：出生，不是直接开工

98310 的 Born 结构除单位 tag、类型、玩家、位置外，还包含：

```text
m_creatorUnitTagIndex
m_creatorUnitTagRecycle
m_creatorAbilityName
```

70154 的对应结构也有这些字段。[P2]

**可落地价值：**

- 保留 creator 原始字段，有机会把出生结果关联到具体生产实体/能力。
- 使用完整 `(index, recycle)` 标识，避免 tag index 复用造成误关联。
- creator 可以减少“同类多建筑”的候选歧义。

**仍未验证：**

- 常规对战录像中各单位类型的字段非空率。
- creator 是生产建筑、卵/茧、施法者还是其他实体。
- 反应堆两条并行生产链如何区分。
- 某些变形/批量孵化是否一对多，以及是否存在中间实体。

因此不能因为协议有 creator 字段，就宣布已经解决精确实训开始还原。

### 3.3 `SUnitInitEvent` / `SUnitDoneEvent`

官方协议：

- Init 包含实体 tag、类型、控制/归属玩家、坐标。
- Done 包含实体 tag index/recycle。
- TypeChange 包含实体 tag 与新类型。
- 所检查的 tracker 事件表没有独立训练队列槽位开始事件。[P1][P4]

`sc2reader` 对 Init 的解释是：实体在完成前已进入游戏，典型为建筑和折跃单位；Done 是该类实体的完成事件。[R5]

因此：

- 对明确属于 Init/Done 模式的实体，可直接提供“实体开工/完成观察时间”。
- 不能把 Init 泛化为“所有普通单位训练 start”。
- 也不应把所有 Init 都命名为“建筑开工”；折跃单位同样可能属于该路径。[R5]

## 4. sc2reader 与插件核验

### 4.1 `started_at` 名称会误导普通训练统计

`ContextLoader.handleUnitBornEvent`：

```python
event.unit.started_at = event.frame
event.unit.finished_at = event.frame
```

而 Init 设置 `started_at`，Done 设置 `finished_at`。[R2]

这意味着：

> 对普通 Born 单位，`unit.started_at` 是 sc2reader 对生命周期对象的赋值约定，不能直接解释为游戏内生产条开始推进的时刻。

### 4.2 选择/控制组重建有价值，但不自动解决生产者分配

官方 sc2reader 的 `SelectionTracker` 跟踪 active selection、控制组等状态，并记录 selection errors；其文档明确提醒某些情况下 selection tracking 不完美。[R4]

因此，选择重建应作为生产者候选证据，同时保留：

- 选择跟踪是否完整；
- 控制组恢复是否有错误；
- command 当时的候选生产实体集合；
- 是否通过 Born creator 或其他证据消除了多解。

### 4.3 历史 `TrainingTracker` 不是实际训练开始解析器

`dsjoerg/ggpyjobs` 中的 sc2reader 扩展：

- `TrainingTracker` 输出 `player.train_commands[unit_name] = list(framestamps)`；
- 注释明确“不尝试过滤 spammed events”；
- TODO 明确涉及取消、shift 队列；
- 对 `build >= 25446` 直接返回，不执行旧训练命令追踪逻辑。[G1]

其 `LifeSpanTracker` 文档按最接近、早于首次活动的 build event 推测时间，依赖 Training/Activity/OwnershipTracker；同样对较新 build 走不同路径。[G2]

**结论：** 不应将历史插件名 `TrainingTracker` 或其 `started_at` 输出当成现代普通训练精准开工的已验证实现。

## 5. Spawning Tool：实际采用推算，但主动承认限制

Spawning Tool 对 Born 路径的源码解释：

> unit_born 是单位真正创建的时刻，因此减去单位建造时间来得到开始时间。

实际调用 `adjust_build_time(event.frame, ...)`。[S1]

Init 路径则直接使用 `event.frame`。[S1]

`adjust_build_time`：

1. 从单位数据取得 `build_time`；
2. 应用 modifier；
3. `projected_start = frame - build_time`；
4. 按 chrono 重叠区间向后修正预测开始；
5. 返回估计值。[S2]

关键限制，源码原文：

> This is only an approximation.  
> We also cannot distinguish which building exactly gets boosted.

chrono 收集逻辑在相关分支按 `event.target.name` 而不是唯一建筑 tag 分组，解释了上述限制。[S3]

此外，该实现当前还处理传送门研究对训练时长的改变，并注释存在“同 build 无新编号的 hotfix”，需要结合对局日期判断 modifier。[S2]

**这提醒本项目：训练数据不能只有单位名与固定时长，甚至不能假定 `baseBuild` 总能唯一确定全部平衡数值。**

## 6. 关键机制及还原边界

以下是基于上述字段与实现的风险模型；没有真实录像验证的行为不作为已证实的事件映射。

| 机制                   | 不能直接采用的简化                      | 推荐策略/剩余验证                                                                 |
| ---------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| 队列                   | `commandLoop = startLoop`               | 重建候选生产实体、任务顺序与已完成结果；只有唯一解才输出确定值                    |
| 取消/重复命令          | 一条命令对应一个最终出生单位            | 记录取消能力、替换、失败候选、未完成任务；不能仅按命令个数配 Born                 |
| 反应堆                 | 每座建筑只有一条串行生产链              | 模型允许多个并发槽；验证 creator 能否定位生产者，但不要假设能定位槽位             |
| Chrono                 | 所有单位都用固定训练时长倒减            | 建筑级加速区间与版本机制是必要证据；参考实现已明确承认近似                        |
| 断电/暂停生产          | 出生前整个时段进度恒速推进              | 若无法观测暂停区间，倒减只能作为带假设的估计                                      |
| 建筑变形/升降/附件切换 | type change 一定是训练开始/完成         | 用实体类型历史与版本规则解释，不能统一按一个 duration 减法处理                    |
| 卵/茧/cocoon           | 所有 Zerg 都统一 `Egg Born → Unit Born` | 按单位与版本记录真实事件序列；验证是否同 tag TypeChange、一对多、是否有 Init/Done |
| 折跃                   | 折跃下令时间就是 Init                   | 分开记录命令与实体 Init；Init/Done 可直接代表实体折跃阶段的观察起止               |
| 初始/召唤/幻象         | 所有 Born 都是正常训练结果              | 分类来源；无可靠能力映射则保留 unknown，不纳入普通训练精度统计                    |

这些风险不是“证明不可恢复”；它们是精确恢复算法必须观测、建模或明确排除的条件。

### Cocoon 的特别限制

`UnitTypeChangeEvent` 文档只说它一般追踪建筑升级、模式切换，且可能还有其他转换情况。[R6]

它不足以证明某个特定 Zerg 单位的茧事件序列。

本次未找到并验证覆盖所有卵/茧类型的、与所支持 build 对齐的测试。因此不能在研究结论中编造统一映射；这一点应作为首批实验目标。

## 7. 建议的限定还原方案

### 7.1 第一层：可直接交付的观察时间轴

优先输出：

- 原始 `SCmdEvent` / 选择 / 控制组时间轴；
- `unit-born`；
- `entity-initialized`；
- `entity-completed`；
- `unit-type-changed`；
- `unit-died`；
- `upgrade-completed`。

保留原始事件与证据引用，避免用“训练开始”概括全部事件。

当前本地 insights 将 Born 映射为 `unit-born`、Init 映射为 `construction-started`，并配对 Done；其业务语义应继续区分观察值与推断值。Init 命名还应注意折跃场景。

本地只读核对位置：

- [replay-insights.ts](../../packages/app-main/src/modules/replay/replay-insights.ts)
- [replay-insights.type.ts](../../packages/app-shared/src/types/replay-insights.type.ts)

### 7.2 第二层：窄范围 duration 倒推

先只支持经过实验校验的：

- 指定 build/平衡数据指纹；
- 指定普通单位与生产方式；
- 无加速、无暂停、无变形干扰；
- 明确生产者；
- 正常完成，非召唤/初始/幻象；
- 用实际游戏观察验证过完整训练 duration。

此时可计算：

```text
estimatedStartLoop = bornLoop - verifiedDurationLoops
```

**排队本身并不必然使这个倒推公式失效**：若知道完成任务实际经历的完整恒速训练时长，公式针对的是实训开始，而不是下单时间。但取消、暂停、速度变化、错误生产方式、版本时长不匹配都会破坏前提。

界面显示“估计训练开始”，同时展示假设，不显示“精确开始”。

### 7.3 第三层：命令—生产者—队列约束匹配

依次引入：

1. build 对齐的能力映射；
2. userId 到实际玩家的映射；
3. 完整 selection/control-group 状态；
4. Born creator tag 与 creator ability；
5. 生产者生命周期、附件与类型历史；
6. 训练任务、取消、并行槽位、加速与暂停状态；
7. Born/Done 结果约束。

如果存在多个合法解释：

- 输出候选或开始区间；
- 保留不确定原因；
- 不强行选最近一次命令。

如果事件截断、选择跟踪失败或关键能力未知，则降级为“无法确定”。

### 7.4 建议结果结构

```text
status:
  observed-init
  estimated-duration
  inferred-queue-model
  ambiguous
  unavailable

commandLoop?
initLoop?
bornLoop?
doneLoop?
estimatedStartLoop?
startInterval?
producerTag?
evidenceRefs[]
assumptions[]
uncertaintyReasons[]
protocolVersion
algorithmVersion
balanceDataFingerprint?
```

不要用一个无来源的 `startTime` 混合直接观察、推算和猜测。

## 8. 与本轮 game.events 接口的衔接

本轮已实现：

```text
parseReplayGameEvents(data, baseBuild, options?)
→ baseBuild
  protocolVersion
  algorithmVersion
  processedEvents
  skippedEvents
  events[{eventId, eventType, gameLoop, userId, data}]
```

官方 build 按可达协议结构分组共享解码器；已移除支持的旧 build 62848 不参与候选试解；其他未登记的正整数 build 默认最多尝试三组候选，只有完整成功且候选事件一致才提供标为未验证的数据。70154 / 98310 保留官方解码器对拍 fixture，不再构成运行时白名单；原始保留命令/选择/控制组字段，不猜能力名称。流内其他已知事件仍解码以推进边界，但不作为展示事件返回。未验证结果不得作为训练开始还原的已验证证据。

此边界与本研究建议一致，但需明确：

> **game.events 解码与指令时间轴只是新增原始输入，不代表已经恢复普通单位实际训练 start。**

建议补充或确认：

- `processedEvents`、`skippedEvents` 与 `maxEvents` 是否明确暴露截断状态；
- `eventId` 是事件类型编号还是流内唯一序号，证据引用需另有稳定 stream ordinal/offset；
- 保留原始能力三元字段、flags、sequence、target；
- 不能默认 game `userId` 与 tracker playerId 数值相同；
- tracker 投影不要丢弃 Born creator 三字段；
- 对无法支持的 build 显式失败，不以邻近协议冒充精确支持。

上述是后续语义还原建议，不表示本轮已完成这些关联与推算。事件数上限超出时本轮解析器直接失败，不返回静默截断结果。

## 9. 进一步可靠验证：实际游戏回放逐 loop 观察

官方 SC2 API 提供一条值得验证的更强路径：

- `RequestStartReplay` 可指定录像、observed player、InterfaceOptions；
- `RequestStep.count` 可控制模拟的 game loops；
- `Observation.game_loop` 提供当前 loop；
- `UnitOrder.progress` 官方注释明确是训练能力进度，范围 `[0,1]`；
- `Unit` 提供 `orders`、`is_active`、`is_powered`、`buff_ids`、`add_on_tag` 等字段。[A1][A2]

这为对照实验提供了直接依据，但**API 有字段不等于已经证明可观察每一种开始边界**：

- queued order 与 active order 的 progress 表现需实验；
- 开始那一 loop 是否仍为 0、何时首次大于 0，需验证；
- 反应堆并行 orders 是否稳定区分，需验证；
- 敌方 orders 有可见性限制；官方明确将其列在 “Not populated for enemies” 下；
- 必须匹配可运行的历史游戏版本、地图与依赖；
- 一次采样看到 progress>0，只能证明该时刻已在推进，不能未经验证就宣称该 loop 是确切开始。

因此更合适的初始表述是“逐 loop 夹定边界并验证误差”，而不是直接承诺“精确到一 loop”。

## 10. 可验证实验矩阵与验收

每个实验都同时记录：

1. 原始 game/tracker 事件及流序号；
2. 完整实体 tag 和 creator 字段；
3. 逐 loop 的生产建筑 orders/progress；
4. 活动、供能、buff、附件及实体类型状态；
5. 游戏版本、数据版本、地图/模组、速度；
6. 实验预期与实际差异。

| 实验                                 | 核心问题                                |
| ------------------------------------ | --------------------------------------- |
| 单兵营空队列造单兵                   | command、首次进度、Born 的差值及稳定性  |
| 同兵营连续排三个单位                 | 第二/三个 command 是否早于实训开始      |
| 两同类建筑多选生产                   | 选择组、creator、实际承接建筑如何对应   |
| 反应堆同时生产与排队                 | 并行槽位与完成顺序能否唯一对应          |
| 取消等待项、取消生产中项、取消后重排 | 哪些命令有 tracker 结果，如何辨认缺失项 |
| 满人口、人口上限变化                 | 命令接受/失败、排队或进度的真实行为     |
| Chrono 覆盖前半/后半、不同生产建筑   | 实际加速区间与倒推偏差                  |
| 神族生产中断电后恢复                 | 是否暂停、如何观察、事件流是否足够      |
| 建筑变形、升降、附件切换             | 哪些是 TypeChange、是否改变任务/进度    |
| 虫族卵、双单位孵化、各类 cocoon      | 实际 Born/Init/Done/TypeChange/tag 链   |
| 折跃成功、打断或取消                 | command 与 Init/Done 的关系             |
| 初始单位、召唤/幻象、未完成对局结束  | 排除规则与 unknown 行为                 |

验收要求：

- 每个单位/机制单列样本数、build、误差，不把不同场景平均值当作全局保证；
- 报告精确匹配率、区间覆盖率、错误唯一匹配率、unknown 比例；
- 把“能解释已完成单位”与“能覆盖取消和未完成任务”分开；
- 对 70154、98310 分别执行，不以其中一版结果覆盖另一版；
- 在通过实验前，不对普通训练公开“精确 start”的产品承诺。

## 11. 剩余验证与限制

已可靠确认：

- 所检查官方协议的事件字段与事件表；
- sc2reader Born/Init/Done 的语义与 `started_at` 实际赋值；
- 历史插件记录训练命令而非普适精确开工；
- Spawning Tool 使用时长倒推并明确承认 chrono 近似；
- 官方 API 提供训练进度等候选对照字段。

尚未完成：

- 没有真实 replay/游戏引擎逐 loop 实验；
- 没有验证 creator 字段实际覆盖率；
- 没有建立支持 build 的完整平衡/能力目录；
- 没有确认所有队列、取消、反应堆、断电和 cocoon 的事件映射；
- 没有证明当前原始 replay 数据对所有普通训练场景具有唯一解；
- 也没有证明它在所有这些场景中都不存在唯一解。

**推荐最终产品结论：观察值直接展示；普通训练 start 在已验证条件下限定推算；存在多解时明确报告不确定，保留进一步通过游戏回放观察增强还原的路径。**

---

## 参考源码与直接证据

### 官方协议

**[P1]** tracker 事件表，无独立通用 TrainStarted：

`Blizzard/s2protocol:s2protocol/versions/protocol98310.py:360-370`  
https://github.com/Blizzard/s2protocol/blob/3b40c5ef01834096b4305172ef5485ec00133dcc/s2protocol/versions/protocol98310.py#L360-L370

**[P2]** Born creator 三字段，两个目标 build：

`Blizzard/s2protocol:s2protocol/versions/protocol98310.py:225-226`  
https://github.com/Blizzard/s2protocol/blob/3b40c5ef01834096b4305172ef5485ec00133dcc/s2protocol/versions/protocol98310.py#L225-L226

`Blizzard/s2protocol:s2protocol/versions/protocol70154.py:225-226`  
https://github.com/Blizzard/s2protocol/blob/3b40c5ef01834096b4305172ef5485ec00133dcc/s2protocol/versions/protocol70154.py#L225-L226

**[P3]** 能力、目标与 command 结构：

`Blizzard/s2protocol:s2protocol/versions/protocol98310.py:119-127`  
https://github.com/Blizzard/s2protocol/blob/3b40c5ef01834096b4305172ef5485ec00133dcc/s2protocol/versions/protocol98310.py#L119-L127

**[P4]** Born/Died/OwnerChange/TypeChange/Upgrade/Init/Done 结构：

`Blizzard/s2protocol:s2protocol/versions/protocol98310.py:226-232`  
https://github.com/Blizzard/s2protocol/blob/3b40c5ef01834096b4305172ef5485ec00133dcc/s2protocol/versions/protocol98310.py#L226-L232

### sc2reader

**[R1]** Born 单位类别及无直接 beginnings 的明确说明：

`ggtracker/sc2reader:sc2reader/events/tracker.py:278-287`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/events/tracker.py#L278-L287

**[R2]** ContextLoader 的 timestamp 赋值：

`ggtracker/sc2reader:sc2reader/engine/plugins/context.py:157-177`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/engine/plugins/context.py#L157-L177

`ggtracker/sc2reader:sc2reader/engine/plugins/context.py:259-289`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/engine/plugins/context.py#L259-L289

**[R3]** Command 语义及 flags：

`ggtracker/sc2reader:sc2reader/events/game.py:131-155`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/events/game.py#L131-L155

`ggtracker/sc2reader:sc2reader/events/game.py:173-179`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/events/game.py#L173-L179

**[R4]** 选择状态重建及错误提醒：

`ggtracker/sc2reader:sc2reader/engine/plugins/selection.py:1-19`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/engine/plugins/selection.py#L1-L19

`ggtracker/sc2reader:sc2reader/engine/plugins/selection.py:26-61`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/engine/plugins/selection.py#L26-L61

**[R5]** Init/Done 语义：

`ggtracker/sc2reader:sc2reader/events/tracker.py:514-518`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/events/tracker.py#L514-L518

`ggtracker/sc2reader:sc2reader/events/tracker.py:574-577`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/events/tracker.py#L574-L577

**[R6]** TypeChange 的有限语义说明：

`ggtracker/sc2reader:sc2reader/events/tracker.py:455-459`  
https://github.com/ggtracker/sc2reader/blob/e10fc9344417d0aa9649e4ed8d6423e38f6af4c9/sc2reader/events/tracker.py#L455-L459

### sc2reader 历史扩展

**[G1]** TrainingTracker 的实际输出、版本限制、取消/队列 TODO：

`dsjoerg/ggpyjobs:sc2parse/plugins.py:424-444`  
https://github.com/dsjoerg/ggpyjobs/blob/249647fbe944799655ae6c842343af09ba23942a/sc2parse/plugins.py#L424-L444

**[G2]** LifeSpanTracker 的匹配启发式与依赖：

`dsjoerg/ggpyjobs:sc2parse/plugins.py:447-464`  
https://github.com/dsjoerg/ggpyjobs/blob/249647fbe944799655ae6c842343af09ba23942a/sc2parse/plugins.py#L447-L464

### Spawning Tool

**[S1]** Born 倒减与 Init 直接使用事件时间：

`StoicLoofah/spawningtool:spawningtool/parser.py:595-624`  
https://github.com/StoicLoofah/spawningtool/blob/ef69a68c90e1b69051a3225a9bcba48364950a62/spawningtool/parser.py#L595-L624

`StoicLoofah/spawningtool:spawningtool/parser.py:637-645`  
https://github.com/StoicLoofah/spawningtool/blob/ef69a68c90e1b69051a3225a9bcba48364950a62/spawningtool/parser.py#L637-L645

**[S2]** approximation 注释、modifier、chrono 估算：

`StoicLoofah/spawningtool:spawningtool/parser.py:747-797`  
https://github.com/StoicLoofah/spawningtool/blob/ef69a68c90e1b69051a3225a9bcba48364950a62/spawningtool/parser.py#L747-L797

**[S3]** chrono 按目标名称收集：

`StoicLoofah/spawningtool:spawningtool/parser.py:492-502`  
https://github.com/StoicLoofah/spawningtool/blob/ef69a68c90e1b69051a3225a9bcba48364950a62/spawningtool/parser.py#L492-L502

### 官方游戏观察 API

**[A1]** 训练进度、状态与 orders 的可见性：

`Blizzard/s2client-proto:s2clientprotocol/raw.proto:52-58`  
https://github.com/Blizzard/s2client-proto/blob/4867bb9ede01e914c57a6fc9575dcc2f4bf0ca5a/s2clientprotocol/raw.proto#L52-L58

`Blizzard/s2client-proto:s2clientprotocol/raw.proto:110-123`  
https://github.com/Blizzard/s2client-proto/blob/4867bb9ede01e914c57a6fc9575dcc2f4bf0ca5a/s2clientprotocol/raw.proto#L110-L123

`Blizzard/s2client-proto:s2clientprotocol/raw.proto:140-142`  
https://github.com/Blizzard/s2client-proto/blob/4867bb9ede01e914c57a6fc9575dcc2f4bf0ca5a/s2clientprotocol/raw.proto#L140-L142

**[A2]** replay 启动、步进与当前 loop：

`Blizzard/s2client-proto:s2clientprotocol/sc2api.proto:269-280`  
https://github.com/Blizzard/s2client-proto/blob/4867bb9ede01e914c57a6fc9575dcc2f4bf0ca5a/s2clientprotocol/sc2api.proto#L269-L280

`Blizzard/s2client-proto:s2clientprotocol/sc2api.proto:391-393`  
https://github.com/Blizzard/s2client-proto/blob/4867bb9ede01e914c57a6fc9575dcc2f4bf0ca5a/s2clientprotocol/sc2api.proto#L391-L393

`Blizzard/s2client-proto:s2clientprotocol/sc2api.proto:617-622`  
https://github.com/Blizzard/s2client-proto/blob/4867bb9ede01e914c57a6fc9575dcc2f4bf0ca5a/s2clientprotocol/sc2api.proto#L617-L622
