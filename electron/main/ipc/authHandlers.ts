/**
 * electron/main/ipc/authHandlers.ts
 * Auth IPC handlers — setup, unlock, login, lock
 */

import { ipcMain } from 'electron';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../database';
import { initVault, lockVault, isVaultUnlocked, verifyMasterPassword } from '../vault';
import { setupLogger } from '../logger';

const logger = setupLogger('auth');

export function registerAuthHandlers() {

  // ── Is setup required? ──────────────────────────────────────────────────────
  ipcMain.handle('auth:isSetupRequired_fix.ts', async () => {
    try {
      const prisma = getPrisma();
      const setting = await prisma.appSetting.findUnique({
        where: { key: 'isSetupComplete' },
      });
      return { success: true, data: { required: !setting || setting.value !== 'true' } };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── First-time setup ────────────────────────────────────────────────────────
  ipcMain.handle('auth:setup', async (_event, data: {
    firmName: string;
    firmAddress?: string;
    firmPhone?: string;
    firmEmail?: string;
    adminUsername: string;
    adminDisplayName: string;
    masterPassword: string;
  }) => {
    try {
      const prisma = getPrisma();

      // Create firm
      const firm = await prisma.firm.create({
        data: {
          name: data.firmName,
          address: data.firmAddress,
          phone: data.firmPhone,
          email: data.firmEmail,
        },
      });

      // Create admin user
      const passwordHash = await bcrypt.hash(data.masterPassword, 12);
      await prisma.user.create({
        data: {
          firmId: firm.id,
          username: data.adminUsername,
          displayName: data.adminDisplayName,
          role: 'ADMIN',
          passwordHash,
          isActive: true,
        },
      });

      // Initialise vault with master password — returns salt
      const salt = await initVault(data.masterPassword);

      // Store vault salt in settings
      await prisma.appSetting.upsert({
        where: { key: 'vaultSalt' },
        update: { value: salt },
        create: { key: 'vaultSalt', value: salt },
      });

      // Mark setup complete
      await prisma.appSetting.upsert({
        where: { key: 'isSetupComplete' },
        update: { value: 'true' },
        create: { key: 'isSetupComplete', value: 'true' },
      });

      logger.info('Setup completed');
      return { success: true };
    } catch (e: any) {
      logger.error('Setup failed: ' + e.message);
      return { success: false, error: e.message };
    }
  });

  // ── Unlock vault ────────────────────────────────────────────────────────────
  ipcMain.handle('auth:unlock', async (_event, masterPassword: string) => {
    try {
      const prisma = getPrisma();
      const saltSetting = await prisma.appSetting.findUnique({
        where: { key: 'vaultSalt' },
      });
      const salt = saltSetting?.value;
      await initVault(masterPassword, salt ?? undefined);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: 'Invalid master password' };
    }
  });

  // ── Lock vault ──────────────────────────────────────────────────────────────
  ipcMain.handle('auth:lock', async () => {
    try {
      lockVault();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Vault status ────────────────────────────────────────────────────────────
  ipcMain.handle('auth:vaultStatus', async () => {
    return { success: true, data: { unlocked: isVaultUnlocked() } };
  });

  // ── Login ───────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:login', async (_event, data: {
    username: string;
    password: string;
  }) => {
    try {
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { username: data.username },
        include: { firm: true },
      });

      if (!user || !user.isActive) {
        return { success: false, error: 'Invalid credentials' };
      }

      const valid = await bcrypt.compare(data.password, user.passwordHash);
      if (!valid) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          action: 'LOGIN',
          entity: 'USER',
          entityId: user.id,
          description: `User logged in: ${user.username}`,
        },
      });

      logger.info(`User logged in: ${user.username}`);

      return {
        success: true,
        data: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          firmId: user.firmId,
          firmName: user.firm.name,
        },
      };
    } catch (e: any) {
      logger.error('Login failed: ' + e.message);
      return { success: false, error: e.message };
    }
  });

  // ── Get firm info ───────────────────────────────────────────────────────────
  ipcMain.handle('auth:getFirmInfo', async () => {
    try {
      const prisma = getPrisma();
      const firm = await prisma.firm.findFirst();
      if (!firm) return { success: false, error: 'Firm not found' };
      return { success: true, data: firm };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}
