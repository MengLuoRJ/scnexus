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
