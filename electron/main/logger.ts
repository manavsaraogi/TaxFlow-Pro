// File: electron/main/logger.ts
// Centralized logger for TaxFlow Pro

import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

let isInitialized = false;

export function setupLogger(module: string) {
  if (!isInitialized) {
    try {
      const logPath = path.join(app.getPath('userData'), 'logs');
      log.transports.file.resolvePath = () => path.join(logPath, 'taxflowpro.log');
      log.transports.file.level = 'info';
      log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn';
      log.transports.file.maxSize = 10 * 1024 * 1024; // 10 MB
      isInitialized = true;
    } catch {
      // app may not be ready yet, use console
    }
  }

  return {
    debug: (msg: string, ...args: unknown[]) => log.debug(`[${module}] ${msg}`, ...args),
    info: (msg: string, ...args: unknown[]) => log.info(`[${module}] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => log.warn(`[${module}] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => log.error(`[${module}] ${msg}`, ...args),
  };
}
