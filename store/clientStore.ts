import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  accountType: 'Savings' | 'Current' | 'Overdraft';
  isPrimary: boolean;
}

export interface ClientSummary {
  id: string;
  pan: string;
  name: string;
  assesseeType: string;
  mobile?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  residentialStatus: string;
  taxRegimePreference: 'Old' | 'New';
  activeReturnsCount: number;
  lastReturnAY?: string | null;
  createdAt: string;
}

export interface ClientDetail extends ClientSummary {
  dateOfBirthOrIncorporation?: string | null;
  addressLine1?: string | null;
  pincode?: string | null;
  portalUsername?: string | null;
  notes?: string | null;
  bankAccounts: BankAccount[];
  updatedAt: string;
}

export type ClientFilter = 'All' | 'Individual' | 'HUF' | 'Company' | 'Firm' | 'Other';
export type ClientSortField = 'name' | 'pan' | 'createdAt' | 'lastReturnAY';
export type SortDirection = 'asc' | 'desc';

interface ClientStoreState {
  clients: ClientSummary[];
  listLoading: boolean;
  listError: string | null;
  searchQuery: string;
  activeFilter: ClientFilter;
  sortField: ClientSortField;
  sortDirection: SortDirection;

  selectedClient: ClientDetail | null;
  detailLoading: boolean;
  detailError: string | null;

  saving: boolean;
  saveError: string | null;
  deleting: boolean;

  fetchClients: () => Promise<void>;
  fetchClient: (id: string) => Promise<void>;
  createClient: (data: Record<string, unknown>) => Promise<string | null>;
  updateClient: (id: string, data: Record<string, unknown>) => Promise<boolean>;
  deleteClient: (id: string) => Promise<boolean>;
  addBankAccount: (clientId: string, data: Record<string, unknown>) => Promise<boolean>;

  setSearchQuery: (q: string) => void;
  setActiveFilter: (f: ClientFilter) => void;
  setSortField: (field: ClientSortField) => void;
  toggleSortDirection: () => void;
  clearSelectedClient: () => void;
  clearErrors: () => void;
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function api<T>(
  url: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error ?? 'Request failed' };
    return { success: true, data: json.data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useClientStore = create<ClientStoreState>()(
  devtools(
    (set, get) => ({
      clients: [],
      listLoading: false,
      listError: null,
      searchQuery: '',
      activeFilter: 'All',
      sortField: 'name',
      sortDirection: 'asc',

      selectedClient: null,
      detailLoading: false,
      detailError: null,

      saving: false,
      saveError: null,
      deleting: false,

      fetchClients: async () => {
        set({ listLoading: true, listError: null });
        const res = await api<ClientSummary[]>('/api/clients');
        if (res.success) {
          set({ clients: res.data ?? [], listLoading: false });
        } else {
          set({ listError: res.error ?? 'Failed to load clients.', listLoading: false });
        }
      },

      fetchClient: async (id) => {
        set({ detailLoading: true, detailError: null, selectedClient: null });
        const res = await api<ClientDetail>(`/api/clients/${id}`);
        if (res.success) {
          set({ selectedClient: res.data ?? null, detailLoading: false });
        } else {
          set({ detailError: res.error ?? 'Failed to load client.', detailLoading: false });
        }
      },

      createClient: async (data) => {
        set({ saving: true, saveError: null });
        const res = await api<{ id: string }>('/api/clients', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (res.success && res.data?.id) {
          await get().fetchClients();
          set({ saving: false });
          return res.data.id;
        } else {
          set({ saveError: res.error ?? 'Failed to create client.', saving: false });
          return null;
        }
      },

      updateClient: async (id, data) => {
        set({ saving: true, saveError: null });
        const res = await api(`/api/clients/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        if (res.success) {
          await get().fetchClient(id);
          await get().fetchClients();
          set({ saving: false });
          return true;
        } else {
          set({ saveError: res.error ?? 'Failed to update client.', saving: false });
          return false;
        }
      },

      deleteClient: async (id) => {
        set({ deleting: true });
        const res = await api(`/api/clients/${id}`, { method: 'DELETE' });
        if (res.success) {
          set((s) => ({
            clients: s.clients.filter((c) => c.id !== id),
            selectedClient: s.selectedClient?.id === id ? null : s.selectedClient,
            deleting: false,
          }));
          return true;
        } else {
          set({ deleting: false });
          return false;
        }
      },

      addBankAccount: async (clientId, data) => {
        set({ saving: true, saveError: null });
        const res = await api(`/api/clients/${clientId}/bank-accounts`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (res.success) {
          await get().fetchClient(clientId);
          set({ saving: false });
          return true;
        } else {
          set({ saveError: res.error ?? 'Failed to add bank account.', saving: false });
          return false;
        }
      },

      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveFilter: (f) => set({ activeFilter: f }),
      setSortField: (field) =>
        set((s) => ({
          sortField: field,
          sortDirection: s.sortField === field
            ? s.sortDirection === 'asc' ? 'desc' : 'asc'
            : 'asc',
        })),
      toggleSortDirection: () =>
        set((s) => ({ sortDirection: s.sortDirection === 'asc' ? 'desc' : 'asc' })),
      clearSelectedClient: () => set({ selectedClient: null, detailError: null }),
      clearErrors: () => set({ listError: null, detailError: null, saveError: null }),
    }),
    { name: 'ClientStore' }
  )
);

// ─── Derived selectors ────────────────────────────────────────────────────────

const FILTER_GROUPS: Record<ClientFilter, string[]> = {
  All: [],
  Individual: ['Individual'],
  HUF: ['HUF'],
  Company: ['Company_Domestic', 'Company_Foreign'],
  Firm: ['Firm', 'LLP'],
  Other: ['AOP', 'BOI', 'AJP', 'Trust', 'LocalAuthority', 'CooperativeSociety'],
};

export function selectFilteredClients(state: ClientStoreState): ClientSummary[] {
  const { clients, searchQuery, activeFilter, sortField, sortDirection } = state;

  let result = clients;

  if (activeFilter !== 'All') {
    const allowed = FILTER_GROUPS[activeFilter];
    result = result.filter((c) => allowed.includes(c.assesseeType));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.pan.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
    );
  }

  result = [...result].sort((a, b) => {
    let aVal = a[sortField] ?? '';
    let bVal = b[sortField] ?? '';
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return result;
}
