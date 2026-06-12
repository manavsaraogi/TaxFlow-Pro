// File: electron/main/utils/appDirs.ts

import path from 'path';
import fs from 'fs/promises';
import { app } from 'electron';
import { setupLogger } from '../logger';

const logger = setupLogger('appDirs');

export function getAppDataPath(): string {
  return app.getPath('userData');
}

export function getDocumentsPath(): string {
  return path.join(app.getPath('userData'), 'documents');
}

export function getBackupPath(): string {
  return path.join(app.getPath('userData'), 'backups');
}

export function getLogsPath(): string {
  return path.join(app.getPath('userData'), 'logs');
}

export function getExportsPath(): string {
  return path.join(app.getPath('userData'), 'exports');
}

export async function ensureAppDirectories(): Promise<void> {
  const dirs = [
    getAppDataPath(),
    getDocumentsPath(),
    getBackupPath(),
    getLogsPath(),
    getExportsPath(),
    path.join(getDocumentsPath(), 'form16'),
    path.join(getDocumentsPath(), 'ais'),
    path.join(getDocumentsPath(), 'computations'),
    path.join(getDocumentsPath(), 'itr-json'),
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.warn(`Could not create directory ${dir}:`, error);
    }
  }

  logger.info('App directories ensured');
}
