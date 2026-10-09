export const ERRORS = {
  APP_INITIALIZATION_FAILED: {
    code: 'M002',
    name: 'APP-INITIALIZATION-FAILED',
    description: '必需启动环节失败',
  },
  APP_UNEXPECTED_ERROR: {
    code: 'M001',
    name: 'APP-UNEXPECTED-ERROR',
    description: '无法分类的内部异常',
  },
  IPC_INVALID_ARGUMENT: {
    code: 'M003',
    name: 'IPC-INVALID-ARGUMENT',
    description: 'IPC 参数不符合契约',
  },
  IPC_SOURCE_REJECTED: {
    code: 'M004',
    name: 'IPC-SOURCE-REJECTED',
    description: '调用来源不被允许',
  },
  IPC_TRANSPORT_FAILED: {
    code: 'P001',
    name: 'IPC-TRANSPORT-FAILED',
    description: '桥接调用无法完成',
  },
  IPC_RESULT_INVALID: {
    code: 'R001',
    name: 'IPC-RESULT-INVALID',
    description: '返回 DTO 不符合契约',
  },
  STORE_READ_FAILED: {
    code: 'M005',
    name: 'STORE-READ-FAILED',
    description: '配置读取失败',
  },
  STORE_WRITE_FAILED: {
    code: 'M006',
    name: 'STORE-WRITE-FAILED',
    description: '配置提交失败',
  },
  STORE_DATA_INVALID: {
    code: 'M007',
    name: 'STORE-DATA-INVALID',
    description: '已存数据损坏或违反 schema',
  },
  STORE_MIGRATION_FAILED: {
    code: 'M008',
    name: 'STORE-MIGRATION-FAILED',
    description: '数据迁移失败',
  },
  STORE_VERSION_UNSUPPORTED: {
    code: 'M009',
    name: 'STORE-VERSION-UNSUPPORTED',
    description: '数据版本高于程序支持',
  },
  SETTING_INVALID_VALUE: {
    code: 'M010',
    name: 'SETTING-INVALID-VALUE',
    description: '用户偏好值无效',
  },
  PROFILE_NOT_READY: {
    code: 'M011',
    name: 'PROFILE-NOT-READY',
    description: '没有可用游戏环境',
  },
  PROFILE_GAME_NOT_FOUND: {
    code: 'M012',
    name: 'PROFILE-GAME-NOT-FOUND',
    description: '未发现游戏安装',
  },
  PROFILE_GAME_ROOT_INVALID: {
    code: 'M013',
    name: 'PROFILE-GAME-ROOT-INVALID',
    description: '候选目录不是有效游戏环境',
  },
  PROFILE_CAPABILITY_UNAVAILABLE: {
    code: 'M014',
    name: 'PROFILE-CAPABILITY-UNAVAILABLE',
    description: '当前游戏环境缺少所需执行能力',
  },
  PROFILE_CHANGE_BLOCKED: {
    code: 'M015',
    name: 'PROFILE-CHANGE-BLOCKED',
    description: '本地任务期间禁止切换游戏环境',
  },
  WINDOW_CREATE_FAILED: {
    code: 'M016',
    name: 'WINDOW-CREATE-FAILED',
    description: '主窗口创建失败',
  },
  WINDOW_LOAD_FAILED: {
    code: 'M017',
    name: 'WINDOW-LOAD-FAILED',
    description: '界面加载失败',
  },
  WINDOW_NOT_READY: {
    code: 'M018',
    name: 'WINDOW-NOT-READY',
    description: '当前没有可投递的就绪界面',
  },
  WINDOW_RENDERER_FAILED: {
    code: 'M019',
    name: 'WINDOW-RENDERER-FAILED',
    description: '页面进程崩溃或异常退出',
  },
  DEEP_LINK_INVALID: {
    code: 'M020',
    name: 'DEEP-LINK-INVALID',
    description: '协议链接结构或参数无效',
  },
  DEEP_LINK_QUEUE_FULL: {
    code: 'M021',
    name: 'DEEP-LINK-QUEUE-FULL',
    description: '待投递链接达到上限',
  },
  DIALOG_FAILED: {
    code: 'M022',
    name: 'DIALOG-FAILED',
    description: '系统对话框失败',
  },
  SHELL_TARGET_INVALID: {
    code: 'M023',
    name: 'SHELL-TARGET-INVALID',
    description: 'URL/路径不符合打开约束',
  },
  SHELL_OPEN_FAILED: {
    code: 'M024',
    name: 'SHELL-OPEN-FAILED',
    description: '系统打开目标失败',
  },
  TRAY_INITIALIZATION_FAILED: {
    code: 'M025',
    name: 'TRAY-INITIALIZATION-FAILED',
    description: '托盘初始化失败',
  },
  UPDATER_UNAVAILABLE: {
    code: 'M026',
    name: 'UPDATER-UNAVAILABLE',
    description: '当前运行环境不支持更新',
  },
  UPDATER_CHECK_FAILED: {
    code: 'M027',
    name: 'UPDATER-CHECK-FAILED',
    description: '更新检查失败',
  },
  UPDATER_DOWNLOAD_FAILED: {
    code: 'M028',
    name: 'UPDATER-DOWNLOAD-FAILED',
    description: '更新下载失败',
  },
  UPDATER_INSTALL_FAILED: {
    code: 'M029',
    name: 'UPDATER-INSTALL-FAILED',
    description: '更新安装启动失败',
  },
  FILESYSTEM_OPERATION_FAILED: {
    code: 'M030',
    name: 'FILESYSTEM-OPERATION-FAILED',
    description: '未被业务错误分类的文件操作失败',
  },
  FILESYSTEM_PATH_REJECTED: {
    code: 'M031',
    name: 'FILESYSTEM-PATH-REJECTED',
    description: '目标不在允许目录内',
  },
  ARCHIVE_INVALID: {
    code: 'M032',
    name: 'ARCHIVE-INVALID',
    description: '压缩包无效',
  },
  ARCHIVE_METADATA_MISSING: {
    code: 'M033',
    name: 'ARCHIVE-METADATA-MISSING',
    description: '包缺少元数据',
  },
  ARCHIVE_METADATA_INVALID: {
    code: 'M034',
    name: 'ARCHIVE-METADATA-INVALID',
    description: '元数据字段或格式无效',
  },
  ARCHIVE_FORMAT_UNSUPPORTED: {
    code: 'M035',
    name: 'ARCHIVE-FORMAT-UNSUPPORTED',
    description: '不支持的归档或压缩能力',
  },
  ARCHIVE_EXTRACT_FAILED: {
    code: 'M036',
    name: 'ARCHIVE-EXTRACT-FAILED',
    description: '解压失败',
  },
  CONTENT_TYPE_UNSUPPORTED: {
    code: 'M037',
    name: 'CONTENT-TYPE-UNSUPPORTED',
    description: '操作不支持该内容类型/管理格式',
  },
  CONTENT_SCAN_FAILED: {
    code: 'M038',
    name: 'CONTENT-SCAN-FAILED',
    description: '内容库扫描失败',
  },
  CONTENT_INSTALL_FAILED: {
    code: 'M039',
    name: 'CONTENT-INSTALL-FAILED',
    description: '内容安装失败',
  },
  CONTENT_UNINSTALL_FAILED: {
    code: 'M040',
    name: 'CONTENT-UNINSTALL-FAILED',
    description: '内容卸载失败',
  },
  CAMPAIGN_ACTIVATION_FAILED: {
    code: 'M041',
    name: 'CAMPAIGN-ACTIVATION-FAILED',
    description: '战役激活失败',
  },
  CAMPAIGN_DEACTIVATION_FAILED: {
    code: 'M042',
    name: 'CAMPAIGN-DEACTIVATION-FAILED',
    description: '取消激活失败',
  },
  CAMPAIGN_RECOVERY_FAILED: {
    code: 'M043',
    name: 'CAMPAIGN-RECOVERY-FAILED',
    description: '战役恢复失败',
  },
  GAME_LAUNCH_FAILED: {
    code: 'M044',
    name: 'GAME-LAUNCH-FAILED',
    description: '游戏或编辑器启动失败',
  },
  WORKSHOP_METADATA_WRITE_FAILED: {
    code: 'M045',
    name: 'WORKSHOP-METADATA-WRITE-FAILED',
    description: '内容包元数据写入失败',
  },
  WORKSHOP_HASH_FAILED: {
    code: 'M046',
    name: 'WORKSHOP-HASH-FAILED',
    description: '文件摘要计算失败',
  },
  WORKSHOP_UPLOAD_FAILED: {
    code: 'M047',
    name: 'WORKSHOP-UPLOAD-FAILED',
    description: '工坊上传失败',
  },
  WORKSHOP_DOWNLOAD_FAILED: {
    code: 'M048',
    name: 'WORKSHOP-DOWNLOAD-FAILED',
    description: '工坊下载失败',
  },
  NETWORK_REQUEST_FAILED: {
    code: 'R002',
    name: 'NETWORK-REQUEST-FAILED',
    description: '未被领域分类的 HTTP/网络错误',
  },
  NETWORK_TIMEOUT: {
    code: 'R003',
    name: 'NETWORK-TIMEOUT',
    description: '网络请求超时',
  },
  TASK_CANCELLED: {
    code: 'M049',
    name: 'TASK-CANCELLED',
    description: '用户取消长任务',
  },
  TASK_TIMEOUT: { code: 'M050', name: 'TASK-TIMEOUT', description: '操作超时' },
  TASK_CONFLICT: {
    code: 'M051',
    name: 'TASK-CONFLICT',
    description: '同一资源已有互斥任务',
  },
  LOGGING_CONFIGURATION_FAILED: {
    code: 'M052',
    name: 'LOGGING-CONFIGURATION-FAILED',
    description: '日志等级应用失败',
  },
  LOGGING_TRANSPORT_FAILED: {
    code: 'M053',
    name: 'LOGGING-TRANSPORT-FAILED',
    description: '日志输出目标失败',
  },
  TELEMETRY_INITIALIZATION_FAILED: {
    code: 'M054',
    name: 'TELEMETRY-INITIALIZATION-FAILED',
    description: 'Sentry 初始化或身份绑定失败',
  },
  TELEMETRY_DISABLE_FAILED: {
    code: 'M055',
    name: 'TELEMETRY-DISABLE-FAILED',
    description: '遥测 SDK 清理或关闭失败',
  },
  GAME_DISCOVERY_FAILED: {
    code: 'M056',
    name: 'GAME-DISCOVERY-FAILED',
    description: '游戏目录自动发现失败',
  },
  GAME_DIRECTORY_PREPARATION_FAILED: {
    code: 'M057',
    name: 'GAME-DIRECTORY-PREPARATION-FAILED',
    description: '游戏管理目录创建失败',
  },
  GAME_MODULE_INITIALIZATION_FAILED: {
    code: 'M058',
    name: 'GAME-MODULE-INITIALIZATION-FAILED',
    description: '游戏或内容依赖模块初始化失败',
  },
} as const

export type ErrorDefinition = (typeof ERRORS)[keyof typeof ERRORS]
export type ErrorCode = ErrorDefinition['code']
export type ErrorName = ErrorDefinition['name']
