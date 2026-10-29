# SCNexus Server 桌面端接入方案与实施记录

## 1. 范围与交付输入

本客户端只维护 renderer-v2。接入遵循后端 `docs/client/README.md`、`electron.md`、`contract.md`、`auth-api.md`、`client-transport.md` 与验收清单；后端仓库仅只读，不由本任务修改。

2026-10-21 用户确认首期：安全基础、邮箱密码登录、MFA 登录、注册邀请策略、邮箱注册、忘记密码、启动恢复、用户/权限自查、退出。暂不做手机号/微信界面、MFA 配置管理、设备管理、签到、突变、通知、在线统计及管理后台。现有本地游戏与内容功能不以登录或联网为前置条件。

- 开发 API：`http://127.0.0.1:3000`。
- 生产 API：`https://api.scnexus.net`，尚未部署，不作为已通过联调的服务。
- 后端基线提交：`d336c7f72da9bb158a7386a860496e288dc7a261`。
- 导出时后端存在未提交的 README、启动地址日志实现与测试变更；该快照是运行实例导出，不声称是不可变提交产物。
- [OpenAPI 快照](../contracts/scnexus/d336c7f72da9bb158a7386a860496e288dc7a261/openapi.json)：2026-10-21 从获准的本地 `/docs/openapi.json` 只读获取。
- SHA256：`d93abab4f267e4abba5a4f01b8dd7fdbc8c77ff23be915fef2f30e426990622d`。
- 未读取或复制后端环境变量、数据库、SMTP/JWT/MFA 密钥。

## 2. 契约与平台边界

使用 DESKTOP 显式双 Token 协议，不使用 `/auth/web/*`、Cookie 或 CSRF 流程，无全局 `/api` 前缀。接受完整 2xx 响应，不能只接受 200。

| 能力 | 端点 |
| --- | --- |
| 注册策略 | GET `/registration-policy` |
| 邮箱密码登录 | POST `/auth/login` |
| MFA 登录 | POST `/auth/two-factor/login` |
| 验证码申请 | POST `/auth/challenges`，REGISTER/RESET |
| 注册 | POST `/auth/register` |
| 忘记密码 | POST `/auth/password/reset` |
| 刷新 | POST `/auth/refresh` |
| 当前退出 | DELETE `/sessions/current` |
| 用户自查 | GET `/users/me` |
| 权限自查 | GET `/users/me/authorization` |

`/users/me` 和 `/users/me/authorization` 的成功响应在快照中缺少完整 Schema；本期只按后端 Electron 文档明确的字段建立最小运行时校验，不宣称具备自动生成的完整 SDK。其他缺失响应不推测。文档与接口冲突时记录问题交后端维护者，不自行改后端。

## 3. 进程和目录职责

- `app-main/src/modules/auth/`：固定认证目标、严格输入/响应校验、Refresh 安全存储、唯一刷新协调、会话版本/epoch、退出与状态广播。
- `app-preload`：只暴露具体认证方法，不提供 URL 代理、任意 channel、Refresh 读取能力。
- `app-shared`：可序列化认证 DTO 和受信服务器配置，不含密钥。
- `app-renderer-v2/src/ipcs/auth.ts`：`ipcAuthXXX` 请求与事件适配，不使用 api 前缀。
- `app-renderer-v2/src/apis/`：固定 Axios 业务客户端及 `apiXXX` HTTP 函数，与 IPC 分开。
- `app-renderer-v2/src/stores/auth.ts`：内存认证展示状态与用户/权限投影，不启用持久化。
- `app-renderer-v2/src/views/account/`：Nuxt UI 账号页和短暂表单，清除已提交/退出的敏感输入。

## 4. 认证与存储

`未登录 → 登录中 → MFA 待验证/已登录 → 刷新中 → 已登录/未登录`；启动恢复不阻断本地服务。MFA 待验证不是已登录，不发布 Access 或旧账号数据。challengeId 由 main 保持，UI 只提交 OTP 或恢复码。

Refresh 仅 main 持有，用 Electron safeStorage 异步 API（`isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`）加密后原子落盘，Linux 拒绝 basic_text。读取解密返回对象的 `result`，兼容旧版同步 API 保存的密文；恢复后仍按既有流程轮换 Refresh。加密不可用、密文损坏、写入失败均 fail closed，不明文回退。异步加密完成后，在同步文件提交前再次校验存储修订号与会话 epoch，避免退出、切换账号或 dispose 期间的旧任务重新写入凭据；旧任务失败不得清除新会话。新 Refresh 安全保存后才发布对应 Access。正常退出应用保留有效密文供下次恢复；账号退出清除密文和内存。

main 通过单飞 Promise 协调窗口续期；已有较新且仍有效 Access 时复用。Refresh 单次轮换禁止通用重试；结果不明确时清除会话并重新登录。账号退出/切换推进 epoch，晚到登录或刷新结果不得写入或广播。

密码、Token、Authorization、OTP、恢复码和 Axios config/响应体不得进入日志、遥测或错误 DTO。HTTP 和 IPC 错误只输出安全状态与通用解释。

## 5. 网络与窗口安全

生产 API 固定 HTTPS，开发仅允许受信 loopback HTTP；不允许页面、深链或远程设置覆盖 API 来源。main 认证请求不发送 Cookie、不跟随重定向。renderer Axios 禁止外部绝对 URL，withCredentials=false；生产 UI 使用独立应用来源，不执行 Web Cookie 登录。

生产 renderer 迁移至 `app://localhost`，在 ready 前注册 standard/secure scheme；handler 只服务打包资源并防止目录穿越。IPC 校验登记窗口、主 frame 与精确页面来源。验证 preload 兼容后开启 sandbox，并设置最小 CSP。

业务 401：调用 main 无参数 refresh，GET/HEAD 最多重发一次。业务写请求不自动重放；403/429/503 分别提示，不能无限刷新。退出/账号变化清除旧用户状态，丢弃旧请求结果。

## 6. 界面流程

- 账号页不替代本地首页，不强制登录。
- 注册先读取 invitationRequired；邀请码可选时用户提供也必须发送并由服务端校验。
- 验证码保持六位字符串，绑定申请的 subject/purpose/challengeId，遵守 retryAfter 与有效期；accepted 仅显示“申请已受理，如符合条件将收到验证码”，不宣称已投递。
- 忘记密码不绕过启用 MFA 的账号，提供明确失败提示，不自造人工恢复 API。
- 退出远端撤销失败仍完成本地退出，明确远端撤销未确认。
- 当前用户仅显示文档确认的 id、会话和 MFA 状态，权限只控制 UI，不代替服务端授权。

## 7. 验收策略

自动化覆盖：输入/响应校验、敏感字段不泄露、MFA 分支、Refresh 单飞与旧令牌不重试、保存失败/超时、退出和晚到结果、HTTP 401 有限重试、写操作不重放、表单挑战配对、来源/CSP/资源路径、用户切换数据清除。

真实联调只在获准本地环境进行，不自动注册、发验证码、重置真实账号或消费真实恢复码。真实注册/邮件投递、MFA 验证、系统密钥环、生产域名/CORS/打包安装验收需要合成账号及人工确认。每项报告区分通过、模拟验证、尚未验证，不将类型检查或 Vite 构建当作真实联调。

## 9. 2026-10-21 契约与账号表单更新

只读对照后端 `d645838df291b1c6a0e0049e339c8aba08f41ff0` 文档新增的 clientId 与密码规则。本地 `127.0.0.1:3000` 已不可连接，未能导出此版本 OpenAPI；上方快照仅代表原基线，不宣称覆盖新增字段。

- 登录/注册由 main 读取既有 setting.clientId（Sentry 同一安装 UUIDv4）并发送，不由 renderer 自报，不重新生成硬件/账号 ID；MFA/刷新不传此字段，保持后端会话关联。响应的可空 clientId 仅作为元数据，不参与授权。
- 新密码更新为 8–128 字符，同时包含大写英文字母、小写英文字母、数字和 ASCII 特殊符号；空白/中文不替代符号，不裁剪密码。登录仍允许原有 1–128 字符密码。renderer 与 main 共用纯校验函数。
- 设备名称通过专用 IPC 从系统 hostname 自动取得（最长 80 字符），玩家可以编辑；异步结果不覆盖已填写名称。名称不是可信设备身份。
- 登录卡片移除外层顶部垂直留白，压缩内部间距；验证码输入与申请按钮并排；不展示邀请码说明提示，保留必填状态和服务端策略验证。

## 个人中心、昵称与交互验证

只读对照后端 `docs/user-profile.md`，用户自查新增 `nickname`（非空字符串）与 `email`（字符串或 null）。HTTP 适配保留这些字段，侧栏显示服务器昵称，仍以 user ID 关联状态，不把昵称用于授权或账号去重。未实现昵称修改功能，也不向注册接口附加昵称。个人中心采用全宽无外层卡片布局，侧栏只保留头像加昵称/未登录。

Zod 依赖声明于 renderer-v2，仅用于用户交互输入：登录、注册、找回密码及 MFA 表单。原 HTTP 响应验证、主进程 IPC/凭据安全校验、内容包和 Store 验证不因该迁移而更改。密码仍复用共享强度规则，验证码/恢复码保持原始字符串，挑战仍校验邮箱、用途与有效期配对。

## 8. 实施结果

已实现首期模块：main 认证服务及安全密文存储、受控 auth IPC/preload、内存 Pinia 状态、固定目标 Axios HTTP、账号页与三语文案。认证已接入模块初始化/释放；生产窗口使用 app://localhost，preload 改为 sandbox 兼容的 CommonJS index.cjs，IPC 校验精确页面来源。HTTP fetch 适配显式 credentials=omit、redirect=error；401 恢复失败统一清会话，业务写不重放。用户的 Vite 自动导入目录调整保持不变；HTTP 内部适配置于 apis/internal 避免重复导入。

2026-10-21 验证记录：

| 命令/验证 | 结果 |
| --- | --- |
| `pnpm run lint:oxlint` | 全仓通过 |
| `pnpm run typecheck` | shared/main/preload/renderer 全部通过 |
| `pnpm run build` | 最终 main、sandbox preload、v2 生产构建通过，无重复自动导入告警 |
| `pnpm run test:build` | 15 项通过 |
| `pnpm --filter @scnexus/app-main test src\\modules\\auth\\__test__ src\\modules\\window\\__test__ src\\utils\\__test__\\ipc-source.test.ts src\\modules\\__test__\\init.test.ts src\\modules\\logging\\__test__\\logging.test.ts --maxWorkers=1` | 40 项通过 |
| `pnpm --filter @scnexus/app-renderer-v2 exec vitest run --maxWorkers=1` | 22 文件、156 项通过 |
| `pnpm exec vitest run -r packages\\app-preload --maxWorkers=1` | 9 项通过 |
| `pnpm --filter @scnexus/app-main test --maxWorkers=1` | 276 通过、1 项旧归档安装目录 rename EPERM 失败；未改动该无关逻辑，不宣称全量通过 |
| 真实 Electron 隔离 userData 冒烟 | app://localhost、sandbox renderer 无 require、认证桥接与 getSnapshot 请求成功；未使用真实账号 |
| 只读 GET `/registration-policy`，Origin=http://localhost:5173 | HTTP200、invitationRequired=false、允许来源精确返回 localhost:5173 |
| 浏览器无桥接账号页 | 账号表单正确渲染且禁用，显示桌面专用提示，本地导航保留 |
| 只读安全代码审查 | 未报告可确认漏洞；不等于真实生产安全验收 |

尚未完成：真实注册/验证码投递、真实 MFA 登录及恢复码消费、真实双 Token 联调、Windows 凭据损坏/系统策略人工验收、Linux secret-service、生产 HTTPS/CORS/域名部署与正式安装包验收。未自动注册、发码或重置账号；后端文档与源文件均未修改。生产地址已固定但未部署，不声称已通过生产认证。

## 2026-10-22 注册响应兼容与错误诊断

只读获取后端 `4d2ed090f5a13560a1b19e5ee8da21745a1ec36e` 的当前 OpenAPI，快照位于 `contracts/scnexus/4d2ed090f5a13560a1b19e5ee8da21745a1ec36e/openapi.json`，SHA256 为 `1e5b8d808c59c0b531b6eef1d124c82746d3e65078824c186401ec03d92e95c8`。

发现当前 NativeTokenResponseDto 新增 `isPublicDevice`。原严格响应白名单拒绝此字段，可造成服务端注册已完成但客户端未建立登录。已兼容普通会话 `isPublicDevice:false`；未提供公共设备模式选择前，不接受 true 并持久化其凭据（fail closed），该独立能力尚未实现。旧版缺省字段继续兼容。

认证失败现在保留受控阶段分类：network、HTTP 状态白名单、response、storage；不传输或记录后端响应体、Axios config、密码、验证码或 Token。前端根据分类给出可操作提示，不再把后端 400 等统一误称为凭据保存失败。原日志未含阶段，不能事后证明当时原因；未自动注册/发码复现。服务端可能已消费验证码或建号，遇此情况应先尝试登录/找回，不连续自动重放注册。

个人中心登录布局固定左右两栏，不使用响应式隐藏品牌栏或切为单列。standard 包已仅发布 ESM，保留 metadata/package 两个 import 子路径，移除 require 导出和 CJS 产物；此为破坏性分发调整，不要求 sandbox preload 取消其必要的 CJS 运行入口。

## 2026-10-22 玩家个人中心、昵称与签到

个人中心不再面向玩家展示 user ID、session ID、会话端、角色及权限清单；资料区域只展示服务器昵称与邮箱（null 显示未绑定），昵称允许编辑，不提供邮箱换绑。内部认证仍按 user/session ID 关联，不用昵称判断身份。

- PATCH `/users/me/nickname` 仅发送 `{nickname}`。输入用 Zod 先 NFC，再按码点8–16位和后端明确字符范围验证；不trim、不使用泛Unicode字母放行。成功采用服务器返回昵称同步内存用户，侧栏自动响应。失败不本地冒充保存成功。
- GET `/users/me/experience` 展示累计经验、服务端等级、下一级所需经验与今日签到状态；等级不在客户端重新推算。
- POST `/users/me/check-in` 发送空对象，不传用户ID/日期/经验。仅用户点击提交，成功整体采用服务端返回值，不本地先加10；重复响应0奖励不当错误。
- 重置日界为服务端北京时间00:00，依据 nextCheckInAt 重新读取；网络失败保留旧信息并提示，不静默清零。退出/切账号清除经验，晚到资料/签到结果不可写入新账号。
- 不自动重放 PATCH/POST。写操作超时无法确定结果时提示用户检查最新状态后再决定，不将UI禁用按钮当作后端幂等保证。

本轮只读核对运行后端 OpenAPI 的三个端点及后端 user-profile/experience-check-in 文档，契约快照与前节4d2ed090版本摘要一致。测试使用模拟传输，不自动消费真实签到或修改真实账号昵称。

### 个人中心标准窗口布局验收

按1000×700浏览器视口、模拟已登录状态验收：资料/经验两列同起点、各402px，昵称编辑展开及长邮箱无横向溢出，未显示重新加载账号信息/刷新经验按钮，未调用真实资料写接口。界面保持等宽两列，不因lg断点主动改为单列；移除昵称下方说明，自动同步与业务错误toast保留。

## 2026-10-23 在线分析：周期心跳、离线暂停及隐私开关

本节替代此前“生命周期单次心跳”方案。用户明确确认改用后端约30秒周期心跳，不考虑窗口前后台、最小化或挂起调度。在线状态因此表示联网且启用统计的应用实例，不严格等同于前台可见使用；不采集页面轨迹或内容操作。

- 设置“日志与隐私”新增“在线分析”，默认开启，独立于Sentry错误遥测。setting schema升至3；旧v1/v2保留原偏好并默认启用，用户关闭后重启仍保持关闭。
- 开启时启动/登录/主动退出后串行注册或复用同visitorToken，成功后立即心跳，随后每30秒一次；Access刷新只替换后续请求使用的Token，不重复注册。关闭立刻中止请求、清定时器和网络观察，不清除安装访客凭证；再次开启按当前会话恢复。
- 主进程每5秒仅查询Electron net.isOnline的OS连通状态，无HTTP探测。离线停止统计请求和退避任务，直到OS报告网络恢复。网络请求失败也暂停，不用循环请求探测网络。OS连通性不是API可达性保证；若系统一直报告在线而传输无响应，需明确在线恢复信号或应用重启，不用盲目重试旧网络请求。
- 503/5xx与429采用指数退避加抖动（基础等待有60秒上限），Retry-After为最小等待时间，最长受计时器范围保护；503不清凭证、不新建访客。永久4xx/无效响应暂停，不反复请求。
- 已知expiresAt过期在请求前清旧凭证，本次注册直接省略旧token。匿名接口401可明确判断统计访客无效，只串行修复注册一次；再次401暂停。认证401不贸然丢visitorToken、不调用认证refresh，等待新的认证状态；后续周期使用最新已登录Access。
- 所有统计HTTP使用固定目标、Node adapter、无Cookie、无重定向、5秒超时，不输出凭证/原始错误，不发toast、不阻断认证和本地功能。无额外leave请求，退出先按既有流程撤销会话，再切匿名周期。
- 访客凭证仅main持久化，复用现有安装UUIDv4 clientId，不以clientId认领旧访客。任务失效不能发送过时身份心跳，禁用后迟到响应不落盘；同一安装已签发且会话切换期间到达的有效访客凭证可供下一身份复用。

测试使用模拟传输/存储/时钟，覆盖30秒周期、开关、离线恢复、退避、Retry-After、过期/失效凭证、认证更新和旧设置迁移。未向真实后端自动写统计，不宣称已验收生产统计快照或持续前台在线口径。后端文件只读。

验收记录（2026-10-23）：`pnpm --filter @scnexus/app-main test --maxWorkers=1` 39文件353项通过；renderer-v2全量26文件258项通过；`pnpm run typecheck`、`pnpm run lint:oxlint`、修改文件ESLint、`pnpm run build`通过；`pnpm run test:build` 19项通过。未执行真实统计写请求及生产在线快照验收。

## 2026-10-23 每周突变与突变因子

renderer-v2 新增“每周突变”导航入口，使用现有固定地址 Axios 客户端直连公开只读接口，不需要登录、不附带 Access 或 Cookie，不新增 IPC 或持久化。

- `GET /sc2/coop/weekly-mutations/current`：省略 region 按后端约定默认 CN。展示主题、展开地图、本周因子及北京时间区间；区分 `projected` 轮换推算与 `verified` 已核验，`lastVerifiedAt: null` 不显示核验时间。
- `GET /sc2/coop/mutators`：展示全部目录，支持中文名、英文名和描述搜索。社区评分仅在存在且非负时显示，`-1` 不当作实际评分；不将 `iconName` 当远程图片 URL；按因子 `id` 从 `src/assets/mutators/{id}.png` 通过 Vite glob URL 映射加载，静态导入 `Ui_coop_ingame_mutatorframe.webp` 外框并叠加，生产资源路径由构建器生成，不再拼接 public URL。图标缺失时显示占位，装饰图片不重复朗读名称。页面采用局部突变绿主题，不影响其他模块，保持 1000×700 双列布局。
- `available: false` 的 `NO_SCHEDULE` 和 `OUTSIDE_VALIDITY` 是成功的空状态，不报网络故障。有效期为 `[startsAt, endsAt)`；到期或恢复可见时检查到期状态，停止展示旧安排，由用户刷新，不将过期响应直接外推、不循环重试。
- 响应通过普通 TypeScript 校验，仅保留显示字段；描述以纯文本渲染，不使用 HTML。两个接口独立加载，各自以后端成功响应优先；请求失败（含无效响应）时使用随包的 `src/assets/mutators/weekly-data-default.json` 回退，不弹出网络失败提示。后端成功返回不可用或空目录时不回退。本周回退按本地快照的 CN 周历锚点、有效范围及覆盖记录计算，覆盖优先，区间同样为半开区间；不把任意第一条当作本周。手动刷新仍先请求后端。移除轮换推算说明句，保留状态标记。页面卸载后迟到结果不更新页面或提示。

本机只读联调成功：当前返回“光炫神迷 / 机会渺茫”、3 个本周因子和 69 个目录因子。后端后续移除本周响应 `source` 字段，客户端已停止要求及保留该字段，兼容旧响应多余字段但不显示、不访问其 URL；对应回归覆盖无 `source` 的成功返回。因子卡片同排等高（Grid stretch），高度由本行最长说明决定，不裁切文字。1000×700 浏览器验收，两列各 402px，无横向溢出；中文搜索“激光”返回 1 项。开发来源使用后端已允许的 `http://localhost:5173`；其他临时端口未被 CORS 允许，不通过放宽安全配置绕过。生产 API 与打包环境仍需部署后独立验收；本轮未修改后端。

验收命令：`pnpm run typecheck:renderer` 通过；`pnpm run test:renderer` 29 文件 279 项通过（新增突变相关 20 项）；`pnpm run build:renderer` 通过；`pnpm exec oxlint -c .oxlintrc.json packages\app-renderer-v2` 通过；新增及修改的业务文件 ESLint 通过。

## 2026-10-24 共享轮换、多服务器及资料语言

以服务端 `docs/sc2-mutations.md` 的“共享轮换与多服务器”最新规则为准，替代前文 CN-only 回退描述。

- 页面支持 CN/NA/EU/AS，默认 CN；资料语言支持 zhCN/enUS/ruRU/koKR/frFR/deDE，底层支持六种资料语言，页面不提供独立语言选择，自动跟随设置的有效界面语言：en→enUS，zh/zh-Hant→zhCN（后端无zhTW）。公开 current 请求传 region/language，mutators 传 language；无认证头和 Cookie，不改变固定 API origin。
- 保留多语言 name，优先使用服务端 displayName；本地回退遵循请求语言→enUS→zhCN。描述维持服务端原文，不宣称已翻译。服务器使用分段切换器，仅影响当前页面；资料语言随设置自动同步，不单独持久化。
- 本地 weekly-data-default 的共享 schedules 使用 startIndex/regions；每地区从 start 按固定七天推进，起点前不可用，遵守可选 validFrom/validUntil。覆盖仅影响同 region，且截断推算区间；不按地区名称猜测 DST。界面时间跟随用户操作系统的本地时区，起止与核验时间附带各自时区缩写/偏移（支持跨夏令时区间），区间仍来自所选服务器，不改变时间戳或轮换计算。
- 切换地区/语言会重新获取；各加载任务带递增版本，迟到成功和失败均不得替换新选择或触发旧回退。每个请求仍后端优先，只有失败才使用当前所选地区/语言的本地数据，成功的暂无安排不回退。
- 本轮只接入既有本周与因子功能的新版契约，不增加管理发布入口或将轮换目录当成本周安排。

验证：`pnpm run test:renderer` 31 文件 293 项通过；`pnpm run typecheck:renderer`、`pnpm run build:renderer`、renderer Oxlint 与修改文件 ESLint 通过。本地公开 EU/deDE 请求成功返回对应 displayName；1000×700 页面两列各402px同高，无横向溢出。未修改后端或用户提交的默认JSON，未执行生产环境联调。

## 2026-10-27 Workshop 客户端重建

以最新 `workshop-api.md`、`client/workshop-electron.md`、`workshop-creators.md`、`files.md` 和 `workshop-worker.md` 为准。未修改后端，未增加管理员工作台；未实现后端尚不存在的点赞/收藏/评论接口。

### 浏览、设置与资格

- 新增匿名公开作品列表、12项分页、关键词搜索和scnid详情；正文为受限Tiptap JSON，纯文本/白名单VNode渲染，不使用HTML。创建/编辑使用title/description/detail/fileIds，不发slug、旧UUID项目ID或summary/content。
- 下载须登录，匿名点击前往个人中心并保存受限本地返回路径。后台已签发的文件能力不等于用户Access；二者不混用。公开互动接口尚未交付，因此不添加可点击但无真实操作的互动按钮。
- 设置新增“内容中心 / SCNexus Workshop”，默认true，setting schema4；旧设置迁移保留偏好并启用Workshop。关闭隐藏导航、路由拒绝访问、停止页面请求并暂停在途任务；不删除文件/记录，重新开启不自动恢复。后续后台检查同样必须受此开关控制。
- 个人中心显示NONE/ACTIVE/REVOKED/BLOCKED资格，创作邀请码对话框用Zod校验8–64位base64url字符。通过本人专用API兑换，随后重新读取授权。创作者导航/路由要求资格ACTIVE和三项创作权限，不凭角色名推测；权限错误不得自动重新赋权。管理员审核不实现。

### 作者与资源

- 我的作品列表、创建、字段编辑、Nuxt UI Editor、版本列表、候选取消、压缩包选择/验证、清单人工预填、更新日志和上传任务已接入。输入表单使用Zod；响应和IPC仍用普通TypeScript校验。冲突409保留编辑、不自动覆盖；放弃并重读由用户明确选择。
- 发布版本使用严格SemVer 2.0.0，支持预发布和build metadata，拒绝v前缀、空白、不完整版本和数字前导零。标准Schema与isPackage共同预检。package.name预填title，scnid不由客户端分配；填写的manifest scnid需匹配当前项目。只保存草稿不代表公开发布。
- Editor只启用合同允许的节点/marks；图片使用READY fileId，显式保存项目引用后才能用于版本日志，不保存预签名URL。公开/本人读取能力按fileIds批量申请，存内存并临近到期续签，组件卸载清理；地址必须匹配精确配置Files origin。CSP只加该HTTPS图片origin并设no-referrer，不开放任意https。图片上传失败不重PUT原对象。

### 任务与本地安装

- 旧workshop metadata.json改包、任意URL整包PUT和未完成下载代码全部移除；MD5计算保留在utils/file-md5.ts，旧IPC不再暴露。
- main持有选择文件路径和短期Worker token，renderer只使用selectionId/taskId。根package.json恰好一份且≤128KiB，严格UTF-8及重复键检查，拒绝不安全归档路径/链接/大小写冲突并限制展开规模；核对资源引用。SHA-256及每16MiB的base64 MD5从本地实际字节计算。
- 上传按控制面状态获取分片能力，当前串行分片（不超过4路上限）；异常先DB状态/reconcile，UNKNOWN不能再PUT，Complete不确定只对账不重复提交。取消由后端持久清理，不承诺立即删除远端字节。传输记录不包含短期token。
- 下载按16MiB Range，最多4路，严格206/Content-Range/长度/ETag；能力过期有限重新授权；完整SHA-256成功后原子转入缓存。再次安装重新哈希，缓存不能被符号链接替换。下载完成toast提示，必须在下载管理点击安装并确认冲突，不自动安装或激活。
- 任务持久化到应用自有workshop目录，重启后未完成任务暂停；关闭模块/身份切换会中止在途。任务按认证session隔离，退出重登的新session不会自动接管旧会话任务；同一持久化session恢复可手动续传。当前只支持workshop来源，git/github仅保留来源判别契约，传入会明确拒绝，不开放任意URL。
- dependency新增独立store、安装/扫描/卸载桥接和下载管理中的已安装列表。仅SCNexus模式，mods-only，资源组冲突、共享所有权、保留和事务回滚复用内容系统；不自动解析远程依赖或删除其他项目文件。

### 配置与验收限制

用户确认Workshop与Files Worker均未部署。本轮默认不填猜测域名，JSON浏览/编辑不依赖R2；下载/上传提示WORKSHOP_STORAGE_NOT_CONFIGURED。部署后main配置 `SCNEXUS_WORKSHOP_ORIGIN`、`SCNEXUS_FILES_ORIGIN`，renderer构建配置 `VITE_SCNEXUS_FILES_ORIGIN`，均必须为精确HTTPS origin，Files两处一致。现有API仍按开发loopback/生产固定地址使用。此环境变量接线用于受控部署，不允许页面设置任意域名。签名私钥和内部Worker secret不进客户端。

已执行模拟传输的Range校验、摘要失败、token续签、禁用暂停、Complete丢响应恢复、UNKNOWN拒写、旧会话隔离，及dependency冲突/回滚/共享文件保护。当前本地后端未运行，浏览器公开列表/详情与匿名下载登录跳转用合成响应验证，未进行真实作者写请求、邀请码消费、Worker/R2上传/下载。浏览器后续连接中断，完整创作者1000×700/真实图片续签和下载页真机验收仍需后续完成；实际Nuxt Editor在组件测试中已挂载为contenteditable，而非用替身冒充编辑器。

本轮最终本地验证：`pnpm run test:main` 46文件426项通过，`pnpm run test:preload` 10项通过，`pnpm run test:renderer` 38文件329项通过；`pnpm run typecheck`、main/preload/renderer构建及仓库Oxlint通过，新增业务与接线文件ESLint通过。最后修复CreatorStatus取消按钮多语句模板被格式化后生产解析失败，renderer已重新构建成功。未打包/发布应用，不宣称真实R2、工坊文件域名或macOS安装器验收。

## GitHub 仓库下载（2026-10-29）

下载管理新增“新建任务”，来源首期仅提供 GitHub 仓库。输入公开仓库 HTTPS 地址及分支（默认 `main`），主进程先读取、校验根目录 `package.json`；接受 `campaign`、`customize`、`dependency` 三种标准包，不兼容作者清单中的 `offcial` 等旧拼写。不要求工坊的 SemVer 发布规则。

该入口无需登录，不受 SCNexus Workshop 开关影响；下载导航始终可见。工坊来源的任务仍保留原有开关与账号隔离，不因此开放匿名工坊下载。GitHub 网络访问由 main 执行，renderer 不直接请求仓库、不接触缓存路径。

清单通过后才创建仓库 ZIP 下载任务。下载完成使用 toast 提示；不自动安装或激活。用户在下载管理点击“安装”后，复用统一内容分析、安装模式与冲突确认，并由内容系统执行安装。来源地址、分支显示在任务中。GitHub ZIP 的完整性记录仅用于本地缓存复验，不代表作者签名、病毒扫描或可信发布认证。

本轮验证：`pnpm run typecheck`、`pnpm run lint`、`pnpm run build:main`、`pnpm run build:preload`、`pnpm run build:renderer` 通过；主进程全量 51 文件 515 项、preload 12 项、renderer 49 文件 398 项通过（含 dependency ZIP 下载后进入安装分析的回归）。1000×700 浏览器检查新建任务对话框（512×398）无横向溢出，默认 `main` 与非法来源校验正常。

使用公开测试仓库 `MengLuoRJ/scnexus-package-test`（commit `f4470b3e8aa233ec56b92dbf979ad611201bff53`）完成真实隔离下载：ZIP 51,657,587 字节，未登录且工坊关闭时完成；缓存复验及现有内容分析识别为战役、35 个文件。未执行游戏安装，临时测试与缓存已清理。GitHub 暂停后恢复从头下载，不承诺 Range 断点续传；任务重启后暂停，用户手动恢复。
