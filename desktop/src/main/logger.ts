/**
 * logger.ts — structured logging via electron-log.
 *
 * Log files land in the platform-standard location:
 *   Windows  %APPDATA%/ProofGraph/logs/main.log
 *   macOS    ~/Library/Logs/ProofGraph/main.log
 *   Linux    ~/.config/ProofGraph/logs/main.log
 *
 * File rotation: 5 MiB per file, 3 archived files kept.
 */
import log from 'electron-log/main';
import path from 'node:path';
import { IS_DEV } from './constants';

log.initialize();

// File transport: always capture info+
log.transports.file.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024;

// Console transport: verbose in dev, quiet in prod
log.transports.console.level = IS_DEV ? 'debug' : 'warn';

// Scoped loggers for each subsystem
export const mainLog  = log.scope('main');
export const hubLog   = log.scope('hub');
export const aiLog    = log.scope('ai');
export const winLog   = log.scope('window');
export const updLog   = log.scope('updater');

/** Directory containing the log files (for "View Logs" menu). */
export const LOG_DIR: string = path.dirname(
  log.transports.file.getFile().path,
);

export default log;
