import { create } from "zustand";
import { devtools } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch?: string | null;
  accountType: "Savings" | "Current" | "Overdraft";
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
  taxRegimePreference: "Old" | "New";
  activeReturnsCount: number;
  lastReturnAY?: string | null;
  createdAt: string;
}

export interface ClientDetail extends ClientSummary {
  dateOfBirthOrIncorporation?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  pincode?: string | null;
  portalUsername?: string | null;
  notes?: string | null;
  bankAccounts: BankAccount[];
  updatedAt: string;
}

export type ClientFilter = "All" | "Individual" | "HUF" | "Company" | "Firm" | "Other";
export type ClientSortField = "name" | "pan" | "createdAt" | "lastReturnAY";
export type SortDirection = "asc" | "desc";

interface ClientStoreState {
  // ── List ──
  clients: ClientSummary[];
  listLoading: boolean;
  listError: string | null;
  searchQuery: string;
  activeFilter: ClientFilter;
  sortField: ClientSortField;
  sortDirection: SortDirection;

  // ── Detail ──
  selectedClient: ClientDetail | null;
  detailLoading: boolean;
  detailError: string | null;

  // ── Mutations ──
  saving: boolean;
  saveError: string | null;
  deleting: boolean;

  // ── Actions ──
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

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_CLIENTS: ClientSummary[] = [
  {
    id: "mock-1",
    pan: "ABCDE1234F",
    name: "Rajan Sharma",
    assesseeType: "Individual",
    mobile: "9876543210",
    email: "rajan@example.com",
    city: "Guwahati",
    state: "Assam",
    residentialStatus: "Resident",
    taxRegimePreference: "New",
    activeReturnsCount: 2,
    lastReturnAY: "2024-25",
    createdAt: "2024-04-01T00:00:00Z",
  },
  {
    id: "mock-2",
    pan: "PQRST5678G",
    name: "Meena Devi HUF",
    assesseeType: "HUF",
    mobile: "9123456780",
    email: "meena.huf@example.com",
    city: "Jorhat",
    state: "Assam",
    residentialStatus: "Resident",
    taxRegimePreference: "Old",
    activeReturnsCount: 1,
    lastReturnAY: "2024-25",
    createdAt: "2023-11-15T00:00:00Z",
  },
  {
    id: "mock-3",
    pan: "LMNOP9012H",
    name: "Northeast Traders Pvt Ltd",
    assesseeType: "Company_Domestic",
    mobile: null,
    email: "accounts@netraders.in",
    city: "Dibrugarh",
    state: "Assam",
    residentialStatus: "Resident",
    taxRegimePreference: "New",
    activeReturnsCount: 0,
    lastReturnAY: "2023-24",
    createdAt: "2023-06-20T00:00:00Z",
  },
];

const MOCK_DETAIL: ClientDetail = {
  ...MOCK_CLIENTS[0],
  dateOfBirthOrIncorporation: "1985-07-15",
  addressLine1: "42, MG Road",
  addressLine2: "Near Central Park",
  pincode: "781001",
  portalUsername: "ABCDE1234F",
  notes: "Long-term client since 2019.",
  bankAccounts: [
    {
      id: "bank-1",
      accountNumber: "XXXX1234",
      ifsc: "SBIN0001234",
      bankName: "State Bank of India",
      branch: "Guwahati Main",
      accountType: "Savings",
      isPrimary: true,
    },
  ],
  updatedAt: "2025-03-10T00:00:00Z",
};

// ─── IPC helper ───────────────────────────────────────────────────────────────

const isBrowser = () =>
  typeof window === "undefined" || typeof (window as any).taxflow === "undefined";

async function ipc<T>(
  channel: (...args: any[]) => Promise<{ success: boolean; error?: string; data?: T }>,
  ...args: any[]
): Promise<{ success: boolean; error?: string; data?: T }> {
  try {
    return await channel(...args);
  } catch (err: any) {
    return { success: false, error: err?.message ?? "IPC call failed." };
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useClientStore = create<ClientStoreState>()(
  devtools(
    (set, get) => ({
      // ── Initial state ──
      clients: [],
      listLoading: false,
      listError: null,
      searchQuery: "",
      activeFilter: "All",
      sortField: "name",
      sortDirection: "asc",

      selectedClient: null,
      detailLoading: false,
      detailError: null,

      saving: false,
      saveError: null,
      deleting: false,

      // ── fetchClients ──
      fetchClients: async () => {
        set({ listLoading: true, listError: null });

        if (isBrowser()) {
          await new Promise((r) => setTimeout(r, 350));
          set({ clients: MOCK_CLIENTS, listLoading: false });
          return;
        }

        const res = await ipc<ClientSummary[]>(
          (window as any).taxflow.clients.list
        );

        if (res.success) {
          set({ clients: res.data ?? [], listLoading: false });
        } else {
          set({ listError: res.error ?? "Failed to load clients.", listLoading: false });
        }
      },

      // ── fetchClient ──
      fetchClient: async (id: string) => {
        set({ detailLoading: true, detailError: null, selectedClient: null });

        if (isBrowser()) {
          await new Promise((r) => setTimeout(r, 300));
          const mock = id === "mock-1" ? MOCK_DETAIL : { ...MOCK_DETAIL, id, name: "Mock Client" };
          set({ selectedClient: mock, detailLoading: false });
          return;
        }

        const res = await ipc<ClientDetail>(
          (window as any).taxflow.clients.get,
          { id }
        );

        if (res.success) {
          set({ selectedClient: res.data ?? null, detailLoading: false });
        } else {
          set({ detailError: res.error ?? "Failed to load client.", detailLoading: false });
        }
      },

      // ── createClient ──
      createClient: async (data) => {
        set({ saving: true, saveError: null });

        if (isBrowser()) {
          await new Promise((r) => setTimeout(r, 500));
          const newClient: ClientSummary = {
            id: `mock-${Date.now()}`,
            pan: (data.pan as string) ?? "",
            name: (data.name as string) ?? "",
            assesseeType: (data.assesseeType as string) ?? "Individual",
            mobile: (data.mobile as string) ?? null,
            email: (data.email as string) ?? null,
            city: (data.city as string) ?? null,
            state: (data.state as string) ?? null,
            residentialStatus: (data.residentialStatus as string) ?? "Resident",
            taxRegimePreference: (data.taxRegimePreference as "Old" | "New") ?? "New",
            activeReturnsCount: 0,
            lastReturnAY: null,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({ clients: [...s.clients, newClient], saving: false }));
          return newClient.id;
        }

        const res = await ipc<{ id: string }>(
          (window as any).taxflow.clients.create,
          data
        );

        if (res.success && res.data?.id) {
          // Refresh the list to include the new client
          await get().fetchClients();
          set({ saving: false });
          return res.data.id;
        } else {
          set({ saveError: res.error ?? "Failed to create client.", saving: false });
          return null;
        }
      },

      // ── updateClient ──
      updateClient: async (id, data) => {
        set({ saving: true, saveError: null });

        if (isBrowser()) {
          await new Promise((r) => setTimeout(r, 450));
          set((s) => ({
            clients: s.clients.map((c) =>
              c.id === id ? { ...c, ...(data as Partial<ClientSummary>) } : c
            ),
            selectedClient:
              s.selectedClient?.id === id
                ? { ...s.selectedClient, ...(data as Partial<ClientDetail>) }
                : s.selectedClient,
            saving: false,
          }));
          return true;
        }

        const res = await ipc(
          (window as any).taxflow.clients.update,
          { id, ...data }
        );

        if (res.success) {
          // Re-fetch detail to get fresh data
          await get().fetchClient(id);
          await get().fetchClients();
          set({ saving: false });
          return true;
        } else {
          set({ saveError: res.error ?? "Failed to update client.", saving: false });
          return false;
        }
      },

      // ── deleteClient ──
      deleteClient: async (id) => {
        set({ deleting: true });

        if (isBrowser()) {
          await new Promise((r) => setTimeout(r, 400));
          set((s) => ({
            clients: s.clients.filter((c) => c.id !== id),
            selectedClient: s.selectedClient?.id === id ? null : s.selectedClient,
            deleting: false,
          }));
          return true;
        }

        const res = await ipc(
          (window as any).taxflow.clients.delete,
          { id }
        );

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

      // ── addBankAccount ──
      addBankAccount: async (clientId, data) => {
        set({ saving: true, saveError: null });

        if (isBrowser()) {
          await new Promise((r) => setTimeout(r, 350));
          const newAccount: BankAccount = {
            id: `bank-${Date.now()}`,
            accountNumber: (data.accountNumber as string) ?? "",
            ifsc: (data.ifsc as string) ?? "",
            bankName: (data.bankName as string) ?? "",
            branch: (data.branch as string) ?? null,
            accountType: (data.accountType as BankAccount["accountType"]) ?? "Savings",
            isPrimary: (data.isPrimary as boolean) ?? false,
          };
          set((s) => ({
            selectedClient: s.selectedClient?.id === clientId
              ? {
                  ...s.selectedClient,
                  bankAccounts: [...s.selectedClient.bankAccounts, newAccount],
                }
              : s.selectedClient,
            saving: false,
          }));
          return true;
        }

        const res = await ipc(
          (window as any).taxflow.clients.addBankAccount,
          { clientId, ...data }
        );

        if (res.success) {
          await get().fetchClient(clientId);
          set({ saving: false });
          return true;
        } else {
          set({ saveError: res.error ?? "Failed to add bank account.", saving: false });
          return false;
        }
      },

      // ── UI state actions ──
      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveFilter: (f) => set({ activeFilter: f }),
      setSortField: (field) =>
        set((s) => ({
          sortField: field,
          // Reset to asc when switching field; toggle if same field
          sortDirection: s.sortField === field
            ? s.sortDirection === "asc" ? "desc" : "asc"
            : "asc",
        })),
      toggleSortDirection: () =>
        set((s) => ({ sortDirection: s.sortDirection === "asc" ? "desc" : "asc" })),
      clearSelectedClient: () => set({ selectedClient: null, detailError: null }),
      clearErrors: () => set({ listError: null, detailError: null, saveError: null }),
    }),
    { name: "ClientStore" }
  )
);

// ─── Derived selectors ────────────────────────────────────────────────────────
// Use these in components instead of inline filtering to avoid re-renders.

const FILTER_GROUPS: Record<ClientFilter, string[]> = {
  All: [],
  Individual: ["Individual"],
  HUF: ["HUF"],
  Company: ["Company_Domestic", "Company_Foreign"],
  Firm: ["Firm", "LLP"],
  Other: ["AOP", "BOI", "AJP", "Trust", "LocalAuthority", "CooperativeSociety"],
};

export function selectFilteredClients(state: ClientStoreState): ClientSummary[] {
  const { clients, searchQuery, activeFilter, sortField, sortDirection } = state;

  let result = clients;

  // Filter by assessee type group
  if (activeFilter !== "All") {
    const allowed = FILTER_GROUPS[activeFilter];
    result = result.filter((c) => allowed.includes(c.assesseeType));
  }

  // Search across PAN, name, email, city
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

  // Sort
  result = [...result].sort((a, b) => {
    let aVal = a[sortField] ?? "";
    let bVal = b[sortField] ?? "";
    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  return result;
}
