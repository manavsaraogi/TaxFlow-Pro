/**
 * electron/main/ipc/documentHandlers.ts
 * Document IPC handlers — upload, list, open, delete
 */

import { ipcMain, shell } from 'electron';
import { getPrisma } from '../database';
import { setupLogger } from '../logger';
import * as path from 'path';
import * as fs from 'fs';

const logger = setupLogger('documents');

export function registerDocumentHandlers() {

  // ── List documents ──────────────────────────────────────────────────────────
  ipcMain.handle('documents:list', async (_event, clientId: number) => {
    try {
      const prisma = getPrisma();
      const docs = await prisma.document.findMany({
        where: { clientId: Number(clientId) },
        orderBy: { uploadedAt: 'desc' },
      });
      return { success: true, data: docs };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Open document ───────────────────────────────────────────────────────────
  ipcMain.handle('documents:open', async (_event, documentId: number) => {
    try {
      const prisma = getPrisma();
      const doc = await prisma.document.findUnique({
        where: { id: Number(documentId) },
      });
      if (!doc) return { success: false, error: 'Document not found' };
      await shell.openPath(doc.storedName);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Delete document ─────────────────────────────────────────────────────────
  ipcMain.handle('documents:delete', async (_event, documentId: number) => {
    try {
      const prisma = getPrisma();
      const doc = await prisma.document.findUnique({
        where: { id: Number(documentId) },
      });
      if (!doc) return { success: false, error: 'Document not found' };

      if (fs.existsSync(doc.storedName)) {
        fs.unlinkSync(doc.storedName);
      }

      await prisma.document.delete({ where: { id: Number(documentId) } });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Upload document ─────────────────────────────────────────────────────────
  ipcMain.handle('documents:upload', async (_event, clientId: number, filePath: string, metadata: any) => {
    try {
      const prisma = getPrisma();
      const doc = await prisma.document.create({
        data: {
          clientId: Number(clientId),
          returnId: metadata.returnId ? Number(metadata.returnId) : undefined,
          category: metadata.category ?? 'OTHER',
          originalName: path.basename(filePath),
          storedName: filePath,
          mimeType: metadata.mimeType,
          notes: metadata.notes,
        },
      });
      return { success: true, data: doc };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}
