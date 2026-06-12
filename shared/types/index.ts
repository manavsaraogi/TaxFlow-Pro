/**
 * shared/types/index.ts
 * Shared TypeScript types used across both Electron main process and renderer.
 * No runtime dependencies — types only.
 */

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Generic IPC response envelope */
export interface IPCResponse<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

/** Pagination params for list queries */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export type AssesseeType =
  | "Individual"
  | "HUF"
  | "Firm"
  | "LLP"
  | "Company_Domestic"
  | "Company_Foreign"
  | "AOP"
  | "BOI"
  | "AJP"
  | "Trust"
  | "LocalAuthority"
  | "CooperativeSociety";

export type ResidentialStatus =
  | "Resident"
  | "NonResident"
  | "ResidentNotOrdinarilyResident";

export type TaxRegime = "Old" | "New";

export type AccountType = "Savings" | "Current" | "Overdraft";

export type ReturnStatus =
  | "NotStarted"
  | "DataCollection"
  | "InProgress"
  | "UnderReview"
  | "PendingApproval"
  | "Approved"
  | "Filed"
  | "Acknowledged"
  | "Defective"
  | "Revised"
  | "OnHold"
  | "Cancelled";

export type ITRForm =
  | "ITR1"
  | "ITR2"
  | "ITR3"
  | "ITR4"
  | "ITR5"
  | "ITR6"
  | "ITR7";

export type FilingType = "Original" | "Revised" | "Belated" | "Updated";

export type DocumentCategory =
  | "Form16"
  | "Form16A"
  | "Form26AS"
  | "AIS"
  | "TIS"
  | "BankStatement"
  | "InvestmentProof"
  | "RentReceipt"
  | "HousePropertyDoc"
  | "CapitalGainsDoc"
  | "BusinessDoc"
  | "Acknowledgement"
  | "Other";

export type UserRole = "Admin" | "Manager" | "Staff";

export type AuditAction =
  | "ClientCreated"
  | "ClientUpdated"
  | "ClientDeleted"
  | "ClientViewed"
  | "PasswordAccessed"
  | "ReturnCreated"
  | "ReturnUpdated"
  | "ReturnFiled"
  | "DocumentUploaded"
  | "DocumentDeleted"
  | "UserLogin"
  | "UserLogout"
  | "VaultUnlocked"
  | "SettingsChanged"
  | "PortalActionTaken";

// ─── Firm ─────────────────────────────────────────────────────────────────────

export interface Firm {
  id: string;
  name: string;
  registrationNumber?: string | null;
  pan?: string | null;
  gstin?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  logoPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FirmUpdateInput = Omit<Firm, "id" | "createdAt" | "updatedAt">;

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  email?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  loginAt: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  pan: string;
  name: string;
  assesseeType: AssesseeType;
  dateOfBirthOrIncorporation?: string | null;
  mobile?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  residentialStatus: ResidentialStatus;
  taxRegimePreference: TaxRegime;
  portalUsername?: string | null;
  /** Never returned in API responses — only written via vault */
  portalPasswordEncrypted?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Subset used in list views */
export interface ClientSummary {
  id: string;
  pan: string;
  name: string;
  assesseeType: AssesseeType;
  mobile?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  residentialStatus: ResidentialStatus;
  taxRegimePreference: TaxRegime;
  activeReturnsCount: number;
  lastReturnAY?: string | null;
  createdAt: string;
}

/** Full client with relations */
export interface ClientDetail extends Client {
  bankAccounts: BankAccount[];
  returns: ReturnSummary[];
}

export interface ClientCreateInput {
  pan: string;
  name: string;
  assesseeType: AssesseeType;
  dateOfBirthOrIncorporation?: string;
  mobile?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  residentialStatus?: ResidentialStatus;
  taxRegimePreference?: TaxRegime;
  portalUsername?: string;
  portalPassword?: string;
  notes?: string;
}

export type ClientUpdateInput = Partial<ClientCreateInput> & { id: string };

export interface ClientListParams extends PaginationParams {
  search?: string;
  assesseeType?: AssesseeType;
  residentialStatus?: ResidentialStatus;
  taxRegime?: TaxRegime;
  sortBy?: "name" | "pan" | "createdAt";
  sortDir?: "asc" | "desc";
}

// ─── Bank Account ─────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  clientId: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch?: string | null;
  accountType: AccountType;
  isPrimary: boolean;
  createdAt: string;
}

export interface BankAccountCreateInput {
  clientId: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch?: string;
  accountType: AccountType;
  isPrimary?: boolean;
}

// ─── Assessment Year ──────────────────────────────────────────────────────────

export interface AssessmentYear {
  id: string;
  clientId: string;
  ay: string;            // e.g. "2024-25"
  fyStart: number;       // e.g. 2024
  itrForm?: ITRForm | null;
  filingType: FilingType;
  dueDate?: string | null;
  extendedDueDate?: string | null;
  createdAt: string;
}

// ─── Return ───────────────────────────────────────────────────────────────────

export interface ReturnSummary {
  id: string;
  clientId: string;
  ay: string;
  itrForm?: ITRForm | null;
  filingType: FilingType;
  status: ReturnStatus;
  filedAt?: string | null;
  acknowledgementNumber?: string | null;
  totalIncome?: number | null;
  taxPayable?: number | null;
  refundAmount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Return extends ReturnSummary {
  salarySchedule?: SalarySchedule | null;
  housePropertySchedules: HousePropertySchedule[];
  otherSourcesSchedule?: OtherSourcesSchedule | null;
  deductionSchedule?: DeductionSchedule | null;
  taxPayments: TaxPayment[];
  tdsEntries: TdsEntry[];
  documents: Document[];
  validationResults: ValidationResult[];
}

export interface ReturnCreateInput {
  clientId: string;
  ay: string;
  itrForm?: ITRForm;
  filingType?: FilingType;
}

export interface ReturnUpdateStatusInput {
  id: string;
  status: ReturnStatus;
  filedAt?: string;
  acknowledgementNumber?: string;
}

// ─── Salary Schedule ──────────────────────────────────────────────────────────

export interface SalarySchedule {
  id: string;
  returnId: string;
  employerName?: string | null;
  employerTAN?: string | null;
  grossSalary?: number | null;
  standardDeduction?: number | null;
  entertainmentAllowance?: number | null;
  professionalTax?: number | null;
  netSalary?: number | null;
  perquisites?: number | null;
  profitsInLieuOfSalary?: number | null;
  updatedAt: string;
}

export type SalaryScheduleUpsertInput = Omit<SalarySchedule, "id" | "updatedAt"> & {
  returnId: string;
};

// ─── House Property ───────────────────────────────────────────────────────────

export type PropertyType = "SelfOccupied" | "LetOut" | "DeemedLetOut";

export interface HousePropertySchedule {
  id: string;
  returnId: string;
  propertyType: PropertyType;
  addressLine1?: string | null;
  city?: string | null;
  annualRentReceived?: number | null;
  municipalTaxPaid?: number | null;
  netAnnualValue?: number | null;
  standardDeduction?: number | null;
  interestOnLoan?: number | null;
  incomeFromHouseProperty?: number | null;
  coOwnerPAN?: string | null;
  coOwnerShare?: number | null;
  updatedAt: string;
}

export type HousePropertyUpsertInput = Omit<HousePropertySchedule, "id" | "updatedAt"> & {
  returnId: string;
};

// ─── Other Sources ────────────────────────────────────────────────────────────

export interface OtherSourcesSchedule {
  id: string;
  returnId: string;
  savingsInterest?: number | null;
  fdInterest?: number | null;
  rdInterest?: number | null;
  dividendIncome?: number | null;
  familyPension?: number | null;
  giftsReceived?: number | null;
  otherIncome?: number | null;
  otherIncomeDescription?: string | null;
  grossOtherSources?: number | null;
  updatedAt: string;
}

export type OtherSourcesUpsertInput = Omit<OtherSourcesSchedule, "id" | "updatedAt"> & {
  returnId: string;
};

// ─── Deductions (Chapter VI-A) ────────────────────────────────────────────────

export interface DeductionSchedule {
  id: string;
  returnId: string;
  sec80C?: number | null;
  sec80CCC?: number | null;
  sec80CCD1?: number | null;
  sec80CCD1B?: number | null;
  sec80CCD2?: number | null;
  sec80D_self?: number | null;
  sec80D_parents?: number | null;
  sec80DD?: number | null;
  sec80DDB?: number | null;
  sec80E?: number | null;
  sec80EE?: number | null;
  sec80EEA?: number | null;
  sec80G?: number | null;
  sec80GG?: number | null;
  sec80GGA?: number | null;
  sec80TTA?: number | null;
  sec80TTB?: number | null;
  sec80U?: number | null;
  totalDeductions?: number | null;
  updatedAt: string;
}

export type DeductionUpsertInput = Omit<DeductionSchedule, "id" | "updatedAt"> & {
  returnId: string;
};

// ─── Tax Payment ──────────────────────────────────────────────────────────────

export type TaxPaymentType = "Advance" | "SelfAssessment" | "Regular";

export interface TaxPayment {
  id: string;
  returnId: string;
  type: TaxPaymentType;
  bsrCode: string;
  challanNumber: string;
  paymentDate: string;
  amount: number;
  createdAt: string;
}

export type TaxPaymentCreateInput = Omit<TaxPayment, "id" | "createdAt"> & {
  returnId: string;
};

// ─── TDS Entry ────────────────────────────────────────────────────────────────

export interface TdsEntry {
  id: string;
  returnId: string;
  deductorName: string;
  deductorTAN: string;
  grossAmount: number;
  tdsAmount: number;
  form?: string | null;   // e.g. "16A", "16B", "26Q"
  quarter?: string | null;
  createdAt: string;
}

export type TdsEntryCreateInput = Omit<TdsEntry, "id" | "createdAt"> & {
  returnId: string;
};

// ─── Document ─────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  clientId: string;
  returnId?: string | null;
  category: DocumentCategory;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  ay?: string | null;
  notes?: string | null;
  uploadedAt: string;
}

export interface DocumentUploadInput {
  clientId: string;
  returnId?: string;
  category: DocumentCategory;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  ay?: string;
  notes?: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  description?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

// ─── Validation Result ────────────────────────────────────────────────────────

export interface ValidationResult {
  id: string;
  returnId: string;
  field: string;
  severity: "Error" | "Warning" | "Info";
  message: string;
  resolvedAt?: string | null;
  createdAt: string;
}

// ─── Portal Action Log ────────────────────────────────────────────────────────

export interface PortalActionLog {
  id: string;
  clientId: string;
  returnId?: string | null;
  action: string;
  status: "Success" | "Failure" | "Pending";
  notes?: string | null;
  performedAt: string;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export type AppSettingKey =
  | "defaultTaxRegime"
  | "defaultAY"
  | "autoBackup"
  | "backupPath"
  | "backupIntervalDays"
  | "sessionTimeoutMinutes"
  | "theme"
  | "firmLogoPath";

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalClients: number;
  activeReturns: number;
  filedThisAY: number;
  pendingApproval: number;
  recentActivity: RecentActivityItem[];
  returnsByStatus: ReturnStatusCount[];
  upcomingDeadlines: DeadlineItem[];
}

export interface RecentActivityItem {
  id: string;
  action: AuditAction;
  description: string;
  entityName?: string;
  performedAt: string;
}

export interface ReturnStatusCount {
  status: ReturnStatus;
  count: number;
}

export interface DeadlineItem {
  clientId: string;
  clientName: string;
  ay: string;
  dueDate: string;
  itrForm?: ITRForm | null;
  status: ReturnStatus;
  daysRemaining: number;
}

// ─── App navigation ───────────────────────────────────────────────────────────

export type AppPage =
  | "dashboard"
  | "clients"
  | "client-detail"
  | "client-new"
  | "client-edit"
  | "returns"
  | "return-detail"
  | "documents"
  | "settings"
  | "audit-log";

export interface NavigationState {
  page: AppPage;
  clientId?: string;
  returnId?: string;
}

// ─── Vault ────────────────────────────────────────────────────────────────────

export interface VaultStatus {
  isInitialised: boolean;
  isUnlocked: boolean;
}

export interface SetupInput {
  firmName: string;
  adminUsername: string;
  adminFullName: string;
  adminPassword: string;
  masterPassword: string;
}

export interface UnlockInput {
  masterPassword: string;
}

export interface LoginInput {
  username: string;
  password: string;
}
