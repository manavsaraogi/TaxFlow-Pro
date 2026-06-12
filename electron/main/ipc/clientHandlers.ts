/**
 * electron/main/ipc/clientHandlers.ts
 * Client IPC handlers — CRUD, portal password, bank accounts, dashboard stats
 */

import { ipcMain } from 'electron';
import { getPrisma } from '../database';
import { setupLogger } from '../logger';
import { encryptPassword, decryptPassword, isVaultUnlocked } from '../vault';
import type { AssesseeType, TaxRegime } from '@prisma/client';

const logger = setupLogger();

export function registerClientHandlers() {

  // ── Create client ───────────────────────────────────────────────────────────
  ipcMain.handle('clients:create', async (_event, data: {
    firmId: number;
    pan: string;
    assesseeType: AssesseeType;
    fullName: string;
    dateOfBirth?: string;
    mobileNumber?: string;
    email?: string;
    address?: string;
    city?: string;
    stateCode?: string;
    pinCode?: number;
    aadhaarNumber?: string;
    residentialStatus?: string;
    portalUsername?: string;
    portalPassword?: string;
  }) => {
    try {
      const prisma = getPrisma();

      let portalPasswordEncrypted: string | undefined;
      if (data.portalPassword) {
        if (!isVaultUnlocked()) return { success: false, error: 'Vault is locked' };
        portalPasswordEncrypted = encryptPassword(data.portalPassword);
      }

      const client = await prisma.client.create({
        data: {
          firmId: data.firmId,
          pan: data.pan.toUpperCase(),
          assesseeType: data.assesseeType,
          fullName: data.fullName,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
          mobileNumber: data.mobileNumber,
          email: data.email,
          address: data.address,
          city: data.city,
          stateCode: data.stateCode,
          pinCode: data.pinCode,
          aadhaarNumber: data.aadhaarNumber,
          residentialStatus: data.residentialStatus ?? 'RES',
          portalUsername: data.portalUsername ?? data.pan.toUpperCase(),
          portalPasswordEncrypted,
          isActive: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          firmId: data.firmId,
          action: 'CLIENT_CREATE',
          entity: 'CLIENT',
          entityId: client.id,
          description: `Client created: ${client.pan} — ${client.fullName}`,
        },
      });

      logger.info(`Client created: ${client.pan} - ${client.fullName}`);
      return { success: true, data: { id: client.id } };
    } catch (e: any) {
      logger.error('Create client failed', e);
      return { success: false, error: e.message };
    }
  });

  // ── Update client ───────────────────────────────────────────────────────────
  ipcMain.handle('clients:update', async (_event, id: number, data: any) => {
    try {
      const prisma = getPrisma();

      const updateData: any = { ...data };
      delete updateData.portalPassword;
      delete updateData.id;

      if (data.portalPassword) {
        if (!isVaultUnlocked()) return { success: false, error: 'Vault is locked' };
        updateData.portalPasswordEncrypted = encryptPassword(data.portalPassword);
      }

      if (data.dateOfBirth) {
        updateData.dateOfBirth = new Date(data.dateOfBirth);
      }

      if (data.pan) updateData.pan = data.pan.toUpperCase();

      await prisma.client.update({
        where: { id: Number(id) },
        data: updateData,
      });

      return { success: true };
    } catch (e: any) {
      logger.error('Update client failed', e);
      return { success: false, error: e.message };
    }
  });

  // ── List clients ────────────────────────────────────────────────────────────
  ipcMain.handle('clients:list', async (_event, filters?: {
    search?: string;
    assesseeType?: string;
    isActive?: boolean;
  }) => {
    try {
      const prisma = getPrisma();

      const where: any = { isActive: filters?.isActive ?? true };

      if (filters?.search) {
        where.OR = [
          { fullName: { contains: filters.search } },
          { pan: { contains: filters.search.toUpperCase() } },
          { mobileNumber: { contains: filters.search } },
          { email: { contains: filters.search } },
        ];
      }

      if (filters?.assesseeType) {
        where.assesseeType = filters.assesseeType;
      }

      const clients = await prisma.client.findMany({
        where,
        include: {
          returns: {
            include: { assessmentYear: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          bankAccounts: { where: { isPrimary: true } },
        },
        orderBy: { fullName: 'asc' },
      });

      // Strip encrypted password from response
      const safeClients = clients.map((c: any) => ({
        ...c,
        portalPasswordEncrypted: undefined,
        hasPortalPassword: !!c.portalPasswordEncrypted,
      }));

      return { success: true, data: safeClients };
    } catch (e: any) {
      logger.error('List clients failed', e);
      return { success: false, error: e.message };
    }
  });

  // ── Get single client ───────────────────────────────────────────────────────
  ipcMain.handle('clients:get', async (_event, id: number) => {
    try {
      const prisma = getPrisma();
      const client = await prisma.client.findUnique({
        where: { id: Number(id) },
        include: {
          bankAccounts: true,
          returns: {
            include: { assessmentYear: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!client) return { success: false, error: 'Client not found' };

      return {
        success: true,
        data: {
          ...client,
          portalPasswordEncrypted: undefined,
          hasPortalPassword: !!client.portalPasswordEncrypted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Delete client ───────────────────────────────────────────────────────────
  ipcMain.handle('clients:delete', async (_event, id: number) => {
    try {
      const prisma = getPrisma();
      await prisma.client.update({
        where: { id: Number(id) },
        data: { isActive: false },
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Get portal password ─────────────────────────────────────────────────────
  ipcMain.handle('clients:getPortalPassword', async (_event, clientId: number) => {
    try {
      if (!isVaultUnlocked()) return { success: false, error: 'Vault is locked' };

      const prisma = getPrisma();
      const client = await prisma.client.findUnique({
        where: { id: Number(clientId) },
      });

      if (!client || !client.portalPasswordEncrypted) {
        return { success: false, error: 'No portal password stored' };
      }

      const password = decryptPassword(client.portalPasswordEncrypted);

      await prisma.auditLog.create({
        data: {
          firmId: client.firmId,
          action: 'PASSWORD_VIEW',
          entity: 'CLIENT',
          entityId: client.id,
          description: `Portal password viewed for ${client.pan}`,
        },
      });

      return { success: true, data: { password } };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Add bank account ────────────────────────────────────────────────────────
  ipcMain.handle('clients:addBankAccount', async (_event, clientId: number, data: {
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    accountType: string;
    isPrimary: boolean;
  }) => {
    try {
      const prisma = getPrisma();

      // If primary, unset existing primary
      if (data.isPrimary) {
        await prisma.bankAccount.updateMany({
          where: { clientId: Number(clientId), isPrimary: true },
          data: { isPrimary: false },
        });
      }

      await prisma.bankAccount.create({
        data: {
          clientId: Number(clientId),
          bankName: data.bankName,
          accountNumber: data.accountNumber,
          ifscCode: data.ifscCode,
          accountType: data.accountType as any,
          isPrimary: data.isPrimary,
        },
      });

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Dashboard stats ─────────────────────────────────────────────────────────
  ipcMain.handle('clients:dashboardStats', async () => {
    try {
      const prisma = getPrisma();

      const [
        totalClients,
        totalReturns,
        filedReturns,
        pendingReturns,
        returnsByStatusRaw,
        returnsByFormRaw,
        clientsByTypeRaw,
      ] = await Promise.all([
        prisma.client.count({ where: { isActive: true } }),
        prisma.return.count(),
        prisma.return.count({ where: { status: 'FILED' } }),
        prisma.return.count({ where: { status: { in: ['DRAFT', 'IN_PROGRESS', 'REVIEW'] } } }),
        prisma.return.groupBy({ by: ['status'], _count: true }),
        prisma.return.groupBy({ by: ['formType'], _count: true }),
        prisma.client.groupBy({ by: ['assesseeType'], _count: true }),
      ]);

      const returnsByStatus = returnsByStatusRaw.map((r: any) => ({
        workflowStatus: r.status,
        _count: r._count,
      }));

      const returnsByForm = returnsByFormRaw.map((r: any) => ({
        itrForm: r.formType ?? 'Unknown',
        _count: r._count,
      }));

      const clientsByType = clientsByTypeRaw.map((r: any) => ({
        assesseeType: r.assesseeType,
        _count: r._count,
      }));

      return {
        success: true,
        data: {
          totalClients,
          totalReturns,
          filedReturns,
          pendingReturns,
          activeReturns: pendingReturns,
          readyForFiling: 0,
          returnsByStatus,
          returnsByForm,
          clientsByType,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}
