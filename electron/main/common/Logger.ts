import { app } from 'electron'
import logger from 'electron-log/main';

const log_level = app.isPackaged ? 'info' : 'silly';

logger.transports.console.level = log_level;
logger.transports.console.format = '{h}:{i}:{s}.{ms} [SCNexus/main] > {text}';

logger.transports.file.level = log_level;
logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [SCNexus/Main] {text}';

logger.info('Logger Initialized');

export default logger;