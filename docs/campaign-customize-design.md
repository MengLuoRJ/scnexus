# 战役包与自制作品：解析、导入、激活及管理设计

## 1. 范围、状态与已确认决策

本文件记录 campaign/customize 的重构规则。main、preload、新标准公开导出及对应 Store 已按后述范围实现；renderer-v2 交互已在文末记录的后续迭代中接入；campaign 与 customize 已实现无描述文件的保守自动识别。实现与验证见第 12 节，不代表所有后续方向已落地。

- campaign 与 customize 保持独立：前者管理战役包，后者管理自制作品。
- campaign 提供 SCNexus、CCM、自动识别三种分析模式；customize 提供 SCNexus、自动识别两种。campaign 自动识别仅在来源中找不到 package.json 与 metadata.txt 时启用；customize 自动识别仅在所有层级均找不到 package.json（含同名目录、资源内部、大小写变体）时启用；metadata.txt 不阻止 customize auto。
- 战役的安装（导入）与激活分开；SCNexus 导入不得修改活动地图或游戏 Mods；CCM 为兼容旧行为，在导入时直接安装 Mods。renderer 可在导入成功后按用户选择发起自动激活，也可只导入供以后手动激活。
- SCNexus 模式优先读取有效 package.json；campaign 输入仅有有效 metadata.txt 时，也可转换为 SCNexus 安装计划。CCM 模式独立读取 metadata.txt。新标准结构以 [package.type.ts](../packages/standard/src/package/package.type.ts) 为准，不继续以旧 metadata.json 为新标准。
- 自动深入输入层级并定位最外层有效包根；源路径相对定位后的逻辑包根，目标路径相对游戏根目录。SCNexus 资源路径必须以 /Maps/ 或 /Mods/ 开头，target_path 缺省时使用 source_path。原归档/输入根与逻辑包根分开记录，不改写用户输入地址。
- manager 仅表示作者推荐安装方式，不强制选择或禁用其他模式；AnalysisResult 返回可为空的 recommendedMode。manager_mode 已从新类型移除，不继续设计 default/strict 分支。
- AnalysisResult 的 conflicts 按模式分组，files 中的 Map/Mod 项各有 conflictId 并返回新资源与本地资源的名称、路径、修改时间和大小；用户可选择覆盖、保留或取消。
- SCNexus campaign 的覆盖地图由 campaign 类型和标准布局自动形成清单；maps/mods 仅声明额外地图和模组。customize 的 package.json 模式必须声明所有需安装的地图和模组；auto 模式自动声明标准 Maps/Mods 层级内全部地图与模组。
- CCM 根部模组安装到 Mods 根目录；Mods 下模组保留相对层级。不按任意父目录猜测模组位置。
- **CCM 模式不生成 package.json**：保留 metadata.txt，激活时写入该战役主地图目录；管理、扫描与删除以 metadata.txt 为格式依据。
- **SCNexus 与自动识别模式采用 SCNexus 管理方式**：在游戏根目录 SCNexusCustomizeData 下每个包一个子目录，保存 package.json、安装文件清单；只有 campaign 保留存在时的 CCM 原文副本，customize 不读取或持久化 metadata.txt 为 ccmOriginal。
- customize、campaign、campaign-active Store 改为基于新 Package 类型的本地记录；profile Store 已改为 scii-game-setting Store。

最新 CCM 决策替代早期“所有安装都生成 package.json”的设想。Package 可以作为内部统一信息模型，但内部转换不意味着向 CCM 安装目录写入 SCNexus 清单。

## 1.1 统一来源分类与描述文件冲突

新导入入口为 `window.scnexus.content.analyze(input, descriptorChoice?)`，对应 `content-package:analyze` 与 renderer IPC 适配器 `apiContentAnalyze`。`SourceAnalysisChoice` 仅包含 `package-json` / `metadata-txt`；返回 `IpcResult<AnalysisResult>`，成功结果的 `contentType` 是主进程分类结果。界面应先切换至 `/campaign` 或 `/customize`，再展示该结果的安装预览；旧领域 analyze 保留兼容，不用于新统一入口的类型选择。

- 外部有效 `metadata.txt` 表示 campaign；`package.json` 按其内部 `type` 分类。二者同类型时保留独立 SCNexus/CCM 模式。二者类型冲突时返回失败 DTO `M064`（`CONTENT_TYPE_CONFLICT`），不返回可安装预览；界面明确让用户选择描述文件，并携带原 `SourceInput` 和 choice **重新分析**。不冲突时传 choice 是非法参数。
- 选 metadata 后，package.json 不参与类型及预览解析；选 package 后，metadata 不参与类型及预览解析（包括 customize），也不保留为 CCM 原文。选择仅解决已验证的类型冲突，不能绕过坏描述文件或伪造类型。
- 描述文件仍按各自最外层有效安装计划确定逻辑根；同深度多个有效根返回业务错误。统一入口的 JSON/CCM 头部必须有效，坏描述文件、同名描述目录及无法确定根的输入直接返回业务错误，不能静默忽略或自动识别兜底。有效头部但没有可安装内容时，保留分类并返回现有模式诊断，不伪造预览。
- `.SC2Map` / `.SC2Mod` components 内部的描述文件是资源元数据，不作为来源分类描述文件。**既有 auto 门槛不变**：campaign 所有层级的 package.json/metadata.txt（含资源内部及同名目录）都会阻止 auto；customize 仅 package.json 阻止 auto。因此内部 metadata 不改变类型，但仍可能阻止 campaign auto。
- 无外部描述文件时，只要存在任何资源外部的标准 `Maps/Campaign` 目录就分类 campaign；WOL 父目录涵盖 swarm、swarm/evolution、void、voidprologue、nova。匹配大小写不敏感，支持包装根，目录输入和归档显式目录条目中的空目录都计入；资源内部或普通名为 Campaign 的目录不计入。无官方目录才分类 customize。含多个战役、歧义布局或空官方目录的输入仍是 campaign，并由后端诊断不可安装，不退回 customize。
- 一次统一分析复用同一 `openSource`、归档哈希快照和描述文件内存缓存；分类不解压资源。目录描述文件在分析结束复核；安装继续复核源文件及目录布局、内容哈希与归档哈希。资源只在用户确认模式和冲突决策后批量解压。

## 2. 现有实现提取

| 现有源码                         | 已有行为                                                                          | 重构时的变化                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 原 compress-process.ts（已删除） | ZIP/7z 读取 metadata.json、metadata.txt，计算大小和文件树；SCNexus 包解压到本地库 | 读取器独立，新增文件夹输入；新标准读 package.json；分析不直接安装              |
| 原 ccmMetadataParser（已迁移）   | title、desc、author、campaign、version 转换成旧元数据                             | 提取独立 CCM 解析器；CCM 模式保留原文，SCNexus 模式生成 Package 与标准管理清单 |
| 原 ccm-process.ts（已删除）      | CCM 解压到 CustomCampaigns，模拟路径会把模组按 basename 移到 Mods                 | CCM 导入直接安装 Mods；保留受规则约束的模组层级，不再扁平化嵌套模组            |
| 原 campaign-util.ts（已删除）    | 四类战役目录、HOTS evolution、LOTV voidprologue 的复制和清理                      | 将布局提取为共享规则，预览与实际提交使用同一计划；不复制无关战役目录           |
| 原 campaign-active.ts（已删除）  | 激活、取消激活、恢复，活动目录读取 metadata.json/txt                              | 新包读取 package.json/txt；按实际安装清单更新状态，不泛化为整目录删除          |
| 原 campaign-manage.ts（已删除）  | 按四类扫描 SCNexusCampaign 和 Maps/CustomCampaigns                                | 一次发现再分类，坏包隔离；保留导入库与活动记录的区别                           |
| 原 customize-manage.ts（已删除） | 从库复制 Maps/Mods，安装后删除来源子目录；扫描库中 metadata.json                  | 明确安装计划和所有权，保留可管理清单，不删除用户拖入的源内容                   |
| 原 profile-store.ts（已删除）    | Windows 注册表/手动路径、执行文件路径、游戏目录与文档目录                         | scii-game-setting 重新检测，不硬编码版本；派生路径只读                         |

内容 Store 已改为 Package 与本地安装信息，数据版本为 2，旧索引备份并保留到 legacyRecords。无法可靠恢复文件归属的旧缓存不直接转为可删除的安装记录。

## 3. 战役定义与地图目录

战役包通过额外地图覆盖官方战役文件所在路径，让玩家从官方战役系统进入自定义体验。本设计管理的是磁盘额外覆盖内容，不直接修改游戏 CASC 数据，也不宣称复制文件会自动启动游戏。

以下均相对 GameRoot，依据重构前 campaign-util 与 Profile 路径提取的规则：

| 类型 | 主地图目录            | 关联地图目录                     | 隔离要求                                         |
| ---- | --------------------- | -------------------------------- | ------------------------------------------------ |
| WOL  | Maps\\Campaign        | 无                               | 不遍历/清理 swarm、void、voidprologue、nova 子树 |
| HOTS | Maps\\Campaign\\swarm | Maps\\Campaign\\swarm\\evolution | evolution 属于 HOTS，不能漏装或单独误删          |
| LOTV | Maps\\Campaign\\void  | Maps\\Campaign\\voidprologue     | 两个并列目录共同参与计划和统计                   |
| NCO  | Maps\\Campaign\\nova  | 无                               | 不影响其他三个类型                               |

package.json 或 metadata.txt 的**活动标记**放到主地图目录：WOL 的 Campaign、HOTS 的 swarm、LOTV 的 void、NCO 的 nova。LOTV 不把标记重复写到 voidprologue。

SCNexus 隐式覆盖地图的源布局与上述目录一一对应：/Maps/Campaign/...、/Maps/Campaign/swarm/...（含 evolution）、/Maps/Campaign/void/... 与 /Maps/Campaign/voidprologue/...、/Maps/Campaign/nova/...。

只识别选定 campaign 的 SC2Map 文件及 SC2Map components 目录。目录内普通辅助文件是否需整体复制不能凭扩展名猜测；未纳入规则的内容在预览中显示为未安装项。不得因 WOL 主目录包含其他战役目录而把其内容全部纳入 WOL。

## 4. SCNexus package.json

### 类型边界

新 Package 包含 scnid、name、description、tags、version、author、localization、网站/社交/赞助信息，type/campaign、maps/mods、dependencies、luancher、bank_enable/banks、manager 等字段；不再包含 manager_mode。

- type 使用小写 campaign/customize。虽然 PackageType 允许其他 string，当前安装只支持这两类。
- campaign 必须为 WOL/HOTS/LOTV/NCO，customize 不按战役根映射。
- scnid 是可选远程标识，不是本地唯一安装 ID；新记录不使用旧 snid 字段。
- 保留目前类型实际拼写 luancher、offcial。纠正拼写属于后续标准契约变更，本次文档不擅自改名。
- dependencies 是声明，不代表已经实现下载或依赖解析；预览须报告未满足依赖，不悄悄联网或安装。
- manager 只表示作者推荐：SCNexus 映射 scnexus，CCM 映射 ccm。推荐不替代用户选择，不决定持久化格式，也不阻止读取另一描述文件。推荐对应模式不可用或 manager 未提供时 recommendedMode=null，并可报告不可用原因；不自动改荐另一模式。
- 新类型已删除 manager_mode，不保留 default/strict 安装分支。manager 类型注释已同步为作者推荐语义。

### 路径规则

source_path 是包内逻辑路径，不是宿主绝对路径；其开头 / 表示定位后的包根，不表示磁盘根。直接布局的包根为输入根；嵌套布局的包根为有效描述文件所在目录。定位结果明确返回 rootRelativePath 和 descriptorPath，原始 sourceTree 保留全部输入层级。

例如归档条目 Project/Maps/Demo/Entry.SC2Map，描述文件位于 Project/package.json：包内 source_path 仍写 /Maps/Demo/Entry.SC2Map，读取器在包根 Project 下解析；缺省 target_path 为 /Maps/Demo/Entry.SC2Map，实际目标不包含 Project。此规则替代前一版强制以原归档根解析的限制。文件夹输入使用同样规则。

- source_path 和 target_path 都必须以 /Maps/ 或 /Mods/ 开头。
- target_path 缺省等于 source_path，不另做未经确认的默认目录推导。
- maps 资源应是 SC2Map（单文件或 components），mods 资源应是 SC2Mod；类别、路径前缀与实际资源需要一致。
- 禁止路径穿越、盘符、UNC、NUL；拼接后验证真实目录边界，处理链接/重解析点，不只用字符串 startsWith。
- Windows 实际目标用反斜线，清单与归档逻辑路径使用 /；统一正规化后检查大小写不敏感冲突。

### campaign 与 customize 的声明差异

**campaign**：先按标准战役布局收集隐式覆盖地图，再合并 maps/mods 中的额外资源。无需把每张战役地图重复写在 maps。重复声明相同资源去重，目标冲突不覆盖用户选择的其他资源；额外地图不得借配置覆盖别的战役类型。

**customize**：maps/mods 声明全部需安装资源；未声明文件只展示在源树，不参与实际复制。不能安装整个 Mods/Maps 目录来替代清单。

SCNexus customize 示例：

```json
{
  "name": "示例作品",
  "description": "自制地图与配套模组",
  "version": "1.0.0",
  "author": "创作者",
  "type": "customize",
  "maps": [{ "name": "Entry.SC2Map", "source_path": "/Maps/Demo/Entry.SC2Map" }],
  "mods": [
    {
      "name": "Core.SC2Mod",
      "source_path": "/Mods/Demo/Core.SC2Mod",
      "target_path": "/Mods/Demo/Core.SC2Mod"
    }
  ],
  "luancher": { "name": "Entry.SC2Map" }
}
```

省略 target_path 的 Entry 安装到 GameRoot\\Maps\\Demo\\Entry.SC2Map。campaign 的最小信息还需 campaign 字段，覆盖地图由相应标准布局确定；无额外资源时 maps/mods 可以省略。

## 5. CCM metadata.txt

### 信息转换

以旧 ccmMetadataParser 的五个字段为起点：

| metadata.txt | 内部 Package 字段          |
| ------------ | -------------------------- |
| title        | name                       |
| desc         | description                |
| author       | author                     |
| campaign     | campaign，转大写并验证四类 |
| version      | version                    |

内部固定 type=campaign、manager=CCM，bank_enable 暂沿用 offcial。不能凭空补造 scnid、依赖、入口地图和丰富信息。读取保留原始字节、编码和文件位置，转换后的 Package 与原文分开。

解析每行以第一个 = 分隔，支持 CRLF/LF，不截断值中的 =。缺失信息、编码失败和无效 campaign 给出诊断；哪些描述字段允许为空在标准校验中统一确定，不用不可靠的强制转换绕过检查。

### 地图和模组布局

CCM 内容根为最外层有效 metadata.txt 的父目录，按第 6 节发现规则自动深入定位。它与 package.json 的包根分别记录；两种文件并存时分别解析，不以其中一种屏蔽另一种，也不合并来自不同包根的资源。

- 内容根直接的 SC2Map → 该 campaign 主地图目录，同名保留。
- HOTS 内容根 evolution 内 SC2Map → swarm\\evolution。
- LOTV 内容根 voidprologue 内 SC2Map → Campaign\\voidprologue。
- 内容根直接的 SC2Mod → GameRoot\\Mods\\同名模组。
- 内容根 Mods\\子目录\\模组 → GameRoot\\Mods\\子目录\\模组，保留层级。
- components 的 SC2Map/SC2Mod 目录是一个逻辑资源，安装时递归复制内部文件；不能把其中的普通文件当成独立模组。
- 其他任意嵌套路径不作为安装目标猜测依据，报告未映射资源。

CCM 例：

```text
内容根/
  metadata.txt
  Mission.SC2Map           → Maps/Campaign/swarm/Mission.SC2Map（HOTS）
  evolution/Evo.SC2Map     → Maps/Campaign/swarm/evolution/Evo.SC2Map
  Base.SC2Mod              → Mods/Base.SC2Mod
  Mods/Author/Core.SC2Mod  → Mods/Author/Core.SC2Mod
```

### 导入、激活与标记

CCM 导入到 GameRoot\\Maps\\CustomCampaigns\\<清洗后的 metadata.title>，保留地图、模组源副本和原 metadata.txt，并立即按已确认冲突决策安装 Mods；激活只复制地图及 metadata.txt。后续取消激活和卸载均不删除、不恢复这些 Mods。

用户选择 CCM 模式时，激活复制计划中的资源，并把 metadata.txt 原样放入该战役主目录，不生成 package.json。库里的原文不因为激活而移动/消耗。

### CCM 库目录命名与重复识别

库目录来自 metadata.txt 的 title，不来自归档文件名：去除 `<>:"/\\|?*` 与控制字符，清理首尾空白，内部空白逐个替换为下划线，去除尾随点；结果为空、Windows 保留设备名或超出通用 255 字节/字符限制则拒绝。保留中文与正常 Unicode 字符。目录名与内部 localId 分离，同名目录不能静默覆盖或追加 UUID。

分析返回 existingInstallations，按 scnexus/ccm/auto 分开列出已有记录的包信息、目录、描述文件路径和匹配依据：SCNexus 在同一游戏、同一业务类型、同一模式下按 scnid 相同**或**name 相同匹配；CCM 按 title 匹配，并检查清洗后的库目录，即使 Store 缺少记录也返回磁盘已有信息。campaign auto 按 SCNexus 规则检查重复内容，与 mode=scnexus 的持久化记录共享判定；customize auto 恒为 []。可返回多个匹配，不以其中一个覆盖其他记录。

安装前再次检查，已有相同包时明确拒绝并要求新分析，不自动升级或覆盖。CCM 扫描按管理目录保留已有内部 localId；没有旧记录时生成稳定路径标识，不把中文目录名当成内部 ID。已有 UUID 目录仍可扫描，不自动改动历史磁盘目录。

### CCM 输入采用 SCNexus 模式

有效 CCM campaign 包同时具备 SCNexus 转换能力，不依赖自动识别模式实现：解析五个描述字段，依据已确定的 CCM 地图/模组布局生成资源映射，再构建新的 Package 和 SCNexus 安装计划。

- 没有有效 package.json、但有有效 metadata.txt 时，modes.scnexus 使用 CCM 转换预览，modes.ccm 仍独立返回原格式预览。
- 已有有效 package.json 时，modes.scnexus 优先使用它；metadata.txt 独立提供 modes.ccm。信息有差异时保留各模式信息并报告差异，不用 CCM 覆盖有效标准清单。
- 转换将战役地图布置成标准隐式源树，额外资源明确写入 maps/mods；每项保留从 CCM 原内容根到标准逻辑资源的映射。生成 Package 的 source_path 指向标准化暂存/导入 payload，不伪造原输入不存在的 /Maps 或 /Mods 条目。
- SCNexus 导入在 SCNexusCustomizeData 保存生成的 package.json、安装文件清单和 metadata.txt 原文副本；激活时写 package.json，不把原文副本作为活动 CCM 标记。
- 用户仍选择 CCM 时沿用 CCM 持久化规则。来源是 metadata.txt 不等于最终必须使用 CCM 管理。
- 推荐只来自有效 package.json 中的作者 manager；CCM 转换可携带历史格式来源，但不能因内部补入 manager=CCM 就伪造一条作者推荐。

CCM 模式管理、重建和取消激活以 metadata.txt 及战役地图布局为依据。metadata.txt 无法恢复 Mod 清单是用户选择 CCM 模式接受的限制，前端在选择前明确提示。设计层面不再推断 Mod 归属、不补充 ownershipIncomplete 状态、不要求从库副本恢复 Mod，也不为此生成 package.json 或附加恢复清单；重新扫描后不会自动恢复或删除无法记录的 Mods。SCNexus 模式的安装清单管理不受此限制。

## 6. 输入分析与独立解析层

### 分层

```text
输入压缩包 / 文件夹
  ↓ content-source：文件树、读取文本、流读取、暂存复制
  ↓ package-parser / ccm-parser / auto-detector（campaign 无描述文件识别）
  ↓ campaign 或 customize：资源映射与目标安装计划
  ↓ renderer 展示并选择
```

content-source 与格式解析不依赖 campaign/customize Store，不直接操作窗口、安装目标或用户源文件。归档/目录提供一致条目，格式解析器只解释内容；campaign/customize 保留各自安装规则与生命周期。

已为本地调用的独立文件能力设置 content-package 模块（index.ts、content-package.ipc.ts、content-package.ts，额外 source/parser 文件按需），格式纯契约可放 standard，桥接 DTO 放 app-shared；不在 preload 放解压或解析业务。自动识别逻辑位于 auto-detector.ts；只接受无描述文件且可唯一推断的标准战役目录，不临时指定 campaign，也不根据地图名称猜测类型。customize 自动识别仍返回 null。

### 最外层有效描述文件与默认包根

package.json 与 metadata.txt 独立发现：从输入根按深度由浅到深扫描，校验候选描述及该模式所需资源映射，选择对应格式的最浅有效候选，描述文件父目录即该模式默认包根。不能只因为文件同名、JSON 可解析就认定有效包，也不因根部存在无效文件而停止向下定位。

```text
直接布局：                 嵌套布局：
输入根/                   输入根/
  Mods/                     Project/
  Maps/                       Mods/
  package.json                Maps/
                              package.json
包根 = 输入根             包根 = 输入根/Project
rootRelativePath = ""      rootRelativePath = "Project"
```

- 同时存在两种描述文件时，都读取：scnexus 优先有效 package.json，ccm 使用有效 metadata.txt；没有有效标准清单时 campaign 的 scnexus 可由 CCM 转换。
- 一个格式的最外层有效候选不会阻断另一格式定位。不同模式可以有不同包根，预览须明确显示，不能互相借用文件。
- 外层无效、内层有效：返回内层预览及外层诊断。有效外层存在时，内层同格式描述不成为默认选择。
- 同深度有多个独立有效包时，不按目录枚举顺序随机取第一项；返回候选列表和选择诊断，在用户明确根之前对应模式为 null。选择多包的后续交互仍待设计。
- 不深入 SC2Map/SC2Mod components、其他归档内部或越界链接寻找包描述，不把资源内部同名文件当成包。
- 包根、描述位置和转换来源随 analysisId 保存，安装使用相同定位，不在执行时重新 first match。

### 分析返回（目标 DTO 示意）

```ts
type InstallMode = 'scnexus' | 'ccm' | 'auto'

type ConflictFile = {
  name: string
  path: string
  modifiedAt: number | null
  bytes: number
}

type ConflictEntry = {
  conflictId: string
  type: 'map' | 'mod'
  incoming: ConflictFile
  local: ConflictFile
}

type ModeConflicts = {
  mode: InstallMode
  files: ConflictEntry[]
}

type AnalysisResult = {
  analysisId: string
  contentType: 'campaign' | 'customize'
  source: { kind: 'archive' | 'directory'; path: string }
  sourceTree: FileTree
  sourceStats: { fileCount: number; bytes: number; compressedBytes?: number }
  modes: {
    scnexus: InstallPreview | null
    ccm: InstallPreview | null
    auto: InstallPreview | null
  }
  recommendedMode: InstallMode | null
  existingInstallations: {
    scnexus: ExistingInstallation[]
    ccm: ExistingInstallation[]
    auto: ExistingInstallation[]
  }
  conflicts: ModeConflicts[]
  diagnostics: ModeDiagnostic[]
}
```

这些契约已在 app-shared 定义。FileTree、InstallPreview、ModeDiagnostic 当前返回：每种可用预览含内部 Package、安装方式、rootRelativePath、descriptorPath、描述来源（package-json/ccm-converted/metadata-txt）、资源映射清单、目标树、数量/大小、依赖及警告。conflicts 按 mode 区分，推荐为空时不替用户自动选择。SCNexus 与自动模式的持久化格式为 SCNexus；CCM 保留 CCM 格式。

- renderer 通过 IPC 传入**作品类型、输入形式和路径**；主进程核实存在性、目录/归档类型和允许访问范围。
- campaign 独立读取 package.json、metadata.txt：返回标准或 CCM 转换的 scnexus 预览、原 CCM 的 ccm 预览；来源中无任何描述文件时，才尝试生成 auto 预览；customize 只支持自制作品 package.json 和 auto，ccm 恒为 null，不能把 CCM 战役转换伪装为 customize。
- 某模式无法使用返回 null；诊断分开携带原因。缺少描述文件不是整个分析失败，一个模式 JSON 错误不阻断其他模式。
- 无法读取输入或游戏环境不可用等全局错误使用统一 IpcResult，不伪装为三种 null。
- sourceTree 是输入结构；各模式 targetTree 是具体目标结构，不能复用输入树假装预览。
- 预览不是批准实际写入；安装时重验 source 和游戏配置修订，源变化/路径变化必须重新分析。
- 用户提交 analysisId + mode，以及该模式 conflictId 对应的 overwrite/keep 决策；cancel 不开始或终止操作。不从 renderer 回传一套可信的绝对目标路径或修改过的 Package。

### Maps 与 Mods 冲突信息与逐文件选择

conflicts 按 mode 分组，每个模式最多一组；没有冲突的模式可以省略，全部无冲突时返回 []。每组 files 包含目标 Maps/Mods 资源与已存在本地资源的冲突对，每项有独立 conflictId 和 type（map/mod），覆盖、保留决策针对每项完整资源，不针对整个模式分组。

incoming/local 都包含名称、路径、修改时间和字节数。incoming.path 为原输入相对资源根（包含外层 Project 等前缀），local.path 为实际游戏目标资源根绝对路径；两侧通过安装计划关联，不能仅按 basename 判断冲突。`.SC2Map` / `.SC2Mod` 可以是单文件或组文件夹（components）；组文件夹内所有条目继承所属资源类型，合并为一个冲突项，字节数为内部物理文件合计。

conflictId 在一次 analysisId 内跨所有模式的 files 项唯一，绑定模式、源条目和目标文件；不能由 renderer 用路径构造。提交示意：

```ts
type ConflictDecision = {
  conflictId: string
  action: 'overwrite' | 'keep'
}

// 用户取消时不提交安装，或发起本次操作的取消请求。
type InstallSelection = {
  analysisId: string
  mode: InstallMode
  decisions: ConflictDecision[]
}
```

同一组可以对一个文件覆盖、另一个文件保留。cancel 终止本次操作，不是某个文件的“跳过”决策。

modifiedAt 为 Unix 毫秒时间戳，归档未提供时用 null；不得用分析时间伪造文件时间。时间和大小是展示与变化检测依据，不证明内容相同；需要确认字节一致时另行比较内容摘要。没有可靠一致性证据的目标碰撞仍返回冲突，不默认覆盖。

用户选择针对选定模式的每个冲突，主进程保存最终决策：

| 决策              | 行为                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| overwrite（覆盖） | 使用新文件，先备份本地旧文件再提交；保留恢复和原所有权信息                          |
| keep（保留）      | 保留本地文件，不复制相冲突的新文件；记录为复用/保留，不宣称拥有本地文件的独占删除权 |
| cancel（取消）    | 不开始目标写入，或停止并回滚已经进入提交的本次操作；不将操作写为成功                |

- 未决冲突禁止开始修改。用户不能提交其他模式的 conflictId，未知、重复或过期决策需重新确认。
- SCNexus campaign 导入不修改活动 Maps/Mods；其分析返回预计激活冲突，实际激活重新确认。CCM 导入只提示本次直接安装的 Mod 冲突，激活阶段另提示 Map 冲突。实际自动/手动激活都重新核对现场，不能把导入时的授权无限期复用。customize 在实际安装前同样复核。
- 源和目标在预览后变化时，刷新相关冲突并要求重新决定；不按旧时间、大小直接覆盖。任务期间使用互斥锁防止应用内并行写入，但仍检查外部变化。
- components 以完整资源目录作为操作边界，覆盖替换整组而非合并旧文件，保留则保留完整本地组；支持单文件与目录两种形态互换。目录摘要包含内部文件内容和目录布局，内部新增、删除或修改都使已有冲突预览失效。同一分析计划内部两个源映射到同一目标属于计划冲突，不能当“新文件/本地文件”让用户随意解决。
- targetTree 与本次操作结果标识实际决策（copied/replaced/kept）。SCNexus 安装清单及 Store 保存这些结果；CCM 导入可在当前 Store 记录本次安装 Mods 信息，但不增加持久化 Mod 恢复清单，不承诺扫描重建该信息。keep 的字节不计为本次复制量，不能据此遗漏目标整体大小。
- SCNexus 自制作品扫描在过滤缺失条目前，先将历史混合所有权资源组统一降为 kept；因此即使原 kept 条目缺失，存留条目仍保留整组不可删除的事实，不把用户新增文件纳入删除范围。扫描先检查资源根的单文件/目录形态；与清单不符时保留原安装记录并报告该资源诊断，继续扫描其他包，不按目录调用 readFile，也不推断新的所有权。
- SCNexus 卸载/取消激活时按完整资源遍历其他已激活战役与已安装 customize 维护表；官方战役覆盖地图不做引用确认，其余资源只有被其他内容引用时才返回逐资源保留/删除选择，未被引用的资源整组移除。旧记录若同一组存在 kept 内部文件，保守保留整个资源，不扩大历史删除权限。customize 卸载不自动恢复安装前文件；CCM 的 Mod 管理恢复不纳入此设计目标。
- SCNexus 激活在管理目录的 `.activation-backup` 保存被覆盖的完整资源及原始文件/目录形态，并在 `active-manifest.json` 保存受控恢复映射。取消激活恢复原资源，没有旧资源时整组移除；提交失败回滚完整资源。扫描及移除执行前必须重新校验活动记录的模式、战役、标记路径、资源类型、Maps/Mods 目标及其对安装计划资源组的归属，备份只能关联该安装实际写入的资源及受控备份目录，不能仅以游戏根目录边界作为授权依据。
- CCM 不生成、不读取、不恢复 `active-manifest.json` 或 `.activation-backup`；已有同名文件不作为可信状态，也不主动清理。仅操作期间保留临时事务备份，失败时回滚，成功后清理。取消激活删除本应用写入的地图而不恢复激活前内容，保留用户选择 kept 的完整资源，Mods 仍不参与删除与恢复。
- CCM 扫描优先使用本应用活动索引与当前元数据匹配的安装 ID，保留 copied/replaced/kept 决策，即使库中存在同元数据副本也不丢失活动关联。没有可信索引的库包地图保守标记 kept，不推断删除权；多个同元数据包无法确定活动归属时报告诊断，不创建可破坏性操作的外部记录。仅有旧索引、没有备份的 SCNexus 活动记录不凭空恢复原文件。进程突然终止时的完整事务重放仍不在当前保证内。

### 文件数和大小口径

源统计与每种预览同时展示两种数量：标准文件数量按全部物理文件计数（组文件夹中的每个文件单独计数）；识别文件数量将 `.SC2Map` / `.SC2Mod` 组文件夹整体计为一个资源，普通文件仍各计一个。`fileCount` 保持标准数量的原有含义；识别数量由完整资源路径去重推导，不向旧 Store 添加必填字段。文件树仍展示内部结构，安装进度按实际提交文件计数。每模式 installStats 只统计计划资源（不把压缩包大小当安装大小），分别表达目标有效载荷、管理清单开销及暂存/备份空间需求。导入库大小与激活复制大小分开。压缩格式无法可靠取得压缩大小时用缺省字段，不填 0 伪造。

## 7. 用户流程与操作语义

```text
拖入文件夹/压缩包 → 分析三个/两个模式 → 展示源树与各目标树
→ 选择可用模式 → 安装/导入 → Store 更新
```

campaign 后续：

```text
导入成功
  ├─ 玩家选择自动激活 → renderer 发起独立 activate
  └─ 玩家选择手动激活 → 仅保留库记录
激活成功 → 玩家另行启动游戏（可由界面串联）
```

- 导入成功但激活失败：库记录仍存在，活动状态不能写成成功，单独反馈两步结果。
- customize 安装将全部声明资源复制到目标并更新作品 Store，无战役 active 集合。
- 所有复制保留用户拖入的原压缩包/文件夹；不能像旧流程一样删除源 Maps/Mods。
- 同一游戏环境的修改互斥，任务固定配置修订；扫描不得在目录修改一半时直接重建索引。
- 安装前暂存、校验、备份；提交资源与标记后更新 Store，失败恢复。磁盘提交后 Store 写入失败要报告可重建状态，不能当作完全没发生。
- 卸载库和取消激活是两个操作；活动包要先取消或明确拒绝库卸载，不留下无来源活动状态。
- uninstall/deactivate 不按 Package.name 删除整目录；按本地 ID 和已核实的文件清单处理，保留其他作品或用户改动的共享文件。

## 8. SCNexus 管理目录及标记

游戏根目录下新建统一管理目录，campaign/customize 的业务模块仍分开：

```text
GameRoot\\SCNexusCustomizeData\\<localId>\\
  package.json              标准清单、CCM转SCNexus生成清单或未来自动生成清单
  install-manifest.json     main 维护的阶段、实际文件映射和所有权
  metadata.txt              有 CCM 来源副本时原样保留，不凭空生成
  payload\\                 战役导入资源（布局和名称待实施确定）
```

payload 仅用于需要留存内容以供激活/重装的场景，不要求 customize 每次重复保存全部安装内容。install-manifest 记录 type、mode、来源格式、campaign、游戏配置修订、本地 ID、管理路径、导入与激活目标、物理文件统计等；它是应用本地记录，不扩充发布 Package 为宿主绝对路径集合。

- SCNexus campaign 导入时清单在管理目录；激活时另把 package.json 复制到战役主地图目录。
- SCNexus customize 的权威管理清单在本地管理目录，实际 Maps/Mods 按计划分散安装，不把 package.json 复制到每个资源旁制造多重记录。
- SCNexus/auto 管理目录若有 CCM 原文副本，记录来源与原位置；副本不自动成为另一个 CCM 安装。
- CCM 格式本身不创建上述 package.json 管理记录；导入库保留 metadata.txt，活动标记也是 metadata.txt。
- 重建时，若同一位置两种活动标记同时存在视为冲突，不按读到先后决定当前战役。
- localId 使用应用生成的稳定 ID，不等同 scnid，也不把同名不同作者/版本误合并。

## 9. Store 重构与重建扫描

四类 Store 使用 electron-store schema、自定义迁移、_schemaVersion/_revision，新模型已实现：

| Store             | 内容                                                        |
| ----------------- | ----------------------------------------------------------- |
| customize         | 新 Package 与本地自制作品安装记录                           |
| campaign          | 按四类组织的导入包记录，格式为 SCNexus/CCM，不能代表已激活  |
| campaign-active   | 四类活动槽位，关联本地包或扫描发现的外部记录及当前文件/标记 |
| scii-game-setting | 游戏根、实际检测/派生目录能力及配置修订，替代旧 profile     |

每个内容记录分离：

```text
localId
package                  新 Package 内容，不混入本机地址
format / selectedMode    最终格式与用户选择的解析模式
source / rootRelativePath 输入形式/位置与逻辑根
ccmOriginal              可选CCM原文及编码副本
localInfo
  managementDirectory / packageFile / ccmMetadataFile
  libraryDirectory       campaign 导入库
  installedFiles         逻辑源路径、游戏相对目标、实际绝对地址、资源类别
  sourceTree / targetTree
  fileCount / bytes      明确统计口径
  importedAt / installedAt / activatedAt（适用时）
```

状态更新以阶段实际成功为准。active 不重复保存另一份可独立编辑的 Package，可引用库 localId；外部扫描无法关联库时保留独立发现记录，并明确来源缺失。

**扫描重建流程**：用户发起 → 锁定游戏环境快照 → 发现管理目录与活动/CCM库标记 → 独立解析 → 实际文件核实与统计 → 生成候选集合和 diagnostics → 原子更新各 Store。

- 首先扫描 SCNexusCustomizeData 和 Maps/CustomCampaigns 的包目录，再核实四类活动目录；也支持发现允许游戏目录中的 package.json/metadata.txt 作为外部记录。
- CCM 扫描兼容其他管理器产生的多层包装目录，例如 `Maps/CustomCampaigns/战役名/战役名/metadata.txt`：在未找到 metadata.txt 的目录中继续向下查找，以标记所在目录作为管理和地图源根目录；找到标记后不再拆分其子目录。激活、取消激活和卸载均使用实际包根，卸载不删除外层包装目录或兄弟包；目录边界和符号链接限制保持不变。
- 不进入 SC2Map/SC2Mod components 内部把同名 JSON 当成包，也不把安装清单附带的 CCM 副本再识别为独立包。
- 管理目录清单帮助恢复 localId、完整资源映射；孤立 Package 可以恢复部分信息，但不能凭空重建原归档来源或隐式地图原始归属。
- CCM 解析 metadata.txt 与该战役地图布局重建记录，不恢复 Mod 清单，也不设置额外 Mod 归属状态；这项限制由前端说明，不属于扫描恢复目标。
- 坏包隔离报告。扫描中权限/读取失败的范围不能等价于空目录，必须保留对应旧记录或中止该范围更新。
- 多个描述文件/多个活动标记/重复目标产生冲突记录，不能以名称覆盖或随机 first match。
- 源文件树和原CCM副本无法由安装后磁盘完全还原时标记缺失，不伪造历史；现场重新统计的目标树可以重建。

旧 MetadataInformated → Package 的迁移明确 Campaign/Customize 到小写 type、snid 到 scnid、metadata_path 拆分为具体文件地址；不能把 metadata_path 有时为目录的旧记录当作稳定文件路径直接使用。只从旧缓存转换不了的新规则，应扫描重建并标记需确认。

## 10. scii-game-setting 获取方式

profile Store/模块已更名为 scii-game-setting，新 IPC 与 preload 已同步；legacyProfile 转换及全部 profile:* IPC/preload 接口已删除，只使用 window.scnexus.gameSetting。原 store-profile.json 的一次迁移仍保留，不提供旧配置运行接口：首次迁移复制为 store-scii-game-setting.json 后转换，不继续写回旧文件。customizeDataRoot 是由 gameRoot 推导的 Store 只读字段，实际目录名仍为 SCNexusCustomizeData。游戏配置数据版本已升至 3，将 v2 的 SCNEXUS_CUTOMIZE_DATA_ROOT 迁为 customizeDataRoot；迁移前备份并保留 gameRoot、documentRoot、confirmedAt 与 _revision。

- 保存用户确认的 gameRoot，检测候选顺序为手动输入、已保存路径、Windows 注册表发现。每次实际使用前确认环境有效，失败不把已保存好配置清空。
- 注册表发现仍参考 HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StarCraft II 的 InstallLocation。
- 派生 Maps/Mods、四类 Campaign 根与关联目录、SCNexusCustomizeData、CCM库；不允许用户任意修改派生目标或安全白名单。
- 文档目录从 Electron documents 路径派生 StarCraft II、Banks、ArcadeBanks，不与游戏根混用。
- 当前优先明确客户端、Switcher、编辑器及所有安装相关路径，以实际文件检测输出能力。游戏版本获取方式尚未确定，不实现猜测检测、不沿用硬编码 5.0.11.90136，也不让版本缺失阻断路径配置与分析；模型若保留 gameVersion，用 null/unknown 表示未知（当前快照不增加该字段）。版本检测留待独立设计。
- 路径来源、规范化路径、检测时间、可用能力是读取快照；环境状态不等同持久化历史 SUCCESS=true。
- 游戏目录切换验证后整体提交，递增配置修订，使分析和内容缓存失效；互斥任务执行中拒绝切换。
- store-profile.json 更名/迁移方案须备份并防止双文件事实来源，不能新建空 Store 后遗失已有游戏目录。

## 11. 后续实施与验收

1. 完善 standard/package 的公开导出及运行时校验，落实已移除 manager_mode 和 manager 作者推荐语义；不改变用户未确认的其他标准字段。
2. 建立独立 archive/directory 输入和两种描述解析；自动识别预留 null。
3. scii-game-setting 与新内容 Store schema/迁移，保留旧数据与兼容入口。
4. 分析 IPC + 同源同目标规则预览，所有路径和冲突校验先于写入。
5. SCNexus/CCM 战役导入与独立激活、自制作品安装；持久化格式跟随选定模式。
6. 扫描、取消激活、卸载和失败恢复，共用解析/计划规则但不合并业务模块。

Vitest 用例位于所属模块 **test**：两种输入形式、三/两种模式及null、双描述独立解析、外层有效优先/外层无效深入、包根重定位、CCM转SCNexus及原文保留、推荐为空/不可用、冲突字段与覆盖/保留/取消/现场变化、components逐文件冲突、路径缺省/越界、WOL隔离、HOTS evolution、LOTV双目录、CCM嵌套Mods、导入不触碰游戏活动文件、用户源不删除、安装与Store失败、扫描副本去重与权限失败、旧字段迁移。

## 12. 当前实现、验证与限制

- [content-package](../packages/app-main/src/modules/content-package/index.ts)：目录/ZIP/7z 输入、包根定位、SCNexus/CCM 解析与转换、按模式冲突分析、可取消预览和任务、复制回滚、扫描重建。
- [campaign](../packages/app-main/src/modules/campaign/index.ts) 与 [customize](../packages/app-main/src/modules/customize/index.ts)：业务入口独立；调用统一文件能力。campaign 支持导入、准备激活、激活、准备取消激活、取消激活、准备卸载、卸载；customize 无激活步骤。
- [scii-game-setting](../packages/app-main/src/modules/scii-game-setting/index.ts)：手动/保存路径/Windows 注册表、执行能力和路径派生；不硬编码游戏版本。
- [共享契约](../packages/app-shared/src/types/content.type.ts)：Package、AnalysisResult、安装记录、活动记录、移除预览及选择；[preload](../packages/app-preload/src/desktop.ts) 暴露完整受控 API，不含本地文件业务。
- 分析 ID、激活 ID、移除 ID 在 main 保存，30 分钟有效；修改游戏路径、源内容/目标内容、维护表修订变化时拒绝过期操作。不同业务入口不能混用 ID。
- 同类型已有活动战役时需先取消激活再激活新包，不静默移除共享文件。renderer 可串联操作但要处理两阶段失败。
- 文件提交使用磁盘备份及原子替换，异常/取消回滚；卸载管理目录先暂存移动，Store 提交失败恢复。回滚失败保留恢复文件。尚未实现进程骤停后的自动事务恢复，不将正常异常回滚描述为崩溃事务保证。
- 扫描管理清单、CCM 库、四类活动标记及 Maps/Mods 中的外部描述；损坏项隔离并保留可关联旧记录，权限错误不当作目录为空。CCM 扫描不重建 Mods；外部内容无完整来源时不能自动重新激活。
- 旧安装/激活写入 channel 明确拒绝并要求新预览确认，避免绕过冲突选择；查询保留适配。renderer-v2 安装界面尚未实现，旧 UI 的直接安装动作不能继续绕过新规则。
- 自动识别与依赖自动下载仍未实现；auto=null。多同层有效包返回不可用诊断；尚未增加交互选包根接口。
- 未传出 `-mcp`，无 UTF-8 标志的 ZIP 名称按系统代码页解码；该兼容缺口见第 13 节，已决定本轮不实现。现有中文 ZIP 测试只覆盖 GBK 归档在 936 系统上的情况。
- 本轮测试使用独立临时游戏目录和假的启动文件，不操作真实游戏、不发遥测。

验证记录：

| 命令/检查                               | 结果                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm run typecheck:main`               | 通过                                                                                                               |
| `pnpm run typecheck:preload`            | 通过                                                                                                               |
| `pnpm run test:main`                    | 11 个文件、49 项 Vitest 通过；含真实 ZIP/7z、Store 迁移、文件回滚、扫描、两阶段与共享引用                          |
| `pnpm run build:main`                   | 通过；原 __dirname 配置提示仍存在                                                                                  |
| `pnpm run build:preload`                | 通过                                                                                                               |
| `pnpm --filter @scnexus/standard build` | 通过；初次因遗留失效 tsup shim 失败，清理生成的无效 shim 后正常入口通过，生成 package/metadata 的 ESM/CJS/类型产物 |
| Electron 44 隔离页面真实 IPC 冒烟       | 路径迁移、分析、导入、激活、扫描、取消激活、卸载全部通过；未验证 v2 UI                                             |

后续范围：真实 SC2 内容验证、大型 ZIP 读取的事件循环性能、打包后外部二进制路径验证、进程中断恢复，以及非 Windows 发现能力。CCM Mod 不恢复是已确认行为，不列为待解决问题。

## 13. 归档读取统一与历史编码逻辑

归档统一使用 7z 完成 ZIP/7z 等格式的列举与条目读取；已删除 AdmZip 分支、工具及直接依赖。工坊原 metadata.json 写入行为保持不变，但改用暂存副本上的 7z 删除/添加，成功后替换原归档，不顺带修改工坊协议。

历史 chardet 的主要用途是 ZIP 文件名编码兼容：旧 readCompressFileInfo 对 AdmZip 的 rawEntryName 调用 analyse，匹配 GB18030 或中文 lang 且 confidence>=10 时，把整包 fn_encoding 设为 gb18030；compressing 解压时使用 zipFileNameEncoding。它也用描述条目的原始名字重算 CCM 根位置，但并非检测 metadata.txt 的文本内容。旧 7z 分支对 Buffer.from(data.file) 检测的是已经解码后的字符串重新编码，不保留原始名字字节，不能可靠推断归档编码。

新方案不恢复上述检测方式：7z 自行解析归档文件名，列表文本显式使用 -sccUTF-8；流读取将消息/进度与文件数据分流，且禁用条目通配匹配。CCM 描述正文仍独立采用严格 UTF-8，失败后 GB18030 解码。

### 已确认的缺口：无 UTF-8 标志的 ZIP 名称

ZIP 文件名在未设置通用标志位 bit 11 时是代码页字节，含义取决于打包环境；7z 不做检测，按当前系统代码页解码。统一到 7z 只解决了“列举与解压口径一致”，不解决代码页推断。

使用随包 7z 24.08 (x64) 在 ACP=936 机器上以同一中文名实测：

| 归档                | 默认（936）       | `-mcp=65001`                     | `-mcp=936` |
| ------------------- | ----------------- | -------------------------------- | ---------- |
| UTF-8 字节 + 标志位 | 正确              | 正确                             | 正确       |
| GBK 字节、无标志    | 正确              | 乱码（含 U+EFB5 一类私用区字符） | 正确       |
| UTF-8 字节、无标志  | 乱码（如 U+9366） | 正确                             | 乱码       |

同时确认：`-mcp` 虽未出现在 `7z -h`，但对 `l`、`x` 与 `x -so` 均生效；ZIP 的 UTF-8 标志优先于 `-mcp`，因此可以无条件传入而不破坏规范归档；解压与流读取必须传同一 `-mcp` 才能保持一致。

由此得出：

- 在启用「使用 Unicode UTF-8 提供全球语言支持」的 Windows（ACP=65001）上，上表第二行会反转，GBK 归档乱码。两种系统配置都会遇到不匹配的归档。
- 失败表现分为两类。SCNexus 的 source_path 来自 UTF-8 的 package.json，解码不一致时匹配不到资源，会明确报错；CCM 与自动识别依赖列表名称，会静默安装成乱码文件名。
- 当前实现未传 `-mcp`，因此该缺口真实存在。现有中文 ZIP 测试只覆盖“GBK 归档 + 936 机器”，属于测试盲区，不能视为已兼容。

**决定：本轮不实现编码协商**，仅记录结论。若后续实现，方向是“每归档选定一个代码页，并对其全部 7z 调用传入同一 `-mcp`”，而不是恢复 chardet：优先自行读取 ZIP 中央目录的原始名字节做确定性判定（有标志用 UTF-8，否则严格 UTF-8 尝试，再否则 GB18030），备选方案是默认列名后按私用区/替换字符与声明路径命中情况在 65001 与 936 之间重试选优。两种方案都需保留 -sccUTF-8，并补双向测试（可在任意 ACP 机器上用显式 `-mcp` 模拟另一种系统）。

新增真实测试覆盖无 UTF-8 标记、无 Unicode 扩展字段的 GBK 中文 ZIP 名称（当前 Windows 环境正确列举并读回），中文工坊资源和描述替换，以及 CCM 正文编码。这不保证所有平台/所有历史编码都能自动判断；ZIP 未声明编码时依赖 7z 的默认解码策略，跨平台或其他代码页需补实际样本后决定显式 -mcp 配置，而不是检测已解码字符串。

## 14. 相关文档

- [整体架构](./architecture.md)
- [app-main 基础模块与存储](./app-main-design.md)
- [错误与日志](./logging-and-errors.md)

### 同名目录描述文件损坏

CCM 分析检查目标目录存在后重新读取 metadata.txt，即使 Store 有记录也验证磁盘描述文件。无法解析或缺失时，existingInstallations 项返回 package=null、已有目录和描述文件路径、diagnostic（M034：已存在同名内容，但信息无法解析），不拿本次输入信息冒充已有信息，不中断其他模式分析。权限或设备读写失败仍作为真实错误返回。安装继续拒绝占用目录，不自动覆盖。

2026-10-08 收尾：标题目录、重复识别、customizeDataRoot v3 迁移、游戏初始化恢复及更新/窗口/设置/遥测模拟回归已补充。真实游戏、NSIS 更新、macOS 签名更新、ZIP 内部文件名代码页协商与崩溃恢复不在模拟验证结论内。

## renderer-v2 战役管理界面（2026-10-09）

新增 /campaign 路由与侧栏导航，使用 Nuxt UI 重新实现 WOL/HOTS/LOTV/NCO 分类与紧凑列表，展示当前游戏的活动战役、包信息、管理目录、文件数量/大小和目标文件树。仅参考旧 renderer 的分类/详情设计，不沿用其组件与 Store。诺娃使用现有 NCO LOGO 素材（没有独立 thumbnail）。

本地闭环：选择压缩包/目录或拖放单个输入 → analyze → 独立展示模式、推荐、诊断、重复安装、源树/目标树 → 展示每个 Map/Mod 冲突并允许调整默认覆盖决策 → install。auto 不可用时禁用，不模拟安装；已有相同内容时禁止重复确认。CCM 提示导入即安装 Mods，后续取消激活/卸载不管理这些 Mods。

激活使用 prepareActivation/activate；取消激活与卸载分别使用 prepareDeactivation/deactivate、prepareUninstall/uninstall。main 禁止在同类型仍有其他活动战役时直接激活、禁止直接卸载活动包；2026-10-11 的界面迭代提供先恢复再确认目标操作的连续流程，不绕过这些限制。共享删除须逐文件明确保留/删除。模态框关闭或页面卸载清理预览；安装失败保留预览以便重试，管理操作结束后关闭确认框并通过 toast 提示。文件树只展示，不从 renderer 操作游戏文件。

刷新重读索引和活动状态，扫描按用户指令重建并显示扫描诊断；按 gameRoot 过滤列表，避免显示另一个游戏环境的数据。无 preload 时本地操作不可用；无有效游戏目录时提供设置入口。扫描返回类型补齐，不再使用 unknown。

验证：v2 与 main/preload 类型检查通过；v2 构建通过；战役/IPC/语言与主进程内容定向测试 27 项通过。临时浏览器服务验证分类、无桥接状态、模拟包列表与激活冲突弹窗（未选择冲突时确认禁用）。浏览器模拟不代替真实 Electron 文件拖放、目录对话框及真实 SC2 包安装验收。临时服务验证后关闭。不包含工坊下载或游戏启动。

战役管理提供两种可切换布局：默认四大战役总览（本地横幅、当前活动包、作者版本/模式、库数量及选择管理/取消激活）；详细管理按分类显示当前包描述和完整库操作。总览选择管理自动切换到对应分类，两种布局共享同一个业务状态与分析/冲突/移除交互，不引入独立安装逻辑或持久化偏好。浏览器已验证总览四类显示与选择 LOTV 后进入详细管理，7 项业务/语言回归通过，v2 类型与构建通过。

### v1 操作组织对齐（2026-10-09）

简略模式四类当前战役展示名字、版本、作者及恢复/卸载。恢复指取消激活；活动包卸载先确认恢复，再确认卸载战役库，不能跳过共享文件决策。底部设置开始游戏按钮与拖入/选择安装交互区，两种模式共用。

详细模式顶部采用 link Tabs 与战役图片；左侧活动包摘要/版本/作者和操作，右侧描述、SCNID、统计、路径、网站、社交及赞助信息，下方保留战役库选择管理。简略/详情切换、刷新、重建通过 Teleport 放在应用标题栏右侧。切换模式不改变安装预览。

新增受控 campaign:launch，preload campaign.launch 与 renderer apiCampaignLaunch 接通；main 复用校验游戏路径后启动官方客户端的能力，不接受 renderer 自定义执行路径。启动错误沿用 M044。真实游戏启动仍需用户环境验证。

验证：三个包类型检查与 v2 构建通过；启动/战役/国际化定向测试 10 项通过；生产预览确认标题操作位置、两栏详细布局、四个 Tab 图标加载以及底部开始/安装区。临时预览服务结束后关闭。

界面交互纠正：简略卡片激活/切换直接打开对应类别包选择弹窗，不跳转详情；活动包显示名称版本作者及恢复/卸载，官方状态仅标签，不虚构版本作者。详情左栏居中，Tabs 小 Logo 24px、左栏大 Logo 128px，开始按钮在左栏；简略开始位于底部。底部主体为整块可点击/可拖入的安装区域，目录选择保留辅助小按钮；标题模式切换 size=xs。浏览器模拟活动包确认操作可见、详情启动位置正确，类型/构建和7项回归通过。

拖放与视觉修正：安装 drop 仅绑定安装区，非 Files 类型拖放与空路径忽略，所有界面图片禁止原生拖动；卡片横幅固定96px高，使用object-cover/object-top调整显示区域，不扩大卡片；详情Tabs使用缩略图，左侧面板单独使用大Logo。简略开始按钮独立居中高40px，不被安装区拉伸。安装区本地压缩包图标与两行文字，整体点击后选择压缩包或目录，删除旁边额外目录按钮。切换文案简化，恢复采用中性描边提高对比度，操作均带Tabler图标。生产浏览器确认四幅横幅未裁切、拖动标志false，内部图片/URI拖放没有P001；类型构建与9项回归通过。

### 连续安装与操作确认（2026-10-11）

CampaignView 只编排页面状态和通知，安装来源、详细管理、战役库、连续安装流程和操作确认分别由 CampaignSourcePicker、CampaignDetails、CampaignLibraryModal、CampaignInstallModal、CampaignOperationModal 承担。

选择来源后立即打开安装对话框：读取中 → 三模式预览（名称/类型/作者/版本、安装与来源统计、源树/目标树、冲突与模式诊断）→ 确认安装 → 文件进度 → 实际返回的安装结果与“立即激活”。不可用模式禁用；安装冲突默认覆盖，可统一或逐文件切换为保留；模式切换或重新打开流程按当前冲突清单重置为覆盖，不沿用其他模式的 conflictId。重复安装仍阻止确认。安装期间禁止关闭或重复提交。完成后可关闭而不激活，或继续进入激活确认。结果区区分战役库导入与游戏资源处理：SCNexus 导入不直接写入游戏资源，CCM 的 copied/replaced/kept 仅统计本次 Mods 处理，不冒充全部导入文件数。

真实进度通过 campaign.onInstallProgress 受控订阅返回。InstallSelection 的可选 taskId 用于关联本次请求；进度携带 analysisId、阶段、已完成/总文件数及当前路径，仅发给发起安装的 renderer。preparing/extracting 不显示文件数；extracting 的可选 `percent?: number` 只来自 7z 实际回调，缺省为不确定进度。copying/finalizing 的数量统计实际安装文件，包含 payload、游戏目标、描述和清单，不含选择保留的游戏目标、解压输出及备份；目录重命名提交后，其包含的安装文件逐项计数，不把重命名本身另算一项。文件百分比不代表字节进度或整个事务已提交。preparing/extracting/copying/finalizing/completed/failed 区分准备、解压、复制与提交；只有文件及持久化提交成功才报告完成；备份、暂存与选择列表的清理失败作为成功结果附带警告，不将已提交安装改报失败。renderer 在成功、失败和页面卸载时取消订阅，并忽略其他 taskId/analysisId 的事件。

归档性能与一致性：确认安装前仅列举条目、读取必要描述文件到内存，不解压到磁盘、不读资源正文或资源哈希。包根、模式、映射路径和冲突均从条目列表推导。归档本体流式 SHA256 在列举前/元数据读取后、安装解压前后及提交前复核，不能仅凭大小和 mtime 判断不变；目录来源保留资源哈希与布局复核。确认模式后生成精确文件清单：战役包括库 payload、CCM 原描述和标准描述所需内容；customize 排除选择保留的目标对应资源。使用 UTF-8 list file、`-spd`、`-r-` 和选项终止符执行一次批量 7z 解压，复核输出文件/目录、大小和链接，不允许额外条目。7z 的取消信号终止子进程，失败和取消均清理清单及隔离暂存。

暂存目录在游戏文件系统内。战役 payload 从解压目录移动到完整管理目录（CCM 转换保持标准 Maps/Mods 映射），写入描述文件、原始 CCM 正文及安装清单后，目录重命名提交，避免第二遍 payload 复制；目录输入则复制一次到该暂存。游戏 Maps/Mods 使用磁盘备份、文件复制和流式哈希的事务写入，在解压/暂存后重新核验目标冲突。Store 持久化失败或取消回滚资源和管理目录，回滚失败保留恢复备份并报告恢复错误。

激活、恢复、卸载均需二次确认，执行按钮显示 loading，成功或失败通过 toast 提示，结束后关闭确认框。切换已有活动战役或卸载活动包时，先确认恢复，再在恢复完成后生成目标操作预览并再次确认，避免使用恢复前的过期冲突信息；取消第二步不会重新激活旧包。共享删除仍须明确保留/删除。刷新/扫描及打开目录、网站、启动失败等操作反馈优先 toast，持久上下文警告与安装结果保留在对话框中。

浏览器模拟验证了三模式切换、预览元数据/双树、数量与百分比进度、安装结果、立即激活的二次确认与 loading，以及恢复/刷新 toast；无桥接环境保持禁用。模拟不代替真实 Electron 对话框、拖放和 SC2 安装验收。

本轮验证：

| 检查 | 命令与结果 |
| --- | --- |
| main 战役、安装进度与内容回归 | `pnpm --filter @scnexus/app-main test src\modules\content-package\__test__\content.test.ts src\modules\content-package\__test__\install-progress.test.ts src\modules\campaign\__test__\campaign.test.ts`：3 文件、23 项通过 |
| renderer 流程、IPC 与语言回归 | `pnpm -w exec vitest run --config packages\app-renderer-v2\vitest.config.ts campaign.test campaign-dialogs pages.test ipcs.test`：4 文件、23 项通过 |
| preload 订阅 | `pnpm --filter @scnexus/app-main exec vitest run -r ..\app-preload src\__test__\desktop.test.ts`：2 项通过 |
| 类型检查 | `pnpm run typecheck:main`、`pnpm run typecheck:preload`、`pnpm --filter @scnexus/app-renderer-v2 type-check`：均通过 |
| renderer 构建 | 包级 `pnpm --filter @scnexus/app-renderer-v2 build-only` 因本地失效 Vite shim 失败；使用已有根目录工具 `pnpm -w exec vite build --config packages\app-renderer-v2\vite.config.ts` 通过，未安装依赖或修改工具链 |
| 静态检查 | 变更文件定向 ESLint、renderer campaign 定向 oxlint 和 `git diff --check` 通过 |

### 安装入口与本地工具修正（2026-10-11）

安装区文案为“拖入或点击选择 压缩包 / 文件夹 进行安装”，保留“选择”后、斜线两侧以及“进行安装”前的空格。其中“压缩包”和“文件夹”为带下划线、可键盘操作的两个独立按钮，直接打开对应文件/目录选择器。区域其余位置不再可点击，不显示来源选择弹窗；保留悬浮边框/阴影与单文件拖放。选择器打开期间与操作禁用状态下，不允许重复选择。简体、繁体与英文使用插值保持点击入口与文案顺序一致。

包级 Vite/Vitest 失效源于切换到 `nodeLinker: hoisted` 后，包内残留旧 isolated 布局生成的 shim，遮蔽根目录有效命令。执行 `pnpm install --frozen-lockfile --offline --ignore-scripts` 恢复锁文件对应安装后，清理 renderer-v2 中仅指向不存在路径的 Vite/Vitest shim；未改构建脚本、依赖版本或锁文件。再次执行相同安装命令后，包级 Vite/Vitest 仍正常。该修复属于本地生成物清理，不需要提交 node_modules。

验证：`pnpm --filter @scnexus/app-renderer-v2 exec vite --version` 与 `exec vitest --version` 成功；`pnpm --filter @scnexus/app-renderer-v2 test:unit --run source-picker pages.test`：8 项通过；`pnpm --filter @scnexus/app-renderer-v2 type-check` 与 `build-only` 通过。入口组件和测试定向 ESLint/oxlint 通过；包级 dev 服务响应 HTTP 200，浏览器模拟确认两个下划线入口分别调用 openFile/openDirectory，且不打开来源弹窗，其他区域点击不执行操作。

### 批量归档安装验收（2026-10-11）

后端回归使用真实 ZIP 和 solid 7z。`archive-performance.test.ts` 验证预览仅读取描述、确认安装恰好一个 7z 子进程、CCM/转换映射、UTF-8 大清单与字面量名称、归档同大小/mtime 内容改变、分析/解压期间源变化、解压期间目标冲突改变、取消与 Store 失败回滚、清单/暂存清理。目录输入的导入、激活、恢复、卸载及内容变化检查沿用 content/recovery 回归。实际 7z 子进程覆盖预先中止信号及关闭后清理；解压中途取消用进度回调测试确认 AbortSignal 已中止，不等同于真实大归档运行中取消验收。进度解析按 CR/LF/backspace 分隔的完整记录匹配 0–100 的整数百分比，UTF-8 解码及跨 chunk 百分比保留缓冲；不伪造进度或保证每次 7z 都输出百分比。

约束：描述正文限制 1 MiB；预览单个描述读取超时 120 秒；确认后的批量解压超时 1200 秒。没有实测用户大型战役的耗时/峰值内存，不声称已测得加速比例；仍需真实游戏及大包验收。

| 范围 | 命令与结果 |
| --- | --- |
| main 内容、战役、共享 7z/工坊回归 | `pnpm --filter @scnexus/app-main test src\modules\content-package\__test__ src\modules\campaign\__test__\campaign.test.ts src\modules\workshop\__test__\workshop-archive.test.ts`：8 文件、60 项通过。现有工坊测试验证 ZIP 元数据替换保留资源，未修改该测试。运行时 TEMP/TMP 指向工作区，避免测试写系统临时目录。 |
| main/shared 类型 | `pnpm exec tsc --noEmit -p packages\app-main\tsconfig.json`、`pnpm exec tsc --noEmit -p packages\app-shared\tsconfig.json`：通过。 |
| 后端定向 lint | `pnpm exec oxlint -c .oxlintrc.json` / `pnpm exec eslint`，范围为 content-package 的 content-package.ts/source.ts/transaction.ts/paths.ts、新 archive-performance.test.ts、utils/7zip-wrapper 及共享 content.type.ts：通过；不将已有 legacy tests/scanner 的全目录 lint 问题归为本轮已修复。 |
| renderer-v2 类型 | `pnpm --filter @scnexus/app-renderer-v2 type-check`：通过（集成协调方验证）。 |
| IPC/main 编排类型 | `pnpm run typecheck:preload`、`pnpm run typecheck:main`：通过（集成协调方验证）。 |
| renderer 交互回归 | `pnpm --filter @scnexus/app-renderer-v2 test:unit --run campaign.test campaign-dialogs source-picker pages.test ipcs.test`：5 文件、30 项通过（集成协调方验证）。 |
| renderer 构建 | `pnpm --filter @scnexus/app-renderer-v2 build-only`：通过（集成协调方验证）。 |
| main/preload 构建 | `pnpm -w exec vite build --config packages\app-main\vite.config.ts`：通过（集成协调方验证）。 |
| renderer 定向 lint | 定向 ESLint / Oxlint：通过（集成协调方验证；未提供完整路径参数，不虚构完整命令）。 |


### 冲突快捷设置与文件大小显示（2026-10-11）

安装冲突默认选择覆盖，界面显示默认行为提示；每个文件使用“覆盖 / 保留”切换按钮，不再使用下拉框。两个及以上冲突提供“全部覆盖 / 全部保留”，统一设置后仍可逐文件调整；混合状态下两个统一按钮都不显示选中。模式切换、新冲突清单或重新打开安装流程时，按当前 conflictId 重置默认覆盖。激活冲突也使用相同的切换与统一控件，但仍需用户明确选择；恢复/卸载的共享删除决策保持原有行为，不自动删除。

renderer-v2 的文件树、冲突对比、战役库/详情、来源与安装统计及安装结果统一通过 formatFileSize 显示大小。采用 1000 进制：小于 1000 为 B，达到 1000 切换为 kB，依次为 MB/GB/TB/PB/EB；B 保留整数，其他单位最多两位小数并去掉无意义的尾零。仅影响界面格式，不改变字节数据、安装清单或 IPC。

验证包含单位边界、逐文件切换、批量设置/混合状态、模式与对话框重置、激活显式决策和文件树格式。1000×660 浏览器模拟确认默认全部覆盖、统一保留后逐文件调整、无下拉框以及 B/kB/MB/GB 显示正确。


### campaign 保守自动识别（2026-10-11）

仅在来源中不存在 package.json 和 metadata.txt 时允许自动识别，文件名大小写不敏感。严格检查所有层级，包括 .SC2Map/.SC2Mod components 内部；无效或损坏描述不允许回退 auto。为避免伪装描述入口，具有这两个名字的目录也使 auto 不可用；只有正常 SCNexus/CCM 解析仍按原规则忽略资源内部描述。

按 Maps/Campaign 的标准目录推断唯一战役类型：直属地图为 WOL，swarm（含 evolution）为 HOTS，void/voidprologue 为 LOTV，nova 为 NCO。支持共同包装目录、SC2Map/SC2Mod components；Maps 与 Mods 必须共享唯一逻辑包根，Mods 保留层级，可附带同根 Maps 下的额外地图。不根据压缩包名、地图名或文件正文猜测类型；出现多个类型、多个包根或非标准战役布局返回 auto 诊断而不安装。包名取包装包根目录名，无包装则取来源目录名或移除扩展名的归档名称；作者、版本、描述保持空，不伪造。auto 不作为“作者推荐模式”。

InstallPreview.origin 增加 auto-detected，预览 descriptorPath 为空（不存在来源描述），生成文件只在确认后写入。auto 选择沿用 SCNexus 管理：ContentRecord.mode=scnexus、origin=auto-detected，生成有效 package.json、资源声明和安装清单，供激活、扫描、恢复与卸载复用。payload 路径按目标规范化，归档来源路径仍保持原始条目供精确批量解压。auto 的 existingInstallations 按 SCNexus 规则检查重复；conflicts 按 auto 分组，正式激活时重新生成冲突预览。customize 自动识别见后续实施记录。

分析不读取资源正文或解压资源：目录 auto 根据路径/大小/mtime/ctime 构建预览，资源哈希在用户确认后采集；归档 auto 不读取任何条目正文，仍使用整体归档 SHA-256 验证来源。确认后重检无描述文件条件及推断计划，批量解压一次，沿用暂存结果验证、事务提交和回滚。目录来源确认后添加描述、改变文件、归档改变或持久化失败都不得产生成功安装。

界面选中唯一可用的 auto 模式，说明推断依据并将未知字段显示为“—”。自动识别不可用时展示描述存在、布局不支持/有歧义、多战役类型或未找到战役目录的本地化标题与具体诊断。

验证包含四种战役及 HOTS evolution/LOTV voidprologue、包装根与大小写规范化、components、损坏/内部/大小写描述门槛、目录与真实 ZIP/solid 7z 完整安装→激活→扫描→恢复→卸载、重复安装、来源变化和 Store 失败回滚。真实归档断言 analyze 不调用 readFile/extractExact，确认安装仅调用一次提取子进程。真实 SC2 地图运行与用户大型归档仍需实际环境验收。


自动识别验证结果：

| 范围 | 命令与结果 |
| --- | --- |
| main 自动识别、内容生命周期、战役与 Store 回归 | `pnpm --filter @scnexus/app-main test src\modules\content-package\__test__ src\modules\campaign\__test__\campaign.test.ts src\stores\__test__`：9 文件、102 项通过，其中自动识别 28 项。 |
| renderer 自动模式、确认流程与语言 | `pnpm --filter @scnexus/app-renderer-v2 test:unit --run campaign.test campaign-dialogs pages.test`：3 文件、23 项通过。 |
| 类型检查 | `pnpm run typecheck:main`、`pnpm run typecheck:preload`、`pnpm --filter @scnexus/app-renderer-v2 type-check`：通过。 |
| 构建 | `pnpm --filter @scnexus/app-renderer-v2 build-only`、`pnpm -w exec vite build --config packages\app-main\vite.config.ts`：通过。 |
| 静态检查 | detector、content service/source、campaign store、自动识别测试、renderer 安装预览与流程测试定向 ESLint/oxlint，以及 `git diff --check`：通过。 |

### customize 自动识别、直接安装与卸载所有权（2026-10-12）

customize 仅提供 analyze、install、list、scan、prepareUninstall、uninstall，复用取消与安装进度订阅；没有激活、移除活动状态或移动生命周期。SCNexus package.json 模式维持现有声明解析。customize auto 只在来源所有层级均无 package.json 时可用，门槛大小写不敏感，包含 resource components 内部和 package.json 同名目录；无效描述不回退 auto。metadata.txt 不是 customize 描述，允许出现，不读取或持久化为 ccmOriginal；components 内的 metadata.txt 仍作为普通资源文件随组件安装。campaign 原有 package.json/metadata.txt 双门槛和战役推断规则保持不变。

customize auto 要求全部 SC2Map/SC2Mod 资源位于唯一共同包装根的标准 Maps/Mods 层级，包含文件及 components，Maps 任意子路径按 customize parser 原有规则保留，不猜测 campaign。拒绝多个逻辑根、松散资源、不匹配的 Maps/Mods 类型和大小写规范化歧义。包名取逻辑包根末级目录，无包装根则取输入目录名或去扩展名的归档名；作者、版本、描述为空。预览 origin=auto-detected，描述路径为空，确认后生成 package.json；记录 mode=scnexus。

customize 无完整 payload/本地库资源副本，只直接安装到游戏 Maps/Mods，再在 SCNexusCustomizeData 中持久化 package.json 与 install-manifest.json。分析不读取来源资源正文、不解压；目录资源哈希在确认后采集并复核，归档继续按精确整体 SHA-256 校验来源。确认并解决直接文件冲突后，选择的归档资源单次批量提取；全部选择保留且无来源描述需要提取时无需启动提取进程。保留默认覆盖由 renderer 提供，不在 backend 隐式替用户决定。长时间解压后重检冲突，文件写入与 Store 失败仍通过现有暂存/事务回滚，不新增持久化原文件备份。

InstalledFile.result=kept 表示没有取得文件删除所有权。卸载跳过这些文件，也不为它们要求共享删除选择；即使用户后来改变保留文件也不会删除或阻止移除管理记录。对实际 copied/replaced 文件继续提供共享引用 keep/delete 决策；其他包的 kept 文件虽然不拥有删除权，仍计入 usedBy 作为只读使用引用，因此卸载拥有文件的包时也会提示保护这些存留使用者。共享 campaign 清单的 kept 同样不取得删除所有权，取消激活时保留。扫描保存 origin 与结果标记，customize Store 接受 auto-detected。

共享 CustomizeApi extends ContentApi 增加 onInstallProgress(listener): () => void，进度 DTO 不变；main 只向安装调用方的 live sender 发送 customize:install-progress。preload 去除 Electron event 并返回精准取消函数，v2 IPC 层仅新增 apiCustomizeOnInstallProgress 订阅适配器。

后端验证：

| 范围 | 精确命令与结果 |
| --- | --- |
| 内容、真实 ZIP/solid 7z、customize/campaign IPC 与 Store 回归 | `pnpm --filter @scnexus/app-main test src\modules\content-package\__test__ src\modules\customize\__test__\customize.test.ts src\modules\campaign\__test__\campaign.test.ts src\stores\__test__`：10 文件、128 项通过。 |
| preload 两域进度订阅、任务 ID 转发 | `pnpm run test:preload`：1 文件、4 项通过。 |
| 独立类型检查 | `pnpm run typecheck:main`、`pnpm run typecheck:preload`：通过。 |
| 定向静态检查 | `pnpm exec eslint` 指定 content-package detector/service/source、auto-detection/recovery 测试、customize service/IPC/测试、customize Store、共享 content-api/desktop 类型、preload desktop/测试及 v2 customize IPC：通过。`pnpm exec oxlint -c .oxlintrc.json` 同范围（不含既有 recovery.test.ts）：通过。recovery.test.ts 的旧 unused imports/toThrow-message oxlint 问题不在本次修改范围。 |

回归覆盖目录/真实 ZIP/solid 7z 的分析→直接安装→扫描→卸载、内部及损坏描述门槛、同名空目录、metadata.txt 非描述、components 与任意 Maps 子路径、keep/overwrite 所有权、共享 keep/delete、全部保留无资源提取、来源/归档变更、提取期间目标变化、Store 失败回滚，以及 sender-only 进度订阅与取消。用户真实游戏启动和大型归档仍需实际环境验收。

#### customize renderer-v2 接入及联调验证

新增 `/customize` 路由与导航，展示自制作品列表、详情和本地记录，支持刷新、扫描、来源分析及安装。来源选择、树形预览、冲突选择和安装进度复用 campaign 流程：`CampaignInstallModal` 通过 `contentType='customize'` 只提供 SCNexus/自动识别两种模式；不出现战役类型选择、激活提示或激活操作。默认覆盖、逐文件/批量保留和取消保持共用交互。

卸载通过 prepareUninstall 获得共享文件引用，确认对话框要求明确 keep/delete，提交时显示 loading 并锁定重复操作，成功/失败使用 toast 反馈。uninstall 的返回 DTO 未变，UI 依据 IpcResult 成功状态判断，不要求额外布尔结果。只读 kept 记录依然保护其他包的 shared usedBy 引用，但它自身卸载不删除文件。

父级最终集成验证（2026-10-12）：

| 范围 | 精确命令与结果 |
| --- | --- |
| renderer-v2 类型检查 | `pnpm --filter @scnexus/app-renderer-v2 type-check`：通过。 |
| customize、卸载确认、campaign 回归及共用来源/冲突/IPC | `pnpm --filter @scnexus/app-renderer-v2 test:unit --run customize.test uninstall-dialog campaign.test campaign-dialogs source-picker conflict-choices file-size pages.test ipcs.test`：9 文件、62 项通过（含刷新失败与 customize 描述门槛本地化消息回归）。 |
| renderer-v2 构建 | `pnpm --filter @scnexus/app-renderer-v2 build-only`：通过。 |
| 浏览器 mock 联调 | 1000×660 验证 `/customize` 仅两种安装模式、mock 安装完成无激活提示、卸载确认共享选择、loading 与 toast：通过；不是实机游戏验收。 |

customize 自动诊断复用 `AUTO_DESCRIPTOR_PRESENT`、`AUTO_LAYOUT_AMBIGUOUS`、`AUTO_LAYOUT_UNSUPPORTED`；没有新增诊断代码，也不会返回 campaign 专用的 `AUTO_CAMPAIGN_AMBIGUOUS`/`AUTO_CAMPAIGN_NOT_FOUND`。`AUTO_DESCRIPTOR_PRESENT` 在 customize 中仅指 package.json，界面说明不应将 metadata.txt 说成 customize 的阻断描述。

## 内容异常与提交后警告

- 描述文件解析、编码与资源声明校验失败可成为逐包 diagnostics；元数据读取的文件系统错误或 7z 工具错误必须拒绝 analyze，不吞为“描述无效”。库扫描只隔离预期的包/清单校验错误，未知异常与实际读错误保留失败语义。
- archive list/read/extract 在对应边界补充明确说明并保留 cause；超时 M050 不降为坏包。7z exit 1 保留返回结果与 warning 回调，内容解压先验证选定文件数、路径及长度，再报告 M063；即使 exit 1，缺失或异常输出仍失败，不持久化安装记录。
- 文件事务提交与 Store 更新成功后，备份清理、内容暂存清理、7z 选择列表清理失败返回 M062 warnings，不触发错误 toast 或重复安装。失败操作中清理仅作次要警告；回滚不完整保留恢复文件并保持 M043 为主错误。
- 进度通知是非提交依赖。回调、窗口投递和日志失败不能从 EventEmitter 逃逸、打断事务或把 completed 改报 failed；通知失败使用 M018 警告。7z stdout/stderr/process 错误记录后在 close 统一结算，超时优先保留超时定义。
- 警告通过 main 每次 IPC 调用的 AsyncLocalStorage 收集，只在成功结果返回一次；并发调用、后续调用及失败结果互不泄漏。renderer 消费可选 warnings，但不得因为警告撤销已提交 data。


### 本次异常审计验证

| 命令 | 结果 |
| ---- | ---- |
| `pnpm run typecheck:main` | 通过。 |
| `pnpm --filter @scnexus/app-main test src\utils\__test__\ipc-util.test.ts src\modules\content-package\__test__ src\modules\campaign\__test__ src\modules\customize\__test__` | 12 文件、138 项通过；包含请求隔离、迟到警告、日志失败、真实文件读写错误注入、清理 EPERM、回滚 M043、7z exit 1 完整/缺失输出及 stream/process/timeout 回归。 |
| `pnpm --filter @scnexus/app-main test src\modules\workshop\__test__\workshop-archive.test.ts` | 1 文件、1 项通过，保留 wrapper workshop 兼容行为。 |
| `pnpm --filter @scnexus/app-main lint` | 未通过；包级存在旧测试 mock 类型/条件断言及旧 IPC explicit-any 等基线，不宣称全包 lint 清洁。 |
| `git diff --check -- packages\app-main docs\logging-and-errors.md docs\campaign-customize-design.md` | 通过。 |

本次新增文件与修改的实现、测试使用 `pnpm exec oxlint -c .oxlintrc.json` 显式指定路径检查通过；同组 `pnpm exec eslint` 排除已有 `ipc-util.ts` explicit-any 签名后通过。未修改其他旧模块/测试来清除全包 lint 基线。构建验证由父任务统一执行，结果见下表。


### 父任务最终构建复验

以下结果由父任务复验并回传；main 域回归再次通过 138 项，workshop archive 回归再次通过 1 项；main、preload、renderer-v2 三包类型检查均通过。

| 命令 | 结果 |
| ---- | ---- |
| `pnpm --filter @scnexus/app-renderer-v2 build-only` | 通过。 |
| `pnpm exec vite build --config packages\app-main\vite.config.ts` | 从仓库根执行，通过。 |
| `pnpm exec vite build --config packages\app-preload\vite.config.ts` | 从仓库根执行，通过。 |

清理 warning 不代表自动恢复已完成：成功提交后的备份/暂存/选择列表清理失败会保留相应文件，尚无自动重试清理；回滚失败保留事务备份并以 M043 拒绝，绝不因后续清理或通知失败改报成功。失败结果不附加 warnings，次要警告通过 warn 日志安全记录；默认 error 阈值可能不输出 warn，但成功 DTO 的 warnings 不受日志阈值影响。尚无进程骤停后的自动事务恢复保证。


### renderer/preload 回归与既有基线

父任务回传以下验证结果；本次未修改失败用例与相关 Vite 配置，不修复无关基线。

| 命令 | 结果 |
| ---- | ---- |
| `pnpm --filter @scnexus/app-renderer-v2 test:unit --run error-normalization content-notifications campaign.test campaign-dialogs customize.test uninstall-dialog ipcs.test pages.test` | 8 文件、58 项通过。 |
| `pnpm run test:preload` | 7 项通过。 |
| `pnpm --filter @scnexus/app-renderer-v2 test:unit --run` | 全量 84 项中 83 项通过、1 项失败：既有 `icons.test` 正则仅识别双引号 `i-tabler` 字符串，而 `vite.config.ts` 使用单引号；两文件均无本次 diff。不得将全量 v2 测试描述为全部通过。 |

### 统一来源分类与跨页面导入验证（2026-10-13）

统一导入由 `useContentImportStore`（Pinia）管理请求、`M064` 冲突和跨路由待接收结果。用户明确选择描述文件后，使用原 `SourceInput` 加 `SourceAnalysisChoice` 重新调用 `apiContentAnalyze`；成功时先按主进程 `contentType` 导航到 `/campaign` 或 `/customize`，目标页面通过 `service.acceptAnalysis(result)` 一次接收完整分析结果，不因导航再调用 analyze。Pinia + router 测试验证单次交接；取消与过期结果通过既有共享 cancel 清理主进程上下文。重新分析的成功 warnings 保留并交给反馈层，主进程进度回调和警告收集机制不变。

以下命令均从仓库根执行。renderer 全量、构建及 browser 联调结果由父任务回传；后端、preload 和 renderer IPC 结果由分类实施任务执行。

| 精确命令或验证 | 结果 |
| --- | --- |
| `pnpm --filter @scnexus/app-main test src/modules/content-package src/utils/__test__/ipc-util.test.ts --reporter=dot --testTimeout=30000` | 11 文件、164 项通过；其中新分类及分类 IPC 32 项。默认 5 秒下既有 solid 7z 大清单测试曾超时，30 秒复跑全部通过，失败 fixture 已清理。 |
| `pnpm --filter @scnexus/app-main test src\modules\content-package\__test__ src\modules\campaign\__test__ src\modules\customize\__test__ src\utils\__test__\ipc-util.test.ts` | 父任务最终扩大回归：14 文件、170 项通过，包含领域 campaign/customize 与 IPC 工具。 |
| `pnpm --filter @scnexus/app-main exec vitest run -r ..\app-preload --reporter=dot` | 1 文件、8 项通过。根 `pnpm test:preload --reporter=dot` 因根目录未提供 vitest 可执行文件失败；使用已声明于 app-main 的 Vitest 执行上述 preload 命令通过，未安装新依赖。 |
| `pnpm --filter @scnexus/app-renderer-v2 test:unit --run src/ipcs/internal/__tests__/ipcs.test.ts --reporter=dot` | 1 文件、9 项通过，含冲突失败 DTO、choice 转发及响应式输入快照。 |
| `pnpm --filter @scnexus/app-renderer-v2 test:unit --run` | 16 文件、102 项通过（父任务最终全量结果）。 |
| `pnpm --filter @scnexus/app-renderer-v2 build-only` | 通过（父任务）。不代替类型检查。 |
| `pnpm --filter @scnexus/app-main build` | 通过（父任务最终包级构建）。 |
| `pnpm --filter @scnexus/app-preload build` | 通过（父任务最终包级构建）。 |
| `pnpm run typecheck:shared` | 通过。 |
| `pnpm run typecheck:main` | 通过。 |
| `pnpm run typecheck:preload` | 通过。 |
| `pnpm --filter @scnexus/app-renderer-v2 type-check` | 未通过；仅既有 `src/main.ts(19)` 的 `app.use(ui)` Plugin 类型不匹配（Nuxt UI/Vue 类型版本），未修改无关入口或依赖。新增 IPC 测试的索引类型问题已修复。 |
| `pnpm exec oxlint -c .oxlintrc.json packages\app-main\src\modules\content-package\classification.ts packages\app-main\src\modules\content-package\__test__\classification.test.ts packages\app-main\src\modules\content-package\__test__\classification-ipc.test.ts` | 通过。其他精确指定的本次实现文件检查同样通过；扩大到既有整个 content-package/renderer IPC 目录会遇到旧 mock 类型等 lint 基线，不宣称全仓 lint 清洁。 |
| `pnpm exec eslint packages\app-main\src\modules\content-package\classification.ts packages\app-main\src\modules\content-package\__test__\classification.test.ts packages\app-main\src\modules\content-package\__test__\classification-ipc.test.ts` | 通过。 |
| `git diff --check` | 通过。 |
| 1000×660 mock browser | 从 campaign 页面选择来源收到 M064，选择 package-json 后带 choice 重新分析、导航 `/customize` 并打开正确且可安装的预览；路由后没有重复分析。通过（父任务），不是真实游戏验收。 |

分类/重新分析矩阵：

| 来源情况 | 期望与已验证结果 |
| --- | --- |
| 仅 package.json | 按内部 campaign/customize 分类；即使 customize 声明了官方路径也不改变描述类型。 |
| 仅 metadata.txt | campaign；正常提供 CCM 与转换后的 SCNexus 计划。 |
| 双描述、同为 campaign | 正常独立多模式分析，不允许 choice 强行覆盖无冲突结果。 |
| package customize + metadata campaign | 首次失败 M064；package-json 重分析只提供 customize SCNexus 计划且无 CCM 原文；metadata-txt 重分析只解析 CCM 资源并提供 campaign 计划。目录和 solid 7z 的两种选择及实际安装均通过。 |
| 坏 JSON、坏 CCM 字段、描述文件同名目录、多个最外层有效包根 | M034 业务失败，不静默忽略或回退 auto。 |
| 无外部描述、有标准官方地图 | campaign；WOL、HOTS、evolution、LOTV、prologue、NCO、包装根及大小写变体通过。 |
| 无描述、仅空官方目录 | 目录/归档显式目录条目均分类 campaign；没有唯一可安装战役时 auto 预览为空并返回 `AUTO_CAMPAIGN_NOT_FOUND`，不重分类 customize，不伪造可安装内容。 |
| 无描述、多战役/歧义布局 | 保持 campaign，返回不可用预览及对应诊断。 |
| 无描述、无官方目录 | customize；标准普通资源可 auto，完全空来源仅诊断不可安装。 |
| Campaign 位于资源 components 内或仅为普通目录名 | 不作为官方目录分类证据；components 内描述文件不作外部分类描述，但严格既有 auto 阻断规则仍有效。 |
| 来源修改与提前提取 | 分析中的归档修改、预览后的描述修改均拒绝；每次 dual 分析仅一次 list、每个描述正文读取一次，确认前没有资源 extractExact。 |

上述结果不承诺实机 StarCraft II 启动、不同平台文件系统或超大型真实归档已经验收；本次未提交 Git commit。
