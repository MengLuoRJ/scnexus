# SCNexus 标准化作品包格式

本文面向战役、自制作品和共享模组的作者，介绍如何通过 `package.json` 描述作品内容与安装位置。字段定义以仓库中的 [`@scnexus/standard`](../packages/standard/README.md) 为准；本文同时区分格式支持与当前客户端的实际能力。

这里的 `package.json` 是 **SCNexus 作品清单**，不是 Node.js 项目的依赖配置。客户端不会因为清单中出现脚本或网址而执行它们。该文件也与用于唤起客户端的 `scnexus://` URL 协议无关。

## 本地压缩包验证

客户端「创作工具 → 压缩包验证」支持选择或拖入一个 ZIP、7z、RAR 压缩包或文件夹，无需配置游戏目录。工具分别检查 `package.json`（星际枢纽标准）和 `metadata.txt`（CCM 标准），展示读取到的原始描述字段、资源校验结果及诊断；顶部标准识别仅判断原生描述文件；下方安装模式详情与战役安装共用分析逻辑，CCM 包可在 SCNexus 标签页查看兼容转换方案（`ccm-converted`），并明确标注非原生标准包。两个标准同时存在时分别展示。无效描述文件仍尽可能展示已读取的字段。文件选择框与战役管理共用组件；分析结果提供源文件树、文件数量与大小、压缩大小（压缩包）、作品基本信息、包内根目录、启动器及候选项、识别后的逻辑目标文件树、逐文件源路径与目标路径映射，以及完整内部分析 JSON。结果从上到下依次为三项标准识别汇总、源文件树、星际枢纽标准 / CCM 标准 / 自动识别三个标签页的分析详情。目标树与映射仅用于预览，不会触发安装。

战役包有 `package.json` 时仅启用星际枢纽标准；没有该文件而有 `metadata.txt` 时启用星际枢纽标准（兼容）与 CCM 标准，默认优先选择兼容模式；两者都没有时仅尝试自动识别。自制作品包有 `package.json` 时仅启用星际枢纽标准，没有时仅尝试自动识别。自动识别详情顶部提示“将按照星际枢纽标准兼容安装”。描述文件无效或资源布局无法识别时，不启用对应安装方案。自动识别结果遵循当前安装流程的目录规则；存在描述文件时可能禁用自动识别，不代表标准包无效。工具只读取压缩包目录或文件夹内容及内存中的描述文件，不解压到磁盘、不安装、不检查本地安装冲突，也不修改源文件或游戏文件。此功能不是压缩包完整性检测或安全扫描，校验通过不保证所有资源内容可正常运行，也不代替工坊上传规则验证。

一个压缩包或所选文件夹仅允许包含一个作品根目录：不同目录中的作品描述文件（包括嵌套的第二个作品）会导致整个来源校验失败，不会挑选其中一个生成安装方案。同一目录内同时存在 `package.json` 和 `metadata.txt` 不视为两个作品；SC2Map / SC2Mod 组件内部的同名文件不作为作品描述文件。分类失败时，验证工具仍展示源文件树与各描述文件的字段、错误，但所有来源级安装方案均不可用。验证详情标签页允许查看失败或非当前安装模式的描述文件，这不代表该模式允许安装。

## 1. 基本结构

推荐将清单放在作品包根目录，并使用 UTF-8 编码的标准 JSON：不写注释，不写尾随逗号，不重复字段名。

```text
我的作品/
├─ package.json
├─ Maps/
│  └─ MyProject/
│     ├─ Launcher.SC2Map
│     └─ Chapter01.SC2Map
└─ Mods/
   └─ MyProject.SC2Mod
```

上传工坊时，压缩包根目录须直接包含唯一的 `package.json`，不要再套一层“我的作品”文件夹。本地导入具备额外的清单查找和旧格式识别能力，但不应依赖这些兼容逻辑制作新包。

清单中的 `/Maps/`、`/Mods/` 是**逻辑路径前缀**，不是磁盘根目录。资源源路径相对于清单所在目录，目标路径相对于游戏目录；清单不要填写作者电脑上的绝对路径。

## 2. 作品类型

| `type`       | 含义                   | 当前客户端行为                                               |
| ------------ | ---------------------- | ------------------------------------------------------------ |
| `campaign`   | 替换对应官方战役的作品 | 安装后通过战役管理激活，再从游戏进入对应战役                 |
| `customize`  | 独立自制地图或作品     | 安装到指定位置，可配置启动器地图并从客户端启动               |
| `dependency` | 供作品共享使用的模组包 | 支持独立安装和卸载，仅声明模组资源，不自动解析其他作品的依赖 |

`campaign` 还必须提供 `campaign` 字段：

| 值     | 战役         |
| ------ | ------------ |
| `WOL`  | 自由之翼     |
| `HOTS` | 虫群之心     |
| `LOTV` | 虚空之遗     |
| `NCO`  | 诺娃隐秘行动 |

`dependency` 不允许添加 `maps`、`campaign`、`manager`、`launcher`、`dependencies`、`localization` 或存档相关字段。

## 3. 基础信息

以下字段适用于三种类型。

| 字段          | 类型       | 必填 | 说明                                                  |
| ------------- | ---------- | ---- | ----------------------------------------------------- |
| `type`        | 字符串     | 是   | 上述三种类型之一                                      |
| `name`        | 字符串     | 是   | 作品名称，不能是空白                                  |
| `description` | 字符串     | 是   | 作品简介                                              |
| `version`     | 字符串     | 是   | 作品版本，建议从一开始使用 SemVer，例如 `1.0.0`       |
| `author`      | 字符串     | 是   | 作者或制作团队                                        |
| `scnid`       | 数字       | 否   | 工坊项目标识，非负安全整数；不能使用字符串代替        |
| `tags`        | 字符串数组 | 否   | 作品标签                                              |
| `website`     | 字符串     | 否   | 作品网站                                              |
| `social`      | 对象       | 否   | 社交信息，见下文                                      |
| `sponsor`     | 对象       | 否   | 赞助信息，见下文                                      |
| `$schema`     | 字符串     | 否   | 编辑器使用的 JSON Schema 关联地址，不是格式版本号     |
| `readme`      | 字符串     | 否   | 包内说明文档路径                                      |
| `changelog`   | 字符串     | 否   | 包内更新日志路径                                      |
| `docs`        | 字符串数组 | 否   | 额外包内文档路径列表                                  |
| `assets`      | 字符串数组 | 否   | 其他展示附件的包根目录相对路径白名单，支持 `*` / `**` |

三种类型还支持以下顶层 AI 使用声明字段：

| 字段                    | 类型   | 必填 | 说明                              |
| ----------------------- | ------ | ---- | --------------------------------- |
| `aiAssistedDevelopment` | 布尔值 | 否   | 是否使用 AI 协助开发              |
| `aiGeneratedArt`        | 布尔值 | 否   | 是否使用 AI 生成/辅助制作美术素材 |
| `aiGeneratedVoice`      | 布尔值 | 否   | 是否使用 AI 生成/辅助制作语音配音 |

字段可独立填写 `true` 或 `false`；省略表示未声明，不等同于未使用。不能填写 `null`、数字或字符串。
这些字段仅用于作者声明，不影响安装，也不代表平台对素材来源的认证。

客户端在已安装战役主面板及战役、自制、依赖作品详情中展示实际清单的三项声明。
创意工坊公开详情展示已审核的项目声明；创作者可在项目表单独立编辑这三项，
也可明确点击“从安装包填写资料”复制包内值。项目声明允许清除为未声明，
与版本包内容独立，保存后需审核才公开；上传新版本不会自动改写项目声明。
安装后显示的是实际包内声明，不用项目声明覆盖。

不要自行编造工坊项目的 `scnid`；关联工坊时应使用该项目实际分配的标识。

### 版本号

推荐使用 `主版本.次版本.修订版本`，例如 `1.2.3`；预发布和构建元数据可以写为 `1.2.3-beta.1`、`1.2.3+build.5`。不要使用 `v1.2.3`、`最新版` 或 `1.2` 作为工坊发布版本。

注意：标准包的 `isPackage` 当前只检查 `version` 是合法文本，**不负责 SemVer 校验**。工坊上传和发布流程另有强制 SemVer 检查；本地清单能被识别，不代表一定能通过工坊预检。

### 社交与赞助

`social` 支持 `twitter`、`discord`、`youtube`、`weibo`、`bilibili`、`qq_group`；`sponsor` 支持 `paypal`、`patreon`、`buymeacoffee`、`afdian`。这些字段的值均为字符串。

```json
{
  "website": "https://example.com/project",
  "social": {
    "bilibili": "https://space.bilibili.com/123456",
    "qq_group": "123456789"
  },
  "sponsor": {
    "afdian": "https://example.com/support"
  }
}
```

上面只是可选字段片段，不是可以单独导入的完整清单。社交和赞助信息不保证在客户端所有页面展示。

### 图片与文档

战役（`campaign`）可声明 `banner?: string`；自制作品（`customize`）可声明
`cover?: string`。两者不能互换或同时声明，依赖包（`dependency`）两者都不允许。
三种包均可声明 `readme?: string`、`changelog?: string`、`docs?: string[]` 和
`assets?: string[]`（注意拼写为 `assets`，不是 `aseets`）。

例如，自制作品清单可以加入以下片段：

```json
{
  "cover": "images/cover.webp",
  "readme": "docs/README.md",
  "changelog": "docs/CHANGELOG.txt",
  "docs": ["docs/guide.md", "docs/credits.txt"],
  "assets": ["images/**", "docs/*.md"]
}
```

这些**显式路径均相对于压缩包根目录**，不同于地图/模组的逻辑路径；推荐不带起始 `/`，
不填写作者电脑的绝对路径或远程网址。`@scnexus/standard` 的 `isPackage` 和 JSON Schema
只校验声明结构，**不访问或探测文件**，不检查存在性、可读性、图片解码或路径边界。
运行时文本不能含 NUL。实际文件读取、包内安全检查及展示由客户端负责，
不属于 standard 的声明校验。当前客户端的附件读取限制见下文。

| 字段               | 仅省略字段时的默认探测顺序（清单同级，精确匹配且区分大小写）        |
| ------------------ | ------------------------------------------------------------------- |
| `banner`（仅战役） | `banner.jpg` → `banner.png` → `banner.webp`                         |
| `cover`（仅自制）  | `cover.jpg` → `cover.png` → `cover.webp`                            |
| `readme`           | `README.txt` → `README.md` → `readme.txt` → `readme.md`             |
| `changelog`        | `CHANGELOG.txt` → `CHANGELOG.md` → `changelog.txt` → `changelog.md` |

显式图片路径无效、文件不存在或无法加载时，**直接回退客户端默认图片，不再探测默认名称**。
省略图片字段时按上表顺序尝试，均不可用时回退默认图片。显式文档路径缺失或不可接受时，
忽略该文档，**不回退探测默认名称**；`docs` 只读取声明的列表，不自动扫描目录。

文档引用和文档内图片只能引用包内文件。显式声明的图片、`readme`、`changelog`、`docs`
以及字段省略时的默认候选自动进入附件候选集合，无需重复列入 `assets`；**所有其他附件**，
包括文档链接指向的其他文档和图片，都必须匹配 `assets` 白名单。未声明 `assets` 或声明 `[]`
表示不保存、不读取任何未列出的额外附件，不会因为文档链接引用了文件而自动授权。

`assets` 中的路径同样相对于**压缩包根目录**，大小写精确匹配；只支持 `*`（单一路径段内
的零个或多个字符）和独立路径段 `**`（零个或多个路径段）。例如 `images/*.png` 不匹配
`images/sub/a.png`；`images/**/*.png` 同时匹配 `images/a.png` 与 `images/sub/a.png`；
`**/*.md` 也匹配根目录的 `guide.md`。不支持 `?`、方括号、花括号、否定规则或段内 `**`，
无效规则不授权任何文件；绝对路径、反斜杠、目录穿越和符号链接逃逸均不允许。
白名单只限制展示附件，不改变地图/模组安装规则，**不会授权可执行文件**或绕过下述文件限制。
standard 的 `isPackage` 仅校验 `assets` 是不含 NUL 的字符串数组，Schema 校验字符串数组结构，
不解析通配符或访问文件；客户端才执行规则与文件安全校验。

这些文件只是展示资料，不是安装到游戏目录的地图或模组资源。

#### 当前客户端读取与保存限制

- 图片接受 JPEG / PNG / WebP 输入，单文件上限 **8 MiB**。主进程使用 Electron
  `nativeImage` 实际解码，再重新编码为 PNG 后提供给界面；不直接展示原始图片字节。
- 文档只接受 UTF-8 编码的 `.md` / `.txt` 文件，单文件上限 **1 MiB**。
- 保存的附件文件最多 **256 个**，总大小上限 **64 MiB**。在应用这些限制前，
  优先选择清单声明的图片、说明、更新日志和文档；字段省略时优先保留清单同级的默认候选文件，
  避免无关图片或文本占满配额导致作品资料全部丢失。剩余额度只保留匹配 `assets` 的其他合规附件，供包内文档引用。
- 目录导入和压缩包导入使用相同的附件选择规则；压缩包在安装时将附件与地图/模组、
  清单一起按精确条目路径批量解压，不使用仅提取游戏资源的过滤规则。附件在移动游戏资源前保存，
  原始包内路径保留为引用标识，不把展示资料安装到游戏的 Maps/Mods 目录。
- 导入的附件保存在客户端管理的私有副本中，删除原始压缩包或来源目录后仍可读取；
  后续安装扫描会保留这些副本，不因扫描覆盖或丢弃。
- 白名单在每次读取时重新执行，已存在的 `.attachments` 私有副本也不能绕过；
  旧安装记录没有私有副本时，仅在经过校验的管理目录中按需读取，且遵守相同白名单。
  不会回退到任意原始来源目录；无法在受控目录中读取时，不提供该附件。
- 界面使用 [Comark 的 Vue 渲染器](https://comark.dev/rendering/vue)，配合
  [Nuxt UI Prose](https://ui.nuxt.com/docs/typography) 展示 Markdown；通过 Vue/Vite 集成，
  不依赖 Nuxt 服务端。`.md` / `.txt` 文档均由同一受限渲染器展示。
- 不启用 HTML、MDC 组件或属性插件；原始 HTML 和 MDC 语法不会作为可执行组件或 HTML 挂载。
  渲染前仅保留允许的 Markdown 节点并重建属性，不允许文档指定任意 Vue 组件、事件处理器、
  动态绑定或组件覆盖。
- 文档链接仅在同一作品包内的 `.md` / `.txt` 文件间导航，支持标题片段；相对路径以当前文档
  所在目录解析，起始 `/` 表示包根目录而非磁盘根目录。图片也只能通过同一作品包的受控 IPC
  读取，不直接使用文件 URL。拒绝远程网址、协议 URL、磁盘绝对路径及逃出包目录的路径，
  不加载远程资源或打开外部链接。

这些限制由客户端读取与保存流程执行；`isPackage` 和 Schema 不检查文件大小、
编码、图片格式或实际文件数量。

## 4. 地图与模组资源

`maps` 与 `mods` 都是数组。地图资源使用 `.SC2Map`，模组资源使用 `.SC2Mod`，扩展名检查不区分大小写。

| 资源字段      | 类型   | 必填 | 说明                                                       |
| ------------- | ------ | ---- | ---------------------------------------------------------- |
| `name`        | 字符串 | 是   | 带扩展名的资源名称；启动器通过此名称引用地图               |
| `source_path` | 字符串 | 是   | 包内资源路径，地图以 `/Maps/` 开头，模组以 `/Mods/` 开头   |
| `target_path` | 字符串 | 否   | 游戏目录中的目标逻辑路径；省略时沿用 `source_path`         |
| `description` | 字符串 | 否   | 资源说明                                                   |
| `version`     | 字符串 | 否   | 资源自身版本，不代替作品版本                               |
| `components`  | 布尔值 | 否   | 标记组件目录形式的资源；当前客户端主要根据实际文件结构处理 |

例如：

```json
{
  "name": "Launcher.SC2Map",
  "source_path": "/Maps/MyProject/Launcher.SC2Map",
  "target_path": "/Maps/MyProject/Start.SC2Map"
}
```

这表示读取包内 `Maps/MyProject/Launcher.SC2Map`，安装为游戏目录下的 `Maps/MyProject/Start.SC2Map`。`target_path` 应与地图实际引用的资源路径一致，不能为了美观随意修改。

资源可以是单个文件，也可以是以 `.SC2Map` 或 `.SC2Mod` 结尾的组件目录。目录形式应声明整个资源根目录，不逐一列出其中的文件。

路径规则：

- 推荐统一使用 `/`，并保持 `/Maps/`、`/Mods/` 前缀大小写准确。
- 不允许盘符、网络共享路径、`.`、`..` 或越出安装目录的路径。
- 声明的资源必须真实存在；同一目标不能由多个不同资源覆盖，文件和目录也不能相互冲突。
- 不通过符号链接把包外文件引入安装范围。
- `maps`、`mods` 在基础类型中虽然可选，真正安装时仍须有可安装内容；空清单不能当作有效作品安装。

## 5. 自制作品与启动器示例

对应第 1 节的目录结构，可以使用以下完整清单：

```json
{
  "name": "我的自制战役",
  "description": "包含启动器和第一章的独立作品。",
  "version": "1.0.0",
  "author": "示例制作组",
  "type": "customize",
  "tags": ["单人", "剧情"],
  "maps": [
    {
      "name": "Launcher.SC2Map",
      "source_path": "/Maps/MyProject/Launcher.SC2Map"
    },
    {
      "name": "Chapter01.SC2Map",
      "source_path": "/Maps/MyProject/Chapter01.SC2Map"
    }
  ],
  "mods": [
    {
      "name": "MyProject.SC2Mod",
      "source_path": "/Mods/MyProject.SC2Mod"
    }
  ],
  "launcher": {
    "name": "Launcher.SC2Map",
    "description": "作品主菜单"
  }
}
```

启动器字段统一使用正确拼写 `launcher`。

`launcher.name` 必须精确匹配 `maps` 中唯一一项的 `name`，不是文件绝对路径，也不是安装后的 `target_path`。

当前客户端优先使用清单声明的启动器。未声明时，会尝试识别 `Launcher.SC2Map`、`启动器.SC2Map` 等常见名称，并在安装确认界面允许玩家选择；安装后也可在作品详情中重新选择。玩家的本地选择不会修改作者原始清单。

## 6. 替换型战役示例

```text
我的替换战役/
├─ package.json
├─ Maps/
│  └─ Campaign/
│     └─ MyMission.SC2Map
└─ Mods/
   └─ MyCampaign.SC2Mod
```

```json
{
  "name": "自由之翼改编战役",
  "description": "替换自由之翼战役内容的示例。",
  "version": "1.0.0",
  "author": "示例作者",
  "type": "campaign",
  "campaign": "WOL",
  "manager": "SCNexus",
  "maps": [
    {
      "name": "MyMission.SC2Map",
      "source_path": "/Maps/Campaign/MyMission.SC2Map"
    }
  ],
  "mods": [
    {
      "name": "MyCampaign.SC2Mod",
      "source_path": "/Mods/MyCampaign.SC2Mod"
    }
  ]
}
```

这是结构示例，不代表任意命名的地图都会被游戏自动加载。实际发布时，必须按所替换的游戏战役关卡和资源引用设置文件名与目标位置。

客户端识别的战役地图区域如下：

| 战役 | 地图目录                                                 |
| ---- | -------------------------------------------------------- |
| WOL  | `/Maps/Campaign/`，不包含其他战役子目录                  |
| HOTS | `/Maps/Campaign/swarm/`，含 `evolution/`                 |
| LOTV | `/Maps/Campaign/void/` 和 `/Maps/Campaign/voidprologue/` |
| NCO  | `/Maps/Campaign/nova/`                                   |

客户端还会发现包内对应战役目录中的地图；推荐仍显式声明资源，便于审阅。战役包必须包含对应战役区域的地图，不能把其他战役的地图混入目标区域。安装、激活和恢复的具体行为见[战役与自制作品设计](./campaign-customize-design.md)。

`manager` 可选值为 `SCNexus` 或 `CCM`。它不能让任意布局自动变成 CCM 包，也不保证其他管理器能读取 SCNexus 清单。CCM 的 `metadata.txt` 属于客户端单独兼容的旧描述格式，不是本清单的别名。

## 7. 共享模组包示例

```text
共享模组/
├─ package.json
└─ Mods/
   └─ SharedCore.SC2Mod
```

```json
{
  "name": "共享核心模组",
  "description": "多个作品共用的基础资源。",
  "version": "1.0.0",
  "author": "示例作者",
  "type": "dependency",
  "mods": [
    {
      "name": "SharedCore.SC2Mod",
      "source_path": "/Mods/SharedCore.SC2Mod"
    }
  ]
}
```

不要给依赖包添加 `manager: "SCNexus"`；此类包本身面向 SCNexus 管理，格式不允许该字段。当前客户端支持依赖包的独立安装与卸载，但不意味着会按作品清单自动寻找、下载或安装依赖。

## 8. 其他内容字段及能力边界

以下字段仅适用于 `campaign` 和 `customize`。

| 字段           | 结构                       | 当前含义与限制                                                                                                                              |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `localization` | 对象数组                   | 每项含必填 `locale`，以及可选的 `name`、`description`、`author`、`version`、`translators`（字符串数组）；声明不保证界面已按语言切换这些信息 |
| `dependencies` | 对象数组                   | 每项可含 `scnid` 和 `version`；只描述依赖，不自动解析、下载或安装，也未定义版本范围求解规则                                                 |
| `bank_enable`  | `"official"` 或 `"custom"` | 历史存档模式声明，不代表已实现存档迁移                                                                                                      |
| `banks`        | 对象数组                   | 每项含 `name` 和可选 `description`，不因声明就自动复制玩家存档                                                                              |

官方存档模式使用正确拼写 `official`。新作品不需要的可选字段直接省略，不要用空字符串或虚构值填满全部字段。

## 9. 编辑器辅助与程序校验

### JSON Schema

标准包提供 JSON Schema Draft-07，公开导出为：

```js
import schema from '@scnexus/standard/package.schema.json' with { type: 'json' }
```

如作者工作目录确实安装了该包，可在作品清单中关联本地文件，例如：

```json
{
  "$schema": "./node_modules/@scnexus/standard/dist/package.schema.json"
}
```

这只是关联字段示例，需合并到完整清单中，路径按实际目录调整。`node_modules` 不需要随作品打包；没有此本地文件时不要照抄。本文不提供尚未确认部署的远程 Schema 地址。

### TypeScript 与运行时校验

```ts
import {
  isPackage,
  isPackageCampaign,
  isPackageCustomize,
  isPackageDependency,
} from '@scnexus/standard/package'
import type { Package } from '@scnexus/standard/package'

const input: unknown = JSON.parse(text)
if (!isPackage(input)) throw new Error('作品清单格式不正确')
const manifest: Package = input
```

标准包采用 ESM，不提供 CommonJS `require` 入口。分类型函数先执行完整 `isPackage` 检查，再判断类型，不是只检查 `type` 字段。

需要区分三层检查：

1. **Schema**：辅助作者检查字段、类型、枚举等结构，拒绝未声明字段。
2. **标准运行时校验**：检查基本结构及部分业务约束；为了兼容旧内容，非 dependency 对象对额外字段仍较宽松，与 Schema 不完全等价。
3. **客户端安装／工坊预检**：继续检查实际资源、路径边界、启动器引用、压缩包安全和发布版本等。结构有效不代表一定可安装，更不代表作品经过病毒检测。

## 10. 发布前检查

- [ ] 清单是有效 UTF-8 JSON，基本信息完整，名称不是空白。
- [ ] `type` 与实际作品用途一致；替换型战役指定了正确的 `campaign`。
- [ ] 版本采用完整 SemVer；工坊项目标识与实际项目一致。
- [ ] 包内资源存在，路径与地图／模组中的引用保持一致。
- [ ] 启动器使用 `launcher` 字段，且精确对应唯一声明地图。
- [ ] 依赖包只含允许字段，不携带地图或启动器配置。
- [ ] 工坊压缩包根目录直接包含唯一 `package.json`。
- [ ] 在客户端安装分析中核对目标文件，再实际测试作品启动和游戏内容。

## 参考

- [标准包使用与分发说明](../packages/standard/README.md)
- [标准字段类型](../packages/standard/src/package/package.type.ts)
- [标准运行时校验](../packages/standard/src/package/package-validation.ts)
- [战役与自制作品设计](./campaign-customize-design.md)
- [服务端接入与工坊流程](./server-integration.md)
