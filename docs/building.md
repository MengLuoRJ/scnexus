# 构建与 Electron 45 验证

开发工具链使用 Node.js 26 和 pnpm 11+；Electron 45.0.0 内嵌 Node.js 24.22.0、Chromium 156.0.8078.48，不能用开发机 Node 版本代替运行时验证。根包、app-main 和 app-preload 三处 Electron 开发依赖统一为 `^45.0.0`，避免 preload 使用旧版类型；构建回归测试检查三者一致。

## 命令

- `pnpm install`：更新依赖；postinstall 使用真实 Electron 更新 Chrome/Node 构建 targets。
- `pnpm run build:prepare`：刷新 targets 并构建 standard。
- `pnpm run build:preload`：生成 sandbox 可加载的单文件 CommonJS preload。
- `pnpm run test:build`：构建契约、分发、7-Zip 和 Windows WER 回归测试。
- `pnpm run test:electron`：需要图形桌面的真实 Electron 45 冒烟，不包含在默认 `test` 中；先运行 `build:prepare` 和 `build:preload`。
- `pnpm run build:app`：同步版本、完整类型检查和三个运行包构建，随后生成 Windows `--dir` 产物；不发布。不与其他修改相同 dist/release 输出的构建并行。

`test:electron` 仅启动持久化测试 fixture，不加载业务 main、Sentry 或用户设置。所有 userData/sessionData/log/crash 路径均放在仓库内独立随机目录，退出后删除。测试禁用 Chromium 后台联网，并拦截测试 session 的 HTTP/WebSocket 请求，不发送业务遥测。隐藏窗口使用 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，加载真实构建 preload，通过受控模拟 handler 验证桥接往返及主世界 Node 隔离。另验证 Electron 版本、async safeStorage 可用性、加解密的 `.result` 往返，以及旧同步 API 密文的异步解密兼容；只有 fixture 使用已弃用同步加密 API，不打印密文。

Electron 45 移除了 sandbox preload 的 events/timers/url shim 和 Buffer/setImmediate 等全局；模拟 Electron 的单元测试不能覆盖这项兼容性，必须执行真实冒烟。

## 后端 API 环境配置

main 与 renderer 的 Vite 配置均以仓库根目录作为 `envDir`。在根目录创建 `.env.development.local`（开发）或 `.env.production.local`（生产），使用同一变量配置后端 API origin：

```dotenv
# .env.development.local
VITE_SCNEXUS_API_ORIGIN=http://127.0.0.1:3000
```

```dotenv
# .env.production.local
VITE_SCNEXUS_API_ORIGIN=https://api.scnexus.net
```

未设置时保留上述开发/生产默认地址；显式空值或非法值报错，不回退。只接受精确 origin，不带末尾 `/`、路径（包括 `/api`）、查询、片段或用户名密码。生产仅允许 HTTPS，开发额外允许 localhost、127.0.0.1、[::1] 的 HTTP origin，可指定本机端口。

配置在 Vite 启动/构建时注入，修改后重启开发流程；分发应用需重新构建 main 和 renderer 并打包，不会读取安装目录中的 `.env`。两个包必须使用同一环境配置构建。认证、在线统计、renderer HTTP、工坊 API 和生产页面 CSP 共用该入口；工坊 Worker/Files origin 仍是独立配置。更换后端地址还需核对服务器允许的客户端来源。

`VITE_*` 会进入客户端构建产物，只填写公开地址，不填写后端密钥。Sentry 可在同一生产环境文件另设 `VITE_SENTRY_DSN`，其打包环境与用户授权条件不变。本地环境文件已被 Git 忽略。

## TypeScript 配置与静态检查

各包保留现有编译器版本，不依赖 `ignoreDeprecations` 隐藏迁移问题。为兼容 TypeScript 7 移除的 `baseUrl`，项目配置已删除该选项；`paths` 的目标均以 `./` 开头，相对于所属配置文件解析。现有 TypeScript 5.7 与 6.0 检查通过不等于已在 TypeScript 7 编译器下验收。

ESLint 默认禁止显式 `any`；异构 IPC 回调及保留兼容性的无类型 JSON API 使用带原因的逐行例外，不对整个文件或全仓库关闭规则。两组 lint 均排除测试生成并清理的 `packages/standard/.types-test-*` 和 `.electron-smoke-*` 临时目录，避免与测试并行时误检合成消费者或遍历已删除的目录。

## Windows WER 与打包边界

当前 electron-builder 26.15.3 只重命名 Electron exe，没有同步重命名 Electron 45 分发中的 `electron_wer.dll`。`afterPack` 精准将 Windows Electron 45+ 的 helper 改为 `${productFilename}_wer.dll`（当前为 `SCNexus_wer.dll`），并支持 electronBranding.projectName。旧 Electron、其他平台和未改名 exe 不处理；缺失 DLL 报错，不静默省略。升级 builder 后须重新检查其实现，避免重复重命名。

2026-10-23 验证：`pnpm run build:app` 的类型检查和三个包构建成功，但默认下载/解压路径遇到 Windows EBUSY；独立输出重试遇到 EPERM 目录 rename。以下使用本机已安装分发的精准重试成功（不改变提交配置）：

```powershell
pnpm --filter @scnexus/app-main exec electron-builder build --config electron-builder.mjs --dir --publish never --config.directories.output=../../release/electron45-validation-local --config.electronDist=../../node_modules/electron/dist
```

成功目录中已检查 `SCNexus.exe`、`resources/app.asar` 和 `SCNexus_wer.dll` 存在，`electron_wer.dll` 不存在。隔离 smoke/WER 测试目录已自动清理；打包验证输出清理时仍有 Windows 文件锁，残留位于 `release/electron45-validation*` 和 `release/0.1.0-snapshot.2/win-unpacked.tmp`，须在锁释放后删除（这些输出不纳入版本控制）。

本机验证只覆盖 Windows x64 目录打包，不等于安装器、签名可信性、自动更新、macOS/Linux、真实业务启动或用户数据迁移验证。打包器会警告其他平台 OXC 可选依赖不存在；未据此扩大生产依赖。

## 原生库验证

node-casclib/node-stormlib 虽在 workspace 中，但 app-main 未声明依赖或导入它们，当前目录包也不应被描述为已集成原生库。它们有显式 no-build install；`pnpm install` 不会重编译原生模块。详情见 [native-packages.md](./native-packages.md)。

存在各包 dist 和当前平台 `build/Release/*.node` 后运行：

- `pnpm run test:native:node`：开发 Node 下执行两个包的已有完整测试。
- `pnpm run test:native:electron`：使用 Electron 的 Node 模式执行相同测试，不启动业务或窗口。

包装脚本将 TEMP/TMP/TMPDIR 指向仓库内隔离目录并清理，避免测试写入系统临时路径。2026-10-23 两个命令各 10 项通过、1 项跳过：MPQ 离线读写、BLTE raw/zlib 解码及兼容 bindings 已在现有二进制上真实执行；未配置 `CASCLIB_TEST_STORAGE`，真实安装 CASC 测试跳过。没有重新编译原生模块，没有验证真实 SC2 内容或打包后的原生库加载；N-API 可加载不等于业务集成或完整平台验证。

## macOS 第一阶段构建

本轮在Windows仅验证配置和文件契约，未生成或运行真实DMG。正式分发签名、公证与自动更新不在此阶段：mac配置显式identity=null、notarize=false、publish=null，仅生成内部测试的未签名包，macOS Gatekeeper仍会限制首次打开，不应宣称可直接正式分发或关闭系统安全设置。

在具备Node26/pnpm及Xcode Command Line Tools的Mac构建机上执行（先按锁文件安装依赖）：

```powershell
pnpm install --frozen-lockfile
pnpm run build:app:prepare
pnpm exec cross-env MODE=production pnpm run build
pnpm run test:build
pnpm --filter @scnexus/app-main exec electron-builder build --config electron-builder.mjs --mac --publish never
```

配置分别生成arm64和x64 DMG，文件名包含`_mac_${arch}`避免覆盖。要先检查目录包，可在最后命令添加`--dir`。应用本身的架构与SC2游戏进程架构分开；不自动安装Rosetta，也不由arm64应用包推断游戏为原生ARM。

Windows regedit VBS仅由win.extraResources附带；mac排除该资源。7z保持双架构Mach-O及许可检查，并在非Windows打包机检查执行权限，afterPack再次检查.app内app.asar.unpacked中的真实helper，避免只验证开发依赖却漏包。Windows WER命名钩子仍执行，但在mac自然不处理。

自动化：`pnpm run test:build` 24项通过，覆盖双架构文件名、平台资源隔离、mac打包后helper缺失拒绝和两种架构检查。真实Mac需独立验收DMG挂载/拖入Applications/首次启动、7z解压、Keychain、SC2识别和安装激活恢复卸载；未执行代码签名、公证或Mac自动更新。业务平台边界见[app-main-design.md](./app-main-design.md)。

## 2026-10-29 依赖升级验收

本节为当前升级结果，前文带日期的 Electron 45.0.0 / builder 26.15.3 记录保留为历史，不代表最新安装版本。

- 所有工作区直接声明的 TypeScript 统一为 `~6.0.3`，不升级 TypeScript 7。第三方工具内部的 TypeScript 依赖仍遵守上游要求，例如 Schema 生成器内部的 5.9，不用 override 强行替换。
- Electron 三处统一 `^45.1.0`，electron-builder `^26.18.0`、electron-updater `^6.8.11`、electron-store `^12.0.0`；Vite `^8.3.5`、Vitest `^5.0.5`、Vue I18n `^11.4.16`。同步升级常规工具与自动导入插件，保留既有 API 和持久化契约。
- standard 删除 tsup，使用固定 `tsdown@0.23.2` 和 Vitest 5。0.23.4 处于发布时间保护窗口，按用户确认不用例外放行。保留 `dist/package/index.js`、`index.d.ts`、`index.js.map` 及 JSON Schema，仍为 ESM-only；包级业务测试与根分发测试分别执行。根 `test` 和 `publish:standard` 均加入 `test:standard`，本轮未发布。
- Nuxt UI 编辑器依赖按其声明的 `^3.31.4` 范围正常安装，项目直接使用的 `@tiptap/core` 同步采用该范围；移除整组 Tiptap overrides 及仅针对 Nuxt UI 4.11.3 的过期 packageExtensions。安装、去重后锁文件解析为单一 `@tiptap/core@3.32.0`，无 peer 冲突，不强制覆盖间接依赖。升级依赖后先构建 renderer 刷新生成声明，避免旧声明指向过期 pnpm 实体目录。
- 保留 `7z-bin@0.0.3`、已弃用但仍有类型引用的 `scnexus-standard@0.0.13` 和既有 Node 类型版本策略；这些不在此次自动迁移范围。没有放宽发布时间保护，没有新增 npm/yarn 锁文件。

验证命令及结果：

- `pnpm install --frozen-lockfile`、`pnpm peers check`：通过，无 peer 问题。
- `pnpm run typecheck`、`pnpm run lint`：通过；两个原生包的包级 `typecheck`、standard 包级 `typecheck` 也通过。
- `pnpm run test`：通过；standard 4 项、分发 26 项、main 575 项、preload 19 项、renderer 427 项。standard 的 4 组业务测试由原根分发文件迁入包内 Vitest，计数变化不表示删除覆盖。
- `pnpm run build`：通过，包括 Schema 生成及三个运行包生产构建；仍有 renderer 大 chunk 提示，未进行无关拆包。
- `pnpm run test:electron`：通过，真实 Electron 45.1.0 / Node 24.22.1 / Chromium 156.0.8078.49，sandbox preload、受控桥接、异步 safeStorage 及旧密文解密兼容通过。旧同步加密仅测试 fixture 用于兼容验证。
- `pnpm run test:native:electron`：10 项通过、1 项真实 CASC 测试跳过（未指定安装数据），没有重编译原生模块。

Electron 安装器初次下载网络失败，随后仅从官方 Release 下载 ZIP，按 electron npm 包附带的 SHA256 校验后安装，刷新 targets 并完成真实冒烟；未更换镜像或关闭 TLS/校验。尚未执行新版 builder 的完整安装器打包、签名、真实自动更新、macOS 或真实游戏数据验收。Crashpad 注册的既有 CreateFile 噪声仍可出现，冒烟退出成功，不宣称已修复该独立问题。

## 旧标准依赖移除与 7-Zip 26.04（2026-10-29）

本节覆盖此前“保留旧标准包与 7z-bin”的暂缓决定。main/shared 已移除 `scnexus-standard`，工作区源码、manifest 和锁文件不再依赖旧 npm 包；新作品格式统一由 `@scnexus/standard` 定义与校验。删除无调用方的旧 shared types/stores 契约，不增加伪装新 Package 的类型别名；旧持久化数据仍以 `legacyRecords` 原样保留并备份，迁移测试覆盖列表、分组、激活及重启，未强行把未知旧数据转换为新清单。

`7z-bin` 升为固定 26.4.0，实际为 7-Zip 26.04。运行代码改用 `path7z` 命名导出；打包通过公开入口定位包目录，不再访问受 exports 限制的 package.json 子路径。许可证位于各架构目录，macOS 二进制位于 `bin/mac/{x64,arm64}/7zz`（当前各自文件均含双架构）；macOS 保留两份架构目录，校验目标 CPU 和执行权限，Windows/Linux 只保留目标架构。新版产物包含 ESM/CJS 入口，不再假定旧 `dist/index.js`。

验证：`test:build` 26 项、main 577 项、preload 19 项、renderer 427 项通过；`pnpm run lint`、`pnpm run build`（含全运行包 typecheck）、冻结锁安装、peer 检查通过。Windows 实际启动新版 7-Zip、归档/内容测试已执行；跨平台资源布局和 macOS Mach-O 校验在 Windows 上检查，不等于真实 macOS/Linux 执行或安装包发布验收。本轮不发布包、不提交代码。
