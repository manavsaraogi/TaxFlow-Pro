// File: electron/main/ipc/settingsHandlers.ts

import { ipcMain } from 'electron';
import { getPrisma } from '../database';
import { setupLogger } from '../logger';

const logger = setupLogger('settingsHandlers');

export function registerSettingsHandlers(): void {

  ipcMain.handle('settings:get', async (_event, key: string) => {
    try {
      const prisma = getPrisma();
      const setting = await prisma.appSetting.findUnique({ where: { key } });
      return { success: true, value: setting?.value || null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:getAll', async () => {
    try {
      const prisma = getPrisma();
      const settings = await prisma.appSetting.findMany();
      const map: Record<string, string> = {};
      settings.forEach((s) => (map[s.key] = s.value));
      return { success: true, settings: map };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
    try {
      const prisma = getPrisma();
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:updateFirm', async (_event, data: {
    name?: string;
    address?: string;
    pan?: string;
    gstin?: string;
    phone?: string;
    email?: string;
  }) => {
    try {
      const prisma = getPrisma();
      const firm = await prisma.firm.findFirst();
      if (!firm) return { success: false, error: 'No firm found' };

      const updated = await prisma.firm.update({
        where: { id: firm.id },
        data,
      });
      return { success: true, firm: updated };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  logger.info('Settings IPC handlers registered');
}
