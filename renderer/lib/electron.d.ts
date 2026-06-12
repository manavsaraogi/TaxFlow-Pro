// File: renderer/lib/electron.d.ts
// Type declarations for the Electron IPC bridge

interface TaxflowAPI {
  auth: {
    isSetupRequired: () => Promise<boolean>;
    setup: (data: {
      firmName: string;
      firmPan?: string;
      adminName: string;
      adminEmail: string;
      masterPassword: string;
    }) => Promise<{ success: boolean; firmId?: string; error?: string }>;
    unlock: (masterPassword: string) => Promise<{ success: boolean; error?: string }>;
    lock: () => Promise<{ success: boolean }>;
    vaultStatus: () => Promise<{ isUnlocked: boolean }>;
    login: (data: { email: string; password: string }) => Promise<{
      success: boolean;
      user?: { id: string; name: string; email: string; role: string; firmId: string; firmName: string };
      error?: string;
    }>;
    getFirmInfo: () => Promise<{ success: boolean; firm?: FirmData; error?: string }>;
  };
  clients: {
    create: (data: ClientInput) => Promise<ApiResponse<{ client: ClientData }>>;
    update: (id: string, data: Partial<ClientInput>) => Promise<ApiResponse<{ client: ClientData }>>;
    list: (filters?: ClientFilters) => Promise<ApiResponse<{ clients: ClientData[] }>>;
    get: (id: string) => Promise<ApiResponse<{ client: ClientData }>>;
    delete: (id: string) => Promise<ApiResponse<{}>>;
    getPortalPassword: (clientId: string) => Promise<ApiResponse<{ password: string; username: string }>>;
    addBankAccount: (clientId: string, data: BankAccountInput) => Promise<ApiResponse<{ account: BankAccountData }>>;
    dashboardStats: () => Promise<ApiResponse<{ stats: DashboardStats }>>;
  };
  returns: {
    create: (data: ReturnCreateInput) => Promise<ApiResponse<{ return: ReturnData }>>;
    get: (returnId: string) => Promise<ApiResponse<{ return: ReturnData }>>;
    listForClient: (clientId: string) => Promise<ApiResponse<{ returns: ReturnData[] }>>;
    updateStatus: (returnId: string, status: string) => Promise<ApiResponse<{ return: ReturnData }>>;
    upsertSalary: (returnId: string, data: object) => Promise<ApiResponse<{ salary: SalaryData }>>;
    upsertOtherSources: (returnId: string, data: object) => Promise<ApiResponse<{ otherSources: object }>>;
    upsertDeductions: (returnId: string, data: object) => Promise<ApiResponse<{ deductions: object }>>;
    addTds: (returnId: string, data: object) => Promise<ApiResponse<{ tds: object }>>;
    addTaxPayment: (returnId: string, data: object) => Promise<ApiResponse<{ payment: object }>>;
    getAssessmentYears: () => Promise<ApiResponse<{ assessmentYears: AssessmentYear[] }>>;
  };
  documents: {
    upload: (data: object) => Promise<ApiResponse<{ document: DocumentData }>>;
    open: (docId: string) => Promise<ApiResponse<{}>>;
    list: (filters: object) => Promise<ApiResponse<{ documents: DocumentData[] }>>;
    delete: (docId: string) => Promise<ApiResponse<{}>>;
  };
  settings: {
    get: (key: string) => Promise<ApiResponse<{ value: string | null }>>;
    getAll: () => Promise<ApiResponse<{ settings: Record<string, string> }>>;
    set: (key: string, value: string) => Promise<ApiResponse<{}>>;
    updateFirm: (data: object) => Promise<ApiResponse<{ firm: FirmData }>>;
  };
}

interface ApiResponse<T> {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

interface FirmData {
  id: string;
  name: string;
  address?: string;
  pan?: string;
  gstin?: string;
  phone?: string;
  email?: string;
}

interface ClientInput {
  pan: string;
  name: string;
  assesseeType: string;
  dateOfBirth?: string;
  mobile?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  residentialStatus?: string;
  taxRegimeDefault?: string;
  portalUsername?: string;
  portalPassword?: string;
  notes?: string;
}

interface ClientFilters {
  search?: string;
  assesseeType?: string;
  isActive?: boolean;
}

interface ClientData {
  id: string;
  pan: string;
  name: string;
  assesseeType: string;
  dateOfBirth?: string;
  mobile?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  residentialStatus: string;
  taxRegimeDefault: string;
  hasPortalPassword?: boolean;
  isActive: boolean;
  createdAt: string;
  bankAccounts?: BankAccountData[];
  returns?: ReturnData[];
}

interface BankAccountInput {
  bankName: string;
  accountNumber: string;
  ifsc: string;
  accountType: string;
  isPrimary?: boolean;
  isJoint?: boolean;
}

interface BankAccountData extends BankAccountInput {
  id: string;
  clientId: string;
}

interface ReturnCreateInput {
  clientId: string;
  ayId: string;
  taxRegime?: string;
}

interface ReturnData {
  id: string;
  clientId: string;
  ayId: string;
  itrForm?: string;
  itrFormReason?: string;
  workflowStatus: string;
  taxRegime: string;
  grossTotalIncome?: number;
  totalDeductions?: number;
  taxableIncome?: number;
  totalTaxLiability?: number;
  totalTaxPaid?: number;
  refundOrPayable?: number;
  filedAt?: string;
  ackNumber?: string;
  client?: ClientData;
  ay?: AssessmentYear;
  salarySchedule?: SalaryData;
  createdAt: string;
}

interface SalaryData {
  id: string;
  returnId: string;
  basicSalary: number;
  hra: number;
  allowancesTaxable: number;
  perquisites: number;
  grossSalary: number;
  hraExemption: number;
  netSalary: number;
  standardDeduction: number;
  incomeFromSalary: number;
  employerName?: string;
  employerTan?: string;
}

interface AssessmentYear {
  id: string;
  ay: string;
  fy: string;
  dueDateInd?: string;
  dueDateAudit?: string;
  isActive: boolean;
}

interface DocumentData {
  id: string;
  docType: string;
  fileName: string;
  fileSize?: number;
  notes?: string;
  uploadedAt: string;
}

interface DashboardStats {
  totalClients: number;
  totalReturns: number;
  filedReturns: number;
  pendingReturns: number;
  readyForFiling: number;
  returnsByStatus: Array<{ workflowStatus: string; _count: number }>;
  returnsByForm: Array<{ itrForm: string; _count: number }>;
  clientsByType: Array<{ assesseeType: string; _count: number }>;
}

declare global {
  interface Window {
    taxflow: TaxflowAPI;
  }
}

export {};
