/**
 * shared/utils/returnValidation.ts
 *
 * Centralized pre-filing validation for ITR returns.
 * Returns per-tab errors with field-level keys so components can show inline messages.
 */

export type TabId =
  | 'salary'
  | 'house_property'
  | 'business_profession'
  | 'financial_particulars'
  | 'capital_gains'
  | 'other_sources'
  | 'deductions'
  | 'assets_liabilities'
  | 'tds'
  | 'tax_payments'
  | 'tax_summary'
  | 'verification'
  | 'itr5_general'
  | 'itr5_balance_sheet'
  | 'itr5_pl';

export interface FieldError {
  field: string;   // dot-notation key, e.g. "employer.0.name" or "tds.0.tan"
  message: string;
}

export interface TabValidation {
  tabId: TabId;
  label: string;
  errors: FieldError[];
  warnings: FieldError[];
}

export interface ValidationResult {
  tabs: TabValidation[];
  errorCount: number;
  warningCount: number;
  /** Keyed by field path for O(1) lookup in components */
  fieldErrors: Record<string, string>;
  fieldWarnings: Record<string, string>;
}

const TAN_RE = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function validateReturn(
  returnData: any,
  summary: { GrossTotalIncome?: number } | null,
  meta: { regime: string; formType: string } | null
): ValidationResult {
  const tabs: TabValidation[] = [];
  const fieldErrors: Record<string, string> = {};
  const fieldWarnings: Record<string, string> = {};

  function addTab(tabId: TabId, label: string, errors: FieldError[], warnings: FieldError[] = []) {
    tabs.push({ tabId, label, errors, warnings });
    for (const e of errors) fieldErrors[e.field] = e.message;
    for (const w of warnings) fieldWarnings[w.field] = w.message;
  }

  const gti = summary?.GrossTotalIncome ?? 0;
  const regime = meta?.regime ?? 'NEW';

  // ── Salary ────────────────────────────────────────────────────────────────
  const salarySchedule = returnData?.salarySchedule;
  const employers: any[] = returnData?.employerEntries ?? salarySchedule?.employerEntries ?? [];
  {
    const errors: FieldError[] = [];
    const warnings: FieldError[] = [];
    for (let i = 0; i < employers.length; i++) {
      const e = employers[i];
      if (!e.nameOfEmployer?.trim())
        errors.push({ field: `employer.${i}.name`, message: 'Employer name is required' });
      if (e.tanOfEmployer && !TAN_RE.test(e.tanOfEmployer.trim().toUpperCase()))
        errors.push({ field: `employer.${i}.tan`, message: 'TAN must be 10 characters (AAAA99999A format)' });
      if ((e.grossSalary ?? e.salary ?? 0) <= 0)
        errors.push({ field: `employer.${i}.grossSalary`, message: 'Gross salary must be greater than zero' });
    }
    if (salarySchedule && employers.length === 0)
      warnings.push({ field: 'salary.noEmployers', message: 'Salary schedule exists but no employer entries found' });
    addTab('salary', 'Salary', errors, warnings);
  }

  // ── House Property ─────────────────────────────────────────────────────────
  const hpSchedules: any[] = returnData?.hpSchedule ?? [];
  {
    const errors: FieldError[] = [];
    for (let i = 0; i < hpSchedules.length; i++) {
      const p = hpSchedules[i];
      if (!p.typeOfHP)
        errors.push({ field: `hp.${i}.typeOfHP`, message: 'Property type (Self Occupied / Let Out) is required' });
      if (!p.addressOfProperty?.trim() && !p.cityOfProperty?.trim())
        errors.push({ field: `hp.${i}.address`, message: 'Property address or city is required' });
      if ((p.typeOfHP === 'L' || p.typeOfHP === 'D') && !(p.annualRentReceived > 0))
        errors.push({ field: `hp.${i}.annualRent`, message: 'Annual rent received must be > 0 for let-out property' });
    }
    addTab('house_property', 'House Property', errors);
  }

  // ── Business / Profession ──────────────────────────────────────────────────
  const pi = returnData?.presumptiveIncome;
  const b44AD: any[] = pi?.Business44AD ?? [];
  const b44ADA: any[] = pi?.Profession44ADA ?? [];
  const b44AE: any[] = pi?.GoodsCarriage44AE ?? [];
  const iea = pi?.Form10IEA;
  {
    const errors: FieldError[] = [];
    for (let i = 0; i < b44AD.length; i++) {
      const e = b44AD[i];
      if (!e.tradeName?.trim())
        errors.push({ field: `bp.44ad.${i}.tradeName`, message: 'Business / trade name is required' });
      if (!(e.turnover > 0))
        errors.push({ field: `bp.44ad.${i}.turnover`, message: 'Turnover must be greater than zero' });
      if (!(e.presumptiveIncome > 0))
        errors.push({ field: `bp.44ad.${i}.presumptiveIncome`, message: 'Presumptive income must be greater than zero' });
    }
    for (let i = 0; i < b44ADA.length; i++) {
      const e = b44ADA[i];
      if (!e.professionName?.trim())
        errors.push({ field: `bp.44ada.${i}.professionName`, message: 'Nature of profession is required' });
      if (!(e.grossReceipts > 0))
        errors.push({ field: `bp.44ada.${i}.grossReceipts`, message: 'Gross receipts must be greater than zero' });
    }
    for (let i = 0; i < b44AE.length; i++) {
      const e = b44AE[i];
      if (!e.vehicleRegNo?.trim())
        errors.push({ field: `bp.44ae.${i}.vehicleRegNo`, message: 'Vehicle registration number is required' });
      if (!(e.ownedMonths > 0))
        errors.push({ field: `bp.44ae.${i}.ownedMonths`, message: 'Months owned must be > 0' });
    }
    const hasBPIncome = b44AD.length + b44ADA.length + b44AE.length > 0;
    if (hasBPIncome && regime === 'OLD') {
      if (iea?.optOut) {
        if (!iea.ackNo?.trim())
          errors.push({ field: 'bp.10iea.ackNo', message: 'Form 10-IEA acknowledgement number is required' });
        if (!iea.dateOfFiling?.trim())
          errors.push({ field: 'bp.10iea.dateOfFiling', message: 'Form 10-IEA date of filing is required' });
      }
    }
    addTab('business_profession', 'Business & Profession', errors);
  }

  // ── Financial Particulars (Part A-BS, mandatory for ITR-4) ──────────────────
  {
    const errors: FieldError[] = [];
    const hasBPIncome = b44AD.length + b44ADA.length + b44AE.length > 0;
    if (hasBPIncome) {
      const fpRaw = returnData?.financialParticulars ?? returnData?.financialParticularsJson;
      const fp = typeof fpRaw === 'string' ? JSON.parse(fpRaw) : fpRaw;
      const mandatory: [string, string][] = [
        ['E15_SundryCreditors', 'Sundry creditors (E15)'],
        ['E19_Inventories', 'Inventories (E19)'],
        ['E20_SundryDebtors', 'Sundry debtors (E20)'],
        ['E21_BalanceWithBanks', 'Balance with banks (E21)'],
        ['E22_CashInHand', 'Cash-in-hand (E22)'],
      ];
      for (const [key, label] of mandatory) {
        if (!fp || !(Number(fp[key]) > 0)) {
          errors.push({ field: `fp.${key}`, message: `${label} is mandatory in Financial Particulars` });
        }
      }
    }
    addTab('financial_particulars', 'Financial Particulars', errors);
  }

  // ── TDS ───────────────────────────────────────────────────────────────────
  const tdsEntries: any[] = returnData?.tdsEntries ?? [];
  {
    const errors: FieldError[] = [];
    for (let i = 0; i < tdsEntries.length; i++) {
      const e = tdsEntries[i];
      if (!e.tanOfDeductor?.trim())
        errors.push({ field: `tds.${i}.tan`, message: 'TAN of deductor is required' });
      else if (!TAN_RE.test(e.tanOfDeductor.trim().toUpperCase()))
        errors.push({ field: `tds.${i}.tan`, message: 'TAN must be 10 characters (AAAA99999A)' });
      if (!e.nameOfDeductor?.trim())
        errors.push({ field: `tds.${i}.name`, message: 'Deductor name is required' });
      if (!(e.totalTaxDeducted > 0) && !(e.taxDeducted > 0))
        errors.push({ field: `tds.${i}.amount`, message: 'Tax deducted must be > 0' });
    }
    addTab('tds', 'TDS / TCS', errors);
  }

  // ── Tax Payments ──────────────────────────────────────────────────────────
  const taxPayments: any[] = returnData?.taxPayments ?? [];
  {
    const errors: FieldError[] = [];
    for (let i = 0; i < taxPayments.length; i++) {
      const e = taxPayments[i];
      if (!e.bsrCode?.trim())
        errors.push({ field: `taxPayments.${i}.bsrCode`, message: 'BSR code is required' });
      if (!e.challanSerialNo?.trim())
        errors.push({ field: `taxPayments.${i}.challanSerial`, message: 'Challan serial number is required' });
      if (!(e.taxAmount > 0))
        errors.push({ field: `taxPayments.${i}.amount`, message: 'Tax amount must be > 0' });
    }
    addTab('tax_payments', 'Tax Payments', errors);
  }

  // ── Assets & Liabilities ─────────────────────────────────────────────────
  const al = returnData?.assetsLiabilities;
  {
    const errors: FieldError[] = [];
    if (gti > 5000000) {
      // AL is mandatory
      const hasImmovable = (al?.immovable?.length ?? 0) > 0;
      const hasMovable = al?.movable
        ? Object.values(al.movable as Record<string, number>).some((v) => v > 0)
        : false;
      if (!hasImmovable && !hasMovable) {
        errors.push({
          field: 'al.assets',
          message: 'Schedule AL is mandatory when income exceeds ₹50 lakhs — at least one asset must be declared',
        });
      }
      // Validate immovable entries
      for (let i = 0; i < (al?.immovable?.length ?? 0); i++) {
        const e = al.immovable[i];
        if (!e.description?.trim())
          errors.push({ field: `al.immovable.${i}.description`, message: 'Property description/address is required' });
        if (!(e.assetsShare > 0))
          errors.push({ field: `al.immovable.${i}.assetsShare`, message: 'Asset amount must be > 0' });
      }
    }
    addTab('assets_liabilities', 'Assets & Liabilities', errors);
  }

  // ── Verification ──────────────────────────────────────────────────────────
  const ver = returnData?.verification;
  {
    const errors: FieldError[] = [];
    if (!ver?.assesseeVerName?.trim())
      errors.push({ field: 'ver.name', message: 'Verification name is required' });
    if (!ver?.placeVerSign?.trim())
      errors.push({ field: 'ver.place', message: 'Place of signing is required' });
    if (!ver?.dateVerSign)
      errors.push({ field: 'ver.date', message: 'Date of signing is required' });
    addTab('verification', 'Verification', errors);
  }

  const errorCount = tabs.reduce((s, t) => s + t.errors.length, 0);
  const warningCount = tabs.reduce((s, t) => s + t.warnings.length, 0);

  return { tabs, errorCount, warningCount, fieldErrors, fieldWarnings };
}

/** Returns just the error count for a specific tab (for badge display) */
export function tabErrorCount(result: ValidationResult, tabId: TabId): number {
  return result.tabs.find((t) => t.tabId === tabId)?.errors.length ?? 0;
}
