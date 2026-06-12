// electron/main/database.ts
// SQLite database initialization via Prisma

import { PrismaClient } from '@prisma/client';
import path from 'path';
import { app } from 'electron';
import { setupLogger } from './logger';
import { execSync } from 'child_process';

const logger = setupLogger('database');

let prisma: PrismaClient | null = null;

export function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'taxflowpro.db');
}

export async function initDatabase(): Promise<void> {
  const dbPath = getDbPath();
  logger.info(`Database path: ${dbPath}`);

  // MUST set before PrismaClient is created
  process.env.DATABASE_URL = `file:${dbPath}`;

  // Push schema to runtime path (creates tables if missing, no-ops if they exist)
  await ensureSchema(dbPath);

  prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
    log: ['error', 'warn'],
  });

  try {
    await prisma.$connect();
    logger.info('Prisma client connected');
    await seedInitialData();
  } catch (error) {
    logger.error('Database connection failed: ' + error);
    throw error;
  }
}

async function ensureSchema(dbPath: string): Promise<void> {
  try {
    // Run prisma db push against the runtime DB path
    // This is idempotent — safe to run every startup
    const cwd = path.join(__dirname, '../../..');
    execSync('npx prisma db push --skip-generate', {
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
      cwd,
    });
    logger.info('Schema ensured at runtime path');
  } catch (e: any) {
    // Tables may already exist — log and continue
    logger.error('ensureSchema warning: ' + (e.stderr?.toString() || e.message));
  }
}

async function seedInitialData(): Promise<void> {
  if (!prisma) throw new Error('Prisma not initialized');
  try {
    const count = await prisma.appSetting.count();
    if (count === 0) {
      await prisma.appSetting.createMany({
        data: [
          { key: 'CURRENT_AY', value: '2025-26' },
          { key: 'AUTO_LOCK_MINUTES', value: '30' },
          { key: 'isSetupComplete', value: 'false' },
          { key: 'defaultRegime', value: 'NEW' },
          { key: 'PORTAL_URL', value: 'https://www.incometax.gov.in' },
        ],
      });
      logger.info('App settings seeded');
    }
  } catch (e) {
    logger.error('Seed failed: ' + e);
  }
}

export function getPrisma(): PrismaClient {
  if (!prisma) throw new Error('Database not initialized. Call initDatabase() first.');
  return prisma;
}

export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('Database connection closed');
  }
}
