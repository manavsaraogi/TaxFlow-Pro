// File: electron/preload/preload.ts
// Secure context bridge between renderer and main process

import { contextBridge, ipcRenderer } from 'electron';

// Type-safe IPC API exposed to renderer
const taxflowAPI = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    isSetupRequired: () => ipcRenderer.invoke('auth:isSetupRequired'),
    setup: (data: Parameters<typeof ipcRenderer.invoke>[1]) =>
      ipcRenderer.invoke('auth:setup', data),
    unlock: (masterPassword: string) =>
      ipcRenderer.invoke('auth:unlock', masterPassword),
    lock: () => ipcRenderer.invoke('auth:lock'),
    vaultStatus: () => ipcRenderer.invoke('auth:vaultStatus'),
    login: (data: { email: string; password: string }) =>
      ipcRenderer.invoke('auth:login', data),
    getFirmInfo: () => ipcRenderer.invoke('auth:getFirmInfo'),
  },

  // ── Clients ───────────────────────────────────────────────────────────────
  clients: {
    create: (data: unknown) => ipcRenderer.invoke('clients:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('clients:update', id, data),
    list: (filters?: unknown) => ipcRenderer.invoke('clients:list', filters),
    get: (id: string) => ipcRenderer.invoke('clients:get', id),
    delete: (id: string) => ipcRenderer.invoke('clients:delete', id),
    getPortalPassword: (clientId: string) =>
      ipcRenderer.invoke('clients:getPortalPassword', clientId),
    addBankAccount: (clientId: string, data: unknown) =>
      ipcRenderer.invoke('clients:addBankAccount', clientId, data),
    dashboardStats: () => ipcRenderer.invoke('clients:dashboardStats'),
  },

  // ── Returns ───────────────────────────────────────────────────────────────
  returns: {
    create: (data: unknown) => ipcRenderer.invoke('returns:create', data),
    get: (returnId: string) => ipcRenderer.invoke('returns:get', returnId),
    listForClient: (clientId: string) =>
      ipcRenderer.invoke('returns:listForClient', clientId),
    updateStatus: (returnId: string, status: string) =>
      ipcRenderer.invoke('returns:updateStatus', returnId, status),
    upsertSalary: (returnId: string, data: unknown) =>
      ipcRenderer.invoke('returns:upsertSalary', returnId, data),
    upsertOtherSources: (returnId: string, data: unknown) =>
      ipcRenderer.invoke('returns:upsertOtherSources', returnId, data),
    upsertDeductions: (returnId: string, data: unknown) =>
      ipcRenderer.invoke('returns:upsertDeductions', returnId, data),
    addTds: (returnId: string, data: unknown) =>
      ipcRenderer.invoke('returns:addTds', returnId, data),
    addTaxPayment: (returnId: string, data: unknown) =>
      ipcRenderer.invoke('returns:addTaxPayment', returnId, data),
    getAssessmentYears: () => ipcRenderer.invoke('returns:getAssessmentYears'),
  },

  // ── Documents ─────────────────────────────────────────────────────────────
  documents: {
    upload: (data: unknown) => ipcRenderer.invoke('documents:upload', data),
    open: (docId: string) => ipcRenderer.invoke('documents:open', docId),
    list: (filters: unknown) => ipcRenderer.invoke('documents:list', filters),
    delete: (docId: string) => ipcRenderer.invoke('documents:delete', docId),
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    updateFirm: (data: unknown) => ipcRenderer.invoke('settings:updateFirm', data),
  },
};

contextBridge.exposeInMainWorld('taxflow', taxflowAPI);

// TypeScript declaration augmentation (used in renderer)
export type TaxflowAPI = typeof taxflowAPI;
