# SCNexus Standard

面向作品作者的目录结构、字段说明与完整示例见[SCNexus 标准化作品包格式](../../docs/scnexus-package-format.md)。

## ESM-only（破坏性变更）

本包仅分发 ES module（ESM），不再提供 CommonJS 构建或 `require` 导出。
消费者需使用 ESM `import`；CommonJS 代码可以使用异步 `import()`，不能继续使用
`require('@scnexus/standard/package')`。

## 0.1.0 导出变更

移除当前仓库业务未使用的 `@scnexus/standard/metadata` 子路径及旧 metadata 类型。
这是公开 API 的破坏性变更；外部消费者若仍引用该入口，需要在升级前迁移。
仓库中的 `scnexus-standard/metadata` 属于另一个旧包，不受本次删除影响。
CCM 的 `metadata.txt` 解析也不依赖被移除的类型，继续保留。

当前唯一公开子路径：

```ts
import { isPackage } from '@scnexus/standard/package'
import type { Package } from '@scnexus/standard/package'
```

包通过 `"type": "module"` 将 `dist/**/*.js` 标记为 ESM，并提供对应的 `.d.ts`
声明。`exports` 与 `typesVersions` 均指向这些文件；不提供包根入口或旧版
`.mjs` / `.d.mts` / CommonJS 文件的兼容路径。请勿直接依赖 `dist` 内部路径。

## 发布

在 scnexus-client 根目录的交互终端运行：

```sh
npm login --registry=https://registry.npmjs.org
pnpm run publish:standard
```

该命令先构建并运行 standard 分发测试，成功后仅发布 `@scnexus/standard` 到 npm 的
`latest` 标签，版本取本包 package.json；不会发布整个工作区。发布会跳过 Git 干净状态检查，
因此使用当前工作区内容，不自动提交或打标签。按 npm 提示完成额外认证，不在脚本中保存验证码或令牌。

## 验证

在仓库根目录运行：

```sh
pnpm run build:standard
node --test scripts/__tests__/standard-distribution.test.mjs
pnpm --filter @scnexus/standard exec tsc --noEmit -p tsconfig.json
```

构建会先清理 `dist`，移除历史双格式产物；分发测试检查产物清单、声明解析、
package 子路径的 ESM 导入、CommonJS `require` 被拒绝以及 metadata 入口被移除。
此独立测试需在构建后运行。


## 包类型

`Package` 为 `PackageContent | PackageDependency`，`PackageType` 仅接受
`campaign`、`customize`、`dependency`。现有作品使用 `PackageContent`，富信息仍以
`website`、`social`、`sponsor` 顶层字段提供，不增加包装对象；原 `PackageRichInfo`
聚合类型已移除，字段结构不变。

`PackageDependency` 只包含 `scnid?`、`name`、`description`、`tags?`、`version`、
`author`、`type: 'dependency'`、`mods?`、`website?`、`social?`、`sponsor?`、`$schema?`、
`readme?`、`changelog?`、`docs?`。沿用基础字段和 mods 的可选性，不强制 scnid
或非空 mods。`isPackage` 拒绝 dependency 中任何其他顶层字段，包括 manager/maps。
该类型仅面向 SCNexus 管理，不声明 manager；当前客户端支持依赖包独立安装与卸载，
但不按作品的 dependencies 声明自动解析、下载或安装依赖，也不按 CCM 处理。

导出可复用类型：`PackageBase`、`PackageResource`、`PackageMap`、`PackageMod`、
`PackageSocial`、`PackageSponsor`、`PackageLocalization`、`PackageLauncher`、
`PackageBank`、`PackageDependencyReference`。Map/Mod 为结构别名，扩展名和路径前缀
由运行时校验区分。`PackageDependencyReference` 是 dependencies 数组的引用项，
不是 dependency 包本体。启动器字段统一使用 `launcher`，官方存档模式使用 `official`。

## 图片与文档声明

`PackageContent` 保留公开名称及既有公共字段，现在按 `type` 区分为联合类型：
`campaign` 仅可声明 `banner?: string`，`customize` 仅可声明 `cover?: string`；
`dependency` 两者均不可声明。TypeScript、Schema 和 `isPackage` 均限制此对应关系。
为兼容现有类型使用，`PackageContent` 中的 `campaign` 字段仍可选；
`PackageCampaign` 和运行时战役校验仍要求有效的战役值。

三种类型均支持 `readme?: string`、`changelog?: string`、`docs?: string[]`。
这些只是路径声明：显式路径相对于压缩包根目录（推荐 `images/banner.webp`、
`docs/guide.md` 这种不带起始 `/` 的写法），不是资源的 `/Maps/`、`/Mods/` 逻辑路径。
`isPackage` 和 Schema 只校验字段结构，不访问路径、不检查文件是否存在、可读或可解码，
也不执行默认文件探测。`isPackage` 沿用文本不含 NUL 的限制；路径安全与实际读取由客户端后续处理。

客户端解析契约（此包不实现文件读取或展示）：

- 显式 `banner` / `cover` 路径无效、文件不存在或无法加载时，直接使用客户端默认图片，
  **不再自动探测同级图片**。
- 仅在相应字段省略时，按顺序、精确且区分大小写地探测清单同级
  `banner.jpg`、`banner.png`、`banner.webp`（战役），或
  `cover.jpg`、`cover.png`、`cover.webp`（自制）；均不可用时使用默认图片。
- `readme` 省略时，依次精确探测清单同级 `README.txt`、`README.md`、`readme.txt`、`readme.md`；
  `changelog` 省略时，依次精确探测 `CHANGELOG.txt`、`CHANGELOG.md`、`changelog.txt`、`changelog.md`。
  显式文档路径缺失或不可接受时忽略该文档，不回退探测默认名称；`docs` 仅使用声明的路径列表。
- 文档引用及文档中的图片只能指向包内文件；客户端解析时必须限制在包内，
  不允许外部网址、绝对路径、目录穿越或符号链接逃逸。

客户端已实现附件读取：接受 JPEG / PNG / WebP 图片，单个图片上限 8 MiB，
经 Electron `nativeImage` 解码后重新编码为 PNG；文档限 UTF-8 的 `.md` / `.txt`，
单文件上限 1 MiB。保存的附件最多 256 个文件、总计 64 MiB。
附件保存为客户端管理的私有副本，删除原始来源后仍可读取，扫描更新也会保留副本。
旧安装记录仅在经过校验的管理目录中按需读取，不回退到任意原始来源目录。
renderer 使用 [Comark 的 Vue 渲染器](https://comark.dev/rendering/vue) 配合
[Nuxt UI Prose](https://ui.nuxt.com/docs/typography) 展示 Markdown，通过 Vue/Vite 集成，
不依赖 Nuxt 服务端。不启用 HTML、MDC 组件和属性插件；只保留允许的 Markdown 节点并重建属性，
不允许任意组件、事件处理器、动态绑定或组件覆盖。文档链接仅在同一包内的 `.md` / `.txt`
文件及标题片段间导航，图片仅通过同包受控 IPC 读取；拒绝远程资源、协议 URL、磁盘绝对路径和
逃出包目录的路径，不打开外部链接。以上均为客户端职责，不增加 standard 校验中的文件访问。

完整作者说明见[作品包格式](../../docs/scnexus-package-format.md#图片与文档)。

## 自动生成的声明与 JSON Schema

`src/package/package.type.ts` 是类型和结构 Schema 的唯一来源。完整构建会先用 tsup
生成单文件 `dist/package/index.d.ts`，再用 ts-json-schema-generator 生成
`dist/package.schema.json`（JSON Schema Draft-07，内部 definitions 引用自包含）。
不要手改 dist；`pnpm run build:schema` 可单独重新生成 Schema，watch 成功构建后也会生成。
两种生成工具及测试用 Ajv 都仅为开发依赖，消费者不需要它们。

Schema 随 npm 包发布，公开入口为 `@scnexus/standard/package.schema.json`：

```js
import schema from '@scnexus/standard/package.schema.json' with { type: 'json' }
```

编辑器可以将该文件关联到作品的 package.json。示例（路径需按实际项目布局调整）：

```json
{
  "$schema": "./node_modules/@scnexus/standard/dist/package.schema.json",
  "name": "共享模组",
  "description": "模组依赖包",
  "version": "1.0.0",
  "author": "作者",
  "type": "dependency",
  "mods": [{ "name": "Core.SC2Mod", "source_path": "/Mods/Core.SC2Mod" }]
}
```

`$schema` 是所有包均可选的字符串，运行时校验不会访问该地址。不声明尚未部署的远程
Schema URL，公开 CDN 地址应在实际发布后再配置。

生成内容包含全部可达类型、必填/可选字段、类型分支、枚举，以及 JSDoc 标注的非空白名称、
scnid 非负安全整数、地图/模组扩展名和路径前缀。所有对象的 Schema 均拒绝未声明字段；
现有 `isPackage` 为兼容历史内容，对非 dependency 对象的额外字段仍较宽松。
因此 Schema 与 isPackage **不完全等价**：Schema 不替代运行时校验，TypeScript 不能
表达的业务规则也不自动推导。例如 campaign 必须有有效 campaign 类型、字段中的 NUL
限制由 isPackage 检查，路径穿越、安装目录边界和 launcher 地图引用由客户端继续校验。
描述和标签只是文本，不增加 URL 抓取或脚本执行能力。

运行 `node --test scripts/__tests__/standard-distribution.test.mjs`（仓库根目录，先构建）
验证生成结果稳定、ESM/JSON 子路径、完整声明、Ajv Schema 校验及部分运行时契约一致性。

## 分类型校验函数

```ts
import { isPackageCampaign, isPackageCustomize, isPackageDependency } from '@scnexus/standard/package'

if (isPackageCampaign(input)) {
  // input: PackageCampaign，campaign 字段必填
  console.log(input.campaign)
}
```

三个包装函数先执行完整 `isPackage` 校验，再匹配 `type`，分别收窄为
`PackageCampaign`、`PackageCustomize`、`PackageDependency`。不只是检查 type 字符串，
也不额外扩展安装支持；校验通过不代表资源实际存在或已通过客户端安装安全检查。
