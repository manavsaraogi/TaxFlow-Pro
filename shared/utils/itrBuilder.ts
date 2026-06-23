/**
 * shared/utils/itrBuilder.ts
 *
 * Assembles the final ITR JSON payload (ready for e-filing upload) from
 * internal ReturnData + Client + Firm objects stored in the DB.
 *
 * Usage:
 *   import { buildITRJson } from 'shared/utils/itrBuilder';
 *   const json = buildITRJson({ returnData, client, firm, swDetails });
 *   // → write to file / POST to ITD portal
 *
 * The output conforms to:
 *   ITR-1_2026_Main_V1.0_0.json
 *   ITR-2_2026_Main_V1.0_0.json
 *   ITR-4_2026_Main_V1.0_0.json
 *
 * Rules enforced here (not in the UI):
 *   - All amounts rounded to nearest integer
 *   - HP loss capped at -2,00,000
 *   - Deduction caps applied from DEDUCTION_CAPS
 *   - Standard deduction u/s 16ia auto-computed (min of actual, cap)
 *   - Rebate u/s 87A auto-computed based on regime + income
 *   - 234F fee auto-included when filing after due date
 */

import { createHmac } from 'crypto';

import type {
  ReturnData,
  ScheduleSalary,
  ScheduleHP,
  ScheduleOS,
  DeductionsChapterVIA,
  ScheduleTDS,
  ScheduleTaxPayments,
  ScheduleLTCG112A,
  IncomeSummary,
  ITRTaxComputation,
  Verification,
  PropertyEntry,
  TaxPaymentEntry,
  TDSSalaryEntry,
  TDSOtherEntry,
  TDS16CEntry,
  AllowanceExemptItem,
  OtherSourceItem,
  ITRFormType,
} from '../types/itr';

import { DEDUCTION_CAPS } from '../types/itr';

// ─────────────────────────────────────────────────────────────────────────────
// INPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface BuilderClient {
  pan: string;
  fullName: string;
  dateOfBirth: string;       // YYYY-MM-DD
  mobileNumber?: string;
  email?: string;
  aadhaarNumber?: string;
  address: string;
  city?: string;
  state?: string;            // StateCode string
  pinCode?: number;
  residentialStatus?: 'RES' | 'NRI' | 'RNR';  // Resident / Non-resident / Resident but Not Ordinary
}

export interface BuilderFirm {
  name: string;
  address: string;
  city: string;
  swVersionNo?: string;      // Software version (default '1.0')
  swCreatedBy?: string;      // SW number e.g. 'SW00000001' — get from ITD registration
  jsonCreatedBy?: string;    // Same as swCreatedBy typically
  intermediaryCity?: string;
}

export interface BuilderSWDetails {
  SWVersionNo: string;       // e.g. '1.0'
  SWCreatedBy: string;       // e.g. 'SW00000001'
  JSONCreatedBy: string;
  IntermediaryCity: string;
}

export interface BuildITRInput {
  returnData: ReturnData;
  client: BuilderClient;
  firm: BuilderFirm;
  sw: BuilderSWDetails;
  filingDate?: string;       // YYYY-MM-DD (defaults to today)
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function toInt(n: number | undefined | null): number {
  return Math.round(n ?? 0);
}

/** Map DB bank account type strings to ITR JSON enum codes */
function mapAccountType(type: string | undefined | null): string {
  const map: Record<string, string> = {
    SAVINGS: 'SB', CURRENT: 'CA', 'CASH CREDIT': 'CC',
    OVERDRAFT: 'OD', NRO: 'NRO', CGAS: 'CGAS', OTHER: 'OTH',
    SB: 'SB', CA: 'CA', CC: 'CC', OD: 'OD', OTH: 'OTH',
  };
  return map[(type ?? '').toUpperCase()] ?? 'SB';
}

/**
 * Build BankAccountDtls for ITR JSON.
 *
 * AY 2026-27 schema changes:
 *   - ITR-1/4: BankAccountDtls only has AddtnlBankDetails array (no BankDtlsFlag at that level).
 *   - ITR-2: BankAccountDtls has BankDtlsFlag + AddtnlBankDetails (no PriBankDetails).
 *
 * The 'layout' param is kept for backward-compat but PriBankDetails is now treated like AddtnlBankDetails.
 */
function buildBankAccountDtls(bank: any, layout: 'AddtnlBankDetails' | 'PriBankDetails') {
  const entry = {
    IFSCCode:      bank?.ifscCode ?? '',
    BankName:      bank?.bankName ?? '',
    BankAccountNo: bank?.accountNumber ?? '',
    AccountType:   mapAccountType(bank?.accountType),
    UseForRefund:  'true',
  };
  if (layout === 'PriBankDetails') {
    // ITR-2: uses BankDtlsFlag + AddtnlBankDetails (PriBankDetails removed in AY 2026-27 schema)
    return {
      BankDtlsFlag: bank ? 'Y' : 'N',
      AddtnlBankDetails: [entry],
    };
  }
  // ITR-1/4: no BankDtlsFlag at BankAccountDtls level per AY 2026-27 schema
  return {
    AddtnlBankDetails: [entry],
  };
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function ayToYear(ay: string): string {
  // "2024-25" → "2024" (start year, per CBDT JSON schema AssessmentYear pattern)
  return ay.split('-')[0] ?? ay;
}

function capAt(value: number, cap: number): number {
  return Math.min(toInt(value), cap);
}

function splitName(fullName: string): { FirstName: string; MiddleName: string; SurName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { FirstName: '', MiddleName: '', SurName: parts[0] };
  if (parts.length === 2) return { FirstName: parts[0], MiddleName: '', SurName: parts[1] };
  return {
    FirstName: parts[0],
    MiddleName: parts.slice(1, -1).join(' '),
    SurName: parts[parts.length - 1],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AY-SPECIFIC RATE CONFIG
// Each AY differs in: new-regime slabs, STCG/LTCG rates, rebate limits, due dates.
// Old-regime slabs and surcharge thresholds are unchanged across all three AYs.
// ─────────────────────────────────────────────────────────────────────────────

interface AYConfig {
  // Slab tax (new regime)
  newRegimeSlabTax: (inc: number) => number;
  // Capital gains rates
  stcg111ARate:     number;   // 0.15 (AY24-25) or 0.20 (AY25-26+)
  ltcg112ARate:     number;   // 0.10 (AY24-25) or 0.125 (AY25-26+)
  ltcg112AExempt:   number;   // 100000 (AY24-25) or 125000 (AY25-26+)
  // Rebate 87A
  rebate87A_new:    number;   // 25000 (AY24-25/25-26) or 60000 (AY26-27)
  rebateLimit_new:  number;   // 700000 (AY24-25/25-26) or 1200000 (AY26-27)
  rebate87A_old:    number;   // 12500 always
  rebateLimit_old:  number;   // 500000 always
  // Standard deduction u/s 16ia
  stdDeduction_new: number;   // 50000 (AY24-25) or 75000 (AY25-26+)
  stdDeduction_old: number;   // 50000 always
  // Filing due dates
  dueDateIndividual: string;
  dueDateAudit:      string;
}

function getAYConfig(ay: string): AYConfig {
  // Old-regime slab tax — unchanged across all AYs (individual <60)
  const oldSlabTax = (inc: number) => {
    if (inc <= 250_000)   return 0;
    if (inc <= 500_000)   return Math.round((inc - 250_000) * 0.05);
    if (inc <= 1_000_000) return 12_500 + Math.round((inc - 500_000) * 0.20);
    return 112_500 + Math.round((inc - 1_000_000) * 0.30);
  };

  if (ay === '2024-25') {
    return {
      newRegimeSlabTax: (inc) => {
        // Budget 2023 new-regime slabs (AY 2024-25)
        if (inc <= 300_000)   return 0;
        if (inc <= 600_000)   return Math.round((inc - 300_000) * 0.05);
        if (inc <= 900_000)   return 15_000 + Math.round((inc - 600_000) * 0.10);
        if (inc <= 1_200_000) return 45_000 + Math.round((inc - 900_000) * 0.15);
        if (inc <= 1_500_000) return 90_000 + Math.round((inc - 1_200_000) * 0.20);
        return 150_000 + Math.round((inc - 1_500_000) * 0.30);
      },
      stcg111ARate:     0.15,
      ltcg112ARate:     0.10,
      ltcg112AExempt:   100_000,
      rebate87A_new:    25_000,
      rebateLimit_new:  700_000,
      rebate87A_old:    12_500,
      rebateLimit_old:  500_000,
      stdDeduction_new: 50_000,
      stdDeduction_old: 50_000,
      dueDateIndividual: '2024-07-31',
      dueDateAudit:      '2024-10-31',
    };
  }

  if (ay === '2025-26') {
    return {
      newRegimeSlabTax: (inc) => {
        // Budget 2024 new-regime slabs (AY 2025-26)
        if (inc <= 300_000)   return 0;
        if (inc <= 700_000)   return Math.round((inc - 300_000) * 0.05);
        if (inc <= 1_000_000) return 20_000 + Math.round((inc - 700_000) * 0.10);
        if (inc <= 1_200_000) return 50_000 + Math.round((inc - 1_000_000) * 0.15);
        if (inc <= 1_500_000) return 80_000 + Math.round((inc - 1_200_000) * 0.20);
        return 140_000 + Math.round((inc - 1_500_000) * 0.30);
      },
      stcg111ARate:     0.20,   // Budget 2024: raised from 15% to 20% (w.e.f. 23-Jul-2024)
      ltcg112ARate:     0.125,  // Budget 2024: raised from 10% to 12.5%
      ltcg112AExempt:   125_000,
      rebate87A_new:    25_000,
      rebateLimit_new:  700_000,
      rebate87A_old:    12_500,
      rebateLimit_old:  500_000,
      stdDeduction_new: 75_000,
      stdDeduction_old: 50_000,
      dueDateIndividual: '2025-07-31',
      dueDateAudit:      '2025-10-31',
    };
  }

  // Default: AY 2026-27 (Budget 2025)
  return {
    newRegimeSlabTax: (inc) => {
      if (inc <= 400_000)   return 0;
      if (inc <= 800_000)   return Math.round((inc - 400_000) * 0.05);
      if (inc <= 1_200_000) return 20_000 + Math.round((inc - 800_000) * 0.10);
      if (inc <= 1_600_000) return 60_000 + Math.round((inc - 1_200_000) * 0.15);
      if (inc <= 2_000_000) return 120_000 + Math.round((inc - 1_600_000) * 0.20);
      if (inc <= 2_400_000) return 200_000 + Math.round((inc - 2_000_000) * 0.25);
      return 300_000 + Math.round((inc - 2_400_000) * 0.30);
    },
    stcg111ARate:     0.20,
    ltcg112ARate:     0.125,
    ltcg112AExempt:   125_000,
    rebate87A_new:    60_000,
    rebateLimit_new:  1_200_000,
    rebate87A_old:    12_500,
    rebateLimit_old:  500_000,
    stdDeduction_new: 75_000,
    stdDeduction_old: 75_000,
    dueDateIndividual: '2026-07-31',
    dueDateAudit:      '2026-10-31',
  };
}

// Detect assessee type from PAN 4th character (P=Individual, H=HUF, F=Firm)
function detectStatusFromPAN(pan: string): 'I' | 'H' | 'F' {
  const ch = (pan[3] ?? 'P').toUpperCase();
  if (ch === 'H') return 'H';
  if (ch === 'F') return 'F';
  return 'I';
}

// ─────────────────────────────────────────────────────────────────────────────
// CAP ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

function applyDeductionCaps(d: DeductionsChapterVIA, totalIncome: number) {
  const s80C = capAt(d.Section80C ?? 0, DEDUCTION_CAPS.Section80C);
  const s80CCC = capAt(d.Section80CCC ?? 0, DEDUCTION_CAPS.Section80CCC);
  const s80CCDEmp = capAt(d.Section80CCDEmployeeOrSE ?? 0, DEDUCTION_CAPS.Section80CCDEmployeeOrSE);
  // 80C + 80CCC + 80CCD(1) combined limit ₹1,50,000
  const combinedPre = s80C + s80CCC + s80CCDEmp;
  const scale = combinedPre > 150_000 ? 150_000 / combinedPre : 1;
  const s80CScaled = Math.round(s80C * scale);
  const s80CCCScaled = Math.round(s80CCC * scale);
  const s80CCDEmpScaled = Math.round(s80CCDEmp * scale);

  const s80CCD1B = capAt(d.Section80CCD1B ?? 0, DEDUCTION_CAPS.Section80CCD1B);
  const s80CCDEmployer = toInt(d.Section80CCDEmployer);

  const s80D = capAt(d.Section80D ?? 0, DEDUCTION_CAPS.Section80D_max);
  const s80DD = capAt(d.Section80DD ?? 0, DEDUCTION_CAPS.Section80DD_severe);
  const s80DDB = capAt(d.Section80DDB ?? 0, DEDUCTION_CAPS.Section80DDB_senior);
  const s80E = toInt(d.Section80E);
  const s80EE = capAt(d.Section80EE ?? 0, DEDUCTION_CAPS.Section80EE);
  const s80EEA = capAt(d.Section80EEA ?? 0, DEDUCTION_CAPS.Section80EEA);
  const s80EEB = capAt(d.Section80EEB ?? 0, DEDUCTION_CAPS.Section80EEB);
  const s80G = toInt(d.Section80G);
  const s80GG = capAt(d.Section80GG ?? 0, DEDUCTION_CAPS.Section80GG);
  const s80GGA = toInt(d.Section80GGA);
  const s80GGC = toInt(d.Section80GGC);
  const s80U = capAt(d.Section80U ?? 0, DEDUCTION_CAPS.Section80U_severe);
  const s80TTA = capAt(d.Section80TTA ?? 0, DEDUCTION_CAPS.Section80TTA);
  const s80TTB = capAt(d.Section80TTB ?? 0, DEDUCTION_CAPS.Section80TTB);
  const s80CCH = capAt(d.AnyOthSec80CCH ?? 0, DEDUCTION_CAPS.AnyOthSec80CCH);

  const total =
    s80CScaled + s80CCCScaled + s80CCDEmpScaled +
    s80CCD1B + s80CCDEmployer +
    s80D + s80DD + s80DDB +
    s80E + s80EE + s80EEA + s80EEB +
    s80G + s80GG + s80GGA + s80GGC +
    s80U + s80TTA + s80TTB + s80CCH;

  // Deductions cannot exceed total income
  const cappedTotal = Math.min(total, Math.max(0, totalIncome));

  return {
    Section80C: s80CScaled,
    Section80CCC: s80CCCScaled,
    Section80CCDEmployeeOrSE: s80CCDEmpScaled,
    Section80CCD1B: s80CCD1B,
    Section80CCDEmployer: s80CCDEmployer,
    Section80D: s80D,
    Section80DD: s80DD,
    Section80DDB: s80DDB,
    Section80E: s80E,
    Section80EE: s80EE,
    Section80EEA: s80EEA,
    Section80EEB: s80EEB,
    Section80G: s80G,
    Section80GG: s80GG,
    Section80GGA: s80GGA,
    Section80GGC: s80GGC,
    Section80U: s80U,
    Section80TTA: s80TTA,
    Section80TTB: s80TTB,
    AnyOthSec80CCH: s80CCH,
    TotalChapVIADeductions: cappedTotal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INCOME SUMMARY COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

function computeIncomeSummary(rd: ReturnData): IncomeSummary {
  const salary = toInt(rd.salary?.IncomeFromSalary);

  // HP loss capped at -2,00,000
  const hpRaw = toInt(rd.houseProperty?.TotalIncomeFromHP);
  const hp = hpRaw < 0 ? Math.max(hpRaw, -DEDUCTION_CAPS.HPLossSetOff) : hpRaw;

  // OS income — read from component format OR DB/API format (osSchedule)
  const os = toInt(rd.otherSources?.IncomeFromOtherSources)
    || toInt((rd as any).osSchedule?.incomeFromOtherSources);
  const presumptive = toInt(rd.presumptiveIncome?.TotalPresumptiveIncome);
  const ltcg112A = toInt(rd.ltcg112A?.TaxableLTCG112A);
  const stcg111A = toInt(rd.stcg?.TotalSTCG111A);
  const stcgOther = toInt(rd.stcg?.TotalSTCGOther);

  // ITR-5: business income = Section A (Item36) + Section B (Item42) + Section C (Item48)
  const itr5BP = (rd as any).itr5BP;
  const itr5PL = (rd as any).itr5PL;
  let itr5BusinessIncome = 0;
  if (itr5BP || itr5PL) {
    if (itr5BP) {
      const bp = itr5BP;
      const netPL = toInt(itr5PL?.NetProfitBeforeTaxes);
      const Item1  = netPL;
      const Item6  = Item1 + toInt(bp.Item2) + toInt(bp.Item3a) + toInt(bp.Item3b) + toInt(bp.Item3c);
      const Item10 = Item6 + toInt(bp.Item7) + toInt(bp.Item8) + toInt(bp.Item9);
      const Item13 = Item10 - toInt(bp.Item11) - toInt(bp.Item12i) - toInt(bp.Item12ii);
      const Item26 = Item13
        - toInt(bp.Item14a) - toInt(bp.Item14b) - toInt(bp.Item14c) - toInt(bp.Item14d)
        - toInt(bp.Item15) - toInt(bp.Item16) - toInt(bp.Item17) - toInt(bp.Item18)
        - toInt(bp.Item19) - toInt(bp.Item20) - toInt(bp.Item21) - toInt(bp.Item22)
        - toInt(bp.Item23) - toInt(bp.Item24) - toInt(bp.Item25);
      const Item33 = Item26 - toInt(bp.Item27) - toInt(bp.Item28) - toInt(bp.Item29)
        - toInt(bp.Item30) - toInt(bp.Item31) - toInt(bp.Item32);
      const Item34 = Item33 + toInt(bp.Item33a);
      const Item35Total = toInt(bp.Item35i_44AD)+toInt(bp.Item35ii_44ADA)+toInt(bp.Item35iii_44AE)
        +toInt(bp.Item35iv_44B)+toInt(bp.Item35v_44BB)+toInt(bp.Item35vi_44BBA)
        +toInt(bp.Item35vii_44BBB)+toInt(bp.Item35viii_44D)+toInt(bp.Item35ix_44DB);
      // Section A: regular business income
      const Item36 = Item34 + Item35Total;
      // Section B: speculative income
      const Item42 = toInt(bp.Item39) + toInt(bp.Item40) - toInt(bp.Item41);
      // Section C: specified business (35AD)
      const Item46 = toInt(bp.Item43) + toInt(bp.Item44) - toInt(bp.Item45);
      const Item47 = toInt(bp.Item47a) + toInt(bp.Item47b);
      const Item48 = Item46 - Item47;
      itr5BusinessIncome = Item36 + Item42 + Item48;
    } else {
      itr5BusinessIncome = toInt(itr5PL?.NetProfitBeforeTaxes);
    }
  }

  // Slab-income base (STCG other assets included, LTCG/111A excluded — taxed separately)
  const grossTotal = salary + hp + os + presumptive + stcgOther + itr5BusinessIncome;
  const grossTotalIncCG = grossTotal + ltcg112A + stcg111A;

  const deductions = rd.deductions
    ? applyDeductionCaps(rd.deductions, grossTotal).TotalChapVIADeductions
    : 0;

  const totalIncome = Math.max(0, grossTotal - deductions);

  return {
    IncomeFromSalary: salary,
    IncomeFromHP: hp,
    IncomeFromOtherSources: os,
    IncomeFromBusinessProfession: (presumptive || itr5BusinessIncome) || undefined,
    GrossTotalIncome: grossTotal,
    GrossTotalIncomeIncLTCG112A: (ltcg112A > 0 || stcg111A > 0) ? grossTotalIncCG : undefined,
    TotalDeductions: deductions,
    TotalIncome: totalIncome,
    LTCG112A: ltcg112A || undefined,
    STCG111A: stcg111A || undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

function computeSlabTax(income: number, regime: 'OLD' | 'NEW', cfg: AYConfig): number {
  if (regime === 'NEW') return cfg.newRegimeSlabTax(income);
  // Old regime — unchanged across all AYs (individual below 60)
  if (income <= 250_000) return 0;
  if (income <= 500_000) return Math.round((income - 250_000) * 0.05);
  if (income <= 1_000_000) return 12_500 + Math.round((income - 500_000) * 0.20);
  return 112_500 + Math.round((income - 1_000_000) * 0.30);
}

function computeSurcharge(
  tax: number,
  income: number,
  regime: 'OLD' | 'NEW',
  isFirmOrLLP = false,
  baseTaxAtIncome?: (i: number) => number,
): number {
  if (isFirmOrLLP) {
    if (income <= 10_000_000) return 0;
    const raw = Math.round(tax * 0.12);
    if (!baseTaxAtIncome) return raw;
    const relief = Math.max(0, (tax + raw) - (baseTaxAtIncome(10_000_000) + (income - 10_000_000)));
    return Math.max(0, raw - relief);
  }
  if (income <= 5_000_000) return 0;
  const rate = income > 50_000_000 ? (regime === 'NEW' ? 0.25 : 0.37)
    : income > 20_000_000 ? 0.25
    : income > 10_000_000 ? 0.15
    : 0.10;
  const raw = Math.round(tax * rate);
  if (!baseTaxAtIncome) return raw;
  // Marginal relief: additional tax over threshold must not exceed additional income
  const thresholds = [5_000_000, 10_000_000, 20_000_000, 50_000_000];
  let relief = 0;
  for (const thr of thresholds) {
    if (income > thr) {
      const taxAtThr = baseTaxAtIncome(thr);
      const additionalTax = tax + raw - taxAtThr;
      if (additionalTax > income - thr) {
        relief = Math.max(relief, additionalTax - (income - thr));
      }
    }
  }
  return Math.max(0, raw - relief);
}

function computeRebate87A(income: number, tax: number, regime: 'OLD' | 'NEW', cfg: AYConfig): number {
  if (regime === 'NEW') {
    if (income <= cfg.rebateLimit_new) return Math.min(tax, cfg.rebate87A_new);
  } else {
    if (income <= cfg.rebateLimit_old) return Math.min(tax, cfg.rebate87A_old);
  }
  return 0;
}

function computeTaxLiability(
  summary: IncomeSummary,
  regime: 'OLD' | 'NEW',
  ay: string,
  itr5?: { entityType?: string; usesMMR?: boolean; filingSection?: string; updatedAY?: string },
): ITRTaxComputation {
  const cfg = getAYConfig(ay);
  const totalIncome = summary.TotalIncome;
  const ltcg112A = summary.LTCG112A ?? 0;
  const stcg111A = summary.STCG111A ?? 0;

  const isFirmOrLLP = itr5 && (itr5.entityType === 'FIRM' || itr5.entityType === 'LLP');
  const isMMR = itr5 && itr5.usesMMR;
  const slabTax = (isFirmOrLLP || isMMR)
    ? Math.floor(totalIncome * 0.30)
    : computeSlabTax(totalIncome, regime, cfg);

  const taxableLTCG = Math.max(0, ltcg112A - cfg.ltcg112AExempt);
  const ltcgTax = Math.round(taxableLTCG * cfg.ltcg112ARate);
  const stcg111ATax = Math.round(stcg111A * cfg.stcg111ARate);

  const rebate = computeRebate87A(totalIncome, slabTax, regime, cfg);
  const taxAfterRebate = Math.max(0, slabTax - rebate) + ltcgTax + stcg111ATax;

  const incomeForSurcharge = totalIncome + ltcg112A + stcg111A;
  const baseTaxFn = (isFirmOrLLP || isMMR)
    ? (i: number) => Math.floor(i * 0.30)
    : (i: number) => computeSlabTax(i, regime, cfg);
  // MMR surcharge: 25% (new regime) or 37% (old regime) on tax, regardless of income level
  const surcharge = isMMR
    ? Math.round(taxAfterRebate * (regime === 'NEW' ? 0.25 : 0.37))
    : computeSurcharge(taxAfterRebate, incomeForSurcharge, regime, !!(isFirmOrLLP), baseTaxFn);
  const taxPlusSurcharge = taxAfterRebate + surcharge;
  const cess = Math.round(taxPlusSurcharge * 0.04);
  const grossTaxLiability = taxPlusSurcharge + cess;

  // 139(8A) updated return — additional tax u/s 140B (preview; base = gross tax, no TDS data here)
  let additionalTax140B: number | undefined;
  if (itr5?.filingSection === '139(8A)') {
    const updAY = itr5.updatedAY ?? '2024-25';
    const endYear = parseInt(updAY.split('-')[1] ?? '25') + 2000;
    const p1End = new Date(endYear + 1, 2, 31);
    const p2End = new Date(endYear + 2, 2, 31);
    const p3End = new Date(endYear + 3, 2, 31);
    const p4End = new Date(endYear + 4, 2, 31);
    const now = new Date();
    const rate = now <= p1End ? 0.25 : now <= p2End ? 0.50 : now <= p3End ? 0.60 : now <= p4End ? 0.70 : 0;
    if (rate > 0) additionalTax140B = Math.round(grossTaxLiability * rate);
  }

  const totalWithPenalty = grossTaxLiability + (additionalTax140B ?? 0);

  return {
    TotalTaxableIncome: totalIncome,
    NetTaxPayable: slabTax,
    Rebate87A: rebate,
    TaxAfterRebate: taxAfterRebate,
    Surcharge: surcharge,
    HealthEducationCess: cess,
    GrossTaxLiability: grossTaxLiability,
    TotalTaxPayable: totalWithPenalty,
    TotalTaxesPaid: 0,
    BalTaxPayable: totalWithPenalty,
    AggregateTaxInterestLiability: grossTaxLiability,
    ...(additionalTax140B !== undefined ? { AdditionalTax140B: additionalTax140B } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE BUILDERS — ITR-1 INCOME DEDUCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function buildITR1IncomeDeductions(rd: ReturnData, summary: IncomeSummary, capped: ReturnType<typeof applyDeductionCaps>, stdDedCap: number, includeGGA = true) {
  const sal = rd.salary;
  const hp = rd.houseProperty;
  const os = rd.otherSources;

  return {
    GrossSalary: toInt(sal?.TotalGrossSalary),
    Salary: toInt(sal?.Employers[0]?.Salarys?.Salary),
    PerquisitesValue: toInt(sal?.Employers[0]?.Salarys?.ValueOfPerquisites),
    ProfitsInSalary: toInt(sal?.Employers[0]?.Salarys?.ProfitsinLieuOfSalary),
    AllwncExemptUs10: sal?.AllwncExemptUs10Items?.length
      ? {
          AllwncExemptUs10Dtls: sal.AllwncExemptUs10Items.map((i: AllowanceExemptItem) => ({
            SalNatureDesc: i.SalNatureDesc,
            SalOthAmount: toInt(i.SalOthAmount),
          })),
          TotalAllwncExemptUs10: toInt(sal.AllwncExtentExemptUs10),
        }
      : { TotalAllwncExemptUs10: 0 },
    NetSalary: toInt(sal?.NetSalary),
    DeductionUs16: toInt(sal?.TotalDeductionUs16),
    DeductionUs16ia: capAt(sal?.DeductionUs16ia ?? 0, stdDedCap),
    EntertainmentAlw16ii: capAt(sal?.EntertainmentAlw16ii ?? 0, DEDUCTION_CAPS.EntertainmentAlw16ii),
    ProfessionalTaxUs16iii: capAt(sal?.ProfessionalTaxUs16iii ?? 0, DEDUCTION_CAPS.ProfessionalTax16iii),
    IncomeFromSal: toInt(sal?.IncomeFromSalary),
    PropertyDetails: hp?.Properties?.slice(0, 2).map(buildPropertyDetails) ?? [],
    TotalIncomeChargeableUnHP: toInt(hp?.TotalIncomeFromHP),
    IncomeOthSrc: toInt(os?.IncomeFromOtherSources),
    OthersInc: os?.OtherSourceItems?.length
      ? { OthersIncDtlsOthSrc: os.OtherSourceItems.map(buildOtherSourceItem) }
      : undefined,
    DeductionUs57iia: toInt(os?.DeductionUs57iia),
    GrossTotIncome: toInt(summary.GrossTotalIncome),
    GrossTotIncomeIncLTCG112A: toInt(summary.GrossTotalIncomeIncLTCG112A ?? summary.GrossTotalIncome),
    UsrDeductUndChapVIA: buildUsrDeductions(rd.deductions, includeGGA),
    DeductUndChapVIA: capped,
    TotalIncome: toInt(summary.TotalIncome),
    ExemptIncAgriOthUs10: os?.ExemptIncomeItems?.length
      ? {
          ExemptIncAgriOthUs10Dtls: os.ExemptIncomeItems.map((e) => ({
            Category: e.Category,
            SubCategory: e.SubCategory,
            OthAmount: toInt(e.OthAmount),
          })),
          ExemptIncAgriOthUs10Total: toInt(os.TotalExemptIncome),
        }
      : { ExemptIncAgriOthUs10Total: 0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY DETAILS BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildPropertyDetails(p: PropertyEntry, idx: number) {
  return {
    HPSNo: idx + 1,
    AddressDetailWithZipCode: {
      AddrDetail: p.AddressDetail.AddrDetail,
      CityOrTownOrDistrict: p.AddressDetail.CityOrTownOrDistrict,
      StateCode: p.AddressDetail.StateCode,
      CountryCode: p.AddressDetail.CountryCode,
      PinCode: p.AddressDetail.PinCode,
      ZipCode: p.AddressDetail.ZipCode,
    },
    PropertyOwner: p.PropertyOwner,
    PropertyOwnerOther: p.PropertyOwnerOther,
    PropCoOwnedFlg: p.PropCoOwnedFlg,
    AsseseeShareProperty: p.AsseseeShareProperty,
    CoOwners: p.CoOwners?.map((c) => ({
      CoOwnersSNo: c.CoOwnersSNo,
      NameCoOwner: c.NameCoOwner,
      PAN_CoOwner: c.PAN_CoOwner,
      Aadhaar_CoOwner: c.Aadhaar_CoOwner,
      PercentShareProperty: c.PercentShareProperty,
    })),
    ifLetOut: p.ifLetOut,
    TenantDetails: p.TenantDetails?.map((t) => ({
      TenantSNo: t.TenantSNo,
      NameofTenant: t.NameofTenant,
      PANofTenant: t.PANofTenant,
      AadhaarofTenant: t.AadhaarofTenant,
      PANTANofTenant: t.PANTANofTenant,
    })),
    Rentdetails: p.Rentdetails
      ? {
          AnnualLetableValue: toInt(p.Rentdetails.AnnualLetableValue),
          RentNotRealized: toInt(p.Rentdetails.RentNotRealized),
          LocalTaxes: toInt(p.Rentdetails.LocalTaxes),
          TotalUnrealizedAndTax: toInt(p.Rentdetails.TotalUnrealizedAndTax),
          BalanceALV: toInt(p.Rentdetails.BalanceALV),
          AnnualOfPropOwned: toInt(p.Rentdetails.AnnualOfPropOwned),
          ThirtyPercentOfBalance: toInt(p.Rentdetails.ThirtyPercentOfBalance),
          IntOnBorwCap: toInt(p.Rentdetails.IntOnBorwCap),
          Section24B: p.Rentdetails.Section24B
            ? {
                Section24BDtls: p.Rentdetails.Section24B.Section24BDtls.map((l) => ({
                  LoanTknFrom: l.LoanTknFrom,
                  BankOrInstnName: l.BankOrInstnName,
                  LoanAccNoOfBankOrInstnRefNo: l.LoanAccNoOfBankOrInstnRefNo,
                  DateofLoan: l.DateofLoan,
                  TotalLoanAmt: toInt(l.TotalLoanAmt),
                  LoanOutstndngAmt: toInt(l.LoanOutstndngAmt),
                  InterestUs24B: toInt(l.InterestUs24B),
                })),
                TotalInterestUs24B: toInt(p.Rentdetails.Section24B.TotalInterestUs24B),
              }
            : undefined,
          TotalDeduct: toInt(p.Rentdetails.TotalDeduct),
          ArrearsUnrealizedRentRcvd: toInt(p.Rentdetails.ArrearsUnrealizedRentRcvd),
          IncomeOfHP: toInt(p.Rentdetails.IncomeOfHP),
        }
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OTHER SOURCE ITEM BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildOtherSourceItem(item: OtherSourceItem) {
  return {
    OthSrcNatureDesc: item.OthSrcNatureDesc,
    OthSrcOthNatOfInc: item.OthSrcOthNatOfInc,
    OthSrcOthAmount: toInt(item.OthSrcOthAmount),
    DividendInc: item.DividendInc,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUCTIONS BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build user-entered Chapter VI-A deductions.
 * @param d         Raw deductions from ReturnData (null = no deductions entered)
 * @param includeGGA Whether to include Section80GGA (ITR-1/2 YES, ITR-4 NO per AY 2026-27 schema)
 */
function buildUsrDeductions(d: DeductionsChapterVIA | null, includeGGA = true) {
  const base = {
    Section80C: d ? toInt(d.Section80C) : 0,
    Section80CCC: d ? toInt(d.Section80CCC) : 0,
    ...(d?.PensionContribution80CCC ? { PensionContribution80CCC: d.PensionContribution80CCC } : {}),
    Section80CCDEmployeeOrSE: d ? toInt(d.Section80CCDEmployeeOrSE) : 0,
    Section80CCD1B: d ? toInt(d.Section80CCD1B) : 0,
    Section80CCDEmployer: d ? toInt(d.Section80CCDEmployer) : 0,
    ...(d?.PRANNumbers?.length ? { PRANDtls: d.PRANNumbers.map((p) => ({ PRANNum: p })) } : {}),
    Section80D: d ? toInt(d.Section80D) : 0,
    Section80DD: d ? toInt(d.Section80DD) : 0,
    ...(d?.Claimant80DDB ? { Section80DDBUsrType: d.Claimant80DDB } : {}),
    ...(d?.SpecialDisease80DDB ? { NameOfSpecDisease80DDB: d.SpecialDisease80DDB } : {}),
    Section80DDB: d ? toInt(d.Section80DDB) : 0,
    Section80E: d ? toInt(d.Section80E) : 0,
    Section80EE: d ? toInt(d.Section80EE) : 0,
    Section80EEA: d ? toInt(d.Section80EEA) : 0,
    Section80EEB: d ? toInt(d.Section80EEB) : 0,
    Section80G: d ? toInt(d.Section80G) : 0,
    Section80GG: d ? toInt(d.Section80GG) : 0,
    ...(d?.Form10BAAckNum ? { Form10BAAckNum: d.Form10BAAckNum } : {}),
    ...(includeGGA ? { Section80GGA: d ? toInt(d.Section80GGA) : 0 } : {}),
    Section80GGC: d ? toInt(d.Section80GGC) : 0,
    Section80U: d ? toInt(d.Section80U) : 0,
    Section80TTA: d ? toInt(d.Section80TTA) : 0,
    Section80TTB: d ? toInt(d.Section80TTB) : 0,
    AnyOthSec80CCH: d ? toInt(d.AnyOthSec80CCH) : 0,
    TotalChapVIADeductions: d ? toInt(d.TotalChapVIADeductions) : 0,
  };
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// TDS SCHEDULE BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildTDSOnSalaries(tds: ScheduleTDS) {
  return {
    TDSonSalary: tds.TDSOnSalaries.map((e: TDSSalaryEntry) => ({
      EmployerOrDeductorOrCollectDetl: {
        TAN: e.EmployerOrDeductorDetails.TAN,
        EmployerName: e.EmployerOrDeductorDetails.EmployerName,
      },
      IncChrgSal: toInt(e.IncomeChargeable),
      TotalTDSSal: toInt(e.TDSDeducted),
    })),
    TotalTDSonSalaries: toInt(tds.TotalTDSOnSalaries),
  };
}

function buildTDSOnOtherIncome(tds: ScheduleTDS) {
  // AY 2026-27 schema: array field is TDSonOthThanSal (not TDSOthThanSalaryDtls)
  return {
    TDSonOthThanSal: tds.TDSOnOtherIncome.map((e: TDSOtherEntry) => ({
      EmployerOrDeductorOrCollectDetl: {
        TAN: e.EmployerOrDeductorDetails.TAN,
        EmployerName: e.EmployerOrDeductorDetails.EmployerName,
      },
      TDSSection: e.TDSSection,
      AmtForTaxDeduct: toInt(e.AmtForTaxDeduct),
      DeductedYr: e.DeductedYear,
      TotTDSOnAmtPaid: toInt(e.TDSDeducted),
      ClaimOutOfTotTDSOnAmtPaid: toInt(e.TDSClaimed),
    })),
    TotalTDSonOthThanSals: toInt(tds.TotalTDSOnOtherIncome),
  };
}

function buildTDS16C(tds: ScheduleTDS) {
  // AY 2026-27 schema: array field is TDS3Details, total is TotalTDS3Details
  return {
    TDS3Details: tds.TDSOnRent16C.map((e: TDS16CEntry) => ({
      PANofTenant: e.PANofTenant,
      AadhaarofTenant: e.AadhaarofTenant,
      TDSSection: e.TDSSection,
      NameOfTenant: e.NameOfTenant,
      GrsRcptToTaxDeduct: toInt(e.GrossRentReceived),
      DeductedYr: e.DeductedYear,
      TDSDeducted: toInt(e.TDSDeducted),
      TDSClaimed: toInt(e.TDSClaimed),
    })),
    TotalTDS3Details: toInt(tds.TotalTDSOnRent),
  };
}

function buildTaxPayments(tp: ScheduleTaxPayments) {
  const allPayments = [
    ...tp.AdvanceTaxPayments,
    ...tp.SelfAssessmentPayments,
  ];
  return {
    TaxPayment: allPayments.map((p: TaxPaymentEntry) => ({
      BSRCode: p.BSRCode,
      DateDep: p.DateOfDeposit,
      SrlNoOfChaln: p.ChallanSerialNo,
      Amt: toInt(p.TaxAmount),
      Surcharge: toInt(p.SurchargeAmount),
      EducationCess: toInt(p.EducationCess),
      IntrstPaid: toInt(p.InterestAmount),
      Fee: toInt(p.FeeAmount),
      TotalAmt: toInt(p.TotalAmount),
      BSRCodeChln: p.BSRCode,
    })),
    TotalTaxPayments: toInt(tp.TotalTaxPaid),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL INFO BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildPersonalInfo(client: BuilderClient, opts?: { includeStatus?: string; itr2?: boolean }) {
  const name = splitName((client.fullName ?? '').toUpperCase());
  const statusCode = opts?.includeStatus ?? detectStatusFromPAN(client.pan);
  const mobileInt = client.mobileNumber ? parseInt(client.mobileNumber.replace(/\D/g, ''), 10) || undefined : undefined;

  if (opts?.itr2) {
    // ITR-2 PersonalInfo: SurNameOrOrgName, Status required; no EmployerCategory; Address needs CountryCodeMobile+MobileNo+EmailAddress
    return {
      AssesseeName: {
        FirstName: name.FirstName,
        MiddleName: name.MiddleName,
        SurNameOrOrgName: name.SurName,
      },
      PAN: client.pan.toUpperCase(),
      DOB: client.dateOfBirth,
      AadhaarCardNo: client.aadhaarNumber,
      Address: {
        ResidenceNo: (client.address || '').toUpperCase() || undefined,
        ResidenceName: '',
        RoadOrStreet: '',
        LocalityOrArea: (client.city ?? '').toUpperCase() || undefined,
        CityOrTownOrDistrict: (client.city ?? '').toUpperCase() || undefined,
        StateCode: (client.state ?? '11') as string,
        CountryCode: '91' as const,
        PinCode: client.pinCode,
        CountryCodeMobile: 91,
        ...(mobileInt ? { MobileNo: mobileInt } : {}),
        ...(client.email ? { EmailAddress: client.email } : {}),
      },
      SecondaryAdd: 'N' as const,
      Status: statusCode,
    };
  }

  // AY 2026-27 schema: Address requires CountryCodeMobile (integer), MobileNo (integer),
  // ResidenceNo and LocalityOrArea must be non-empty strings.
  // PersonalInfo does NOT have ResidentialStatus (removed in AY 2026-27 for ITR-1/4).
  const mobileInt2 = client.mobileNumber
    ? parseInt(client.mobileNumber.replace(/\D/g, ''), 10) || 9999999999
    : 9999999999;
  return {
    AssesseeName: {
      FirstName: name.FirstName,
      MiddleName: name.MiddleName,
      SurNameOrOrgName: name.SurName,
    },
    PAN: client.pan.toUpperCase(),
    DOB: client.dateOfBirth,
    AadhaarCardNo: client.aadhaarNumber,
    Address: {
      ResidenceNo: (client.address || 'NA').toUpperCase(),
      ResidenceName: '',
      RoadOrStreet: '',
      LocalityOrArea: (client.city || 'NA').toUpperCase(),
      CityOrTownOrDistrict: (client.city ?? '').toUpperCase(),
      StateCode: (client.state ?? '11') as string,
      CountryCode: '91',
      PinCode: client.pinCode,
      CountryCodeMobile: 91,
      MobileNo: mobileInt2,
      ...(client.email ? { EmailAddress: client.email } : {}),
    },
    SecondaryAdd: 'N' as const,
    EmployerCategory: 'OTH' as const,
    ...(opts?.includeStatus ? { Status: opts.includeStatus } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION BUILDER
// ─────────────────────────────────────────────────────────────────────────────

// Valid ITR-5 capacity codes: MP DP PA PO ME LQ RP TR EX RA AS OA
// Valid ITR-5 capacity codes: MP DP PA PO ME LQ RP TR EX RA AS OA
const VALID_ITR5_CAPACITY = new Set(['MP','DP','PA','PO','ME','LQ','RP','TR','EX','RA','AS','OA']);
// Valid individual (ITR-1/2/3/4) capacity codes
const VALID_INDIV_CAPACITY = new Set(['S','R','11','12']);

/**
 * Build Verification block — layout varies by form type / AY schema:
 *   'ITR5'  — ITR-5 AY2025-26: Capacity/Place/Date all inside Declaration
 *   'ITR14' — ITR-1/4 AY2026-27: Declaration(Name+Father+PAN) + top-level Capacity + Place (no Date)
 *   'ITR23' — ITR-2/3 AY2026-27: Declaration(Name+Father+PAN) + top-level Capacity + Date + Place
 */
function buildVerification(
  v: Verification,
  filingDate: string,
  pan?: string,
  layout: 'ITR5' | 'ITR14' | 'ITR23' = 'ITR14',
) {
  const isITR5   = layout === 'ITR5';
  const validSet = isITR5 ? VALID_ITR5_CAPACITY : VALID_INDIV_CAPACITY;
  const defaultCap = isITR5 ? 'PO' : 'S';
  const capacity = (validSet.has(v.Capacity ?? '') ? v.Capacity : defaultCap) as string;
  const sigPAN   = (v as any).signatoryPAN || pan || '';
  const name     = (v.AssesseeVerName || (isITR5 ? 'AUTHORISED SIGNATORY' : '')).toUpperCase();
  const father   = (v.FatherName?.trim() && v.FatherName.trim() !== '-'
                      ? v.FatherName.trim() : '-').toUpperCase();
  const place    = ((v as any).Place || (v as any).PlaceVerSign || '').toUpperCase() || undefined;
  const date     = (v as any).Date || (v as any).DateVerSign || filingDate;

  if (isITR5) {
    // ITR-5 AY2025-26: all fields inside Declaration
    return {
      Declaration: {
        AssesseeVerName: name,
        ...(father !== '-' ? { FatherName: father } : {}),
        AssesseeVerPAN: sigPAN,
        Capacity: capacity,
        ...(place ? { Place: place } : {}),
        Date: date,
      },
    };
  }

  if (layout === 'ITR14') {
    // ITR-1/4 AY2026-27: no Date in Verification
    return {
      Declaration: { AssesseeVerName: name, FatherName: father, AssesseeVerPAN: sigPAN },
      Capacity: capacity,
      ...(place ? { Place: place } : {}),
    };
  }

  // ITR-2/3 AY2026-27: Date required at Verification level
  return {
    Declaration: { AssesseeVerName: name, FatherName: father, AssesseeVerPAN: sigPAN },
    Capacity: capacity,
    Date: date,
    ...(place ? { Place: place } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN BUILDER — ITR-1
// ─────────────────────────────────────────────────────────────────────────────

function buildITR1(input: BuildITRInput): object {
  const { returnData: rd, client, sw, filingDate } = input;
  const date = filingDate ?? today();
  const ay = rd.assessmentYear ?? '2026-27';
  const cfg = getAYConfig(ay);
  const summary = computeIncomeSummary(rd);
  const capped = rd.deductions
    ? applyDeductionCaps(rd.deductions, summary.GrossTotalIncome)
    : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);
  const taxComp = computeTaxLiability(summary, rd.regime, ay);

  const totalTaxPaid =
    toInt(rd.tds?.TotalTDSOnSalaries) +
    toInt(rd.tds?.TotalTDSOnOtherIncome) +
    toInt(rd.tds?.TotalTDSOnRent) +
    toInt(rd.tds?.TotalTCS) +
    toInt(rd.taxPayments?.TotalTaxPaid);

  taxComp.TotalTaxesPaid = totalTaxPaid;
  taxComp.BalTaxPayable = Math.max(0, taxComp.GrossTaxLiability - totalTaxPaid);
  taxComp.Refund = totalTaxPaid > taxComp.GrossTaxLiability
    ? totalTaxPaid - taxComp.GrossTaxLiability
    : undefined;
  taxComp.AggregateTaxInterestLiability = taxComp.GrossTaxLiability;

  return {
    ITR: {
      ITR1: {
        CreationInfo: {
          SWVersionNo: sw.SWVersionNo,
          SWCreatedBy: sw.SWCreatedBy,
          JSONCreatedBy: sw.JSONCreatedBy,
          JSONCreationDate: date,
          IntermediaryCity: sw.IntermediaryCity,
          Digest: '-',
        },
        Form_ITR1: {
          FormName: 'ITR-1',
          // Description maxLength=75 per AY 2026-27 schema
          Description: 'For Individuals having Income from Salaries, one house property',
          AssessmentYear: ayToYear(rd.assessmentYear),
          SchemaVer: 'Ver1.0',
          FormVer: 'Ver1.0',
        },
        PersonalInfo: buildPersonalInfo(client),
        FilingStatus: {
          // AY 2026-27 schema: ReturnFileSec must be an integer (not string)
          ReturnFileSec: Number(rd.filingSection ?? 11),
          OptOutNewTaxRegime: rd.regime === 'OLD' ? 'Y' : 'N',
          AsseseeRepFlg: 'N',
          ItrFilingDueDate: cfg.dueDateIndividual,
        },
        ITR1_IncomeDeductions: buildITR1IncomeDeductions(rd, summary, capped, rd.regime === 'NEW' ? cfg.stdDeduction_new : cfg.stdDeduction_old, true),
        ITR1_TaxComputation: {
          TotalTaxPayable:     toInt(taxComp.NetTaxPayable),    // tax on TI before rebate
          Rebate87A:           toInt(taxComp.Rebate87A),
          TaxPayableOnRebate:  toInt(taxComp.TaxAfterRebate),   // after rebate
          EducationCess:       toInt(taxComp.HealthEducationCess),
          GrossTaxLiability:   toInt(taxComp.GrossTaxLiability),
          Section89:           0,
          NetTaxLiability:     toInt(taxComp.GrossTaxLiability),
          TotalIntrstPay:      0,
          IntrstPay: {
            IntrstPayUs234A:   0,
            IntrstPayUs234B:   0,
            IntrstPayUs234C:   0,
            LateFilingFee234F: 0,
          },
          TotTaxPlusIntrstPay: toInt(taxComp.GrossTaxLiability),
        },
        TaxPaid: {
          TaxesPaid: {
            AdvanceTax:        toInt(rd.taxPayments?.TotalAdvanceTax),
            TDS:               toInt(rd.tds?.TotalTDSOnSalaries) + toInt(rd.tds?.TotalTDSOnOtherIncome) + toInt(rd.tds?.TotalTDSOnRent),
            TCS:               toInt(rd.tds?.TotalTCS),
            SelfAssessmentTax: toInt(rd.taxPayments?.TotalSelfAssessmentTax),
            TotalTaxesPaid:    totalTaxPaid,
          },
          BalTaxPayable: Math.max(0, toInt(taxComp.GrossTaxLiability) - totalTaxPaid),
        },
        Refund: {
          RefundDue: taxComp.Refund ?? 0,
          BankAccountDtls: buildBankAccountDtls((rd as any).bankAccounts?.[0], 'AddtnlBankDetails'),
        },
        // AY 2026-27: TDSonSalary minItems=1 — only include if there are entries
        ...(rd.tds && rd.tds.TDSOnSalaries.length > 0
          ? { TDSonSalaries: buildTDSOnSalaries(rd.tds) }
          : {}),
        // TDSonOthThanSal array only if entries exist (minItems=1)
        ...(rd.tds && rd.tds.TDSOnOtherIncome.length > 0
          ? { TDSonOthThanSals: buildTDSOnOtherIncome(rd.tds) }
          : { TDSonOthThanSals: { TotalTDSonOthThanSals: 0 } }),
        // TDS3Details (16C) only if entries exist (minItems=1)
        ...(rd.tds && rd.tds.TDSOnRent16C.length > 0
          ? { ScheduleTDS3Dtls: buildTDS16C(rd.tds) }
          : { ScheduleTDS3Dtls: { TotalTDS3Details: 0 } }),
        TaxPayments: rd.taxPayments ? buildTaxPayments(rd.taxPayments) : { TotalTaxPayments: 0 },
        LTCG112A: rd.ltcg112A
          ? {
              LTCG112ADtls: rd.ltcg112A.Entries.map((e) => ({
                ISIN: e.ISIN,
                ShareUnitName: e.ShareOrUnitName,
                FMVPerShareUnit: toInt(e.FMVasOn31Jan2018),
                SaleValue: toInt(e.SalesValue),
                PurchaseCost: toInt(e.PurchaseCost),
                Expenditure: toInt(e.Expenditure),
                GainLoss: toInt(e.GainLoss),
              })),
              TotalLTCG112A: toInt(rd.ltcg112A.TaxableLTCG112A),
            }
          : undefined,
        Verification: rd.verification ? buildVerification(rd.verification, date, undefined, 'ITR14') : undefined,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO FORM-TYPE SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Automatically determine ITR form type from client + return signals.
 * Returns { formType, reason }.
 */
export function autoSelectFormType(opts: {
  assesseeType: string;           // 'INDIVIDUAL' | 'HUF' | 'FIRM' etc.
  residentialStatus?: string;     // 'RES' | 'NRI' | 'RNR'
  housePropertyCount?: number;    // number of HP schedule entries
  hasCapitalGains?: boolean;      // any LTCG/STCG entries
  totalIncome?: number;           // gross total income
  hasAgriIncome?: boolean;        // agricultural income > 5000
  hasBusinessIncome?: boolean;    // income from business/profession
}): { formType: 'ITR-1' | 'ITR-2' | 'ITR-4'; reason: string } {
  const { assesseeType, residentialStatus, housePropertyCount = 0,
    hasCapitalGains = false, totalIncome = 0, hasAgriIncome = false, hasBusinessIncome = false } = opts;

  if (hasBusinessIncome) return { formType: 'ITR-4', reason: 'Presumptive business income (u/s 44AD/44ADA/44AE)' };
  if (assesseeType === 'HUF') return { formType: 'ITR-2', reason: 'HUF assessee must use ITR-2' };
  if (residentialStatus === 'NRI' || residentialStatus === 'RNR') return { formType: 'ITR-2', reason: 'Non-resident / RNOR must use ITR-2' };
  if (hasCapitalGains) return { formType: 'ITR-2', reason: 'Capital gains income requires ITR-2' };
  if (housePropertyCount > 1) return { formType: 'ITR-2', reason: 'More than one house property requires ITR-2' };
  if (totalIncome > 5_000_000) return { formType: 'ITR-2', reason: 'Total income exceeds ₹50 lakh — ITR-2 required' };
  if (hasAgriIncome) return { formType: 'ITR-2', reason: 'Agricultural income requires ITR-2' };
  return { formType: 'ITR-1', reason: 'Salary + up to 1 house property + other sources' };
}

/**
 * Detect the correct ITR form type directly from a fully-populated ReturnData.
 * Used by ReturnShell to auto-suggest / auto-switch form type as the user fills in schedules.
 *
 * Priority (first match wins — stricter rules first):
 *  1. STCG (any) → ITR-2
 *  2. LTCG 112A > ₹1.25L AND no presumptive → ITR-2
 *  3. Presumptive income → ITR-4  (LTCG 112A within limit is allowed in ITR-4)
 *  4. Any LTCG 112A entry (even within limit, no presumptive) → ITR-2
 *  5. Total income > ₹50 lakh → ITR-2
 *  6. HUF status (4th PAN char = H) → ITR-2
 *  7. Otherwise → ITR-1
 */
export function detectFormTypeFromReturnData(rd: ReturnData): { formType: ITRFormType; reason: string } {
  const hasSTCG       = (rd.stcg?.TotalSTCG ?? 0) > 0;
  const ltcg112ACount = rd.ltcg112A?.Entries?.length ?? 0;
  const ltcg112AGain  = rd.ltcg112A?.TotalGain ?? 0;
  const ltcg112AOver  = ltcg112AGain > DEDUCTION_CAPS.LTCG112AExempt;
  const hasPresumptive = (rd.presumptiveIncome?.TotalPresumptiveIncome ?? 0) > 0;
  const summary       = computeIncomeSummary(rd);
  const grossIncome   = summary.GrossTotalIncome;

  if (hasSTCG)
    return { formType: 'ITR-2', reason: 'Short-term capital gains (STCG) — ITR-2 required' };

  if (ltcg112AOver && !hasPresumptive)
    return { formType: 'ITR-2', reason: `LTCG u/s 112A gain ₹${ltcg112AGain.toLocaleString('en-IN')} exceeds ₹1.25L exemption — ITR-2 required` };

  if (hasPresumptive)
    return { formType: 'ITR-4', reason: 'Presumptive income u/s 44AD/44ADA/44AE — ITR-4 required' };

  if (ltcg112ACount > 0)
    return { formType: 'ITR-2', reason: 'Capital gains u/s 112A — ITR-2 required (or ITR-4 for presumptive income filers)' };

  if (grossIncome > 5_000_000)
    return { formType: 'ITR-2', reason: `Total income ₹${(grossIncome/100000).toFixed(1)}L exceeds ₹50L — ITR-2 required` };

  return { formType: 'ITR-1', reason: 'Salary, house property and other sources — ITR-1 applicable' };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN BUILDER — ITR-2 (Individuals/HUF with CG, multiple HP, foreign income)
// ─────────────────────────────────────────────────────────────────────────────

function buildITR2(input: BuildITRInput): object {
  const { returnData: rd, client, sw, filingDate } = input;
  const date = filingDate ?? today();
  const ay = rd.assessmentYear ?? '2026-27';
  const cfg = getAYConfig(ay);
  const summary = computeIncomeSummary(rd);
  const capped = rd.deductions
    ? applyDeductionCaps(rd.deductions, summary.GrossTotalIncome)
    : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);
  const taxComp = computeTaxLiability(summary, rd.regime, ay);

  // ── Capital gains from LTCG 112A entries ────────────────────────────────
  const ltcg112ATotal = toInt(rd.ltcg112A?.TaxableLTCG112A ?? 0);
  const ltcg112AEntries = rd.ltcg112A?.Entries ?? [];

  const totalCG = ltcg112ATotal; // extend when STCG added
  const grossTotalIncome = toInt(summary.GrossTotalIncome) + totalCG;
  const totalIncome = Math.max(0, grossTotalIncome - capped.TotalChapVIADeductions);

  // ── TDS / tax paid totals ────────────────────────────────────────────────
  const tdsSalary  = toInt(rd.tds?.TotalTDSOnSalaries);
  const tdsOther   = toInt(rd.tds?.TotalTDSOnOtherIncome);
  const tdsRent    = toInt(rd.tds?.TotalTDSOnRent);
  const tcs        = toInt(rd.tds?.TotalTCS);
  const advTax     = toInt(rd.taxPayments?.TotalAdvanceTax);
  const satTax     = toInt(rd.taxPayments?.TotalSelfAssessmentTax);
  const totalTaxPaid = tdsSalary + tdsOther + tdsRent + tcs + advTax + satTax;

  taxComp.TotalTaxesPaid = totalTaxPaid;
  const netTaxLiability  = toInt(taxComp.GrossTaxLiability);
  const balPayable        = Math.max(0, netTaxLiability - totalTaxPaid);
  const refund            = totalTaxPaid > netTaxLiability ? totalTaxPaid - netTaxLiability : 0;

  // ── ScheduleCYLA helper (no loss set-off in common case) ────────────────
  const hpIncome = toInt(summary.IncomeFromHP);
  const salIncome = toInt(summary.IncomeFromSalary);
  const osIncome  = toInt(summary.IncomeFromOtherSources);
  // HP loss (negative) can be set off against salary u/s 71 up to ₹2L
  const hpLossSetOff = hpIncome < 0 ? Math.min(Math.abs(hpIncome), 200_000) : 0;
  const salAfterSetOff = Math.max(0, salIncome - hpLossSetOff);
  const hpAfterSetOff  = Math.max(0, hpIncome);  // HP loss absorbed above

  const cylaInc = (n: number) => ({
    IncCYLA: { IncOfCurYrUnderThatHead: Math.max(0, n), HPlossCurYrSetoff: 0, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: Math.max(0, n) },
  });

  // ── ScheduleBFLA (no brought-forward losses in common case) ─────────────
  const bflaRow = (n: number) => ({
    IncCYLA: { IncOfCurYrUnderThatHead: Math.max(0,n), HPlossCurYrSetoff: 0, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: Math.max(0,n) },
    BFLossSetOff: 0,
    IncOfCurYrAfterBFLSetOff: Math.max(0,n),
  });

  return {
    ITR: {
      ITR2: {
        CreationInfo: {
          SWVersionNo:      sw.SWVersionNo,
          SWCreatedBy:      sw.SWCreatedBy,
          JSONCreatedBy:    sw.JSONCreatedBy,
          JSONCreationDate: date,
          IntermediaryCity: sw.IntermediaryCity,
          Digest: '-',
        },
        Form_ITR2: {
          FormName:       'ITR-2',
          Description:    'For Individuals and HUFs not having income from profits and gains of business or profession',
          AssessmentYear: ayToYear(rd.assessmentYear),
          SchemaVer:      'Ver1.0',
          FormVer:        'Ver1.0',
        },

        // ── PartA_GEN1 ────────────────────────────────────────────────────
        PartA_GEN1: {
          PersonalInfo: buildPersonalInfo(client, { itr2: true }),
          FilingStatus: {
            ReturnFileSec:        rd.filingSection,
            OptOutNewTaxRegime:   rd.regime === 'OLD' ? 'Y' : 'N',
            SeventhProvisio139:   'N',
            clauseiv7provisio139i: 'N',
            AsseseeRepFlg:        'N',
            ResidentialStatus:    (client.residentialStatus ?? 'RES') === 'RNR' ? 'NOR' : (client.residentialStatus ?? 'RES'),
          },
        },

        // ── ScheduleS ────────────────────────────────────────────────────
        ScheduleS: rd.salary
          ? {
              Salaries: rd.salary.Employers.map((emp) => ({
                NameOfEmployer:     emp.NameOfEmployer,
                NatureOfEmployment: emp.NatureOfEmployment,
                TANofEmployer:      emp.TANofEmployer,
                AddressDetail:      emp.AddressDetail,
                Salarys: {
                  GrossSalary:             toInt(emp.Salarys.GrossSalary),
                  Salary:                  toInt(emp.Salarys.Salary),
                  ValueOfPerquisites:      toInt(emp.Salarys.ValueOfPerquisites),
                  ProfitsinLieuOfSalary:   toInt(emp.Salarys.ProfitsinLieuOfSalary),
                  IncomeNotified89A:       toInt(emp.Salarys.IncomeNotified89A),
                  IncomeNotifiedOther89A:  toInt(emp.Salarys.IncomeNotifiedOther89A),
                },
              })),
              TotalGrossSalary:           toInt(rd.salary.TotalGrossSalary),
              AllwncExtentExemptUs10:     toInt(rd.salary.AllwncExtentExemptUs10),
              NetSalary:                  toInt(rd.salary.NetSalary),
              DeductionUS16:              toInt(rd.salary.TotalDeductionUs16),
              DeductionUnderSection16ia:  capAt(rd.salary.DeductionUs16ia, rd.regime === 'NEW' ? cfg.stdDeduction_new : cfg.stdDeduction_old),
              EntertainmntalwncUs16ii:    capAt(rd.salary.EntertainmentAlw16ii, DEDUCTION_CAPS.EntertainmentAlw16ii),
              ProfessionalTaxUs16iii:     capAt(rd.salary.ProfessionalTaxUs16iii, DEDUCTION_CAPS.ProfessionalTax16iii),
              TotIncUnderHeadSalaries:    toInt(rd.salary.IncomeFromSalary),
            }
          : undefined,

        // ── ScheduleHP ───────────────────────────────────────────────────
        ScheduleHP: rd.houseProperty
          ? {
              PropertyDetails:             rd.houseProperty.Properties.map(buildPropertyDetails),
              TotalIncomeChargeableUnHP:   toInt(rd.houseProperty.TotalIncomeFromHP),
            }
          : undefined,

        // ── ScheduleCGFor23 ──────────────────────────────────────────────
        ScheduleCGFor23: {
          ShortTermCapGainFor23: (() => {
            const stcg = rd.stcg;
            const stcg111ATotal = toInt(stcg?.TotalSTCG111A);
            const stcgOtherTotal = toInt(stcg?.TotalSTCGOther);
            const otherAssets = stcg?.OtherEntries ?? [];
            const totalOtherSaleVal = otherAssets.reduce((s, e) => s + toInt(e.salesValue), 0);
            const totalOtherCost    = otherAssets.reduce((s, e) => s + toInt(e.purchaseCost), 0);
            const totalOtherExp     = otherAssets.reduce((s, e) => s + toInt(e.expenditure), 0);
            const equityShares111A = stcg?.Entries111A ?? [];
            return {
              EquityMFDTDtls111A: equityShares111A.length > 0 ? {
                ShareUnitSaleDetails111A: equityShares111A.map(e => ({
                  ISIN:          e.isin ?? '',
                  ShareUnitName: e.shareOrUnitName ?? '',
                  SaleValue:     toInt(e.salesValue),
                  CostAcquisition: toInt(e.purchaseCost),
                  Expenditure:   toInt(e.expenditure),
                  GainLoss:      toInt(e.gainLoss),
                })),
                TotalSaleValue:      stcg?.Entries111A.reduce((s, e) => s + toInt(e.salesValue), 0) ?? 0,
                TotalCostOfAcq:      stcg?.Entries111A.reduce((s, e) => s + toInt(e.purchaseCost), 0) ?? 0,
                TotalExpenditure:    stcg?.Entries111A.reduce((s, e) => s + toInt(e.expenditure), 0) ?? 0,
                TotalSTCG111A:       stcg111ATotal,
              } : undefined,
              NRITransacSec48Dtl:    { NRITransactionSec48: 0 },
              NRISecur115AD:         { NRISecuritiesIncome: 0, NRISecuritiesTax: 0 },
              SaleOnOtherAssets:     { SaleValue: totalOtherSaleVal, CostAcquisition: totalOtherCost, LowDeductions: totalOtherExp, CapGain: stcgOtherTotal },
              TotalAmtDeemedStcg:    0,
              PassThrIncNatureSTCG:  0,
              TotalAmtNotTaxUsDTAAStcg: 0,
              TotalAmtTaxUsDTAAStcg:    0,
              TotalSTCG:             stcg111ATotal + stcgOtherTotal,
            };
          })(),
          LongTermCapGain23: {
            SaleOfEquityShareUs112A: ltcg112AEntries.length > 0
              ? {
                  SaleOfEquityDtls: ltcg112AEntries.map((e) => ({
                    ISIN:            e.ISIN ?? '',
                    ShareUnitName:   e.ShareOrUnitName ?? '',
                    SaleValue:       toInt(e.SalesValue),
                    PurchaseCost:    toInt(e.PurchaseCost),
                    FMVasOn31Jan2018: toInt(e.FMVasOn31Jan2018),
                    Expenditure:     toInt(e.Expenditure),
                    GainLoss:        toInt(e.GainLoss),
                  })),
                  TotalSaleValue:    toInt(rd.ltcg112A?.Entries.reduce((s,e) => s + (e.SalesValue ?? 0), 0)),
                  TotalCostOfAcq:    toInt(rd.ltcg112A?.Entries.reduce((s,e) => s + (e.PurchaseCost ?? 0), 0)),
                  TotalExpenditure:  0,
                  TotalLTCG112A:     ltcg112ATotal,
                }
              : undefined,
            NRIProvisoSec48:          { NRITransactionSec48: 0 },
            NRIOnSec112and115:        { NRISecuritiesIncome: 0, NRISecuritiesTax: 0 },
            NRISaleOfEquityShareUs112A: { NRIEquityIncome: 0, NRIEquityTax: 0 },
            NRISaleofForeignAsset:    { NRIForeignAssetIncome: 0, NRIForeignAssetTax: 0 },
            SaleofAssetNADtls:        { SaleValue: 0, CostAcquisition: 0, LowDeductions: 0, CapGain: 0 },
            TotalAmtDeemedLtcg:       0,
            PassThrIncNatureLTCG:     0,
            TotalAmtNotTaxUsDTAALtcg: 0,
            TotalAmtTaxUsDTAALtcg:    0,
            TotalLTCG:                ltcg112ATotal,
          },
          SumOfCGIncm:     totalCG,
          IncmFromVDATrnsf: 0,
          TotScheduleCGFor23: totalCG,
        },

        // ── Schedule112A ─────────────────────────────────────────────────
        Schedule112A: ltcg112AEntries.length > 0
          ? {
              Schedule112ADtls: ltcg112AEntries.map((e) => ({
                ISIN:             e.ISIN ?? '',
                ShareUnitName:    e.ShareOrUnitName ?? '',
                FMVPerShareUnit:  toInt(e.FMVasOn31Jan2018),
                SaleValue:        toInt(e.SalesValue),
                PurchaseCost:     toInt(e.PurchaseCost),
                Expenditure:      toInt(e.Expenditure),
                GainLoss:         toInt(e.GainLoss),
              })),
              TotalLTCG112A: ltcg112ATotal,
            }
          : undefined,

        // ── ScheduleOS ───────────────────────────────────────────────────
        ScheduleOS: rd.otherSources
          ? {
              OtherSrcThanOwnRaceHorse: toInt(rd.otherSources.IncomeFromOtherSources),
              OthSrcItems: Array.isArray(rd.otherSources.OtherSourceItems)
                ? rd.otherSources.OtherSourceItems.map(buildOtherSourceItem)
                : [],
              DeductionUs57iia: toInt(rd.otherSources.DeductionUs57iia),
              IncomeOthSrc:     toInt(rd.otherSources.IncomeFromOtherSources),
            }
          : { OtherSrcThanOwnRaceHorse: 0, OthSrcItems: [], DeductionUs57iia: 0, IncomeOthSrc: 0 },

        // ── ScheduleVIA ──────────────────────────────────────────────────
        ScheduleVIA: rd.deductions && rd.regime === 'OLD'
          ? { UsrDeductions: buildUsrDeductions(rd.deductions) }
          : undefined,

        // ── ScheduleCYLA (current year loss adjustment) ───────────────────
        ScheduleCYLA: {
          Salary: {
            IncCYLA: {
              IncOfCurYrUnderThatHead: Math.max(0, salIncome),
              HPlossCurYrSetoff:       hpLossSetOff,
              OthSrcLossNoRaceHorseSetoff: 0,
              IncOfCurYrAfterSetOff:   salAfterSetOff,
            },
          },
          HP: {
            IncCYLA: {
              IncOfCurYrUnderThatHead: Math.max(0, hpIncome),
              OthSrcLossNoRaceHorseSetoff: 0,
              IncOfCurYrAfterSetOff:   hpAfterSetOff,
            },
          },
          STCG20Per:    cylaInc(0),
          STCG30Per:    cylaInc(0),
          STCGAppRate:  cylaInc(0),
          STCGDTAARate: cylaInc(0),
          LTCG12_5Per:  cylaInc(ltcg112ATotal),
          LTCGDTAARate: cylaInc(0),
          OthSrcExclRaceHorse: {
            IncCYLA: {
              IncOfCurYrUnderThatHead:   Math.max(0, osIncome),
              OthSrcLossNoRaceHorseSetoff: 0,
              IncOfCurYrAfterSetOff:     Math.max(0, osIncome),
            },
          },
          TotalCurYr: {
            TotalCurYrInc: grossTotalIncome,
            TotalCurYrLoss: 0,
          },
          TotalLossSetOff: { TotalLossSetOff: hpLossSetOff },
          LossRemAftSetOff: { LossRemainingAfterSetOff: 0 },
        },

        // ── ScheduleBFLA (brought-forward losses — none in common case) ──
        ScheduleBFLA: {
          Salary:       bflaRow(salAfterSetOff),
          STCG20Per:    bflaRow(0),
          STCG30Per:    bflaRow(0),
          STCGAppRate:  bflaRow(0),
          STCGDTAARate: bflaRow(0),
          LTCG12_5Per:  bflaRow(ltcg112ATotal),
          LTCGDTAARate: bflaRow(0),
          IncomeOfCurrYrAftCYLABFLA: grossTotalIncome,
          TotalBFLossSetOff: 0,
        },

        // ── PartB-TI ─────────────────────────────────────────────────────
        'PartB-TI': {
          Salaries: toInt(summary.IncomeFromSalary),
          IncomeFromHP: Math.max(0, toInt(summary.IncomeFromHP)),
          CapGain: {
            ShortTerm: {
              ShortTerm20Per:       0,
              ShortTerm30Per:       0,
              ShortTermAppRate:     0,
              ShortTermSplRateDTAA: 0,
              TotalShortTerm:       0,
            },
            LongTerm: {
              LongTerm12_5Per:      ltcg112ATotal,
              LongTermSplRateDTAA:  0,
              TotalLongTerm:        ltcg112ATotal,
            },
            ShortTermLongTermTotal: ltcg112ATotal,
            CapGains30Per115BBH:    0,
            TotalCapGains:          ltcg112ATotal,
          },
          IncFromOS: {
            OtherSrcThanOwnRaceHorse: Math.max(0, toInt(summary.IncomeFromOtherSources)),
            IncChargblSplRate:        0,
            FromOwnRaceHorse:         0,
            TotIncFromOS:             Math.max(0, toInt(summary.IncomeFromOtherSources)),
          },
          TotalTI:                  grossTotalIncome,
          CurrentYearLoss:          0,
          BalanceAfterSetoffLosses: grossTotalIncome,
          BroughtFwdLossesSetoff:   0,
          GrossTotalIncome:         grossTotalIncome,
          IncChargeTaxSplRate111A112: ltcg112ATotal,
          DeductionsUnderScheduleVIA: capped.TotalChapVIADeductions,
          TotalIncome:              totalIncome,
          IncChargeableTaxSplRates: ltcg112ATotal,
          NetAgricultureIncomeOrOtherIncomeForRate: 0,
          AggregateIncome:          totalIncome,
          LossesOfCurrentYearCarriedFwd: 0,
          DeemedIncomeUs115JC:      0,
        },

        // ── PartB_TTI ────────────────────────────────────────────────────
        PartB_TTI: {
          TaxPayDeemedTotIncUs115JC:  0,
          Surcharge:                  toInt(taxComp.Surcharge),
          HealthEduCess:              toInt(taxComp.HealthEducationCess),
          TotalTaxPayablDeemedTotInc: 0,
          ComputationOfTaxLiability: {
            TaxPayableOnTI:               toInt(taxComp.NetTaxPayable),
            Rebate87A:                    toInt(taxComp.Rebate87A),
            TaxPayableOnRebate:           toInt(taxComp.TaxAfterRebate),
            Surcharge25ofSI:              0,
            SurchargeOnAboveCrore:        toInt(taxComp.Surcharge),
            Surcharge25ofSIBeforeMarginal: 0,
            SurchargeOnAboveCroreBeforeMarginal: 0,
            TotalSurcharge:               toInt(taxComp.Surcharge),
            EducationCess:                toInt(taxComp.HealthEducationCess),
            GrossTaxLiability:            toInt(taxComp.GrossTaxLiability),
            GrossTaxPayable:              toInt(taxComp.GrossTaxLiability),
            GrossTaxPay:                  toInt(taxComp.GrossTaxLiability),
            CreditUS115JD:                0,
            TaxPayAfterCreditUs115JD:     toInt(taxComp.GrossTaxLiability),
            TaxRelief:                    0,
            NetTaxLiability:              netTaxLiability,
            IntrstPay: {
              IntrstPayUs234A: 0,
              IntrstPayUs234B: 0,
              IntrstPayUs234C: 0,
              TotalIntrstPay:  0,
            },
            AggregateTaxInterestLiability: netTaxLiability,
          },
          TaxPaid: {
            TaxesPaid: {
              AdvanceTax:        advTax,
              TDS1:              tdsSalary,
              TDS2:              tdsOther + tdsRent,
              TCS:               tcs,
              SelfAssessmentTax: satTax,
              TotalTaxesPaid:    totalTaxPaid,
            },
          },
          Refund: {
            RefundDue: refund,
            BankAccountDtls: buildBankAccountDtls((rd as any).bankAccounts?.[0], 'PriBankDetails'),
          },
          AssetOutIndiaFlag: 'N',
        },

        // ── ScheduleTDS1 (TDS on salary) ─────────────────────────────────
        ScheduleTDS1: rd.tds ? buildTDSOnSalaries(rd.tds) : { TDSonSalary: [], TotalTDSonSalaries: 0 },

        // ── ScheduleTDS2 (TDS on other income) ───────────────────────────
        ScheduleTDS2: rd.tds ? buildTDSOnOtherIncome(rd.tds) : { TDSonOthThanSal: [], TotalTDSonOthThanSals: 0 },

        // ── ScheduleTDS3 (TDS u/s 194IB rent) ───────────────────────────
        ScheduleTDS3: rd.tds ? buildTDS16C(rd.tds) : { TDS3Details: [], TotalTDS3Details: 0 },

        // ── ScheduleIT (advance tax / SAT challans) ───────────────────────
        ScheduleIT: rd.taxPayments ? buildTaxPayments(rd.taxPayments) : { TotalTaxPayments: 0 },

        // ── ScheduleTCS ───────────────────────────────────────────────────
        ScheduleTCS: rd.tds?.TCSEntries?.length
          ? {
              TCSDetails: rd.tds.TCSEntries.map((t) => ({
                TAN: t.EmployerOrDeductorDetails?.TAN ?? '',
                CollectorName: t.EmployerOrDeductorDetails?.EmployerName ?? '',
                TotalTCS: toInt(t.TCSCollected),
              })),
              TotalTCS: tcs,
            }
          : undefined,

        Verification: rd.verification ? buildVerification(rd.verification, date, undefined, 'ITR23') : undefined,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN BUILDER — ITR-4 (skeleton; adds presumptive income)
// ─────────────────────────────────────────────────────────────────────────────

function buildITR4(input: BuildITRInput): object {
  const { returnData: rd, client, sw, filingDate } = input;
  const date = filingDate ?? today();
  const ay = rd.assessmentYear ?? '2026-27';
  const cfg = getAYConfig(ay);
  const summary = computeIncomeSummary(rd);
  const capped = rd.deductions
    ? applyDeductionCaps(rd.deductions, summary.GrossTotalIncome)
    : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);
  const taxComp = computeTaxLiability(summary, rd.regime, ay);

  const ltcg112ATotal = toInt(rd.ltcg112A?.TaxableLTCG112A ?? 0);
  const grossTotInc    = toInt(summary.GrossTotalIncome);
  const grossTotIncInclLTCG = grossTotInc + ltcg112ATotal;
  const totalIncome    = Math.max(0, grossTotIncInclLTCG - capped.TotalChapVIADeductions);

  const tdsSalary  = toInt(rd.tds?.TotalTDSOnSalaries);
  const tdsOther   = toInt(rd.tds?.TotalTDSOnOtherIncome) + toInt(rd.tds?.TotalTDSOnRent);
  const tcs        = toInt(rd.tds?.TotalTCS);
  const advTax     = toInt(rd.taxPayments?.TotalAdvanceTax);
  const satTax     = toInt(rd.taxPayments?.TotalSelfAssessmentTax);
  const totalTaxPaid = tdsSalary + tdsOther + tcs + advTax + satTax;
  const netTaxLiability = toInt(taxComp.GrossTaxLiability);
  const balPayable = Math.max(0, netTaxLiability - totalTaxPaid);
  const refund     = totalTaxPaid > netTaxLiability ? totalTaxPaid - netTaxLiability : 0;

  return {
    ITR: {
      ITR4: {
        CreationInfo: {
          SWVersionNo:      sw.SWVersionNo,
          SWCreatedBy:      sw.SWCreatedBy,
          JSONCreatedBy:    sw.JSONCreatedBy,
          JSONCreationDate: date,
          IntermediaryCity: sw.IntermediaryCity,
          Digest: '-',
        },
        Form_ITR4: {
          FormName:       'ITR-4',
          Description:    'For Individuals, HUFs and Firms (other than LLP) being a resident having total income upto Rs.50 lakh and having income from business and profession which is computed under sections 44AD, 44ADA or 44AE',
          AssessmentYear: ayToYear(rd.assessmentYear),
          SchemaVer:      'Ver1.0',
          FormVer:        'Ver1.0',
        },
        PersonalInfo: {
          ...buildPersonalInfo(client, { includeStatus: detectStatusFromPAN(client.pan) }),
          ResidentialStatus: (client.residentialStatus ?? 'RES') === 'RNR' ? 'NOR' : (client.residentialStatus ?? 'RES'),
          EmployerCategory: 'SE' as const,
        },
        FilingStatus: (() => {
          const f10 = rd.presumptiveIncome?.Form10IEA;
          return {
            ReturnFileSec:               rd.filingSection,
            OptOutNewTaxRegime:          rd.regime === 'OLD' ? 'Y' : 'N',
            SeventhProvisio139:          'N',
            clauseiv7provisio139i:       'N',
            AsseseeRepFlg:               'N',
            ResidentialStatus:           (client.residentialStatus ?? 'RES') === 'RNR' ? 'NOR' : (client.residentialStatus ?? 'RES'),
            ItrFilingDueDate:            (rd.presumptiveIncome as any)?.isAuditRequired ? cfg.dueDateAudit : cfg.dueDateIndividual,
            ...(rd.regime === 'OLD' && f10?.optOut ? {
              Form10IEAFiledFlag:        'Y',
              Form10IEAAckNum:           f10.ackNo,
              Form10IEADate:             f10.dateOfFiling,
              Form10IEAEarlierAYOldRegime: 'NA',
            } : {
              Form10IEAEarlierAYOldRegime: 'NA',
            }),
          };
        })(),
        IncomeDeductions: {
          IncomeFromBusinessProf:     toInt(summary.IncomeFromBusinessProfession),
          GrossSalary:                toInt(rd.salary?.TotalGrossSalary),
          Salary:                     toInt(rd.salary?.NetSalary),
          PerquisitesValue:           0,
          ProfitsInSalary:            0,
          AllwncExemptUs10: {
            TotalAllwncExemptUs10:    toInt(rd.salary?.AllwncExtentExemptUs10),
          },
          NetSalary:                  toInt(rd.salary?.NetSalary),
          DeductionUs16:              toInt(rd.salary?.TotalDeductionUs16),
          DeductionUs16ia:            capAt(rd.salary?.DeductionUs16ia ?? 0, rd.regime === 'NEW' ? cfg.stdDeduction_new : cfg.stdDeduction_old),
          EntertainmntalwncUs16ii:    capAt(rd.salary?.EntertainmentAlw16ii ?? 0, DEDUCTION_CAPS.EntertainmentAlw16ii),
          ProfessionalTaxUs16iii:     capAt(rd.salary?.ProfessionalTaxUs16iii ?? 0, DEDUCTION_CAPS.ProfessionalTax16iii),
          IncomeFromSal:              toInt(summary.IncomeFromSalary),
          PropertyDetails:            rd.houseProperty?.Properties.map(buildPropertyDetails) ?? [],
          TotalIncomeChargeableUnHP:  toInt(summary.IncomeFromHP),
          IncomeOthSrc:               Math.max(0, toInt(summary.IncomeFromOtherSources)),
          OthersInc: rd.otherSources?.OtherSourceItems?.length
            ? { OthersIncDtlsOthSrc: rd.otherSources.OtherSourceItems.map(buildOtherSourceItem) }
            : undefined,
          DeductionUs57iia:           capAt(rd.otherSources?.DeductionUs57iia ?? 0, 25_000),
          GrossTotIncome:             grossTotInc,
          GrossTotIncomeIncLTCG112A:  grossTotIncInclLTCG,
          UsrDeductUndChapVIA:        buildUsrDeductions(rd.deductions),
          DeductUndChapVIA:           { TotalDeductUndChapVIA: capped.TotalChapVIADeductions },
          TotalIncome:                Math.min(totalIncome, 5_125_000),
        },
        TaxComputation: {
          TotalTaxPayable:     toInt(taxComp.NetTaxPayable),
          Rebate87A:           detectStatusFromPAN(client.pan) === 'I' ? toInt(taxComp.Rebate87A) : 0,
          TaxPayableOnRebate:  toInt(taxComp.TaxAfterRebate),
          EducationCess:       toInt(taxComp.HealthEducationCess),
          GrossTaxLiability:   netTaxLiability,
          NetTaxLiability:     netTaxLiability,
          IntrstPay: {
            IntrstPayUs234A:   0,
            IntrstPayUs234B:   0,
            IntrstPayUs234C:   0,
            LateFilingFee234F: 0,
          },
          TotTaxPlusIntrstPay: netTaxLiability,
        },
        TaxPaid: {
          TaxesPaid: {
            AdvanceTax:        advTax,
            TDS:               tdsSalary + tdsOther,
            TCS:               tcs,
            SelfAssessmentTax: satTax,
            TotalTaxesPaid:    totalTaxPaid,
          },
          BalTaxPayable: balPayable,
        },
        Refund: {
          RefundDue: refund,
          BankAccountDtls: buildBankAccountDtls((rd as any).bankAccounts?.[0], 'AddtnlBankDetails'),
        },
        // ── ScheduleBP — presumptive income ──────────────────────────────
        ScheduleBP: rd.presumptiveIncome ? (() => {
          const pi = rd.presumptiveIncome!;
          const biz44AD  = pi.Business44AD  ?? [];
          const prof44ADA = pi.Profession44ADA ?? [];
          const gc44AE   = pi.GoodsCarriage44AE ?? [];
          const tot44AD  = toInt(pi.TotalIncome44AD ?? biz44AD.reduce((s, b) => s + b.PresumptiveIncome, 0));
          const tot44ADA = toInt(pi.TotalIncome44ADA ?? prof44ADA.reduce((s, p) => s + p.PresumptiveIncome, 0));
          const tot44AE  = toInt(pi.TotalIncome44AE ?? gc44AE.reduce((s, g) => s + g.TaxableIncome, 0));
          return {
            NoOfBusiness44AD:  biz44AD.length,
            NoOfProf44ADA:     prof44ADA.length,
            Business44ADDtls: biz44AD.length > 0 ? {
              Business44ADDtlsEntry: biz44AD.map(b => ({
                NatureOfBusiness:    b.BusinessCode,
                TradeName:           b.NameOfBusiness,
                TurnoverCash:        toInt(b.TurnoverCash),
                TurnoverDigital:     toInt(b.TurnoverDigital),
                Turnover:            toInt(b.TurnoverCash) + toInt(b.TurnoverDigital),
                GrossReceipts:       toInt(b.GrossReceipts),
                PresumptiveIncome44AD: toInt(b.PresumptiveIncome),
                ...(b.GSTINOfBusiness ? { GSTINOfBusiness: b.GSTINOfBusiness } : {}),
              })),
            } : undefined,
            TotalIncmBusiness44AD: tot44AD,
            Prof44ADADtls: prof44ADA.length > 0 ? {
              Prof44ADADtlsEntry: prof44ADA.map(p => ({
                NatureOfProfession:  p.ProfessionCode,
                ProfessionName:      p.NameOfProfession,
                GrossReceipts:       toInt(p.GrossReceipts),
                PresumptiveIncome44ADA: toInt(p.PresumptiveIncome),
              })),
            } : undefined,
            TotalIncmProfession44ADA: tot44ADA,
            GoodsCarriage44AEDtls: gc44AE.length > 0 ? {
              GoodsCarriage44AEDtlsEntry: gc44AE.map(g => ({
                RegistrationNo:  g.RegistrationNo,
                OwnedOrHired:    g.OwnedOrHired,
                DateOfPurchase:  g.DateOfPurchase ?? '',
                TonnageCapacity: toInt(g.TonnageCapacity ?? 0),
                MonthsOwned:     toInt(g.MonthsOwned),
                TaxableIncome:   toInt(g.TaxableIncome),
              })),
            } : undefined,
            TotalIncmGoodsCarriage44AE: tot44AE,
            TotPresumptiveInc: tot44AD + tot44ADA + tot44AE,
          };
        })() : undefined,

        // ── ScheduleOS ───────────────────────────────────────────────────
        ScheduleOS: rd.otherSources
          ? {
              OtherSrcThanOwnRaceHorse: toInt(rd.otherSources.IncomeFromOtherSources),
              OthSrcItems: Array.isArray(rd.otherSources.OtherSourceItems)
                ? rd.otherSources.OtherSourceItems.map(buildOtherSourceItem)
                : [],
              DeductionUs57iia: toInt(rd.otherSources.DeductionUs57iia),
              IncomeOthSrc:     toInt(rd.otherSources.IncomeFromOtherSources),
            }
          : { OtherSrcThanOwnRaceHorse: 0, OthSrcItems: [], DeductionUs57iia: 0, IncomeOthSrc: 0 },

        // ── ScheduleVIA ──────────────────────────────────────────────────
        ScheduleVIA: rd.deductions && rd.regime === 'OLD'
          ? { UsrDeductions: buildUsrDeductions(rd.deductions) }
          : undefined,

        // ── ScheduleCGFor23 ──────────────────────────────────────────────
        ...(() => {
          const hasCG = (rd.stcg?.TotalSTCG111A || rd.stcg?.TotalSTCGOther || rd.ltcg112A?.TaxableLTCG112A);
          if (!hasCG) return {};
          const stcg = rd.stcg;
          const stcg111ATotal  = toInt(stcg?.TotalSTCG111A);
          const stcgOtherTotal = toInt(stcg?.TotalSTCGOther);
          const otherEntries   = stcg?.OtherEntries ?? [];
          const entries111A    = stcg?.Entries111A  ?? [];
          const ltcgOtherTotal = 0; // LTCG Other not yet stored in ReturnData
          const ltcg112AEnts   = rd.ltcg112A?.Entries ?? [];
          const totalCG        = stcg111ATotal + stcgOtherTotal + ltcgOtherTotal + ltcg112ATotal;
          return {
            ScheduleCGFor23: {
              ShortTermCapGainFor23: {
                EquityMFDTDtls111A: entries111A.length > 0 ? {
                  ShareUnitSaleDetails111A: entries111A.map(e => ({
                    ISIN:            e.isin ?? '',
                    ShareUnitName:   e.shareOrUnitName ?? '',
                    SaleValue:       toInt(e.salesValue),
                    CostAcquisition: toInt(e.purchaseCost),
                    Expenditure:     toInt(e.expenditure),
                    GainLoss:        toInt(e.gainLoss),
                  })),
                  TotalSaleValue:   entries111A.reduce((s, e) => s + toInt(e.salesValue), 0),
                  TotalCostOfAcq:   entries111A.reduce((s, e) => s + toInt(e.purchaseCost), 0),
                  TotalExpenditure: entries111A.reduce((s, e) => s + toInt(e.expenditure), 0),
                  TotalSTCG111A:    stcg111ATotal,
                } : undefined,
                NRITransacSec48Dtl:       { NRITransactionSec48: 0 },
                NRISecur115AD:             { NRISecuritiesIncome: 0, NRISecuritiesTax: 0 },
                SaleOnOtherAssets: {
                  SaleValue:       otherEntries.reduce((s, e) => s + toInt(e.salesValue), 0),
                  CostAcquisition: otherEntries.reduce((s, e) => s + toInt(e.purchaseCost), 0),
                  LowDeductions:   otherEntries.reduce((s, e) => s + toInt(e.expenditure), 0),
                  CapGain:         stcgOtherTotal,
                },
                TotalAmtDeemedStcg:          0,
                PassThrIncNatureSTCG:         0,
                TotalAmtNotTaxUsDTAAStcg:    0,
                TotalAmtTaxUsDTAAStcg:        0,
                TotalSTCG:                    stcg111ATotal + stcgOtherTotal,
              },
              LongTermCapGain23: {
                SaleOfEquityShareUs112A: ltcg112AEnts.length > 0 ? {
                  SaleOfEquityDtls: ltcg112AEnts.map(e => ({
                    ISIN:             e.ISIN ?? '',
                    ShareUnitName:    e.ShareOrUnitName ?? '',
                    SaleValue:        toInt(e.SalesValue),
                    PurchaseCost:     toInt(e.PurchaseCost),
                    FMVasOn31Jan2018: toInt(e.FMVasOn31Jan2018),
                    Expenditure:      toInt(e.Expenditure),
                    GainLoss:         toInt(e.GainLoss),
                  })),
                  TotalSaleValue:   ltcg112AEnts.reduce((s, e) => s + toInt(e.SalesValue), 0),
                  TotalCostOfAcq:   ltcg112AEnts.reduce((s, e) => s + toInt(e.PurchaseCost), 0),
                  TotalExpenditure: 0,
                  TotalLTCG112A:    ltcg112ATotal,
                } : undefined,
                SaleofAssetNADtls: {
                  SaleValue:       0,
                  CostAcquisition: 0,
                  LowDeductions:   0,
                  CapGain:         ltcgOtherTotal,
                },
                NRIProvisoSec48:        { NRITransactionSec48: 0 },
                NRIOnSec112and115:      { NRISecuritiesIncome: 0, NRISecuritiesTax: 0 },
                NRISaleOfEquityShareUs112A: { NRIEquityIncome: 0, NRIEquityTax: 0 },
                NRISaleofForeignAsset:  { NRIForeignAssetIncome: 0, NRIForeignAssetTax: 0 },
                TotalAmtDeemedLtcg:     0,
                PassThrIncNatureLTCG:   0,
                TotalAmtNotTaxUsDTAALtcg: 0,
                TotalAmtTaxUsDTAALtcg:  0,
                TotalLTCG:              ltcg112ATotal + ltcgOtherTotal,
              },
              SumOfCGIncm:        totalCG,
              IncmFromVDATrnsf:   0,
              TotScheduleCGFor23: totalCG,
            },
            Schedule112A: ltcg112AEnts.length > 0 ? {
              Schedule112ADtls: ltcg112AEnts.map(e => ({
                ISIN:            e.ISIN ?? '',
                ShareUnitName:   e.ShareOrUnitName ?? '',
                FMVPerShareUnit: toInt(e.FMVasOn31Jan2018),
                SaleValue:       toInt(e.SalesValue),
                PurchaseCost:    toInt(e.PurchaseCost),
                Expenditure:     toInt(e.Expenditure),
                GainLoss:        toInt(e.GainLoss),
              })),
              TotalLTCG112A: ltcg112ATotal,
            } : undefined,
          };
        })(),

        // ── ScheduleGST ──────────────────────────────────────────────────
        ScheduleGST: rd.presumptiveIncome?.ScheduleGST?.length
          ? {
              GSTNDtls: rd.presumptiveIncome.ScheduleGST.map(g => ({
                GSTINNo:             g.GSTINNo,
                GrossRcptsAsPerGST:  toInt(g.GrossRcptsAsPerGST),
                ...(g.TurnoverAsPerGST != null ? { TurnoverAsPerGST: toInt(g.TurnoverAsPerGST) } : {}),
              })),
              TotGrossRcptsAsPerGST: rd.presumptiveIncome.ScheduleGST.reduce((s, g) => s + toInt(g.GrossRcptsAsPerGST), 0),
            }
          : undefined,

        // ── ScheduleAL — Assets & Liabilities (if total income > ₹50L) ──
        ...(totalIncome > 5_000_000 && rd.presumptiveIncome?.ScheduleAL ? (() => {
          const al = rd.presumptiveIncome.ScheduleAL!;
          return {
            ScheduleAL: {
              ImmovableAssets:     toInt(al.ImmovableAssets),
              MovableAssets:       toInt(al.MovableAssets),
              CashInHand:          toInt(al.CashInHand),
              BankDeposits:        toInt(al.BankDeposits),
              SharesAndSecurities: toInt(al.SharesAndSecurities),
              InsurancePolicies:   toInt(al.InsurancePolicies),
              TotalAssets:         toInt(al.ImmovableAssets) + toInt(al.MovableAssets) + toInt(al.CashInHand) + toInt(al.BankDeposits) + toInt(al.SharesAndSecurities) + toInt(al.InsurancePolicies),
              LoansTaken:          toInt(al.LoansTaken),
              OtherLiabilities:    toInt(al.OtherLiabilities),
              TotalLiabilities:    toInt(al.LoansTaken) + toInt(al.OtherLiabilities),
            },
          };
        })() : {}),

        LTCG112A: rd.ltcg112A?.Entries.length
          ? {
              LTCG112ADtls: rd.ltcg112A.Entries.map((e) => ({
                ISIN:            e.ISIN,
                ShareUnitName:   e.ShareOrUnitName,
                FMVPerShareUnit: toInt(e.FMVasOn31Jan2018),
                SaleValue:       toInt(e.SalesValue),
                PurchaseCost:    toInt(e.PurchaseCost),
                Expenditure:     toInt(e.Expenditure),
                GainLoss:        toInt(e.GainLoss),
              })),
              TotalLTCG112A: ltcg112ATotal,
            }
          : undefined,
        // ── PartA-BS — Financial Particulars, No Account Case (E11–E25) ──
        ...(() => {
          const fp = rd.financialParticulars;
          if (!fp) return {};
          const totCapLiab = toInt(fp.E11_ProprietorFund) + toInt(fp.E12_SecuredLoans) + toInt(fp.E13_UnsecuredLoans)
            + toInt(fp.E14_Advances) + toInt(fp.E15_SundryCreditors) + toInt(fp.E16_OtherLiabilities);
          const totAssets = toInt(fp.E18_FixedAssets) + toInt(fp.E18a_Investments) + toInt(fp.E19_Inventories)
            + toInt(fp.E20_SundryDebtors) + toInt(fp.E21_BalanceWithBanks) + toInt(fp.E22_CashInHand)
            + toInt(fp.E23_LoansAndAdvances) + toInt(fp.E24_OtherAssets);
          return {
            'PartA-BS': {
              NoAccountCase: {
                ProprietorFundPartABS:  toInt(fp.E11_ProprietorFund),
                SecuredLoanPartABS:     toInt(fp.E12_SecuredLoans),
                UnsecuredLoanPartABS:   toInt(fp.E13_UnsecuredLoans),
                AdvancesPartABS:        toInt(fp.E14_Advances),
                SundryCredPartABS:      toInt(fp.E15_SundryCreditors),
                OthLiabPartABS:         toInt(fp.E16_OtherLiabilities),
                TotCapLiabPartABS:      totCapLiab,
                FixedAssetPartABS:      toInt(fp.E18_FixedAssets),
                InvstmntPartABS:        toInt(fp.E18a_Investments),
                InventoriesPartABS:     toInt(fp.E19_Inventories),
                SundryDebtorPartABS:    toInt(fp.E20_SundryDebtors),
                BalanceWithBanksPartABS: toInt(fp.E21_BalanceWithBanks),
                CashInHandPartABS:      toInt(fp.E22_CashInHand),
                LoanAdvPartABS:         toInt(fp.E23_LoansAndAdvances),
                OthAssetPartABS:        toInt(fp.E24_OtherAssets),
                TotalAssetPartABS:      totAssets,
              },
            },
          };
        })(),

        TDSonSalaries:    rd.tds ? buildTDSOnSalaries(rd.tds)     : { TDSonSalary: [], TotalTDSonSalaries: 0 },
        TDSonOthThanSals: rd.tds ? buildTDSOnOtherIncome(rd.tds)  : { TDSonOthThanSal: [], TotalTDSonOthThanSals: 0 },
        ScheduleTDS3Dtls: rd.tds ? buildTDS16C(rd.tds)            : { TDS3Details: [], TotalTDS3Details: 0 },
        ScheduleIT:       rd.taxPayments ? buildTaxPayments(rd.taxPayments) : { TotalTaxPayments: 0 },
        ScheduleTCS: rd.tds?.TCSEntries?.length
          ? {
              TCSDetails: rd.tds.TCSEntries.map((t) => ({
                TAN:          t.EmployerOrDeductorDetails?.TAN ?? '',
                CollectorName: t.EmployerOrDeductorDetails?.EmployerName ?? '',
                TotalTCS:     toInt(t.TCSCollected),
              })),
              TotalTCS: tcs,
            }
          : undefined,
        Verification: rd.verification ? buildVerification(rd.verification, date, undefined, 'ITR14') : undefined,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the complete ITR JSON object for the given return.
 * Returns a plain JS object — serialize with JSON.stringify() before writing to file.
 */
// Maps our entity type codes to schema StatusOrCompanyType + SubStatus
function itr5EntityStatus(entityType: string): { StatusOrCompanyType: string; SubStatus?: string } {
  switch (entityType) {
    case 'FIRM':  return { StatusOrCompanyType: '1',  SubStatus: '10' };
    case 'LLP':   return { StatusOrCompanyType: '1',  SubStatus: '5'  };
    case 'LA':    return { StatusOrCompanyType: '2'                   };
    case 'AOP':   return { StatusOrCompanyType: '14', SubStatus: '8'  };
    case 'BOI':   return { StatusOrCompanyType: '14', SubStatus: '8'  };
    case 'COOP':  return { StatusOrCompanyType: '14', SubStatus: '4'  };
    case 'AJP':   return { StatusOrCompanyType: '9',  SubStatus: '19' };
    case 'TRUST': return { StatusOrCompanyType: '14', SubStatus: '13' };
    default:      return { StatusOrCompanyType: '14', SubStatus: '8'  };
  }
}

function buildITR5(input: BuildITRInput): object {
  const { returnData: rd, client, sw, filingDate } = input;
  const date = filingDate ?? today();
  const gen  = (rd as any).itr5General ?? {};
  const bs   = (rd as any).itr5BalanceSheet ?? {};
  const pl   = (rd as any).itr5PL ?? {};
  const upd  = gen.isUpdatedReturn ? (gen.updated ?? {}) : null;
  const itr5AY = rd.assessmentYear ?? '2026-27';
  const itr5Cfg = getAYConfig(itr5AY);
  // For updated return, use the selected updatedAY; otherwise use the return's own AY
  const effectiveAY = upd ? (upd.updatedAY ?? itr5AY) : itr5AY;
  // Portal expects the END year of the AY (e.g. "2026" for AY 2025-26)
  const effectiveAYYear = ayToYear(effectiveAY);

  // SW90002425 is the registered SWProviderID for AY 2024-25 per CBDT reference JSON
  const itr5SwId = effectiveAY === '2025-26' ? 'SW90002526' : 'SW90002425';

  const toI = (v: unknown) => Math.round(Number(v) || 0);
  const bp5 = (rd as any).itr5BP ?? {};

  // ── Income computations ───────────────────────────────────────────────────
  const hpIncome   = toI(rd.houseProperty?.TotalIncomeFromHP);
  const osIncome   = toI(rd.otherSources?.IncomeFromOtherSources);
  const stcg111A   = toI(rd.stcg?.TotalSTCG111A);
  const stcgOther  = toI(rd.stcg?.TotalSTCGOther);
  const totalSTCG  = stcg111A + stcgOther;
  const ltcg112A   = toI(rd.ltcg112A?.TaxableLTCG112A);
  const totalLTCG  = ltcg112A;
  const totalCG    = totalSTCG + totalLTCG;

  // ITR-5 business/profession income
  // Regular books: use adjusted taxable income (net profit + additions - cross-heads - deductions)
  // No-account case: use BizNetProfit + ProfNetProfit from the no-account P&L fields
  const bpIncome = gen.maintainsRegularBooks
    ? (() => {
        const netProfit     = toI(pl.NetProfitBeforeTaxes);
        const additions     = toI(bp5.personalExpenses) + toI(bp5.inadmissibleU40aIa) + toI(bp5.inadmissibleU40A3)
                            + toI(bp5.provisionIncomeTax) + toI(bp5.salaryToPartnersExcess)
                            + toI(bp5.interestToPartnersExcess) + toI(bp5.otherAdditions);
        // When user hasn't set otherCrossHeadDeductions, auto-derive OS misc income credited to PL
        const autoOSCross   = toI(bp5.otherCrossHeadDeductions) === 0
          ? Math.max(0, osIncome - toI(bp5.interestCreditedToPL) - toI(bp5.dividendCreditedToPL) - toI(bp5.rentalIncomeCreditedToPL))
          : 0;
        const crossHeads    = toI(bp5.dividendCreditedToPL) + toI(bp5.interestCreditedToPL)
                            + toI(bp5.rentalIncomeCreditedToPL) + toI(bp5.capitalGainCreditedToPL)
                            + toI(bp5.otherCrossHeadDeductions) + autoOSCross;
        const deductions    = toI(bp5.depreciationITAct) + toI(bp5.deductionU35) + toI(bp5.deductionU10AA)
                            + toI(bp5.deductionU80IC) + toI(bp5.otherBPDeductions);
        const fromOtherHeads = toI(bp5.amtFromOtherHeadsToBP);
        return netProfit + additions + fromOtherHeads - crossHeads - deductions;
      })()
    : toI(pl.N65id) + toI(pl.N65iid);

  // Income taxed at special rates is excluded from normal slab computation
  const specialRateIncome = stcg111A + ltcg112A;
  const normalIncome      = Math.max(0, bpIncome + Math.max(0, hpIncome) + stcgOther + Math.max(0, osIncome));
  const grossTotalIncome  = normalIncome + specialRateIncome;

  // Section 167B: determine tax rate regime
  // MMR applies when: (a) shares indeterminate OR (b) shares determinable but any member > basic exemption
  const usesMMR = !gen.sharesDeterminable || gen.anyMemberExceedsExemption;

  // Tax on normal income
  function slabTaxOldRegime(inc: number): number {
    if (inc <= 250000)   return 0;
    if (inc <= 500000)   return Math.round((inc - 250000) * 0.05);
    if (inc <= 1000000)  return 12500 + Math.round((inc - 500000) * 0.20);
    return 112500 + Math.round((inc - 1000000) * 0.30);
  }
  const taxOnNormal    = usesMMR ? Math.round(normalIncome * 0.30) : slabTaxOldRegime(normalIncome);
  const taxOnSTCG111A  = Math.round(stcg111A * itr5Cfg.stcg111ARate);
  const taxOnLTCG112A  = Math.round(Math.max(0, ltcg112A - itr5Cfg.ltcg112AExempt) * itr5Cfg.ltcg112ARate);
  const taxPayableOnTI = taxOnNormal + taxOnSTCG111A + taxOnLTCG112A;

  // Surcharge on normal income + special rate income
  // Rates: 10% (>50L), 15% (>1Cr), 25% (>2Cr), 37% (>5Cr) — but 15% cap on STCG/LTCG surcharge
  // When MMR applies (trust/AOP taxed at maximum marginal rate), surcharge is always 37%
  // regardless of the entity's actual income (MMR = highest individual rate incl. highest surcharge)
  function getSurchargeRate(inc: number): number {
    if (inc <= 5000000)   return 0;
    if (inc <= 10000000)  return 0.10;
    if (inc <= 20000000)  return 0.15;
    if (inc <= 50000000)  return 0.25;
    return 0.37;
  }
  // Surcharge on CG is capped at 15%
  // MMR surcharge under s.164: highest individual surcharge regardless of entity's income.
  // Old regime = 37% (income > 5Cr individual), New regime = 25% (Budget 2023 reduction).
  const mmrSurRate       = rd.regime === 'NEW' ? 0.25 : 0.37;
  const cgSurchargeRate  = usesMMR ? 0.15 : Math.min(getSurchargeRate(grossTotalIncome), 0.15);
  const normalSurRate    = usesMMR ? mmrSurRate : getSurchargeRate(grossTotalIncome);
  const surchargeOnNormal = Math.round(taxOnNormal * normalSurRate);
  const surchargeOnCG    = Math.round((taxOnSTCG111A + taxOnLTCG112A) * cgSurchargeRate);
  const surcharge        = surchargeOnNormal + surchargeOnCG;

  // Health & Education Cess: 4% on (tax + surcharge)
  const cess         = Math.round((taxPayableOnTI + surcharge) * 0.04);
  const regularTaxLiab = taxPayableOnTI + surcharge + cess;

  // AMT u/s 115JC — applies when AMT > regular tax (18.5% of adjusted total income)
  // Adjusted total income = gross total income (conservative; no add-backs without user input)
  const amtOnTI      = Math.round(grossTotalIncome * 0.185);
  const amtSurcharge = Math.round(amtOnTI * normalSurRate);
  const amtCess      = Math.round((amtOnTI + amtSurcharge) * 0.04);
  const amtLiability = amtOnTI + amtSurcharge + amtCess;
  const amtApplies   = grossTotalIncome > 0 && amtLiability > regularTaxLiab;
  const grossTaxLiab = amtApplies ? amtLiability : regularTaxLiab;
  // For 139(8A): portal checks DeemedTotIncSec115JC == ScheduleAMT Sl.3 (= LatestTotInc = 0)
  const deemedIncome115JC  = upd ? 0 : (amtApplies ? grossTotalIncome : 0);
  const taxDeemed115JC     = amtApplies ? amtOnTI : 0;

  // Interest u/s 234A/234B/234C/234F — use manual override if provided, else auto-compute
  const manualInt234A = toI(gen.interest234A);
  const manualInt234B = toI(gen.interest234B);
  const manualInt234C = toI(gen.interest234C);
  const manualInt234F = toI(gen.interest234F);

  // Auto-compute 234B, 234A, 234F when not manually overridden
  // For 139(8A), due date is based on the AY being updated, not the current return AY
  const effectiveCfg = upd ? getAYConfig(upd.updatedAY ?? itr5AY) : itr5Cfg;
  const dueDate = gen.isAuditRequired ? effectiveCfg.dueDateAudit : effectiveCfg.dueDateIndividual;
  const { int234A: auto234A, int234B: auto234B, int234F: auto234F } = (() => {
    const filingStr = date;
    const isLate = filingStr > dueDate;
    const fee234F = isLate ? (grossTotalIncome > 500_000 ? 5_000 : 1_000) : 0;
    const assessedTax = Math.max(0, grossTaxLiab - (toI(rd.tds?.TotalTDSOnOtherIncome) + toI(rd.tds?.TotalTCS)));
    const advTaxHere = toI(rd.taxPayments?.TotalAdvanceTax);
    const advShortfall = Math.max(0, assessedTax - advTaxHere);
    const ayYear = parseInt(effectiveAY.split('-')[0] ?? '2025');
    const apr1OfAY = `${ayYear}-04-01`;
    const countM = (from: string, to: string) => {
      if (to <= from) return 0;
      const d1 = new Date(from), d2 = new Date(to);
      const m = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
      return d2.getDate() > d1.getDate() ? m + 1 : Math.max(m, 1);
    };
    // 234B only applies when net tax liability ≥ ₹10,000 (s.208)
    const int234B = grossTaxLiab >= 10_000 && advShortfall > assessedTax * 0.10
      ? Math.ceil(advShortfall * 0.01 * countM(apr1OfAY, filingStr)) : 0;
    let int234A = 0;
    if (isLate) {
      const base = Math.max(0, grossTaxLiab - (toI(rd.tds?.TotalTDSOnOtherIncome) + toI(rd.tds?.TotalTCS)) - advTaxHere);
      if (base > 0) {
        const afterDue = new Date(dueDate);
        afterDue.setDate(afterDue.getDate() + 1);
        int234A = Math.ceil(base * 0.01 * countM(afterDue.toISOString().slice(0, 10), filingStr));
      }
    }
    return { int234A, int234B, int234F: fee234F };
  })();

  const int234A = manualInt234A || auto234A;
  const int234B = manualInt234B || auto234B;
  const int234C = manualInt234C;
  const int234F = manualInt234F || auto234F;
  const totalInterest = int234A + int234B + int234C + int234F;

  // Taxes paid
  const advTax   = toI(rd.taxPayments?.TotalAdvanceTax);
  const tdsOther = toI(rd.tds?.TotalTDSOnOtherIncome);
  const tcs      = toI(rd.tds?.TotalTCS);
  const satTax   = toI(rd.taxPayments?.TotalSelfAssessmentTax);
  const totalTaxPaid = advTax + tdsOther + tcs + satTax;
  // Section 288B: tax payable / refund rounded to nearest Rs 10
  const r10 = (n: number) => Math.round(n / 10) * 10;
  const netTaxLiab   = r10(Math.max(0, grossTaxLiab + totalInterest - totalTaxPaid));
  const refund       = r10(Math.max(0, totalTaxPaid - grossTaxLiab - totalInterest));

  // 139(8A) PartB-ATI: aggregate liability = balance payable (after TDS + interest)
  // netTaxLiab already = grossTaxLiab + totalInterest - totalTaxPaid
  const balPayableForATI = netTaxLiab;
  let atiAddtnlTax = 0;
  let atiNetPayable = 0;
  let atiTaxDue = 0;
  let taxUS140BPaid = 0;
  if (upd) {
    const updAY = upd.updatedAY ?? itr5AY;
    const endYear = parseInt(updAY.split('-')[1] ?? '25') + 2000;
    const p1End = new Date(endYear + 1, 2, 31);
    const p2End = new Date(endYear + 2, 2, 31);
    const p3End = new Date(endYear + 3, 2, 31);
    const p4End = new Date(endYear + 4, 2, 31);
    const now = new Date(date);
    const atiRate = now <= p1End ? 0.25 : now <= p2End ? 0.50 : now <= p3End ? 0.60 : now <= p4End ? 0.70 : 0;
    const aggrLiability = balPayableForATI; // simple case: no prior return credits
    // Additional tax: standard round (not r10) — matches CBDT utility behaviour
    // NetPayable = BalTaxPayable + AddtnlIncTax (also not r10'd)
    atiAddtnlTax = atiRate > 0 ? Math.round(Math.max(0, aggrLiability - int234F) * atiRate) : 0;
    atiNetPayable = aggrLiability + atiAddtnlTax;
    taxUS140BPaid = (upd.taxUS140BPayments ?? []).reduce((s: number, p: any) => s + toI(p.amount), 0);
    atiTaxDue = r10(Math.max(0, atiNetPayable - taxUS140BPaid));
  }

  // Bank for refund — pulled from returnData bankAccounts
  const primaryBank = (rd as any).bankAccounts?.[0];

  // Chapter VI-A deductions
  const cappedVIA = rd.deductions
    ? applyDeductionCaps(rd.deductions, grossTotalIncome)
    : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);
  const viaDeductions = cappedVIA.TotalChapVIADeductions;
  // Section 288A: total income rounded to nearest Rs 10
  const totalIncome   = r10(Math.max(0, grossTotalIncome - viaDeductions));

  // CYLA helpers per income head (fields differ based on which losses can set off against which heads)
  const cylaHP  = (n: number) => ({
    IncCYLA: { IncOfCurYrUnderThatHead: n, BusLossSetoff: 0, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: n },
  });
  const cylaBP  = (n: number) => ({
    IncCYLA: { IncOfCurYrUnderThatHead: n, HPlossCurYrSetoff: 0, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: n },
  });
  const cylaInc = (n: number) => ({
    IncCYLA: { IncOfCurYrUnderThatHead: n, HPlossCurYrSetoff: 0, BusLossSetoff: 0, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: n },
  });
  const cylaOS  = (n: number) => ({
    IncCYLA: { IncOfCurYrUnderThatHead: n, HPlossCurYrSetoff: 0, BusLossSetoff: 0, IncOfCurYrAfterSetOff: n },
  });
  const bflaRow = (n: number) => ({
    IncBFLA: { IncOfCurYrUndHeadFromCYLA: n, BFlossPrevYrUndSameHeadSetoff: 0, BFUnabsorbedDeprSetoff: 0, BFAllUs35Cl4Setoff: 0, IncOfCurYrAfterSetOffBFLosses: n },
  });
  const bflaRowOS = (n: number) => ({
    IncBFLA: { IncOfCurYrUndHeadFromCYLA: n, BFUnabsorbedDeprSetoff: 0, BFAllUs35Cl4Setoff: 0, IncOfCurYrAfterSetOffBFLosses: n },
  });

  // ── Balance Sheet totals ──────────────────────────────────────────────────
  const totResrNSurp      = toI(bs.ReservesRevaluation) + toI(bs.ReservesCapital) + toI(bs.ReservesStatutory) + toI(bs.ReservesOther) + toI(bs.ReservesPLCredit);
  const totPartnerFund    = toI(bs.PartnersCapital) + totResrNSurp;
  const totSecuredRupee   = toI(bs.SecuredLoansFromBanks) + toI(bs.SecuredLoansFromOthers);
  const totSecrLoan       = toI(bs.SecuredFCYLoans) + totSecuredRupee;
  const totUnsecuredRupee = toI(bs.UnsecuredLoansFromBanks) + toI(bs.UnsecuredLoansFrom40A2b) + toI(bs.UnsecuredLoansFromOthers);
  const totUnSecrLoan     = toI(bs.UnsecuredFCYLoans) + totUnsecuredRupee;
  const totLoanFund       = totSecrLoan + totUnSecrLoan;
  const totalAdvances     = toI(bs.AdvancesFrom40A2b) + toI(bs.AdvancesFromOthers);
  const totFundSrc        = totPartnerFund + totLoanFund + toI(bs.DeferredTaxLiability) + totalAdvances;

  const netBlock          = toI(bs.GrossBlock) - toI(bs.Depreciation);
  const totFixedAsset     = netBlock + toI(bs.CapitalWIP);
  const totLTInv          = toI(bs.LTInvProperty) + (toI(bs.LTInvListedEquity) + toI(bs.LTInvUnlistedEquity)) + toI(bs.LTInvPrefShares) + toI(bs.LTInvGovtTrust) + toI(bs.LTInvDebentures) + toI(bs.LTInvMF) + toI(bs.LTInvOthers);
  const totSTInv          = (toI(bs.STInvListedEquity) + toI(bs.STInvUnlistedEquity)) + toI(bs.STInvPrefShares) + toI(bs.STInvGovtTrust) + toI(bs.STInvDebentures) + toI(bs.STInvMF) + toI(bs.STInvOthers);
  const totInvestments    = totLTInv + totSTInv;
  const totInventories    = toI(bs.InventoriesRawMaterial) + toI(bs.InventoriesWIP) + toI(bs.InventoriesFinishedGoods) + toI(bs.InventoriesStockInTrade) + toI(bs.InventoriesOthers);
  const totDebtors        = toI(bs.SundryDebtorsMoreThan1Yr) + toI(bs.SundryDebtorsOthers);
  const totCashBank       = toI(bs.BalanceWithBanks) + toI(bs.CashInHand) + toI(bs.OtherCashBankBalances);
  const totCurrAsset      = totInventories + totDebtors + totCashBank + toI(bs.OtherCurrentAssets);
  const totLoanAdv        = toI(bs.LoansRecoverable) + toI(bs.LoansDepositsToOthers) + toI(bs.LoansRevenueAuthorities);
  const totCurrAssetLoanAdv = totCurrAsset + totLoanAdv;
  const totSundryCreditors  = toI(bs.CLSundryCreditors1Yr) + toI(bs.CLSundryCreditsOthers);
  // AY 25-26 has granular CL fields; AY 24-25 used CLOther as a catch-all
  const clLeasedAssets      = toI(bs.CLLeasedAssets);
  const clIntOnLeased       = toI(bs.CLInterestOnLeasedAsset);
  const clIntNotDue         = toI(bs.CLInterestAccruedNotDue);
  const clIncomeInAdv       = toI(bs.CLIncomeReceivedInAdvance);
  const clOtherPayables     = toI(bs.CLOtherPayables) + toI(bs.CLOther);
  const totCurrLiabilities  = totSundryCreditors + clLeasedAssets + clIntOnLeased + clIntNotDue + clIncomeInAdv + clOtherPayables;
  const totProvisions       = toI(bs.ProvisionsIncomeTax) + toI(bs.ProvisionsLeaveGratuity) + toI(bs.ProvisionsOther);

  const noAccountCase = !gen.maintainsRegularBooks;
  const entityStatusBase = itr5EntityStatus(gen.entityType ?? 'AOP');
  const entityStatus = {
    ...entityStatusBase,
    ...(gen.subStatus ? { SubStatus: gen.subStatus } : {}),
  };
  const incomeTaxSec  = upd ? 21 : Number(rd.filingSection ?? 11);

  // ── Full P&L income/debit totals (using new PLState field names) ─────────
  const totOthIncome = toI(pl.PL14i) + toI(pl.PL14ii) + toI(pl.PL14iii) + toI(pl.PL14iv)
    + toI(pl.PL14v) + toI(pl.PL14vi) + toI(pl.PL14vii) + toI(pl.PL14viii)
    + toI(pl.PL14ix) + toI(pl.PL14x) + toI(pl.PL14xia) + toI(pl.PL14xi);
  const grossProfitFromTrading = toI(pl.T12) || toI(pl.PL13);
  const totCreditsToPL = grossProfitFromTrading + totOthIncome;

  // Debit/expense side of P&L (regular books)
  const totDebitsExpenses = toI(pl.PL16) + toI(pl.PL17) + toI(pl.PL18) + toI(pl.PL19)
    + toI(pl.PL20) + toI(pl.PL21) + toI(pl.PL22xi)
    + (toI(pl.PL23i) + toI(pl.PL23ii) + toI(pl.PL23iii) + toI(pl.PL23iv))
    + toI(pl.PL24) + toI(pl.PL25) + toI(pl.PL26) + toI(pl.PL27) + toI(pl.PL28) + toI(pl.PL29)
    + (toI(pl.PL30i) + toI(pl.PL30ii)) + (toI(pl.PL31i) + toI(pl.PL31ii))
    + (toI(pl.PL32i) + toI(pl.PL32ii))
    + toI(pl.PL33) + toI(pl.PL34) + toI(pl.PL35) + toI(pl.PL36) + toI(pl.PL37)
    + toI(pl.PL38) + toI(pl.PL39) + toI(pl.PL40) + toI(pl.PL41) + toI(pl.PL42) + toI(pl.PL43)
    + toI(pl.PL44x) + toI(pl.PL45) + toI(pl.PL46) + toI(pl.PL47) + toI(pl.PL48iv)
    + toI(pl.PL49) + toI(pl.PL50)
    + (toI(pl.PL52ia) + toI(pl.PL52ib) + toI(pl.PL52iia) + toI(pl.PL52iib))
    + toI(pl.PL53);
  // TotDebitsToPL = all expenses + net profit (balancing figure) = TotCreditsToPL
  const totDebitsToPL = totCreditsToPL;

  return {
    ITR: {
      ITR5: {
        CreationInfo: {
          SWVersionNo:      effectiveAY === '2025-26' ? 'R10' : 'R13',
          SWCreatedBy:      itr5SwId,
          JSONCreatedBy:    itr5SwId,
          JSONCreationDate: date,
          IntermediaryCity: sw.IntermediaryCity ?? 'Delhi',
          Digest:           '-',
        },
        Form_ITR5: {
          FormName:       'ITR-5',
          Description:    'For firms, AOPs and BOIs',
          AssessmentYear: effectiveAYYear,
          SchemaVer:      'Ver1.0',
          FormVer:        'Ver1.0',
        },
        PartA_GEN1: {
          OrgFirmInfo: {
            AssesseeName: { SurNameOrOrgName: (client.fullName ?? '').toUpperCase() },
            PAN: client.pan ?? '',
            Address: {
              ResidenceNo:          client.address?.split(',')[0]?.trim() ?? '',
              LocalityOrArea:       (client.city ?? '').toUpperCase(),
              CityOrTownOrDistrict: (client.city ?? '').toUpperCase(),
              StateCode:            client.state ?? '07',
              CountryCode:          '91',
              CountryCodeMobile:    91,
              MobileNo:             Number((client.mobileNumber ?? '9999999999').replace(/\D/g, '')) || 9999999999,
              EmailAddress:         (client.email || 'noreply@taxflowpro.in').toUpperCase(),
              PinCode:              client.pinCode ?? 110001,
              Phone:                { STDcode: 0, PhoneNo: 0 },
            },
            DateOFFormOrIncorp:   gen.dateOfFormation || '2000-01-01',
            StatusOrCompanyType:  entityStatus.StatusOrCompanyType,
            ...(entityStatus.SubStatus ? { SubStatus: entityStatus.SubStatus } : {}),
          },
          FilingStatus: {
            ReturnFileSec: {
              IncomeTaxSec: incomeTaxSec,
            },
            BusinessTrustFlag:         'N',
            InvstmntFundRefrdSec115UB: 'N',
            ResidentialStatus:         (client.residentialStatus ?? 'RES') === 'RNR' ? 'NOR' : (client.residentialStatus ?? 'RES'),
            ForeignExchangeFlag:       'N',
            StartUpDPIITFlag:          'N',
            InterMinisterialCertFlag:  'N',
            FiiFpiFlag:                gen.isFIIFPI ? 'Y' : 'N',
            AsseseeRepFlg:             gen.isRepresentativeAssessee ? 'Y' : 'N',
            PartnerInFirmFlg:          gen.isPartnerInFirm ? 'Y' : 'N',
            HeldUnlistedEqShrPrYrFlg:  gen.hasUnlistedEquityShares ? 'Y' : 'N',
            ifMSME:                    gen.isMSME ? 'Y' : 'N',
            RegNumMSMEDAct2006:        gen.msmeRegNo ?? '',
            NriSEPinIndia:             'NA',
            ItrFilingDueDate:          effectiveCfg.dueDateAudit,
          },
        },
        // ── 139(8A) Updated Return ─────────────────────────────────────────────
        ...(upd ? {
          PartA_139_8A: {
            Name:                        (client.fullName ?? '').toUpperCase(),
            PAN:                         client.pan ?? '',
            AssessmentYear:              effectiveAYYear,
            PreviouslyFiledForThisAY:    upd.previouslyFiled ? 'Y' : 'N',
            ...(upd.previouslyFiled && upd.previousFilingType ? {
              PreviouslyFiledForThisAY_139_8A: upd.previousFilingType,
            } : {}),
            ...(upd.origAckNo && upd.origFilingDate ? {
              Applicable_139_8A: {
                ITRForm:          'ITR5',
                AcknowledgementNo: upd.origAckNo,
                OrigRetFiledDate:  upd.origFilingDate,
              },
            } : {}),
            LaidOutIn_139_8A:    'Y',
            ITRFormUpdatingInc:  'ITR5',
            UpdatingInc: {
              ReasonsForUpdatingIncDtls: (Array.isArray(upd.reasons) && upd.reasons.length > 0
                ? upd.reasons : ['1']).map((r: string) => ({
                  ReasonsForUpdatingIncome: r,
                })),
            },
            UpdatedReturnDuringPeriod: upd.periodCode ?? '1',
          },
          'PartB-ATI': {
            HeadOfInc: {
              IncomeFromHP:   Math.max(0, hpIncome),
              IncomeFromBP:   Math.max(0, bpIncome),
              IncomeFromCG:   totalCG,
              IncomeFromOS:   Math.max(0, osIncome),
              Total:          grossTotalIncome,
            },
            LatestTotInc:           toI(upd.priorTotalIncome),
            UpdatedTotInc:          totalIncome,
            AmtPayable:             balPayableForATI,
            AmtRefundable:          refund,
            LastAmtPayable:         toI(upd.priorNetPayable),
            Refund:                 0,
            TotRefund:              0,
            FeeIncUS234F:           int234F,
            RegAssessementTAX:      0,
            AggrLiabilityRefund:    0,
            AggrLiabilityNoRefund:  balPayableForATI,
            AddtnlIncTax:           atiAddtnlTax,
            NetPayable:             atiNetPayable,
            TaxUS140B:              atiNetPayable,
            TaxDue10_11:            atiTaxDue,
            ...(upd.taxUS140BPayments?.length ? {
              ScheduleIT1: {
                TaxPayment1: {
                  TaxPayments: upd.taxUS140BPayments!.map((p: { bsrCode: string; challanDate: string; challanSerial: number; amount: number }, i: number) => ({
                    slno:          i + 1,
                    BSRCode:       p.bsrCode,
                    DateDep:       p.challanDate,
                    SrlNoOfChaln:  p.challanSerial,
                    Amt:           toI(p.amount),
                  })),
                },
                Total: taxUS140BPaid,
              },
            } : {}),
          },
        } : {}),
        PartA_GEN2: {
          LiableSec44AAflg:    gen.maintainsRegularBooks ? 'Y' : 'N',
          IncDclrdUs:          'N',
          LiableSec44ABflg:    gen.isAuditRequired ? 'Y' : 'N',
          LiableSec92Eflg:     'N',
          TotalSalesExcOneCr:  'N',
          PrevYrMemPartChange: 'N',
          ...(gen.isAuditRequired && gen.auditorName ? {
            AuditInfo: {
              AuditReportFurnishDate: gen.auditReportDate ?? date,
              AuditDate:              gen.auditReportDate ?? date,
              AuditorName:            gen.auditorName ?? '',
              AuditorMemNo:           (gen.auditorMembership ?? '').replace(/\D/g, '').padStart(6, '0').slice(0, 6),
              AudFrmName:             gen.auditFirmName ?? '',
              AudFrmRegNo:            gen.auditFirmRegNo ?? '',
              ...(gen.auditFirmPAN ? { AudFrmPAN: gen.auditFirmPAN } : {}),
              ...(gen.auditAckNo ? { AckNum44AB: parseInt(gen.auditAckNo) || 0 } : {}),
              ...(gen.udin ? { UDIN: gen.udin } : {}),
            },
          } : {}),
          ...(Array.isArray(gen.members) && gen.members.length > 0 ? {
            PartnerOrMemberInfo: gen.members.map((m: any) => ({
              PartnerForeignCompFlg:          'NO',
              PercentageOfShareForeignComp:   0,
              TotIncFrmMemberOfAop:           'Y',
              PartnerOrMemberName:            (m.name ?? '').toUpperCase(),
              AddressDetailWithZipCode: {
                AddrDetail:            ([m.flatNo, m.buildingName, m.streetName, m.localityOrArea].filter(Boolean).join(', ') || m.address || '').toUpperCase() || undefined,
                CityOrTownOrDistrict:  (m.cityOrTownOrDistrict || m.city || 'Delhi').toUpperCase(),
                StateCode:             m.stateCode ?? '09',
                CountryCode:           m.countryCode ?? '91',
                PinCode:               Number(m.pinCode) || 110001,
              },
              SharePercentage:  Number(m.sharePercentage) || 0,
              PAN:              m.pan ?? '',
              Status:           m.status ?? 'TRUSTEE',
              RateOfInterest:   Number(m.rateOfInterest) || 0,
              RemunerationPaid: Math.round(Number(m.remunerationPaid) || 0),
              ...(m.aadhaar ? { AadhaarCardNo: m.aadhaar } : {}),
            })),
          } : {}),
          PvtDiscretioneryTrust: {
            PvtDiscTrustShareFlg: 'N',
            PvtDiscTrustBusIncFlg: 'Y',
            PvtDiscTrustWillFlg: 'N',
          },
          NatOfBus: {
            NatureOfBusiness: [{ Code: gen.businessCode || '19009', TradeName1: (client.fullName ?? '').toUpperCase() }],
          },
        },
        // ── Balance Sheet ───────────────────────────────────────────────────
        PARTA_BS: {
          FundSrc: {
            PartnerOrMemberFund: {
              PartnerOrMemberCap: toI(bs.PartnersCapital),
              ResrNSurp: {
                RevResr:              toI(bs.ReservesRevaluation),
                CapResr:              toI(bs.ReservesCapital),
                StatResr:             toI(bs.ReservesStatutory),
                OthResr:              toI(bs.ReservesOther),
                CreditBalOfPLAccount: toI(bs.ReservesPLCredit),
                TotResrNSurp:         totResrNSurp,
              },
              TotPartnerOrMemberFund: totPartnerFund,
            },
            LoanFunds: {
              SecrLoan: {
                ForeignCurrLoan: toI(bs.SecuredFCYLoans),
                RupeeLoan: {
                  FrmBank:      toI(bs.SecuredLoansFromBanks),
                  FrmOthrs:     toI(bs.SecuredLoansFromOthers),
                  TotRupeeLoan: totSecuredRupee,
                },
                TotSecrLoan: totSecrLoan,
              },
              UnsecrLoan: {
                ForeignCurrencyLoans: toI(bs.UnsecuredFCYLoans),
                RupeeLoan: {
                  FrmBank:              toI(bs.UnsecuredLoansFromBanks),
                  FrmPersonSpcfdUs40A2b: toI(bs.UnsecuredLoansFrom40A2b),
                  FrmOthrs:             toI(bs.UnsecuredLoansFromOthers),
                  TotRupeeLoan:         totUnsecuredRupee,
                },
                TotUnSecrLoan: totUnSecrLoan,
              },
              TotLoanFund: totLoanFund,
            },
            DeferredTax: toI(bs.DeferredTaxLiability),
            Advances: {
              FrmPersonSpcfdUs40A2b: toI(bs.AdvancesFrom40A2b),
              FrmOthers:             toI(bs.AdvancesFromOthers),
              TotalAdvances:         totalAdvances,
            },
            TotFundSrc: totFundSrc,
          },
          FundApply: {
            FixedAsset: {
              GrossBlock:    toI(bs.GrossBlock),
              Depreciation:  toI(bs.Depreciation),
              NetBlock:      netBlock,
              CapWrkProg:    toI(bs.CapitalWIP),
              TotFixedAsset: totFixedAsset,
            },
            Investments: {
              LongTermInv: {
                InvInProperty:     toI(bs.LTInvProperty),
                EquityInstruments: {
                  ListedEquities:   toI(bs.LTInvListedEquity),
                  UnListedEquities: toI(bs.LTInvUnlistedEquity),
                  Total:            toI(bs.LTInvListedEquity) + toI(bs.LTInvUnlistedEquity),
                },
                PreferenceShares:    toI(bs.LTInvPrefShares),
                GovtOrTrustSecurities: toI(bs.LTInvGovtTrust),
                DebenturesOrBonds:   toI(bs.LTInvDebentures),
                MutualFunds:         toI(bs.LTInvMF),
                Others:              toI(bs.LTInvOthers),
                TotLongTermInv:      totLTInv,
              },
              ShortTermInv: {
                EquityInstruments: {
                  ListedEquities:   toI(bs.STInvListedEquity),
                  UnListedEquities: toI(bs.STInvUnlistedEquity),
                  Total:            toI(bs.STInvListedEquity) + toI(bs.STInvUnlistedEquity),
                },
                PreferenceShares:    toI(bs.STInvPrefShares),
                GovtOrTrustSecurities: toI(bs.STInvGovtTrust),
                DebenturesOrBonds:   toI(bs.STInvDebentures),
                MutualFunds:         toI(bs.STInvMF),
                Others:              toI(bs.STInvOthers),
                TotShortTermInv:     totSTInv,
              },
              TotInvestments: totInvestments,
            },
            CurrAssetLoanAdv: {
              CurrAsset: {
                Inventories: {
                  RawMatl:          toI(bs.InventoriesRawMaterial),
                  WorkInProgress:   toI(bs.InventoriesWIP),
                  FinOrTradGood:    toI(bs.InventoriesFinishedGoods),
                  StkInTrade:       toI(bs.InventoriesStockInTrade),
                  StoresConsumables: 0,
                  LooseTools:       0,
                  Others:           toI(bs.InventoriesOthers),
                  TotInventries:    totInventories,
                },
                SundryDebtorDtls: {
                  OutstandindMorethanOneYr: toI(bs.SundryDebtorsMoreThan1Yr),
                  Others:                  toI(bs.SundryDebtorsOthers),
                  TotalSundryDebtors:      totDebtors,
                },
                CashOrBankBal: {
                  BankBal:         toI(bs.BalanceWithBanks),
                  CashinHand:      toI(bs.CashInHand),
                  Others:          toI(bs.OtherCashBankBalances),
                  TotCashOrBankBal: totCashBank,
                },
                OthCurrAsset: toI(bs.OtherCurrentAssets),
                TotCurrAsset: totCurrAsset,
              },
              LoanAdv: {
                AdvRecoverable: toI(bs.LoansRecoverable),
                Deposits:       toI(bs.LoansDepositsToOthers),
                BalWithRevAuth: toI(bs.LoansRevenueAuthorities),
                TotLoanAdv:     totLoanAdv,
                LoanAdvIncluded: {
                  PurposeOFBusOrProf:    totLoanAdv,
                  NotForPurposeOFBusOrProf: 0,
                },
              },
              TotCurrAssetLoanAdv: totCurrAssetLoanAdv,
              NetCurrAsset: totCurrAssetLoanAdv - (totCurrLiabilities + totProvisions),
              CurrLiabilitiesProv: {
                CurrLiabilities: {
                  SundryCreditorDtls: {
                    OutstandindMorethanOneYr: toI(bs.CLSundryCreditors1Yr),
                    Others:                  toI(bs.CLSundryCreditsOthers),
                    TotalSundryCreditors:    totSundryCreditors,
                  },
                  LiabForLeasedAsset:   clLeasedAssets,
                  AccrIntonLeasedAsset: clIntOnLeased,
                  AccrIntNotDue:        clIntNotDue,
                  IncRecvdInAdv:        clIncomeInAdv,
                  OtherPayables:        clOtherPayables,
                  TotCurrLiabilities:   totCurrLiabilities,
                },
                Provisions: {
                  ITProvision:             toI(bs.ProvisionsIncomeTax),
                  ELSuperAnnGratProvision: toI(bs.ProvisionsLeaveGratuity),
                  OthProvision:            toI(bs.ProvisionsOther),
                  TotProvisions:           totProvisions,
                },
                TotCurrLiabilitiesProvision: totCurrLiabilities + totProvisions,
              },
            },
            MiscAdjust: {
              MiscExpndr:        toI(bs.MiscExpenditure),
              DefTaxAsset:       toI(bs.DeferredTaxAsset),
              AccumultedLosses:  toI(bs.DebitPLBalance),
              TotMiscAdjust:     toI(bs.MiscExpenditure) + toI(bs.DeferredTaxAsset) + toI(bs.DebitPLBalance),
            },
            TotFundApply: totFixedAsset + totInvestments
              + totCurrAssetLoanAdv - (totCurrLiabilities + totProvisions)
              + toI(bs.MiscExpenditure) + toI(bs.DeferredTaxAsset) + toI(bs.DebitPLBalance),
          },
          NoBooksOfAccBS: {
            TotSundryDbtAmt: 0,
            TotSundryCrdAmt: 0,
            TotStkInTradAmt: 0,
            CashBalAmt:      0,
          },
        },
        // ── P&L ────────────────────────────────────────────────────────────
        PARTA_PL: noAccountCase ? {
          // No-account case: NatOfBus44AD array in PARTA_PL carries gross receipts/profit
          NatOfBus44AD: [
            {
              NameOfBusiness: 'Business/Activity',
              CodeAD: gen.businessCode ?? '19009',
              GrossReceiptsElecMode:  toI(pl.BizGrossReceiptsElectronic),
              GrossReceiptsOtherMode: toI(pl.BizGrossReceiptsOther),
              TotGrossReceipts:       toI(pl.BizGrossReceiptsElectronic) + toI(pl.BizGrossReceiptsOther),
              GrossProfit:            toI(pl.BizGrossProfit),
              Expenditure:            toI(pl.BizExpenses),
              NetProfit:              toI(pl.BizNetProfit),
            },
          ],
          CreditsToPL: {
            OthIncome: {
              RentInc:                    0,
              Comissions:                 0,
              Dividends:                  0,
              InterestInc:                0,
              ProfitOnSaleFixedAsset:     0,
              ProfitOnInvChrSTT:          0,
              ProfitOnOthInv:             0,
              ProfitOnCurrFluct:          0,
              ProfitOnCnvInvntryToCapAsst: 0,
              ProfitOnAgriIncome:         0,
              MiscOthIncome:              0,
              TotOthIncome:               0,
            },
            TotCreditsToPL: toI(pl.N65id) + toI(pl.N65iid),
          },
          DebitsToPL: {
            DebitPlAcnt: {
              Freight: 0, ConsumptionOfStores: 0, PowerFuel: 0, RentExpdr: 0, RepairsBldg: 0, RepairMach: 0,
              EmployeeComp: { SalsWages: 0, Bonus: 0, MedExpReimb: 0, LeaveEncash: 0, LeaveTravelBenft: 0, ContToSuperAnnFund: 0, ContToPF: 0, ContToGratFund: 0, ContToOthFund: 0, OthEmpBenftExpdr: 0, TotEmployeeComp: 0 },
              Insurances: { MedInsur: 0, LifeInsur: 0, KeyManInsur: 0, OthInsur: 0, TotInsurances: 0 },
              StaffWelfareExp: 0, Entertainment: 0, Hospitality: 0, Conference: 0, SalePromoExp: 0, Advertisement: 0,
              CommissionExpdrDtls: { NonResOtherCompany: 0, Others: 0, Total: 0 },
              RoyalityDtls: { NonResOtherCompany: 0, Others: 0, Total: 0 },
              ProfessionalConstDtls: { NonResOtherCompany: 0, Others: 0, Total: 0 },
              HotelBoardLodge: 0, TravelExp: 0, ForeignTravelExp: 0, ConveyanceExp: 0, TelephoneExp: 0, GuestHouseExp: 0, ClubExp: 0, FestivalCelebExp: 0, Scholarship: 0, Gift: 0, Donation: 0,
              RatesTaxesPays: { ExciseCustomsVAT: { UnionExciseDuty:0,ServiceTax:0,VATorSaleTax:0,CentralGoodServiceTax:0,StateGoodServiceTax:0,IntegratedGoodServiceTax:0,UnionTerrGoodServiceTax:0,OthDutyTaxCess:0,TotExciseCustomsVAT:0 } },
              AuditFee: 0, SalRemuneration: 0, OtherExpenses: 0,
              BadDebtDtls: { BadDebtAmtDtlsTotal: 0, OthersPANNotAvlblDtlTotal: 0, OthersAmtLt1Lakh: 0, BadDebt: 0 },
              ProvForBadDoubtDebt: 0, OthProvisionsExpdr: 0, PBIDTA: 0,
              InterestExpdrtDtls: { NonResOtherCompany: 0, Others: 0, ResPartners: 0, ResOthers: 0, InterestExpdr: 0 },
              DepreciationAmort: 0, PBT: 0,
            },
            TaxProvAppr: {
              ProvForCurrTax: 0, ProvDefTax: 0, ProfitAfterTax: 0, BalBFPrevYr: 0, AmtAvlAppr: 0,
              Appropriations: {TrfToReserves: 0}, PartnerAccBalTrf: 0,
            },
          },
          PersumptiveInc44AD:       { GrsTrnOverOrReceipt: 0, TotPersumptiveInc44AD: toI(pl.BizNetProfit) },
          PersumptiveInc44ADA:      { GrsReceipt: 0 },
          TotalPrsumptvIncUs44E:    0,
          NoBooksOfAccPL: {
            GrossReceipt:              toI(pl.BizGrossReceiptsElectronic) + toI(pl.BizGrossReceiptsOther),
            GrsRcptAccPayeeOrBankMode: toI(pl.BizGrossReceiptsElectronic),
            GrsRcptOtherMode:          toI(pl.BizGrossReceiptsOther),
            GrossProfit:               toI(pl.BizGrossProfit),
            Expenses:                  toI(pl.BizExpenses),
            NetProfit:                 toI(pl.BizNetProfit),
            GrossReceiptPrf:           0,
            GrsRcptAccPayeeOrBankModePrf: 0,
            GrsRcptOtherModePrf:       0,
            GrossProfitPrf:            toI(pl.ProfNetProfit),
            ExpensesPrf:               0,
            NetProfitPrf:              toI(pl.ProfNetProfit),
            TotBusinessProfession:     toI(pl.BizNetProfit) + toI(pl.ProfNetProfit),
          },
          TurnverFrmSpecActivity:   0,
          NetIncomeFrmSpecActivity: 0,
        } : {
          CreditsToPL: {
            GrossProfitTrnsfFrmTrdAcc: grossProfitFromTrading,
            OthIncome: {
              RentInc:                    toI(pl.PL14i),
              Comissions:                 toI(pl.PL14ii),
              Dividends:                  toI(pl.PL14iii),
              InterestInc:                toI(pl.PL14iv),
              ProfitOnSaleFixedAsset:     toI(pl.PL14v),
              ProfitOnInvChrSTT:          toI(pl.PL14vi),
              ProfitOnOthInv:             toI(pl.PL14vii),
              ProfitOnCurrFluct:          toI(pl.PL14viii),
              ProfitOnCnvInvntryToCapAsst: toI(pl.PL14ix),
              ProfitOnAgriIncome:         toI(pl.PL14x),
              MiscOthIncome:              toI(pl.PL14xi) + toI(pl.PL14xia),
              TotOthIncome:               totOthIncome,
              LiabilityWrittenBack:       0,
              OtherIncDtls: (() => {
                const miscAmt = toI(pl.PL14xi) + toI(pl.PL14xia);
                const mapped = (pl.OtherIncomeDetails ?? [])
                  .map((d: any) => ({ NatureOfIncome: d.nature ?? '', Amount: toI(d.amount) }))
                  .filter((d: any) => d.Amount > 0);
                // Portal requires breakdown when MiscOthIncome > 0 (error 9)
                return mapped.length > 0 ? mapped
                  : miscAmt > 0 ? [{ NatureOfIncome: 'MISCELLANEOUS INCOME', Amount: miscAmt }]
                  : [];
              })(),
            },
            TotCreditsToPL: totCreditsToPL,
          },
          DebitsToPL: {
            DebitPlAcnt: {
              Freight:             0,
              ConsumptionOfStores: 0,
              PowerFuel:           toI(pl.PL23i) + toI(pl.PL23ii) + toI(pl.PL23iii) + toI(pl.PL23iv),
              RentExpdr:           toI(pl.PL17),
              RepairsBldg:         toI(pl.PL18),
              RepairMach:          toI(pl.PL19),
              EmployeeComp: {
                SalsWages:         toI(pl.PL16) + toI(pl.PL52ia) + toI(pl.PL52ib) + toI(pl.PL52iia) + toI(pl.PL52iib),
                Bonus: 0, MedExpReimb: 0, LeaveEncash: 0, LeaveTravelBenft: 0,
                ContToSuperAnnFund: 0, ContToPF: 0, ContToGratFund: 0, ContToOthFund: 0, OthEmpBenftExpdr: 0,
                TotEmployeeComp:   toI(pl.PL16) + toI(pl.PL52ia) + toI(pl.PL52ib) + toI(pl.PL52iia) + toI(pl.PL52iib),
                AmtPaidToNonRes:   0,
              },
              Insurances: { MedInsur: 0, LifeInsur: 0, KeyManInsur: 0, OthInsur: toI(pl.PL20), TotInsurances: toI(pl.PL20) },
              StaffWelfareExp: 0, Entertainment: 0, Hospitality: toI(pl.PL27),
              Conference: 0, SalePromoExp: 0, Advertisement: toI(pl.PL29),
              CommissionExpdrDtls: { NonResOtherCompany: 0, Others: toI(pl.PL30i) + toI(pl.PL30ii), Total: toI(pl.PL30i) + toI(pl.PL30ii) },
              RoyalityDtls:        { NonResOtherCompany: 0, Others: toI(pl.PL32i) + toI(pl.PL32ii), Total: toI(pl.PL32i) + toI(pl.PL32ii) },
              ProfessionalConstDtls: { NonResOtherCompany: 0, Others: toI(pl.PL31i) + toI(pl.PL31ii), Total: toI(pl.PL31i) + toI(pl.PL31ii) },
              HotelBoardLodge: 0,
              TravelExp:       toI(pl.PL24) + toI(pl.PL25),
              ForeignTravelExp: toI(pl.PL26),
              ConveyanceExp: 0, TelephoneExp: toI(pl.PL22xi), GuestHouseExp: 0, ClubExp: 0,
              FestivalCelebExp: toI(pl.PL28), Scholarship: 0, Gift: 0, Donation: toI(pl.PL53),
              RatesTaxesPays: { ExciseCustomsVAT: { UnionExciseDuty:0,ServiceTax:0,VATorSaleTax:0,CentralGoodServiceTax:0,StateGoodServiceTax:0,IntegratedGoodServiceTax:0,UnionTerrGoodServiceTax:0,OthDutyTaxCess:toI(pl.PL21),Cess:0,TotExciseCustomsVAT:toI(pl.PL21) } },
              AuditFee:            toI(pl.PL33),
              SalRemuneration:     0,
              OtherExpenses:       toI(pl.PL37) + toI(pl.PL40) + toI(pl.PL41) + toI(pl.PL42) + toI(pl.PL43) + toI(pl.PL44x) + toI(pl.PL45) + toI(pl.PL46) + toI(pl.PL47) + toI(pl.PL48iv),
              BadDebtDtls:         { BadDebtAmtDtlsTotal: 0, OthersPANNotAvlblDtlTotal: 0, OthersAmtLt1Lakh: toI(pl.PL34), BadDebt: toI(pl.PL34) },
              ProvForBadDoubtDebt: toI(pl.PL35),
              OthProvisionsExpdr:  toI(pl.PL36),
              PBIDTA:              Math.max(0, toI(pl.NetProfitBeforeTaxes) + toI(pl.PL38) + toI(pl.PL39)),
              InterestExpdrtDtls:  { NonResOtherCompany: 0, Others: 0, ResPartners: 0, ResOthers: toI(pl.PL38), InterestExpdr: toI(pl.PL38) },
              DepreciationAmort:   toI(pl.PL39),
              PBT:                 toI(pl.NetProfitBeforeTaxes),
            },
            TaxProvAppr: {
              ProvForCurrTax:  toI(pl.PL49),
              ProvDefTax:      0,
              ProfitAfterTax:  Math.max(0, toI(pl.NetProfitBeforeTaxes) - toI(pl.PL49)),
              BalBFPrevYr:     0,
              AmtAvlAppr:      Math.max(0, toI(pl.NetProfitBeforeTaxes) - toI(pl.PL49)),
              Appropriations:  {TrfToReserves: toI(pl.TrfToReserves)},
              // Portal error 8: must equal AmtAvlAppr − TrfToReserves (auto-derived)
              PartnerAccBalTrf: Math.max(0, toI(pl.NetProfitBeforeTaxes) - toI(pl.PL49)) - toI(pl.TrfToReserves),
            },
          },
          PersumptiveInc44AD: {
            GrsTrnOverOrReceipt:      0,
            GrsTrnOverBank:           0,
            GrsTotalTrnOverInCash:    0,
            GrsTrnOverAnyOthMode:     0,
            TotPersumptiveInc44AD:    0,
            PersumptiveInc44AD6Per:   0,
            PersumptiveInc44AD8Per:   0,
          },
          PersumptiveInc44ADA: {
            GrsReceipt:               0,
            GrsTrnOverBank44ADA:      0,
            GrsTotalTrnOverInCash44ADA: 0,
            GrsTrnOverAnyOthMode44ADA: 0,
            TotPersumptiveInc44ADA:   0,
          },
          TotalNumOfMonths:             0,
          TotalPrsumptvIncUs44EGoods:   0,
          TotalPrsumptvIncGCUs44E:      0,
          SalRemrtnToPartnerFirm:       0,
          TotalPrsumptvIncUs44E:        0,
          NoBooksOfAccPL: {
            GrossReceipt: 0, GrsRcptAccPayeeOrBankMode: 0, GrsRcptOtherMode: 0,
            GrossProfit: 0, Expenses: 0, NetProfit: 0,
            GrossReceiptPrf: 0, GrsRcptAccPayeeOrBankModePrf: 0, GrsRcptOtherModePrf: 0,
            GrossProfitPrf: 0, ExpensesPrf: 0, NetProfitPrf: 0,
            TotBusinessProfession: 0,
          },
          TurnverFrmSpecActivity:       0,
          GrossProfit:                  0,
          Expenditure:                  0,
          NetIncomeFrmSpecActivity:     0,
        },

        // ── ScheduleBP (regular books case) ──────────────────────────────
        ...(!noAccountCase ? (() => {
          const netProfit       = toI(pl.NetProfitBeforeTaxes);
          const autoOSCrossBP   = toI(bp5.otherCrossHeadDeductions) === 0
            ? Math.max(0, osIncome - toI(bp5.interestCreditedToPL) - toI(bp5.dividendCreditedToPL) - toI(bp5.rentalIncomeCreditedToPL))
            : 0;
          const crossHeads      = toI(bp5.dividendCreditedToPL) + toI(bp5.interestCreditedToPL)
                                + toI(bp5.rentalIncomeCreditedToPL) + toI(bp5.capitalGainCreditedToPL)
                                + toI(bp5.otherCrossHeadDeductions) + autoOSCrossBP;
          const bpDeds          = toI(bp5.depreciationITAct) + toI(bp5.deductionU35) + toI(bp5.deductionU10AA)
                                + toI(bp5.deductionU80IC) + toI(bp5.otherBPDeductions);
          const fromOtherHeads  = toI(bp5.amtFromOtherHeadsToBP);
          const salDisallow     = toI(bp5.salaryToPartnersExcess);
          const intDisallow     = toI(bp5.interestToPartnersExcess);
          const othDisallow     = toI(bp5.personalExpenses) + toI(bp5.provisionIncomeTax);
          const disallUs37      = toI(bp5.otherAdditions);
          const disallUs40      = toI(bp5.inadmissibleU40aIa);
          const disallUs40A     = toI(bp5.inadmissibleU40A3);
          const deprnBooks      = toI(pl.PL39);
          const deprnIT         = toI(bp5.depreciationITAct);
          const balPL           = netProfit - crossHeads;
          const adjPLDepr       = balPL + deprnBooks - deprnIT;
          const totAdditions    = adjPLDepr + disallUs37 + disallUs40 + disallUs40A + salDisallow + intDisallow + othDisallow;
          const totDeductions   = toI(bp5.deductionU35) + toI(bp5.deductionU10AA) + toI(bp5.deductionU80IC) + toI(bp5.otherBPDeductions);
          const plAftAdj        = totAdditions - totDeductions;
          const netPLAft        = plAftAdj + fromOtherHeads;
          const taxableBPIncome = Math.max(0, netPLAft);
          return {
            CorpScheduleBP: {
              BusinessIncOthThanSpec: {
                ProfBfrTaxPL:           netProfit,
                NetPLFromSpecBus:       0,
                NetProfLossSpecifiedBus: 0,
                IncRecCredPLOthHeadDtls: {
                  HouseProperty:    toI(bp5.rentalIncomeCreditedToPL),
                  CapitalGains:     toI(bp5.capitalGainCreditedToPL),
                  OtherSources:     toI(bp5.interestCreditedToPL) + toI(bp5.otherCrossHeadDeductions) + autoOSCrossBP,
                  Dividend:         toI(bp5.dividendCreditedToPL),
                  OtherThanDividend: toI(bp5.interestCreditedToPL) + toI(bp5.otherCrossHeadDeductions) + autoOSCrossBP,
                  UnderSec115BBF:   0,
                  UnderSec115BBG:   0,
                  UnderSec115BBH:   0,
                },
                PLUs44sChapXIIGOthrUs115B: 0,
                ProfitLossInclRefrdSec:    effectiveAY === '2024-25'
                  ? { ProfitLossUs44AD:0,ProfitLossUs44ADA:0,ProfitLossUs44AE:0,ProfitLossUs44B:0,ProfitLossUs44BB:0,ProfitLossUs44BBA:0,ProfitLossUs44DA:0,FirstSchITActOthr115B:0 }
                  : { ProfitLossUs44AD:0,ProfitLossUs44ADA:0,ProfitLossUs44AE:0,ProfitLossUs44B:0,ProfitLossUs44BB:0,ProfitLossUs44BBA:0,ProfitLossUs44BBC:0,ProfitLossUs44DA:0,FirstSchITActOthr115B:0 },
                TotalProfitFrmActCvrd:     0,
                ProfitFrmActCvrd:          { ProfitFrmActCvrdUndrRule7:0,ProfitFrmActCvrdUndrRule7A:0,ProfitFrmActCvrdUndrRule7B1:0,ProfitFrmActCvrdUndrRule7B1A:0,ProfitFrmActCvrdUndrRule8:0 },
                IncCredPL:                 { FirmShareInc:0,AOPBOISharInc:0,OtherExmptIncDtl:{OperatingDividendName:'Dividend',OperatingDividendAmt:0},OthExempInc:fromOtherHeads,TotExempInc:fromOtherHeads },
                BalancePLOthThanSpecBus:   balPL,
                ExpDebToPLOthHeadDtls: {
                  HouseProperty:  0,
                  CapitalGains:   0,
                  OtherSources:   0,
                  UnderSec115BBF: 0,
                  UnderSec115BBG: 0,
                  UnderSec115BBH: 0,
                },
                ExpDebToPLExemptInc:             0,
                ExpDebToPLExemptIncDisAllwUs14A: 0,
                TotExpDebPL:                     0,
                AdjustedPLOthThanSpecBus:        balPL,
                DepreciationDebPLCosAct:         deprnBooks,
                DepreciationAllowITAct32:        { DepreciationAllowUs32_1_ii:deprnIT,DepreciationAllowUs32_1_i:0,TotDeprAllowITAct:deprnIT },
                AdjustPLAfterDeprOthSpecInc:     adjPLDepr,
                AmtDebPLDisallowUs36:            0,
                AmtDebPLDisallowUs37:            disallUs37,
                AmtDebPLDisallowUs40:            disallUs40,
                AmtDebPLDisallowUs40A:           disallUs40A,
                AmtDebPLDisallowUs43B:           0,
                InterestDisAllowUs23SMEAct:      0,
                DeemIncUs41:                     0,
                DeemIncUs3380HHD80IA:            0,
                DeemIncUs32AC:                   0,
                DeemIncUs32AD:                   0,
                DeemIncUs33AB:                   0,
                DeemIncUs33ABA:                  0,
                DeemIncUs35ABA:                  0,
                DeemIncUs35ABB:                  0,
                DeemIncUs35AC:                   0,
                DeemIncUs40A3A:                  0,
                DeemIncUs33AC:                   0,
                DeemIncUs72A:                    0,
                DeemIncUs80HHD:                  0,
                DeemIncUs80IA:                   0,
                DeemIncUs43CA:                   0,
                OthItemDisallowUs28To44DB:       0,
                AnyOthIncNotInclInExpDisallowPL: 0,
                SalaryExpDisallowPL:             salDisallow,
                BonusExpDisallowPL:              0,
                CommissionExpDisallowPL:         0,
                InterestExpDisallowPL:           intDisallow,
                OthersExpDisallowPL:             othDisallow,
                IncProfDecLossAccICDSAdj:        0,
                TotAfterAddToPLDeprOthSpecInc:   totAdditions,
                DeductUs32_1_iii:                0,
                DebPLUs35ExcessAmt:              toI(bp5.deductionU35),
                AmtDisallUs40NowAllow:           0,
                AmtDisallUs43BNowAllow:          0,
                AnyOthAmtAllDeduct:              toI(bp5.deductionU10AA) + toI(bp5.deductionU80IC) + toI(bp5.otherBPDeductions),
                DecProfIncLossAccICDSAdj:        0,
                TotDeductionAmts:                totDeductions,
                PLAftAdjDedBusOthThanSpec:       plAftAdj,
                DeemedProfitBusUs:               effectiveAY === '2024-25'
                  ? { Section44AD:0,Section44ADA:0,Section44AE:0,Section44B:0,Section44BB:0,Section44BBA:0,Section44DA:0,FirstSchTActOther:0,TotDeemedProfitBusUs:0 }
                  : { Section44AD:0,Section44ADA:0,Section44AE:0,Section44B:0,Section44BB:0,Section44BBA:0,Section44BBC:0,Section44DA:0,FirstSchTActOther:0,TotDeemedProfitBusUs:0 },
                NetPLAftAdjBusOthThanSpec:       netPLAft,
                NetPLBusOthThanSpec7A7B7C:       taxableBPIncome,
                ChrgblIncUndrRule7:              0,
                DeemedChrgblIncUndrRule7A:       0,
                DeemedChrgblIncUndrRule7B1:      0,
                DeemedChrgblIncUndrRule7B1A:     0,
                DeemedChrgblIncUndrRule8:        0,
                IncomeOtherThanRule:             taxableBPIncome,
                BalIncDeemedFrmAgri:             0,
              },
              SpecBusinessInc: {
                NetPLFrmSpecBus:        0,
                AdditionUs28to44DB:     0,
                DeductUs28to44DB:       0,
                AdjustedPLFrmSpecuBus:  0,
              },
              IncSpecifiedBusiness: {
                NetPLFrmSpecifiedBus:          0,
                AddSec28to44DB:                0,
                DedSec28to44DBOTDedSec35AD:    0,
                ProfitLossSpecifiedBusiness:   0,
                ProfitLossSpecifiedBusFinal:   0,
              },
              IncChrgUnHdProftGain: taxableBPIncome,
              BusSetoffCurrYr: {
                LossSetOffOnBusLoss:     0,
                SpeculativeInc: { IncOfCurYrUnderThatHead: 0, BusLossSetoff: 0, IncOfCurYrAfterSetOff: 0 },
                SpecifiedInc:   { IncOfCurYrUnderThatHead: 0, BusLossSetoff: 0, IncOfCurYrAfterSetOff: 0 },
                TotLossSetOffOnBus:      0,
                LossRemainSetOffOnBus:   taxableBPIncome,
              },
            },
          };
        })() : {}),

        // ── ScheduleHP ────────────────────────────────────────────────────
        ScheduleHP: rd.houseProperty && rd.houseProperty.Properties?.length
          ? {
              PropertyDetails:           rd.houseProperty.Properties.map(buildPropertyDetails),
              PassThroghIncome:          0,
              TotalIncomeChargeableUnHP: toI(rd.houseProperty.TotalIncomeFromHP),
            }
          : { PassThroghIncome: 0, TotalIncomeChargeableUnHP: 0 },

        // ── ScheduleOS ────────────────────────────────────────────────────
        ScheduleOS: (() => {
          const osData        = rd.otherSources ?? ({} as any);
          const interestGross = toI(osData.IntrstFrmSavingBank) + toI(osData.IntrstFrmTermDeposit)
            + toI(osData.IntrstFrmIncmTaxRefund) + toI(osData.IntrstFrmOthers)
            + toI(osData.InterestIncome);       // fallback flat field
          const dividendGross = toI(osData.DividendIncome);
          const deductions    = toI(osData.DeductionUs57iia);
          const grossInc      = Math.max(0, toI(osData.IncomeFromOtherSources));
          const netInc        = Math.max(0, grossInc - deductions);
          const knownOsItems  = interestGross + dividendGross + toI(osData.RentFromMachPlantBldgs);
          const derivedAnyOther = Math.max(0, grossInc - knownOsItems);
          const anyOtherInc   = toI(osData.AnyOtherIncome) || derivedAnyOther;
          const otherIncDtls  = osData.AnyOtherIncomeDetails?.length
            ? osData.AnyOtherIncomeDetails.map((d: any) => ({ OthNatOfInc: d.nature ?? '', OthAmount: toI(d.amount) }))
            : (anyOtherInc > 0 ? [{ OthNatOfInc: 'MISCELLANEOUS INCOME', OthAmount: anyOtherInc }] : []);
          return {
            IncOthThanOwnRaceHorse: {
              GrossIncChrgblTaxAtAppRate: grossInc,
              DividendGross:             dividendGross,
              DividendOthThan22e:        dividendGross,
              Dividend22e:               0,
              InterestGross:             interestGross,
              IntrstFrmSavingBank:       toI(osData.IntrstFrmSavingBank),
              IntrstFrmTermDeposit:      toI(osData.IntrstFrmTermDeposit),
              IntrstFrmIncmTaxRefund:    toI(osData.IntrstFrmIncmTaxRefund),
              NatofPassThrghIncome:      0,
              IntrstFrmOthers:           toI(osData.IntrstFrmOthers),
              RentFromMachPlantBldgs:    toI(osData.RentFromMachPlantBldgs),
              Tot562x:                   0,
              Aggrtvaluewithoutcons562x: 0,
              Immovpropwithoutcons562x:  0,
              Immovpropinadeqcons562x:   0,
              Anyotherpropwithoutcons562x: 0,
              Anyotherpropinadeqcons562x: 0,
              SumRecdPrYrBusTRU562xii:   0,
              AnyOtherIncome:            anyOtherInc,
              OthersInc:                 { OthersIncDtls: otherIncDtls },
              IncChargeableSpecialRates: 0,
              LtryPzzlChrgblUs115BB:     0,
              IncChrgblUs115BBE:         0,
              IncChrgblUs115BBJ:         0,
              CashCreditsUs68:           0,
              UnExplndInvstmntsUs69:     0,
              UnExplndMoneyUs69A:        0,
              UnDsclsdInvstmntsUs69B:    0,
              UnExplndExpndtrUs69C:      0,
              AmtBrwdRepaidOnHundiUs69D: 0,
              OthersGross:               0,
              PassThrIncOSChrgblSplRate: 0,
              IncChargblSplRateOS:       { TotalAmtTaxUsDTAASchOs: 0 },
              Deductions:                { Expenses: 0, Depreciation: 0, UsrIntExp57: 0, IntExp57: 0, TotDeductions: deductions },
              AmtNotDeductibleUs58:      0,
              ProfitChargTaxUs59:        0,
              BalanceNoRaceHorse:        netInc,
            },
            TotOthSrcNoRaceHorse:       netInc,
            IncFromOwnHorse:            { Receipts: 0, DeductSec57: 0, AmtNotDeductibleUs58: 0, ProfitChargTaxUs59: 0, BalanceOwnRaceHorse: 0 },
            IncChargeableFrmOthSrc:     netInc,
            IncFrmLottery:              { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            IncFrmOnGames:              { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            DividendIncUs115BBDA:       { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            ...(effectiveAY !== '2024-25' ? { DividendIncUs115BBDAaiii: { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } } } : {}),
            DividendIncUs115A1ai:       { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            DividendIncUs115A1aA:       { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            DividendIncUs115AC:         { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            DividendIncUs115AD1iDiv:    { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            DividendIncUs115AD1IBd:     { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            DividendDTAA:               { DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
          };
        })(),

        // ── ScheduleCG ────────────────────────────────────────────────────
        ScheduleCG: {
          ShortTermCapGain: (() => {
            const stcg = rd.stcg;
            const otherAssets = stcg?.OtherEntries ?? [];
            return {
              SlumpSaleInStcg: { FMV11UAEii: 0, FMV11UAEiii: 0, FullConsideration: 0, NetWorthOfDivision: 0, CapgainonAssets: 0 },
              NRITransacSec48Dtl: effectiveAY === '2024-25'
                ? { NRItaxSTTPaid: 0, NRItaxSTTNotPaid: 0 }
                : { NRItaxSTTPaid: 0, NRItaxSTTPaidTransferBE: 0, NRItaxSTTPaidTransferAE: 0, NRItaxSTTNotPaid: 0 },
              NRISecur115AD: {
                FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0,
                FullConsideration: 0,
                DeductSec48: { Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 },
                BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0,
              },
              SaleOnOtherAssets: {
                FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0,
                FullConsideration: otherAssets.reduce((s,e) => s + toI(e.salesValue), 0),
                DeductSec48: {
                  Reduction48iii: 0, AquisitCost: otherAssets.reduce((s,e) => s + toI(e.purchaseCost), 0),
                  ImproveCost: 0, ExpOnTrans: otherAssets.reduce((s,e) => s + toI(e.expenditure), 0),
                  TotalDedn: otherAssets.reduce((s,e) => s + toI(e.purchaseCost) + toI(e.expenditure), 0),
                },
                BalanceCG: stcgOther, LossSec94of7Or94of8: 0, DeemedSTCGDeprAsset: 0,
                ExemptionOrDednUs54: { ExemptionOrDednUs54Dtls: [
                  { ExemptionSecCode: '54D', ExemptionAmount: 0 },
                  { ExemptionSecCode: '54G', ExemptionAmount: 0 },
                  { ExemptionSecCode: '54GA', ExemptionAmount: 0 },
                ], ExemptionGrandTotal: 0 },
                CapgainonAssets: stcgOther,
              },
              TotalAmtDeemedStcg:       0,
              PassThrIncNatureSTCG:     0,
              TotalAmtNotTaxUsDTAAStcg: 0,
              TotalAmtTaxUsDTAAStcg:    0,
              TotalSTCG:                totalSTCG,
              SaleofLandBuild: {
                SaleofLandBuildDtls: [{
                  FullConsideration: 0, PropertyValuation: 0, FullConsideration50C: 0,
                  Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0, Balance: 0,
                  ExemptionOrDednUs54: { ExemptionOrDednUs54Dtls: [
                    { ExemptionSecCode: '54G', ExemptionAmount: 0 },
                    { ExemptionSecCode: '54GA', ExemptionAmount: 0 },
                  ], ExemptionGrandTotal: 0 },
                  CapgainonAssets: 0,
                }],
              },
              EquityMFonSTT: [
                { MFSectionCode: '1A',        EquityMFonSTTDtls: { FullConsideration: 0, DeductSec48: { Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 }, BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: stcg111A }, EquityMFonSTTDtls_BE: { FullConsideration: 0, DeductSec48: { Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 }, BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0 }, TotalCapGainonassets: stcg111A },
                { MFSectionCode: '5AD1biip',  EquityMFonSTTDtls: { FullConsideration: 0, DeductSec48: { Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 }, BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0 }, EquityMFonSTTDtls_BE: { FullConsideration: 0, DeductSec48: { Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 }, BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0 }, TotalCapGainonassets: 0 },
              ],
              AmtDeemedStcg:            0,
              AmtDeemedStcg45iv:        0,
              PassThrIncNatureSTCG15Per:  0,
              PassThrIncNatureSTCG30Per:  0,
              PassThrIncNatureSTCGAppRate: 0,
            };
          })(),
          LongTermCapGain: {
            ...(effectiveAY === '2024-25' ? {
              SlumpSaleInLtcg: { FMV11UAEii: 0, FMV11UAEiii: 0, FullConsideration: 0, NetWorthOfDivision: 0, SlumpBalance: 0, DeductionUnderSec54: 0, CapgainonAssets: 0 },
            } : {
              SlumpSaleInLtcgDtls: {},
            }),
            SaleofBondsDebntr:        { FullConsideration: 0, DeductSec48: { Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 }, BalanceCG: 0 },
            SaleOfEquityShareUs112A: {
              CapgainonAssets: ltcg112A,
              ...(effectiveAY !== '2024-25' ? { CapgainonAssetsTransferBE: 0, CapgainonAssetsTransferAE: 0 } : {}),
            },
            NRISaleOfEquityShareUs112A: {
              CapgainonAssets: 0,
              ...(effectiveAY !== '2024-25' ? { CapgainonAssetsTransferBE: 0, CapgainonAssetsTransferAE: 0 } : {}),
            },
            ...(effectiveAY === '2024-25' ? {
              SaleofAssetNA: {
                FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0, FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0,
                FullConsideration: 0,
                DeductSec48: { Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 },
                BalanceCG: 0,
                ExemptionOrDednUs54: { ExemptionOrDednUs54Dtls: [
                  { ExemptionSecCode: '54D', ExemptionAmount: 0 },
                  { ExemptionSecCode: '54G', ExemptionAmount: 0 },
                  { ExemptionSecCode: '54GA', ExemptionAmount: 0 },
                ], ExemptionGrandTotal: 0 },
                CapgainonAssets: 0,
              },
            } : {
              SaleofAssetNADtls: {},
            }),
            TotalAmtDeemedLtcg:       0,
            PassThrIncNatureLTCG:     0,
            PassThrIncNatureLTCGUs112A: 0,
            TotalAmtNotTaxUsDTAALtcg: 0,
            TotalAmtTaxUsDTAALtcg:    0,
            TotalLTCG:                ltcg112A,
            SaleofLandBuild: {
              SaleofLandBuildDtls: [{
                FullConsideration: 0, PropertyValuation: 0, FullConsideration50C: 0,
                Reduction48iii: 0, AquisitCost: 0, AquisitCostIndex: 0,
                CostOfImprovements: { CostOfImprovementsDtls: [], TotalImprovecost: 0, TotalindexImprovecost: 0 },
                ExpOnTrans: 0, TotalDedn: 0, Balance: 0,
                ExemptionOrDednUs54: { ExemptionOrDednUs54Dtls: [
                  { ExemptionSecCode: '54D', ExemptionAmount: 0 },
                  { ExemptionSecCode: '54EC', ExemptionAmount: 0 },
                  { ExemptionSecCode: '54G', ExemptionAmount: 0 },
                  { ExemptionSecCode: '54GA', ExemptionAmount: 0 },
                ], ExemptionGrandTotal: 0 },
                CapgainonAssets: 0,
              }],
            },
            Proviso112Applicable: {
              Proviso112SectionCode: '22',
              Proviso112Applicabledtls: { FullConsideration: 0, DeductSec48: { Reduction48iii: 0, AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 }, BalanceCG: 0 },
            },
            NRIProvisoSec48: { LTCGWithoutBenefitTransferBEListDb: 0, LTCGWithoutBenefitTransferBE: 0, LTCGWithoutBenefitTransferAE: 0, BalanceCG: 0 },
            NRIOnSec112and115: {
              NRIOnSec112and115Dtls: [
                { SectionCode: '21ciii', NRIOnSec112and115Dtls_BE: { FullValueConsdRecvUnqshr:0, FairMrktValueUnqshr:0, FullValueConsdSec50CA:0, FullValueConsdOthUnqshr:0, FullConsideration:0, DeductSec48:{Reduction48iii:0,AquisitCost:0,ImproveCost:0,ExpOnTrans:0,TotalDedn:0}, BalanceCG:0 }, NRIOnSec112and115Dtls_AE: { FullValueConsdRecvUnqshr:0, FairMrktValueUnqshr:0, FullValueConsdSec50CA:0, FullValueConsdOthUnqshr:0, FullConsideration:0, DeductSec48:{Reduction48iii:0,AquisitCost:0,ImproveCost:0,ExpOnTrans:0,TotalDedn:0}, BalanceCG:0 } },
                { SectionCode: '5AB1b',  NRIOnSec112and115Dtls_BE: { FullValueConsdRecvUnqshr:0, FairMrktValueUnqshr:0, FullValueConsdSec50CA:0, FullValueConsdOthUnqshr:0, FullConsideration:0, DeductSec48:{Reduction48iii:0,AquisitCost:0,ImproveCost:0,ExpOnTrans:0,TotalDedn:0}, BalanceCG:0 }, NRIOnSec112and115Dtls_AE: { FullValueConsdRecvUnqshr:0, FairMrktValueUnqshr:0, FullValueConsdSec50CA:0, FullValueConsdOthUnqshr:0, FullConsideration:0, DeductSec48:{Reduction48iii:0,AquisitCost:0,ImproveCost:0,ExpOnTrans:0,TotalDedn:0}, BalanceCG:0 } },
                { SectionCode: '5AC1c',  NRIOnSec112and115Dtls_BE: { FullValueConsdRecvUnqshr:0, FairMrktValueUnqshr:0, FullValueConsdSec50CA:0, FullValueConsdOthUnqshr:0, FullConsideration:0, DeductSec48:{Reduction48iii:0,AquisitCost:0,ImproveCost:0,ExpOnTrans:0,TotalDedn:0}, BalanceCG:0 }, NRIOnSec112and115Dtls_AE: { FullValueConsdRecvUnqshr:0, FairMrktValueUnqshr:0, FullValueConsdSec50CA:0, FullValueConsdOthUnqshr:0, FullConsideration:0, DeductSec48:{Reduction48iii:0,AquisitCost:0,ImproveCost:0,ExpOnTrans:0,TotalDedn:0}, BalanceCG:0 } },
              ],
            },
            AmtDeemedLtcg:            0,
            AmtDeemedLtcg45iv:        0,
            PassThrIncNatureLTCG10Per: 0,
            PassThrIncNatureLTCG20Per: 0,
          },
          SumOfCGIncm:              totalCG,
          IncmFromVDATrnsf:         0,
          IncChargeableHeadCapGain: totalCG,
          DeducClaimInfo:           { TotDeductClaim: 0 },
          CurrYrLosses: {
            // AY 2024-25: 15% STCG / 10% LTCG (pre-Budget 2024 rates)
            // AY 2025-26+: 20% STCG / 12.5% LTCG introduced — extra fields required
            InLossSetOff: effectiveAY === '2024-25'
              ? { StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0 }
              : { StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff12_5Per:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0 },
            InStcg15Per:   { CurrYearIncome:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,CurrYrCapGain:0 },
            ...(effectiveAY !== '2024-25' ? { InStcg20Per: { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,CurrYrCapGain:0 } } : {}),
            InStcg30Per: effectiveAY === '2024-25'
              ? { CurrYearIncome:0,StclSetoff15Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,CurrYrCapGain:0 }
              : { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff20Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,CurrYrCapGain:0 },
            InStcgAppRate: effectiveAY === '2024-25'
              ? { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffDTAARate:0,CurrYrCapGain:0 }
              : { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffDTAARate:0,CurrYrCapGain:0 },
            InStcgDTAARate: effectiveAY === '2024-25'
              ? { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,CurrYrCapGain:0 }
              : { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,CurrYrCapGain:0 },
            InLtcg10Per: effectiveAY === '2024-25'
              ? { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0,CurrYrCapGain:0 }
              : { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff12_5Per:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0,CurrYrCapGain:0 },
            ...(effectiveAY !== '2024-25' ? { InLtcg12_5Per: { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0,CurrYrCapGain:0 } } : {}),
            InLtcg20Per: effectiveAY === '2024-25'
              ? { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOffDTAARate:0,CurrYrCapGain:0 }
              : { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff12_5Per:0,LtclSetOffDTAARate:0,CurrYrCapGain:0 },
            InLtcgDTAARate: effectiveAY === '2024-25'
              ? { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff20Per:0,CurrYrCapGain:0 }
              : { CurrYearIncome:0,StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff12_5Per:0,LtclSetOff20Per:0,CurrYrCapGain:0 },
            TotLossSetOff: effectiveAY === '2024-25'
              ? { StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0 }
              : { StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff12_5Per:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0 },
            LossRemainSetOff: effectiveAY === '2024-25'
              ? { StclSetoff15Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0 }
              : { StclSetoff15Per:0,StclSetoff20Per:0,StclSetoff30Per:0,StclSetoffAppRate:0,StclSetoffDTAARate:0,LtclSetOff10Per:0,LtclSetOff12_5Per:0,LtclSetOff20Per:0,LtclSetOffDTAARate:0 },
          },
          AccruOrRecOfCG: {
            VDATrnsfGainsUnder30Per: { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} },
            ShortTermUnder15Per:   { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} },
            ...(effectiveAY !== '2024-25' ? { ShortTermUnder20Per: { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} } } : {}),
            ShortTermUnder30Per:   { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} },
            ShortTermUnderAppRate: { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} },
            ShortTermUnderDTAARate:{ DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} },
            LongTermUnder10Per:    { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} },
            ...(effectiveAY !== '2024-25' ? { LongTermUnder12_5Per: { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} } } : {}),
            LongTermUnder20Per:    { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} },
            LongTermUnderDTAARate: { DateRange:{Upto15Of6:0,Upto15Of9:0,Up16Of9To15Of12:0,Up16Of12To15Of3:0,Up16Of3To31Of3:0} },
          },
        },

        // ── ScheduleGST (only when GST data present) ─────────────────────
        ...(Array.isArray(gen.gstDetails) && gen.gstDetails.length > 0 ? {
          ScheduleGST: {
            TurnoverGrsRcptForGSTIN: gen.gstDetails.map((g: any) => ({
              GSTINNo:              g.gstin ?? '',
              AmtTurnGrossRcptGSTIN: toI(g.turnover),
            })),
          },
        } : {}),

        // ── ScheduleCYLA ─────────────────────────────────────────────────
        ScheduleCYLA: {
          CYLAEditFlag:         'N',
          HP:                   cylaHP(Math.max(0, hpIncome)),
          BusProfExclSpecProf:  cylaBP(Math.max(0, bpIncome)),
          SpeculationIncome:    cylaBP(0),
          SpecifiedBusIncome:   cylaBP(0),
          STCG15Per:    cylaInc(effectiveAY === '2024-25' ? stcg111A : 0),
          ...(effectiveAY !== '2024-25' ? { STCG20Per: cylaInc(stcg111A) } : {}),
          STCG30Per:    cylaInc(0),
          STCGAppRate:  cylaInc(stcgOther),
          STCGDTAARate: cylaInc(0),
          LTCG10Per:    cylaInc(effectiveAY === '2024-25' ? ltcg112A : 0),
          ...(effectiveAY !== '2024-25' ? { LTCG12_5Per: cylaInc(ltcg112A) } : {}),
          LTCG20Per:    cylaInc(0),
          LTCGDTAARate: cylaInc(0),
          OthSrcExclRaceHorseLottery: cylaOS(Math.max(0, osIncome)),
          ProfitFrmRaceHorse:   cylaInc(0),
          IncOSDTAA:            cylaInc(0),
          TotalCurYr: {
            TotHPlossCurYr:              0,
            TotBusLoss:                  0,
            TotOthSrcLossNoRaceHorse:    0,
          },
          TotalLossSetOff: {
            TotHPlossCurYrSetoff:            0,
            TotBusLossSetoff:                0,
            TotOthSrcLossNoRaceHorseSetoff:  0,
          },
          LossRemAftSetOff: {
            BalHPlossCurYrAftSetoff:            0,
            BalBusLossAftSetoff:                0,
            BalOthSrcLossNoRaceHorseAftSetoff:  0,
          },
        },

        // ── ScheduleBFLA ─────────────────────────────────────────────────
        ScheduleBFLA: {
          BFLAEditFlag:        'N',
          HP:                  bflaRow(Math.max(0, hpIncome)),
          BusProfExclSpecProf: bflaRow(Math.max(0, bpIncome)),
          SpeculationIncome:   bflaRow(0),
          SpecifiedBusIncome:  bflaRow(0),
          STCG15Per:    bflaRow(effectiveAY === '2024-25' ? stcg111A : 0),
          ...(effectiveAY !== '2024-25' ? { STCG20Per: bflaRow(stcg111A) } : {}),
          STCG30Per:    bflaRow(0),
          STCGAppRate:  bflaRow(stcgOther),
          STCGDTAARate: bflaRow(0),
          LTCG10Per:    bflaRow(effectiveAY === '2024-25' ? ltcg112A : 0),
          ...(effectiveAY !== '2024-25' ? { LTCG12_5Per: bflaRow(ltcg112A) } : {}),
          LTCG20Per:    bflaRow(0),
          LTCGDTAARate: bflaRow(0),
          OthSrcExclRaceHorse: bflaRowOS(Math.max(0, osIncome)),
          ProfitFrmRaceHorse:  bflaRow(0),
          IncOSDTAA:           bflaRowOS(0),
          TotalBFLossSetOff: {
            TotBFLossSetoff:        0,
            TotUnabsorbedDeprSetoff: 0,
            TotAllUs35cl4Setoff:    0,
          },
          IncomeOfCurrYrAftCYLABFLA: grossTotalIncome,
        },

        // ── ScheduleCFL ───────────────────────────────────────────────────
        ScheduleCFL: {
          TotalOfBFLossesEarlierYrs: { LossSummaryDetail: { TotalHPPTILossCF:0,BusLossOthThanSpecLossCF:0,LossFrmSpecBusCF:0,LossFrmSpecifiedBusCF:0,TotalSTCGPTILossCF:0,TotalLTCGPTILossCF:0,OthSrcLossRaceHorseCF:0 } },
          AdjTotBFLossInBFLA:        { LossSummaryDetail: { TotalHPPTILossCF:0,BusLossOthThanSpecLossCF:0,LossFrmSpecBusCF:0,LossFrmSpecifiedBusCF:0,TotalSTCGPTILossCF:0,TotalLTCGPTILossCF:0,OthSrcLossRaceHorseCF:0 } },
          CurrentAYloss:             { LossSummaryDetail: { TotalHPPTILossCF:0,BusLossOthThanSpecLossCF:0,LossFrmSpecBusCF:0,LossFrmSpecifiedBusCF:0,TotalSTCGPTILossCF:0,TotalLTCGPTILossCF:0,OthSrcLossRaceHorseCF:0 } },
          CurrentYearLossCF:         { LossSummaryDetail: { TotalHPPTILossCF:0,BusLossOthThanSpecLossCF:0,LossFrmSpecBusCF:0,LossFrmSpecifiedBusCF:0,TotalSTCGPTILossCF:0,TotalLTCGPTILossCF:0,OthSrcLossRaceHorseCF:0 } },
          TotalLossCFSummary:        { LossSummaryDetail: { TotalHPPTILossCF:0,BusLossOthThanSpecLossCF:0,LossFrmSpecBusCF:0,LossFrmSpecifiedBusCF:0,TotalSTCGPTILossCF:0,TotalLTCGPTILossCF:0,OthSrcLossRaceHorseCF:0 } },
          CurrentYearDistrUnitHolder: { LossSummaryDetail: { TotalHPPTILossCF:0,TotalSTCGPTILossCF:0,TotalLTCGPTILossCF:0,OthSrcLossRaceHorseCF:0 } },
        },

        // ── PartB-TI ─────────────────────────────────────────────────────
        'PartB-TI': {
          IncomeFromHP: Math.max(0, hpIncome),
          ProfBusGain: {
            ProfGainNoSpecBus:    Math.max(0, bpIncome),
            ProfGainSpecBus:      0,
            ProfGainSpecifiedBus: 0,
            IncChrgblTaxSplRate:  0,
            TotProfBusGain:       Math.max(0, bpIncome),
          },
          CapGain: {
            ShortTerm: effectiveAY === '2024-25' ? {
              ShortTerm15Per:       stcg111A,
              ShortTerm30Per:       0,
              ShortTermAppRate:     stcgOther,
              ShortTermSplRateDTAA: 0,
              TotalShortTerm:       totalSTCG,
            } : {
              ShortTerm15Per:       0,
              ShortTerm20Per:       stcg111A,
              ShortTerm30Per:       0,
              ShortTermAppRate:     stcgOther,
              ShortTermSplRateDTAA: 0,
              TotalShortTerm:       totalSTCG,
            },
            LongTerm: effectiveAY === '2024-25' ? {
              LongTerm10Per:        ltcg112A,
              LongTerm20Per:        0,
              LongTermSplRateDTAA:  0,
              TotalLongTerm:        ltcg112A,
            } : {
              LongTerm10Per:        0,
              LongTerm12_5Per:      ltcg112A,
              LongTerm20Per:        0,
              LongTermSplRateDTAA:  0,
              TotalLongTerm:        ltcg112A,
            },
            ShortTermLongTermTotal: totalCG,
            CapGains30Per115BBH:    0,
            TotalCapGains:          totalCG,
          },
          IncFromOS: {
            OtherSrcThanOwnRaceHorse: Math.max(0, osIncome),
            IncChargblSplRate:        0,
            FromOwnRaceHorse:         0,
            TotIncFromOS:             Math.max(0, osIncome),
          },
          TotalTI:                  grossTotalIncome,
          CurrentYearLoss:          0,
          BalanceAfterSetoffLosses: grossTotalIncome,
          BroughtFwdLossesSetoff:   0,
          GrossTotalIncome:         grossTotalIncome,
          IncChargeTaxSplRate111A112: stcg111A + ltcg112A,
          DeductionsUndSchVIADtl: {
            PartBchapterVIA:  viaDeductions,
            PartCchapterVIA:  0,
            TotDeductUndSchVIA: viaDeductions,
          },
          DeductionsUnder10Aor10AA: 0,
          TotalIncome:               totalIncome,
          IncChargeableTaxSplRates:  stcg111A + ltcg112A,
          NetAgricultureIncomeOrOtherIncomeForRate: 0,
          AggregateIncome:           totalIncome,
          LossesOfCurrentYearCarriedFwd: 0,
          DeemedTotIncSec115JC:          deemedIncome115JC,
        },

        // ── PartB_TTI ─────────────────────────────────────────────────────
        PartB_TTI: {
          ComputationOfTaxLiability: {
            TaxPayableOnDeemedTI: (() => {
              const sc  = amtApplies ? amtSurcharge : 0;
              const ces = amtApplies ? amtCess      : 0;
              return {
                TaxDeemedTISec115JC: taxDeemed115JC,
                Surcharge:           sc,
                EducationCess:       ces,
                TotalTax:            taxDeemed115JC + sc + ces,
              };
            })(),
            TaxPayableOnTI: {
              TaxAtNormalRates:                 taxOnNormal,
              TaxAtSpecialRates:                taxOnSTCG111A + taxOnLTCG112A,
              RebateOnAgriInc:                  0,
              TaxPayableOnTotInc:               taxPayableOnTI,
              Surcharge25ofSI:                  surchargeOnCG,
              SurchargeOnTaxPayable:            surchargeOnNormal,
              Surcharge25ofSIBeforeMarginal:    surchargeOnCG,
              SurchargeOnTaxPayableBeforeMarginal: surchargeOnNormal,
              TotalSurcharge:                   surcharge,
              EducationCess:                    cess,
              GrossTaxLiability:                grossTaxLiab,
            },
            GrossTaxPayable:   grossTaxLiab,
            CreditUS115JD:     0,
            TaxPaidUnderCredit: grossTaxLiab,
            TaxRelief: {
              Section90:    0,
              Section91:    0,
              TotTaxRelief: 0,
            },
            NetTaxLiability: grossTaxLiab,
            IntrstPay: {
              IntrstPayUs234A:  int234A,
              IntrstPayUs234B:  int234B,
              IntrstPayUs234C:  int234C,
              LateFilingFee234F: int234F,
              TotalIntrstPay:   totalInterest,
            },
            AggregateTaxInterestLiability: r10(grossTaxLiab + totalInterest),
          },
          TaxPaid: {
            TaxesPaid: {
              AdvanceTax:        advTax,
              TDS:               tdsOther,
              TCS:               tcs,
              SelfAssessmentTax: satTax,
              TotalTaxesPaid:    totalTaxPaid,
            },
            BalTaxPayable:       netTaxLiab,
            NetTaxPayable115TD:  0,
            TaxPayable115TD:     0,
            NetRefundAdjust:     0,
          },
          Refund: {
            RefundDue: refund,
            BankAccountDtls: buildBankAccountDtls(primaryBank, 'AddtnlBankDetails'),
          },
          AssetOutsideIndiaFlg: 'NO',
        },

        // ── ScheduleTDS2 (TDS on income other than salary) ───────────────
        ...(rd.tds?.TDSOnOtherIncome?.length ? {
          ScheduleTDS2: buildTDSOnOtherIncome(rd.tds),
        } : {}),

        // ── ScheduleTDS3 (TDS u/s 194IB rent) ────────────────────────────
        ...(rd.tds?.TDSOnRent16C?.length ? {
          ScheduleTDS3: buildTDS16C(rd.tds),
        } : {}),

        // ── ScheduleIT (advance tax challans) ────────────────────────────
        ...(rd.taxPayments?.AdvanceTaxPayments?.length ? {
          ScheduleIT: buildTaxPayments(rd.taxPayments),
        } : {}),

        // ── Verification ─────────────────────────────────────────────────
        // Always include — omitting it causes the portal to spin silently with no error
        Verification: buildVerification(rd.verification ?? {} as any, date, client.pan, 'ITR5'),

        // ── ManufacturingAccount ──────────────────────────────────────────
        ManufacturingAccount: {
          OpeningInventory: { OpngInvntryTotal:0,DirectExpenses:0,TotalFactoryOverheads:0,TotalDebtsManfctrngAcc:0 },
          ClosingStock:     { ClsngStckTotal:0 },
          CostOfGoodsPrdcd: 0,
        },

        // ── TradingAccount ───────────────────────────────────────────────
        TradingAccount: {
          OperatingRevenueTotal:    0,
          SalesGrossReceiptsTotal:  0,
          GrossRcptFromProfession:  0,
          ExciseCustomsVAT:         { UnionExciseDuty:0,ServiceTax:0,VATorSaleTax:0,CentralGoodServiceTax:0,StateGoodServiceTax:0,IntegratedGoodServiceTax:0,UnionTerrGoodServiceTax:0,OthDutyTaxCess:0,TotExciseCustomsVAT:0 },
          TotRevenueFrmOperations:  0,
          ClsngStckOfFinishedStcks: 0,
          TardingAccTotCred:        0,
          OpngStckOfFinishedStcks:  0,
          Purchases:                0,
          DirectExpenses:           0,
          CarriageInward:           0,
          PowerAndFuel:             0,
          DirectExpensesTotal:      0,
          DutyTaxPay:               { ExciseCustomsVAT: { TotExciseCustomsVAT:0 } },
          GoodsCostPrdcdFrmMA:      0,
          GrossProfitFrmBusProf:    0,
        },

        // ── PARTA_OI ─────────────────────────────────────────────────────
        PARTA_OI: {
          MethodOfAcct:     'MERC',
          ChangeInAcctMethFlg: 'N',
          ProfDeviatDueAcctMeth: 0,
          DecProOrIncLossUs145_2: 0,
          MethodOfValClgStk:  { ValRawMaterial:'1',ValFinishedGoods:'1',ChngStockValMetFlg:'N',EffectOnPL:0,DecProOrIncLossUs145_A:0 },
          NoCredToPLAmt:      { Section28Items:0,ProformaCreditsDue:0,PrevYrEscalClaim:0,OthItemInc:0,CapReceipt:0,TotNoCredToPLAmt:0 },
          AmtDisallUs36:      { StkInsurPrem:0,EmpHealthInsurPrem:0,EmpBonusCommSum:0,IntOnBorrCap:0,ZeroCoupBondDisc:0,RecogPFContribAmt:0,AppSuperAnnFundAmt:0,PensionSchemeSec80CCD:0,AppGratFundAmt:0,OthFundAmt:0,EmpContributionCredits:0,BadDebtDoubtAmt:0,BadDebtDoubtProvn:0,SpecResrvTranfr:0,FamPlanPromoExp:0,SecuritiesPaidAmt:0,MrktLossOthExpLossICDS:0,ExpGovtApprovedSugarPrice:0,AnyOthDisallowance:0,TotAmtDisallUs36:0,NoOfEmployeesEmployed:{DeployedInIndia:0,DeployedOutSideIndia:0,Total:0} },
          AmtDisallUs37:      { CapitalNatureExp:0,PersonalExp:0,BusOrProfessnExp:0,PoliticPartyExp:0,LawVoilatPenalExp:0,OthPenalFineExp:0,OffenceExp:0,ContigentLiability:0,OthAmtNotAllowUs37:0,TotAmtDisallUs37:0 },
          AmtDisallUs40:      { NonCompChapXVIIBAmt:0,NonComp40aiiChapXVIIBAmt:0,NonComp40aibChapXVIIBAmt:0,NonComp40aiiiChapXVIIBAmt:0,TaxAmtOnProfits:0,WTAmt:0,RolyatyOrServiceFee:0,IntSalBonPartner:0,AnyOthDisallowance:0,TotAmtDisallUs40:0,AnyAmtOfSec40AllowPrevYr:0 },
          AmtDisallUs40A:     { AmtPaidUs40A2b:0,AmtGT20kCash:0,ProvPmtGrat:0,ContToSetupTrust:0,AnyOthDisallowance:0,TotAmtDisallUs40A:0 },
          AmtDisallUs43BPyNowAll: { AmtUs43B:{ TaxDutyCesAmt:0,ContToEmpPFSFGF:0,EmpBonusComm:0,IntPayaleToFI:0,SumPayaleLoanBrToFinComp:0,IntPayaleToFISchBank:0,LeaveEncashPayable:0,TotAmtUs43b:0,RailwayAsstsPyble:0,MSEPayable:0 } },
          AmtDisall43B:       { AmtUs43B:{ TaxDutyCesAmt:0,ContToEmpPFSFGF:0,EmpBonusComm:0,IntPayaleToFI:0,SumPayaleLoanBrToFinComp:0,IntPayaleToFISchBank:0,LeaveEncashPayable:0,RailwayAsstsPyble:0,MSEPayable:0,TotAmtUs43b:0 } },
          AmtExciseCustomsVATOutstanding: { ExciseCustomsVAT:{ UnionExciseDuty:0,ServiceTax:0,VATorSaleTax:0,CentralGoodServiceTax:0,StateGoodServiceTax:0,IntegratedGoodServiceTax:0,UnionTerrGoodServiceTax:0,OthDutyTaxCess:0,TotExciseCustomsVAT:0 } },
          DeemedProfUs33ABs:  0,
          DeemedProfUs33AB:   0,
          DeemedProfUs33ABA:  0,
          DeemedProfUs33AC:   0,
          ProfTaxAmtUs41:     0,
          PriorAmtIncCrDrPL:  0,
          AmountOfExpDisAllwUs14A: 0,
          ScheduleTPSAFlg:    'N',
        },

        // ── ScheduleDPM ──────────────────────────────────────────────────
        ScheduleDPM: {
          PlantMachinery: {
            Rate15: { DepreciationDetail: { WDVFirstDay:0,AdjustmentSec115BAC:0,Total:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,AddlnDeprOnGT180DayAdditions:0,AddlnDeprDuringYearAdditions:0,AddlnDeprOnLessThan180DayAdditions:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } },
            Rate30: { DepreciationDetail: { WDVFirstDay:0,AdjustmentSec115BAC:0,Total:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,AddlnDeprOnGT180DayAdditions:0,AddlnDeprDuringYearAdditions:0,AddlnDeprOnLessThan180DayAdditions:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } },
            Rate40: { DepreciationDetail: { WDVFirstDay:0,AdjustmentSec115BAC:0,Total:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,AddlnDeprOnGT180DayAdditions:0,AddlnDeprDuringYearAdditions:0,AddlnDeprOnLessThan180DayAdditions:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } },
            Rate45: { DepreciationDetail: { WDVFirstDay:0,AdjustmentSec115BAC:0,Total:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,DepreciationAtFullRate:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } },
          },
        },

        // ── ScheduleDOA ──────────────────────────────────────────────────
        ScheduleDOA: {
          Land: { DepreciationDetail: { WDVFirstDay:0,WDVLastDay:0 } },
          Building: {
            Rate5:  { DepreciationDetail: { WDVFirstDay:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } },
            Rate10: { DepreciationDetail: { WDVFirstDay:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } },
            Rate40: { DepreciationDetail: { WDVFirstDay:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } },
          },
          FurnitureFittings: { Rate10: { DepreciationDetail: { WDVFirstDay:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } } },
          IntangibleAssets: { Rate25: { DepreciationDetail: { WDVFirstDay:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } } },
          Ships: { Rate20: { DepreciationDetail: { WDVFirstDay:0,AdditionsGrThan180Days:0,RealizationTotalPeriod:0,FullRateDeprAmt:0,AdditionsLessThan180Days:0,RealizationPeriodDuringYear:0,HalfRateDeprAmt:0,DepreciationAtFullRate:0,DepreciationAtHalfRate:0,TotalDepreciation:0,DepDisAllowUs38_2:0,NetAggregateDepreciation:0,ProportionateAggDepreciation:0,ExpdrOnTrforSaleAsset:0,CapGainUs50:0,WDVLastDay:0 } } },
        },

        // ── ScheduleDEP ──────────────────────────────────────────────────
        ScheduleDEP: {
          SummaryFromDeprSch: {
            PlantMachinerySummary: { DeprBlockTot15Percent:0,DeprBlockTot30Percent:0,DeprBlockTot40Percent:0,DeprBlockTot45Percent:0,TotPlntMach:0 },
            BuildingSummary:       { DeprBlockTot5Percent:0,DeprBlockTot10Percent:0,DeprBlockTot40Percent:0,TotBuildng:0 },
            FurnitureSummary:      0,
            IntangibleAssetSummary: 0,
            ShipsSummary:          0,
            TotalDepreciation:     0,
          },
        },

        // ── ScheduleDCG ──────────────────────────────────────────────────
        ScheduleDCG: {
          SummaryFromDeprSchCG: {
            PlantMachinerySummaryCG: { DeprBlockTot15Percent:0,DeprBlockTot30Percent:0,DeprBlockTot40Percent:0,DeprBlockTot45Percent:0,TotPlntMach:0 },
            BuildingSummaryCG:       { DeprBlockTot5Percent:0,DeprBlockTot10Percent:0,DeprBlockTot40Percent:0,TotBuildng:0 },
            FurnitureSummary:        0,
            IntangibleAssetSummary:  0,
            ShipsSummary:            0,
            TotalDepreciation:       0,
          },
        },

        // ── ScheduleESR ──────────────────────────────────────────────────
        ScheduleESR: {
          DeductionUs35: {
            Section35_1_i:   { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            Section35_1_ii:  { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            Section35_1_iia: { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            Section35_1_iii: { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            Section35_1_iv:  { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            Section35_2AA:   { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            Section35_2AB:   { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            Section35_CCC:   { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            Section35_CCD:   { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
            TotUs35:         { DeductUs35:{ AmtDebPL:0,AmtUs35Allowable:0,ExcessAmtOverDebPL:0 } },
          },
        },

        // ── ScheduleICDS ─────────────────────────────────────────────────
        ScheduleICDS: {
          TotalNetAmtDetl: { IncreaseInProfit:0, DecreaseInProfit:0 },
        },

        // ── Schedule80_IA ────────────────────────────────────────────────
        Schedule80_IA: {
          Sch80SectionCode: '80-IA',
          DeductUs80_IA_4_i:   { Sch80LocOrDescCode:'INFRAFAC',  Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
          DeductUs80_IA_4_iv:  { Sch80LocOrDescCode:'POWER',     Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
          TotSchedule80_IA:    0,
        },

        // ── Schedule80_IB ────────────────────────────────────────────────
        Schedule80_IB: {
          Sch80SectionCode: '80-IB',
          DeductJKLocUs80_IB_4_Und:     { Sch80LocOrDescCode:'INDSRTL_JK',       Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
          DeductMinOilUs80_IB_9_Und:    { Sch80LocOrDescCode:'COMM_PROD',         Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
          DeductHousUs80_IB_10_Und:     { Sch80LocOrDescCode:'HOUSING_PROJECT',   Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
          DeductFruitVegUs80_IB_11A_Und: { Sch80LocOrDescCode:'FRIUTS_VEGTBLE',  Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
          DeductFoodGrainUs80_IB_11A_Und: { Sch80LocOrDescCode:'STOR_TRANS',     Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
          TotSchedule80_IB:             0,
        },

        // ── Schedule80_IC ────────────────────────────────────────────────
        Schedule80_IC: {
          Sch80SectionCode: '80-IC_IE',
          DeductInNorthEast: {
            Sikkim_Und:            { Sch80LocOrDescCode:'INDSRTL_SIKKIM',         Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
            Assam_Und:             { Sch80LocOrDescCode:'INDSRTL_ASSAM',         Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
            ArunachalPradesh_Und:  { Sch80LocOrDescCode:'INDSRTL_ARUNPRADESH',   Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
            Manipur_Und:           { Sch80LocOrDescCode:'INDSRTL_MANIPUR',       Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
            Mizoram_Und:           { Sch80LocOrDescCode:'INDSRTL_MIZORAM',       Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
            Meghalaya_Und:         { Sch80LocOrDescCode:'INDSRTL_MEGHALAYA',     Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
            Nagaland_Und:          { Sch80LocOrDescCode:'INDSRTL_NAGALND',       Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
            Tripura_Und:           { Sch80LocOrDescCode:'INDSRTL_TRIPURA',       Sch80DeductAmtDtls:[{ DeductAmountSec80:0 }] },
            TotDeductInNorthEast:  0,
          },
          TotSchedule80_IC: 0,
        },

        // ── Schedule80GGC ────────────────────────────────────────────────
        Schedule80GGC: {
          Schedule80GGCDetails:           [],
          TotalDonationAmtCash80GGC:      0,
          TotalDonationAmtOtherMode80GGC: 0,
          TotalDonationsUs80GGC:          0,
          TotalEligibleDonationAmt80GGC:  0,
        },

        // ── ScheduleAMT ──────────────────────────────────────────────────
        // Sl.1 = total income; Sl.2 = VIA add-backs; Sl.3 = Sl.1 + Sl.2
        // Sl.3b = Sl.3 − Sl.3a; must mirror PartB-TI.DeemedTotIncSec115JC
        ScheduleAMT: (() => {
          // For 139(8A) updated returns, portal cross-checks TotalIncItem13 against
          // PartB-ATI.LatestTotInc (the original return's income, = 0 when no prior return).
          // Using updatedIncome here causes errors 1-4 even in the CBDT official utility.
          const amtBaseIncome = upd ? 0 : totalIncome;
          const amtAddback    = upd ? 0 : viaDeductions;
          const amtAdjIncome  = amtBaseIncome + amtAddback;
          const amtTaxAmt     = upd ? 0 : (amtApplies ? amtOnTI : 0);
          return {
            TotalIncItem13:              amtBaseIncome,
            AdjustmentSec115JC:         [{ DeductClaimSec6A: amtAddback, DeductClaimSec10AA: 0, DeductClaimSec35AD: 0, Total: amtAddback }],
            AdjustedUnderSec115JC:      amtAdjIncome,
            AdjustedUnderSec115JCIFSC:  0,
            AdjustedUnderSec115JCOther: amtAdjIncome,
            TaxPayableUnderSec115JC:    amtTaxAmt,
          };
        })(),

        // ── ScheduleVIA ───────────────────────────────────────────────────
        ScheduleVIA: (() => {
          const usrRow = buildUsrDeductions(rd.deductions);
          const capped = rd.deductions ? applyDeductionCaps(rd.deductions, totalIncome) : usrRow;
          const toVIA = (r: any) => ({
            Section80G: toI(r.Section80G), Section80GGA: toI(r.Section80GGA), Section80GGC: toI(r.Section80GGC),
            TotPartBchapterVIA: toI(r.Section80G) + toI(r.Section80GGA) + toI(r.Section80GGC),
            Section80IA: toI(r.Section80IA), Section80IAB: 0, Section80IAC: 0,
            Section80IB: toI(r.Section80IB), Section80IBA: 0, Section80IC: toI(r.Section80IC),
            Section80JJA: toI(r.Section80JJA), Section80JJAA: toI(r.Section80JJAA),
            Section80LA: 0, Section80LA_1A: 0, Section80P: toI(r.Section80P),
            TotPartCchapterVIA: toI(r.Section80IA)+toI(r.Section80IB)+toI(r.Section80IC)+toI(r.Section80JJA)+toI(r.Section80JJAA)+toI(r.Section80P),
            TotalChapVIADeductions: toI(r.TotalChapVIADeductions),
          });
          return { UsrDeductUndChapVIA: toVIA(usrRow), DeductUndChapVIA: toVIA(capped) };
        })(),

        // ── ScheduleAMTC ─────────────────────────────────────────────────
        ScheduleAMTC: (() => {
          const [ayStartStr] = (effectiveAY ?? '2024-25').split('-');
          const ayStart = parseInt(ayStartStr, 10);
          const amtcYears: any[] = [];
          for (let y = ayStart - 12; y < ayStart; y++) {
            amtcYears.push({
              AssYr: `${y}-${String(y + 1).slice(-2)}`,
              AmtCreditFwd: 0, AmtCreditSetOfEy: 0, AmtCreditBalBroughtFwd: 0,
              AmtCreditUtilized: 0, BalAmtCreditCarryFwd: 0,
            });
          }
          const amtcTax115JC = amtApplies ? amtLiability : 0;
          return {
            TaxSection115JC: amtcTax115JC,
            TaxOthProvisions: regularTaxLiab,
            AmtTaxCreditAvailable: regularTaxLiab - amtcTax115JC,
            ScheduleAMTCDtls: amtcYears,
            CurrAssYr: effectiveAY ?? '2024-25',
            CurrYrAmtCreditFwd: 0, CurrYrCreditBalBF: 0, CurrYrCreditCarryFwd: 0,
            TotAMTGross: 0, TotSetOffEys: 0, TotBalBF: 0, TotAmtCreditUtilisedCY: 0, TotBalAMTCreditCF: 0,
            TaxSection115JD: 0, AmtLiabilityAvailable: 0,
          };
        })(),

        // ── ScheduleSI (Special Income rates — always present) ────────────
        ScheduleSI: {
          SplCodeRateTax: [
            { SecCode: '1A',          SplRatePercent: 15, SplRateInc: stcg111A,        SplRateIncTax: taxOnSTCG111A },
            { SecCode: '21',          SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '22',          SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '21ciii',      SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '2A',          SplRatePercent: 10, SplRateInc: ltcg112A,        SplRateIncTax: taxOnLTCG112A },
            { SecCode: '5A1ai',       SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1aA',       SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1aii',      SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1aiia',     SplRatePercent: 5,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1aiiaa',    SplRatePercent: 5,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1aiiab',    SplRatePercent: 5,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1aiiac',    SplRatePercent: 5,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1aiii',     SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1bA',       SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AC1ab',      SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AC1c',       SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BB',         SplRatePercent: 30, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBJ',        SplRatePercent: 30, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5ADii',       SplRatePercent: 30, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBF_BP',     SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBG_BP',     SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBH_BP',     SplRatePercent: 30, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5ADiiiP',     SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'DTAASTCG',    SplRatePercent: 1,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'DTAALTCG',    SplRatePercent: 1,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'DTAAOS',      SplRatePercent: 1,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AD1biip',    SplRatePercent: 15, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AD1i',       SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AD1iP',      SplRatePercent: 5,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5ADiii',      SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBA',        SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBE',        SplRatePercent: 60, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBF',        SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBG',        SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5BBH',        SplRatePercent: 30, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AB1a',       SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AB1b',       SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5Ea',         SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_STCG15P', SplRatePercent: 15, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_STCG30P', SplRatePercent: 30, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_LTCG10P', SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_LTCG10P112A', SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_LTCG20P', SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1ai',   SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1aA',   SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1aii',  SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1aiia', SplRatePercent: 5,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1aiiaa', SplRatePercent: 5, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1aiiab', SplRatePercent: 5, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1aiiac', SplRatePercent: 5, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1aiii', SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1bA',   SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5AB1a',   SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5AC1ab',  SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5AD1i',   SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5AD1iP',  SplRatePercent: 5,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5BBA',    SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5BBF',    SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5BBG',    SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5Ea',     SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5A1aiiaaP',   SplRatePercent: 4,  SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5A1aiiaaP', SplRatePercent: 4, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AD1iDiv',    SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5AD1iDiv', SplRatePercent: 20, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AD1IBd',     SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AD1IB',      SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5AD1IBd', SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5AD1IB',  SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: '5AC1abD',     SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
            { SecCode: 'PTI_5AC1abD', SplRatePercent: 10, SplRateInc: 0, SplRateIncTax: 0 },
          ],
          TotSplRateInc:    stcg111A + ltcg112A,
          TotSplRateIncTax: taxOnSTCG111A + taxOnLTCG112A,
        },

        // ── ScheduleTPSA ─────────────────────────────────────────────────
        ScheduleTPSA: {
          AmtPrimaryAdjUs92CE_2A: 0, AdditionalIncTax18PercAbove: 0, Surcharge12Perc: 0,
          HealthEducationCess: 0, TotalAdditionalTax: 0, TaxesPaid: 0, NetTaxPayable: 0, TotalAmountDeposited: 0,
        },

        // ── ScheduleTR1 ──────────────────────────────────────────────────
        ScheduleTR1: {
          ScheduleTR: [], TotalTaxOutsideIndia: 0, TotalTaxReliefOutsideIndia: 0,
          TaxReliefOutsideIndiaDTAA: 0, TaxReliefOutsideIndiaNotDTAA: 0,
        },

        // ── ScheduleFA ───────────────────────────────────────────────────
        ScheduleFA: {},

        // ── ScheduleTCS ──────────────────────────────────────────────────
        ScheduleTCS: { TotalSchTCS: 0 },

        // ── Schedule115TD ────────────────────────────────────────────────
        Schedule115TD: {
          NetValAsst: 0, FMVTotal: 0, AccretedIncomeSection115TD: 0,
          AddIncPay115TDMarginalRate: 0, InterestPayable115TE: 0, AddIncIntstPayb: 0,
          TaxIntstPaid: 0, NetPaybleRefble: 0, DepositofTaxAccInc: {},
        },
      },
    },
  };
}

// CBDT offline utility HMAC-SHA256 signing key (extracted from ITR5 AY 2025-26 V1.9 VBA)
// Key rotated from RoduFpNqMzQlWO9Q (AY 2024-25) to LO3QtH59fGuVaETa (AY 2025-26 V1.9)
const ITR5_HMAC_KEY = Buffer.from('LO3QtH59fGuVaETa', 'latin1');
const ITR5_HMAC_ITERS = 1978;

export function signITR5Json(itrObj: any): any {
  const inner = itrObj?.ITR?.ITR5;
  if (!inner?.CreationInfo) return itrObj;

  // Compact JSON with Digest:"-" — remove escaped \n sequences as CBDT VBA does
  const compact = JSON.stringify(itrObj).replace(/\\n/g, '');

  // Iterated HMAC-SHA256: 1 initial + 1978 more = 1979 total (matches HMACSHA256A in VBA V1.9)
  let h = createHmac('sha256', ITR5_HMAC_KEY)
    .update(Buffer.from(compact, 'latin1'))
    .digest();
  for (let i = 0; i < ITR5_HMAC_ITERS; i++) {
    h = createHmac('sha256', ITR5_HMAC_KEY).update(h).digest();
  }
  const digest = h.toString('base64');

  return {
    ...itrObj,
    ITR: {
      ...itrObj.ITR,
      ITR5: { ...inner, CreationInfo: { ...inner.CreationInfo, Digest: digest } },
    },
  };
}

function reorderITR5Keys(result: any): any {
  const itr5 = result?.ITR?.ITR5;
  if (!itr5) return result;
  const keyOrder = [
    'CreationInfo', 'Form_ITR5', 'PartA_GEN1', 'PartA_139_8A', 'PartB-ATI',
    'PartA_GEN2', 'PARTA_BS', 'PARTA_PL', 'CorpScheduleBP',
    'PartB-TI', 'PartB_TTI', 'Verification',
    'ManufacturingAccount', 'TradingAccount', 'PARTA_OI',
    'ScheduleHP', 'ScheduleDPM', 'ScheduleDOA', 'ScheduleDEP', 'ScheduleDCG',
    'ScheduleESR', 'ScheduleCG', 'ScheduleOS',
    'ScheduleCYLA', 'ScheduleBFLA', 'ScheduleCFL',
    'ScheduleICDS', 'Schedule80_IA', 'Schedule80_IB', 'Schedule80_IC', 'Schedule80GGC',
    'ScheduleAMT', 'ScheduleVIA', 'ScheduleAMTC', 'ScheduleSI',
    'ScheduleTPSA', 'ScheduleTR1', 'ScheduleFA', 'ScheduleTCS', 'Schedule115TD',
  ];
  const ordered: any = {};
  for (const key of keyOrder) {
    if (key in itr5) ordered[key] = itr5[key];
  }
  for (const key of Object.keys(itr5)) {
    if (!(key in ordered)) ordered[key] = itr5[key];
  }
  return { ITR: { ...result.ITR, ITR5: ordered } };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN BUILDER — ITR-3 (Individuals/HUF with business/profession income)
// AY 2026-27 — schema ITR-3_2026_Main.json
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildITR3(input: BuildITRInput): object {
  const { returnData: rd, client, sw, filingDate } = input;
  const date = filingDate ?? today();
  const ay = rd.assessmentYear ?? '2026-27';
  const cfg = getAYConfig(ay);
  const summary = computeIncomeSummary(rd);
  const capped = rd.deductions
    ? applyDeductionCaps(rd.deductions, summary.GrossTotalIncome)
    : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);
  const taxComp = computeTaxLiability(summary, rd.regime, ay);

  // ── Capital gains ─────────────────────────────────────────────────────────
  const ltcg112ATotal = toInt(rd.ltcg112A?.TaxableLTCG112A ?? 0);
  const ltcg112AEntries = rd.ltcg112A?.Entries ?? [];
  const stcg111ATotal = toInt(rd.stcg?.TotalSTCG111A ?? 0);
  const stcgOtherTotal = toInt(rd.stcg?.TotalSTCGOther ?? 0);
  const totalCG = ltcg112ATotal + stcg111ATotal + stcgOtherTotal;

  // ── Income totals ─────────────────────────────────────────────────────────
  const salIncome = toInt(summary.IncomeFromSalary);
  const hpIncome  = toInt(summary.IncomeFromHP);
  const osIncome  = toInt(summary.IncomeFromOtherSources);
  const bpIncome  = 0;   // regular business income — zero for salary+OS only case
  const grossTotalIncome = toInt(summary.GrossTotalIncome) + totalCG;
  const totalIncome = Math.max(0, grossTotalIncome - capped.TotalChapVIADeductions);

  // ── TDS / tax paid ────────────────────────────────────────────────────────
  const tdsSalary  = toInt(rd.tds?.TotalTDSOnSalaries);
  const tdsOther   = toInt(rd.tds?.TotalTDSOnOtherIncome);
  const tdsRent    = toInt(rd.tds?.TotalTDSOnRent);
  const tcs        = toInt(rd.tds?.TotalTCS);
  const advTax     = toInt(rd.taxPayments?.TotalAdvanceTax);
  const satTax     = toInt(rd.taxPayments?.TotalSelfAssessmentTax);
  const totalTaxPaid = tdsSalary + tdsOther + tdsRent + tcs + advTax + satTax;

  taxComp.TotalTaxesPaid = totalTaxPaid;
  const netTaxLiability  = toInt(taxComp.GrossTaxLiability);
  const balPayable       = Math.max(0, netTaxLiability - totalTaxPaid);
  const refund           = totalTaxPaid > netTaxLiability ? totalTaxPaid - netTaxLiability : 0;

  // ── ScheduleCYLA helpers ───────────────────────────────────────────────────
  const hpLossSetOff   = hpIncome < 0 ? Math.min(Math.abs(hpIncome), 200_000) : 0;
  const salAfterSetOff = Math.max(0, salIncome - hpLossSetOff);
  const hpAfterSetOff  = Math.max(0, hpIncome);

  const cylaInc3 = (n: number) => ({
    IncCYLA: {
      IncOfCurYrUnderThatHead:     Math.max(0, n),
      HPlossCurYrSetoff:           0,
      OthSrcLossNoRaceHorseSetoff: 0,
      IncOfCurYrAfterSetOff:       Math.max(0, n),
    },
  });
  const cylaBus = (n: number) => ({
    IncCYLA: {
      IncOfCurYrUnderThatHead:     Math.max(0, n),
      HPlossCurYrSetoff:           0,
      OthSrcLossNoRaceHorseSetoff: 0,
      IncOfCurYrAfterSetOff:       Math.max(0, n),
    },
  });

  // ── ScheduleBFLA helpers ───────────────────────────────────────────────────
  const bflaRowSal = (n: number) => ({
    IncBFLA: {
      IncOfCurYrUndHeadFromCYLA:  Math.max(0, n),
      IncOfCurYrAfterSetOffBFLosses: Math.max(0, n),
    },
  });
  const bflaRow3 = (n: number) => ({
    IncBFLA: {
      IncOfCurYrUndHeadFromCYLA:     Math.max(0, n),
      BFlossPrevYrUndSameHeadSetoff: 0,
      BFUnabsorbedDeprSetoff:        0,
      BFAllUs35Cl4Setoff:            0,
      IncOfCurYrAfterSetOffBFLosses: Math.max(0, n),
    },
  });

  // ── ItrFilingDueDate: ITR-3 schema enum is 2026-08-31/2026-10-31/2026-11-30 ──
  // Normal individual non-audit due date: 2026-08-31 (extended by CBDT for AY 26-27)
  const itrFilingDueDate = '2026-08-31';

  // ── DateRange zero helper (used in ScheduleOS — DateRangeTypeOS format) ─────
  // ITR-3 uses Up16Of6To15Of9 (not Upto15Of9) per DateRangeTypeOS definition
  const zeroDateRange = () => ({
    DateRange: { Upto15Of6: 0, Up16Of6To15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 },
  });

  // ── Personal info (ITR-3 uses the itr2=true layout: SurNameOrOrgName, no EmployerCategory) ──
  const personalInfo = buildPersonalInfo(client, { itr2: true });

  return {
    ITR: {
      ITR3: {
        // ── CreationInfo ──────────────────────────────────────────────────
        CreationInfo: {
          SWVersionNo:      sw.SWVersionNo,
          SWCreatedBy:      sw.SWCreatedBy,
          JSONCreatedBy:    sw.JSONCreatedBy,
          JSONCreationDate: date,
          IntermediaryCity: sw.IntermediaryCity,
          Digest: '-',
        },

        // ── Form_ITR3 ─────────────────────────────────────────────────────
        Form_ITR3: {
          FormName:       'ITR-3',
          Description:    'For individuals and HUFs having income from business or profession',
          AssessmentYear: ayToYear(rd.assessmentYear),
          SchemaVer:      'Ver1.0',
          FormVer:        'Ver1.0',
        },

        // ── PartA_GEN1 ────────────────────────────────────────────────────
        PartA_GEN1: {
          PersonalInfo: personalInfo,
          FilingStatus: {
            ReturnFileSec:            rd.filingSection,
            IncFrmBusOrProf:          'Y',
            SeventhProvisio139:       'N',
            ResidentialStatus:        (client.residentialStatus ?? 'RES') === 'RNR' ? 'NOR' : (client.residentialStatus ?? 'RES'),
            HeldUnlistedEqShrPrYrFlg: 'N',
            ForeignExchangeFlag:      'N',
            FiiFpiFlag:               'N',
            ItrFilingDueDate:         itrFilingDueDate,
            // Regime-related 10IEA fields (business income case)
            ...(rd.regime === 'OLD' ? { F10IEACurrAYOldRegime: 'N' } : { F10IEACurrAYNewRegime: 'N' }),
          },
        },

        // ── PartA_GEN2 ────────────────────────────────────────────────────
        PartA_GEN2: {
          AuditInfo: {
            LiableSec44AAflg: 'N',
            IncDclrdUs:       'N',
            LiableSec44ABflg: 'N',
            LiableSec92Eflg:  'N',
            AccountAuditFlag: 'N',
          },
        },

        // ── PARTA_BS (Balance Sheet — zero/minimal for salary+OS case) ────
        PARTA_BS: {
          FundSrc: {
            PropFund: {
              PropCap:  0,
              ResrNSurp: { RevResr: 0, CapResr: 0, StatResr: 0, OthResr: 0, TotResrNSurp: 0 },
              TotPropFund: 0,
            },
            LoanFunds: {
              SecrLoan: {
                ForeignCurrLoan: 0,
                RupeeLoan: { FrmBank: 0, FrmOthrs: 0, TotRupeeLoan: 0 },
                TotSecrLoan: 0,
              },
              UnsecrLoan: { FrmBank: 0, FrmOthrs: 0, TotUnSecrLoan: 0 },
              TotLoanFund: 0,
            },
            DeferredTax: 0,
            Advances:    { TotalAdvances: 0 },
            TotFundSrc:  0,
          },
          FundApply: {
            FixedAsset: { GrossBlock: 0, Depreciation: 0, NetBlock: 0, CapWrkProg: 0, TotFixedAsset: 0 },
            Investments: {
              LongTermInv: { GovtOthSecQuoted: 0, GovOthSecUnQoted: 0, TotLongTermInv: 0 },
              TradeInv:    { EquityShares: 0, PreferShares: 0, Debenture: 0, TotTradeInv: 0 },
              TotInvestments: 0,
            },
            CurrAssetLoanAdv: {
              CurrAsset: {
                Inventories:  { StoresConsumables: 0, RawMatl: 0, StkInProcess: 0, FinOrTradGood: 0, TotInventries: 0 },
                SndryDebtors: 0,
                CashOrBankBal: { CashinHand: 0, BankBal: 0, TotCashOrBankBal: 0 },
                OthCurrAsset: 0,
                TotCurrAsset: 0,
              },
              LoanAdv:   { AdvRecoverable: 0, Deposits: 0, BalWithRevAuth: 0, TotLoanAdv: 0 },
              TotCurrAssetLoanAdv: 0,
              CurrLiabilitiesProv: {
                CurrLiabilities: { SundryCred: 0, LiabForLeasedAsset: 0, AccrIntonLeasedAsset: 0, AccrIntNotDue: 0, TotCurrLiabilities: 0 },
                Provisions:      { ITProvision: 0, ELSuperAnnGratProvision: 0, OthProvision: 0, TotProvisions: 0 },
                TotCurrLiabilitiesProvision: 0,
              },
              NetCurrAsset: 0,
            },
            MiscAdjust:  { MiscExpndr: 0, DefTaxAsset: 0, AccumaltedLosses: 0, TotMiscAdjust: 0 },
            TotFundApply: 0,
          },
        },

        // ── PARTA_PL (P&L — zero for salary+OS case) ─────────────────────
        PARTA_PL: {
          CreditsToPL: {
            GrossProfitTrnsfFrmTrdAcc: 0,
            OthIncome: {
              RentInc:                     0,
              Comissions:                  0,
              Dividends:                   0,
              InterestInc:                 0,
              ProfitOnSaleFixedAsset:      0,
              ProfitOnInvChrSTT:           0,
              ProfitOnOthInv:              0,
              ProfitOnCurrFluct:           0,
              ProfitOnCnvInvntryToCapAsst: 0,
              ProfitOnAgriIncome:          0,
              MiscOthIncome:               0,
              TotOthIncome:                0,
            },
            TotCreditsToPL: 0,
          },
          DebitsToPL: {
            Freight:           0, ConsumptionOfStores: 0, PowerFuel:    0,
            RentExpdr:         0, RepairsBldg:         0, RepairMach:   0,
            EmployeeComp: {
              SalsWages: 0, Bonus: 0, MedExpReimb: 0, LeaveEncash: 0,
              LeaveTravelBenft: 0, ContToSuperAnnFund: 0, ContToPF: 0,
              ContToGratFund: 0, ContToOthFund: 0, OthEmpBenftExpdr: 0, TotEmployeeComp: 0,
            },
            Insurances: { MedInsur: 0, LifeInsur: 0, KeyManInsur: 0, OthInsur: 0, TotInsurances: 0 },
            StaffWelfareExp: 0,
            Entertainment:     0, Hospitality:         0, Conference:   0,
            SalePromoExp:      0, Advertisement:       0,
            CommissionExpdrDtls:  { NonResOtherCompany: 0, Others: 0, Total: 0 },
            RoyalityDtls:         { NonResOtherCompany: 0, Others: 0, Total: 0 },
            ProfessionalConstDtls:{ NonResOtherCompany: 0, Others: 0, Total: 0 },
            HotelBoardLodge:   0, TravelExp:  0, ForeignTravelExp: 0,
            ConveyanceExp:     0, TelephoneExp: 0, GuestHouseExp: 0,
            ClubExp:           0, FestivalCelebExp: 0, Scholarship: 0,
            Gift:              0, Donation: 0,
            RatesTaxesPays: { ExciseCustomsVAT: { UnionExciseDuty:0,ServiceTax:0,VATorSaleTax:0,CentralGoodServiceTax:0,StateGoodServiceTax:0,IntegratedGoodServiceTax:0,UnionTerrGoodServiceTax:0,OthDutyTaxCess:0,TotExciseCustomsVAT:0 } },
            AuditFee: 0,
            OtherExpenses:     0,
            BadDebtDtls: { BadDebtAmtDtlsTotal: 0, OthersPANNotAvlblDtlTotal: 0, OthersAmtLt1Lakh: 0, BadDebt: 0 },
            ProvForBadDoubtDebt: 0, OthProvisionsExpdr: 0, PBIDTA: 0,
            InterestExpdrtDtls:  { NonResOtherCompany: 0, Others: 0, InterestExpdr: 0 },
            DepreciationAmort:   0,
            PBT:                 0,
          },
          TaxProvAppr: {
            ProvForCurrTax:     0, ProvDefTax: 0,
            ProfitAfterTax:     0, BalBFPrevYr: 0,
            AmtAvlAppr:         0, TrfToReserves: 0, ProprietorAccBalTrf: 0,
          },
          NoBooksOfAccPL: {
            GrossReceipt: 0, GrsRcptAccPayeeOrBankMode: 0, GrsRcptOtherMode: 0,
            GrossProfit: 0, Expenses: 0, NetProfit: 0,
            GrossReceiptPrf: 0, GrsRcptAccPayeeOrBankModePrf: 0, GrsRcptOtherModePrf: 0,
            GrossProfitPrf: 0, ExpensesPrf: 0, NetProfitPrf: 0,
            TotBusinessProfession: 0,
          },
          TurnverFrmSpecActivity: 0,
          NetIncomeFrmSpecActivity: 0,
        },

        // ── ITR3ScheduleBP (business/profession — zero for salary+OS case) ─
        ITR3ScheduleBP: {
          BusinessIncOthThanSpec: {
            ProfBfrTaxPL:           0,
            NetPLFromSpecBus:       0,
            NetPLFromSpecifiedBus:  0,
            IncRecCredPLOthHeadDtls: {
              Salary: 0, HouseProperty: 0, CapitalGains: 0, OtherSources: 0,
              Dividend: 0, OtherThanDividend: 0,
              Us115BBF: 0, Us115BBG: 0, '115BBH': 0,
            },
            PLUs44sChapXIIG: 0,
            ProfitLossInclRefrdSec: {
              ProfitLossUs44AD: 0, ProfitLossUs44ADA: 0, ProfitLossUs44AE: 0,
              ProfitLossUs44B: 0,  ProfitLossUs44BB: 0,  ProfitLossUs44BBA: 0,
              ProfitLossUs44BBC: 0, ProfitLossUs44BBD: 0, ProfitLossUs44DA: 0,
            },
            TotalProfitFrmActCvrd: 0,
            ProfitFrmActCvrd: {
              ProfitFrmActCvrdUndrRule7:    0,
              ProfitFrmActCvrdUndrRule7A:   0,
              ProfitFrmActCvrdUndrRule7B1:  0,
              ProfitFrmActCvrdUndrRule7B1A: 0,
              ProfitFrmActCvrdUndrRule8:    0,
            },
            IncCredPL: {
              FirmShareInc:    0,
              AOPBOISharInc:   0,
              OtherExmptIncDtl: { OperatingDividendName: 'Dividend', OperatingDividendAmt: 0 },
              OthExempInc:     0,
              TotExempIncPL:   0,
            },
            BalancePLOthThanSpecBus:         0,
            ExpDebToPLOthHeadDtls: {
              Salary: 0, HouseProperty: 0, CapitalGains: 0, OtherSources: 0,
              Us115BBF: 0, Us115BBG: 0, '115BBH': 0,
            },
            ExpDebToPLExemptInc:             0,
            ExpDebToPLExemptIncDisAllwUs14A: 0,
            TotExpDebPL:                     0,
            AdjustedPLOthThanSpecBus:        0,
            DepreciationDebPLCosAct:         0,
            DepreciationAllowITAct32: {
              DepreciationAllowUs32_1_ii: 0,
              DepreciationAllowUs32_1_i:  0,
              TotDeprAllowITAct:          0,
            },
            AdjustPLAfterDeprOthSpecInc:  0,
            AmtDebPLDisallowUs36:         0,
            AmtDebPLDisallowUs37:         0,
            AmtDebPLDisallowUs40:         0,
            AmtDebPLDisallowUs40A:        0,
            AmtDebPLDisallowUs43B:        0,
            InterestDisAllowUs23SMEAct:   0,
            DeemIncUs41:                  0,
            DeemIncUs3380HHD80IA:         0,
            DeemIncUs43CA:                0,
            OthItemDisallowUs28To44DA:    0,
            AnyOthIncNotInclInExpDisallowPL: 0,
            AnyOthIncNotInclInSalary:     0,
            AnyOthIncNotInclInBonus:      0,
            AnyOthIncNotInclInCommission: 0,
            AnyOthIncNotInclInInterest:   0,
            AnyOthIncNotInclInOthers:     0,
            IncProfDecLossAccICDSAdj:     0,
            TotAfterAddToPLDeprOthSpecInc: 0,
            DeductUs32_1_iii:             0,
            DebPLUs35ExcessAmt:           0,
            AmtDisallUs40NowAllow:        0,
            AmtDisallUs43BNowAllow:       0,
            AnyOthAmtAllDeduct:           0,
            DecProfIncLossAccICDSAdj:     0,
            TotDeductionAmts:             0,
            PLAftAdjDedBusOthThanSpec:    0,
            DeemedProfitBusUs: {
              Section44AD: 0, Section44ADA: 0, Section44AE: 0, Section44B: 0,
              Section44BB: 0, Section44BBA: 0, Section44BBC: 0, Section44BBD: 0,
              Section44DA: 0, TotDeemedProfitBusUs: 0,
            },
            NetPLAftAdjBusOthThanSpec:    0,
            NetPLBusOthThanSpec7A7B7C:    0,
            ChrgblIncUndrRule7:           0,
            DeemedChrgblIncUndrRule7A:    0,
            DeemedChrgblIncUndrRule7B1:   0,
            DeemedChrgblIncUndrRule7B1A:  0,
            DeemedChrgblIncUndrRule8:     0,
            IncomeOtherThanRule:          0,
            BalIncDeemedFrmAgri:          0,
          },
          SpecBusinessInc: {
            NetPLFrmSpecBus:      0,
            AdditionUs28to44DA:   0,
            DeductUs28to44DA:     0,
            AdjustedPLFrmSpecuBus: 0,
          },
          SpecifiedBusinessInc: {
            NetPLFrmSpecifiedBus:           0,
            AddSec28to44DA:                 0,
            DedSec28to44DAOTDedSec35AD:     0,
            ProfitLossSpecifiedBusiness:    0,
            DeductionUs35AD:                0,
            PLFrmSpecifiedBus:              0,
          },
          IncChrgUnHdProftGain: 0,
          BusSetoffCurrYr: {
            LossSetOffOnBusLoss:   0,
            TotLossSetOffOnBus:    0,
            LossRemainSetOffOnBus: 0,
          },
        },

        // ── ScheduleS (salary) ────────────────────────────────────────────
        ScheduleS: rd.salary
          ? {
              Salaries: rd.salary.Employers.map((emp: any) => ({
                NameOfEmployer:     emp.NameOfEmployer,
                NatureOfEmployment: emp.NatureOfEmployment,
                TANofEmployer:      emp.TANofEmployer,
                // ITR-3 AddressDetail has no CountryCode field
                AddressDetail: {
                  AddrDetail:              (emp.AddressDetail?.AddrDetail ?? '').toUpperCase(),
                  CityOrTownOrDistrict:    (emp.AddressDetail?.CityOrTownOrDistrict ?? '').toUpperCase(),
                  StateCode:               emp.AddressDetail?.StateCode ?? '11',
                  PinCode:                 emp.AddressDetail?.PinCode,
                },
                Salarys: {
                  GrossSalary:            toInt(emp.Salarys.GrossSalary),
                  Salary:                 toInt(emp.Salarys.Salary),
                  ValueOfPerquisites:     toInt(emp.Salarys.ValueOfPerquisites),
                  ProfitsinLieuOfSalary:  toInt(emp.Salarys.ProfitsinLieuOfSalary),
                  IncomeNotified89A:      toInt(emp.Salarys.IncomeNotified89A),
                  IncomeNotifiedOther89A: toInt(emp.Salarys.IncomeNotifiedOther89A),
                },
              })),
              TotalGrossSalary:          toInt(rd.salary.TotalGrossSalary),
              AllwncExtentExemptUs10:    toInt(rd.salary.AllwncExtentExemptUs10),
              NetSalary:                 toInt(rd.salary.NetSalary),
              DeductionUS16:             toInt(rd.salary.TotalDeductionUs16),
              DeductionUnderSection16ia: capAt(rd.salary.DeductionUs16ia, rd.regime === 'NEW' ? cfg.stdDeduction_new : cfg.stdDeduction_old),
              EntertainmntalwncUs16ii:   capAt(rd.salary.EntertainmentAlw16ii, DEDUCTION_CAPS.EntertainmentAlw16ii),
              ProfessionalTaxUs16iii:    capAt(rd.salary.ProfessionalTaxUs16iii, DEDUCTION_CAPS.ProfessionalTax16iii),
              TotIncUnderHeadSalaries:   toInt(rd.salary.IncomeFromSalary),
            }
          : undefined,

        // ── ScheduleHP ───────────────────────────────────────────────────
        ScheduleHP: rd.houseProperty
          ? {
              PropertyDetails:             rd.houseProperty.Properties.map(buildPropertyDetails),
              TotalIncomeChargeableUnHP:   toInt(rd.houseProperty.TotalIncomeFromHP),
            }
          : undefined,

        // ── ScheduleCGFor23 ──────────────────────────────────────────────
        ScheduleCGFor23: {
          ShortTermCapGainFor23: (() => {
            const stcg = rd.stcg;
            const entries111A  = stcg?.Entries111A  ?? [];
            const otherEntries = stcg?.OtherEntries ?? [];
            return {
              EquityMFDTDtls111A: entries111A.length > 0 ? {
                ShareUnitSaleDetails111A: entries111A.map((e: any) => ({
                  ISIN:            e.isin ?? '',
                  ShareUnitName:   e.shareOrUnitName ?? '',
                  SaleValue:       toInt(e.salesValue),
                  CostAcquisition: toInt(e.purchaseCost),
                  Expenditure:     toInt(e.expenditure),
                  GainLoss:        toInt(e.gainLoss),
                })),
                TotalSaleValue:   entries111A.reduce((s: number, e: any) => s + toInt(e.salesValue), 0),
                TotalCostOfAcq:   entries111A.reduce((s: number, e: any) => s + toInt(e.purchaseCost), 0),
                TotalExpenditure: entries111A.reduce((s: number, e: any) => s + toInt(e.expenditure), 0),
                TotalSTCG111A:    stcg111ATotal,
              } : undefined,
              SlumpSaleInStcg: {
                FMV11UAEii: 0, FMV11UAEiii: 0,
                FullConsideration: 0,
                NetWorthOfDivision: 0,
                CapgainonAssets: 0,
              },
              NRITransacSec48Dtl: { NRItaxSTTPaid: 0, NRItaxSTTNotPaid: 0 },
              NRISecur115AD: {
                FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0,
                FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0,
                FullConsideration: 0,
                DeductSec48: { AquisitCost: 0, ImproveCost: 0, ExpOnTrans: 0, TotalDedn: 0 },
                BalanceCG: 0, LossSec94of7Or94of8: 0, CapgainonAssets: 0,
              },
              SaleOnOtherAssets: {
                FullValueConsdRecvUnqshr: 0, FairMrktValueUnqshr: 0,
                FullValueConsdSec50CA: 0, FullValueConsdOthUnqshr: 0,
                FullConsideration: stcgOtherTotal,
                DeductSec48: {
                  AquisitCost: otherEntries.reduce((s: number, e: any) => s + toInt(e.purchaseCost), 0),
                  ImproveCost: 0,
                  ExpOnTrans:  otherEntries.reduce((s: number, e: any) => s + toInt(e.expenditure), 0),
                  TotalDedn:   otherEntries.reduce((s: number, e: any) => s + toInt(e.purchaseCost) + toInt(e.expenditure), 0),
                },
                BalanceCG: stcgOtherTotal,
                LossSec94of7Or94of8: 0,
                DeemedStcgOnAssets:  0,
                ExemptionOrDednUs54: { ExemptionGrandTotal: 0 },
                CapgainonAssets:     stcgOtherTotal,
              },
              TotalAmtDeemedStcg:       0,
              PassThrIncNatureSTCG:     0,
              TotalAmtNotTaxUsDTAAStcg: 0,
              TotalAmtTaxUsDTAAStcg:    0,
              TotalSTCG:                stcg111ATotal + stcgOtherTotal,
            };
          })(),
          LongTermCapGain23: {
            SlumpSaleInLtcgDtls: {},
            SaleOfEquityShareUs112A: (() => {
              // Required field — BalanceCG, DeductionUs54F, CapgainonAssets always required
              const base = { BalanceCG: ltcg112ATotal, DeductionUs54F: 0, CapgainonAssets: ltcg112ATotal };
              if (ltcg112AEntries.length > 0) {
                return {
                  ...base,
                  SaleOfEquityDtls: ltcg112AEntries.map((e) => ({
                    ISIN:             e.ISIN ?? '',
                    ShareUnitName:    e.ShareOrUnitName ?? '',
                    SaleValue:        toInt(e.SalesValue),
                    PurchaseCost:     toInt(e.PurchaseCost),
                    FMVasOn31Jan2018: toInt(e.FMVasOn31Jan2018),
                    Expenditure:      toInt(e.Expenditure),
                    GainLoss:         toInt(e.GainLoss),
                  })),
                  TotalSaleValue:   ltcg112AEntries.reduce((s, e) => s + toInt(e.SalesValue), 0),
                  TotalCostOfAcq:   ltcg112AEntries.reduce((s, e) => s + toInt(e.PurchaseCost), 0),
                  TotalExpenditure: 0,
                  TotalLTCG112A:    ltcg112ATotal,
                };
              }
              return base;
            })(),
            SaleofAssetNADtls:   { SaleofAssetNA: undefined },
            NRIProvisoSec48:     { LTCGWithoutBenefit: 0, DeductionUs54F: 0, BalanceCG: 0 },
            NRISaleOfEquityShareUs112A: { BalanceCG: 0, DeductionUs54F: 0, CapgainonAssets: 0 },
            NRISaleofForeignAsset:      { SaleonSpecAsset: 0, DednSpecAssetus115: 0, BalonSpeciAsset: 0 },
            TotalAmtDeemedLtcg:         0,
            PassThrIncNatureLTCG:       0,
            TotalAmtNotTaxUsDTAALtcg:   0,
            TotalAmtTaxUsDTAALtcg:      0,
            TotalLTCG:                  ltcg112ATotal,
          },
          SumOfCGIncm:        totalCG,
          IncmFromVDATrnsf:   0,
          TotScheduleCGFor23: totalCG,
          DeducClaimInfo: { TotDeductClaim: 0 },
          CurrYrLosses: {
            InLossSetOff:   { StclSetoff20Per:0, StclSetoff30Per:0, StclSetoffAppRate:0, StclSetoffDTAARate:0, LtclSetOff12_5Per:0, LtclSetOffDTAARate:0 },
            InStcg20Per:    { CurrYearIncome:stcg111ATotal, StclSetoff30Per:0, StclSetoffAppRate:0, StclSetoffDTAARate:0, CurrYrCapGain:stcg111ATotal },
            InStcg30Per:    { CurrYearIncome:0, StclSetoff20Per:0, StclSetoffAppRate:0, StclSetoffDTAARate:0, CurrYrCapGain:0 },
            InStcgAppRate:  { CurrYearIncome:stcgOtherTotal, StclSetoff20Per:0, StclSetoff30Per:0, StclSetoffDTAARate:0, CurrYrCapGain:stcgOtherTotal },
            InStcgDTAARate: { CurrYearIncome:0, StclSetoff20Per:0, StclSetoff30Per:0, StclSetoffAppRate:0, CurrYrCapGain:0 },
            InLtcg12_5Per:  { CurrYearIncome:ltcg112ATotal, StclSetoff20Per:0, StclSetoff30Per:0, StclSetoffAppRate:0, StclSetoffDTAARate:0, LtclSetOffDTAARate:0, CurrYrCapGain:ltcg112ATotal },
            InLtcgDTAARate: { CurrYearIncome:0, StclSetoff20Per:0, StclSetoff30Per:0, StclSetoffAppRate:0, StclSetoffDTAARate:0, LtclSetOff12_5Per:0, CurrYrCapGain:0 },
            TotLossSetOff:  { StclSetoff20Per:0, StclSetoff30Per:0, StclSetoffAppRate:0, StclSetoffDTAARate:0, LtclSetOff12_5Per:0, LtclSetOffDTAARate:0 },
            LossRemainSetOff:{ StclSetoff20Per:0, StclSetoff30Per:0, StclSetoffAppRate:0, StclSetoffDTAARate:0, LtclSetOff12_5Per:0, LtclSetOffDTAARate:0 },
          },
          AccruOrRecOfCG: {
            ShortTermUnder20Per:    { DateRange: { Upto15Of6: 0, Upto15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            ShortTermUnder30Per:    { DateRange: { Upto15Of6: 0, Upto15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            ShortTermUnderAppRate:  { DateRange: { Upto15Of6: 0, Upto15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            ShortTermUnderDTAARate: { DateRange: { Upto15Of6: 0, Upto15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            LongTermUnder12_5Per:   { DateRange: { Upto15Of6: 0, Upto15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            LongTermUnderDTAARate:  { DateRange: { Upto15Of6: 0, Upto15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
            VDATrnsfGainsUnder30Per:{ DateRange: { Upto15Of6: 0, Upto15Of9: 0, Up16Of9To15Of12: 0, Up16Of12To15Of3: 0, Up16Of3To31Of3: 0 } },
          },
        },

        // ── Schedule112A ─────────────────────────────────────────────────
        Schedule112A: ltcg112AEntries.length > 0
          ? {
              Schedule112ADtls: ltcg112AEntries.map((e) => ({
                ISIN:            e.ISIN ?? '',
                ShareUnitName:   e.ShareOrUnitName ?? '',
                FMVPerShareUnit: toInt(e.FMVasOn31Jan2018),
                SaleValue:       toInt(e.SalesValue),
                PurchaseCost:    toInt(e.PurchaseCost),
                Expenditure:     toInt(e.Expenditure),
                GainLoss:        toInt(e.GainLoss),
              })),
              TotalLTCG112A: ltcg112ATotal,
            }
          : undefined,

        // ── ScheduleOS ───────────────────────────────────────────────────
        ScheduleOS: {
          IncOthThanOwnRaceHorse: {
            GrossIncChrgblTaxAtAppRate: Math.max(0, osIncome),
            DividendGross:              0,
            DividendOthThan22e:         0,
            Dividend22e:                0,
            InterestGross:              0,
            IntrstFrmSavingBank:        0,
            IntrstFrmTermDeposit:       0,
            IntrstFrmIncmTaxRefund:     0,
            NatofPassThrghIncome:       0,
            IntrstFrmOthers:            Math.max(0, osIncome),
            RentFromMachPlantBldgs:     0,
            Tot562x:                    0,
            Aggrtvaluewithoutcons562x:  0,
            Immovpropwithoutcons562x:   0,
            Immovpropinadeqcons562x:    0,
            Anyotherpropwithoutcons562x: 0,
            Anyotherpropinadeqcons562x: 0,
            FamilyPension:              0,
            AnyOtherIncome:             0,
            IncChargeableSpecialRates:  0,
            LtryPzzlChrgblUs115BB:      0,
            IncChrgblUs115BBE:          0,
            CashCreditsUs68:            0,
            UnExplndInvstmntsUs69:      0,
            UnExplndMoneyUs69A:         0,
            UnDsclsdInvstmntsUs69B:     0,
            UnExplndExpndtrUs69C:       0,
            AmtBrwdRepaidOnHundiUs69D:  0,
            OthersGross:                0,
            PassThrIncOSChrgblSplRate:  0,
            Deductions: {
              Expenses:         0,
              DeductionUs57iia: capAt(rd.otherSources?.DeductionUs57iia ?? 0, 25_000),
              Depreciation:     0,
              TotDeductions:    capAt(rd.otherSources?.DeductionUs57iia ?? 0, 25_000),
            },
            BalanceNoRaceHorse: Math.max(0, osIncome - capAt(rd.otherSources?.DeductionUs57iia ?? 0, 25_000)),
          },
          TotOthSrcNoRaceHorse: Math.max(0, osIncome),
          IncFrmLottery:        zeroDateRange(),
          DividendIncUs115BBDA:    zeroDateRange(),
          DividendIncUs115BBDAaiii: zeroDateRange(),
          DividendIncUs115A1ai:    zeroDateRange(),
          DividendIncUs115AC:      zeroDateRange(),
          DividendIncUs115ACA:     zeroDateRange(),
          DividendIncUs115AD1i:    zeroDateRange(),
          NOT89A:                  zeroDateRange(),
          DividendDTAA:            zeroDateRange(),
          IncChargeable:           Math.max(0, osIncome),
        },

        // ── ScheduleVIA ──────────────────────────────────────────────────
        ScheduleVIA: (() => {
          const usrRaw = rd.deductions && rd.regime === 'OLD'
            ? buildUsrDeductions(rd.deductions)
            : buildUsrDeductions(null);
          const cappedRaw = rd.deductions && rd.regime === 'OLD'
            ? capped
            : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);
          // UsrDeductUndChapVIA requires TotPartBchapterVIA, TotPartCchapterVIA, TotPartCAandDchapterVIA
          const n = (v: unknown) => toInt(v as number);
          const partB = n((usrRaw as any).Section80C) + n((usrRaw as any).Section80CCC)
            + n((usrRaw as any).Section80CCDEmployeeOrSE) + n((usrRaw as any).Section80CCD1B)
            + n((usrRaw as any).Section80CCDEmployer) + n((usrRaw as any).Section80D)
            + n((usrRaw as any).Section80DD) + n((usrRaw as any).Section80DDB)
            + n((usrRaw as any).Section80E) + n((usrRaw as any).Section80EE)
            + n((usrRaw as any).Section80EEA) + n((usrRaw as any).Section80EEB)
            + n((usrRaw as any).Section80G) + n((usrRaw as any).Section80GG)
            + n((usrRaw as any).Section80GGA) + n((usrRaw as any).Section80GGC);
          const partC = n((usrRaw as any).Section80TTA) + n((usrRaw as any).Section80TTB) + n((usrRaw as any).Section80U);
          const partCAD = n((usrRaw as any).AnyOthSec80CCH);
          return {
            UsrDeductUndChapVIA: {
              ...usrRaw,
              TotPartBchapterVIA:      partB,
              TotPartCchapterVIA:      partC,
              TotPartCAandDchapterVIA: partCAD,
            },
            DeductUndChapVIA: {
              ...cappedRaw,
              TotPartBchapterVIA:      partB,
              TotPartCchapterVIA:      partC,
              TotPartCAandDchapterVIA: partCAD,
            },
          };
        })(),

        // ── ScheduleCYLA ─────────────────────────────────────────────────
        ScheduleCYLA: {
          Salary: {
            IncCYLA: {
              IncOfCurYrUnderThatHead:     Math.max(0, salIncome),
              HPlossCurYrSetoff:           hpLossSetOff,
              OthSrcLossNoRaceHorseSetoff: 0,
              IncOfCurYrAfterSetOff:       salAfterSetOff,
            },
          },
          HP: {
            IncCYLA: {
              IncOfCurYrUnderThatHead:     Math.max(0, hpIncome),
              OthSrcLossNoRaceHorseSetoff: 0,
              IncOfCurYrAfterSetOff:       hpAfterSetOff,
            },
          },
          BusProfExclSpecProf: cylaBus(bpIncome),
          SpeculativeInc:      cylaBus(0),
          SpecifiedInc:        cylaBus(0),
          STCG20Per:           cylaInc3(stcg111ATotal),
          STCG30Per:           cylaInc3(0),
          STCGAppRate:         cylaInc3(stcgOtherTotal),
          STCGDTAARate:        cylaInc3(0),
          LTCG12_5Per:         cylaInc3(ltcg112ATotal),
          LTCGDTAARate:        cylaInc3(0),
          OthSrcExclRaceHorse: {
            IncCYLA: {
              IncOfCurYrUnderThatHead: Math.max(0, osIncome),
              IncOfCurYrAfterSetOff:   Math.max(0, osIncome),
            },
          },
          OthSrcRaceHorse: cylaInc3(0),
          IncOSDTAA:       cylaInc3(0),
          TotalCurYr: {
            TotHPlossCurYr:             0,
            TotBusLoss:                 0,
            TotOthSrcLossNoRaceHorse:   0,
          },
          TotalLossSetOff: {
            TotHPlossCurYrSetoff:           hpLossSetOff,
            TotBusLossSetoff:               0,
            TotOthSrcLossNoRaceHorseSetoff: 0,
          },
          LossRemAftSetOff: {
            BalHPlossCurYrAftSetoff:           0,
            BalBusLossAftSetoff:               0,
            BalOthSrcLossNoRaceHorseAftSetoff: 0,
          },
        },

        // ── ScheduleBFLA ─────────────────────────────────────────────────
        ScheduleBFLA: {
          Salary:              bflaRowSal(salAfterSetOff),
          HP:                  bflaRow3(hpAfterSetOff),
          BusProfExclSpecProf: bflaRow3(bpIncome),
          SpeculativeInc:      bflaRow3(0),
          SpecifiedInc:        bflaRow3(0),
          STCG20Per:           bflaRow3(stcg111ATotal),
          STCG30Per:           bflaRow3(0),
          STCGAppRate:         bflaRow3(stcgOtherTotal),
          STCGDTAARate:        bflaRow3(0),
          LTCG12_5Per:         bflaRow3(ltcg112ATotal),
          LTCGDTAARate:        bflaRow3(0),
          OthSrcExclRaceHorse: {
            IncBFLA: {
              IncOfCurYrUndHeadFromCYLA:     Math.max(0, osIncome),
              BFUnabsorbedDeprSetoff:        0,
              BFAllUs35Cl4Setoff:            0,
              IncOfCurYrAfterSetOffBFLosses: Math.max(0, osIncome),
            },
          },
          OthSrcRaceHorse: {
            IncBFLA: { IncOfCurYrUndHeadFromCYLA: 0, BFUnabsorbedDeprSetoff: 0, BFAllUs35Cl4Setoff: 0, IncOfCurYrAfterSetOffBFLosses: 0 },
          },
          IncOSDTAA: {
            IncBFLA: { IncOfCurYrUndHeadFromCYLA: 0, BFUnabsorbedDeprSetoff: 0, BFAllUs35Cl4Setoff: 0, IncOfCurYrAfterSetOffBFLosses: 0 },
          },
          TotalBFLossSetOff: {
            TotBFLossSetoff:       0,
            TotUnabsorbedDeprSetoff: 0,
            TotAllUs35cl4Setoff:   0,
          },
          IncomeOfCurrYrAftCYLABFLA: grossTotalIncome,
        },

        // ── PartB-TI ─────────────────────────────────────────────────────
        'PartB-TI': {
          Salaries:     toInt(summary.IncomeFromSalary),
          IncomeFromHP: Math.max(0, toInt(summary.IncomeFromHP)),
          ProfBusGain: {
            ProfGainNoSpecBus:    bpIncome,
            ProfGainSpecBus:      0,
            ProfGainSpecifiedBus: 0,
            ProfIncome115BBF:     0,
            TotProfBusGain:       bpIncome,
          },
          CapGain: {
            ShortTerm: {
              ShortTerm20Per:       stcg111ATotal,
              ShortTerm30Per:       0,
              ShortTermAppRate:     stcgOtherTotal,
              ShortTermSplRateDTAA: 0,
              TotalShortTerm:       stcg111ATotal + stcgOtherTotal,
            },
            LongTerm: {
              LongTerm12_5Per:     ltcg112ATotal,
              LongTermSplRateDTAA: 0,
              TotalLongTerm:       ltcg112ATotal,
            },
            ShortTermLongTermTotal: totalCG,
            CapGains30Per115BBH:    0,
            TotalCapGains:          totalCG,
          },
          IncFromOS: {
            OtherSrcThanOwnRaceHorse: Math.max(0, toInt(summary.IncomeFromOtherSources)),
            IncChargblSplRate:        0,
            FromOwnRaceHorse:         0,
            TotIncFromOS:             Math.max(0, toInt(summary.IncomeFromOtherSources)),
          },
          TotalTI:                   grossTotalIncome,
          CurrentYearLoss:           0,
          BalanceAfterSetoffLosses:  grossTotalIncome,
          BroughtFwdLossesSetoff:    0,
          GrossTotalIncome:          grossTotalIncome,
          IncChargeTaxSplRate111A112: totalCG,
          DeductionsUndSchVIADtl: {
            PartBchapterVIA:    capped.TotalChapVIADeductions,
            PartCchapterVIA:    0,
            TotDeductUndSchVIA: capped.TotalChapVIADeductions,
          },
          DeductionsUnder10Aor10AA: 0,
          TotalIncome:              totalIncome,
          IncChargeableTaxSplRates: totalCG,
          NetAgricultureIncomeOrOtherIncomeForRate: 0,
          AggregateIncome:          totalIncome,
          LossesOfCurrentYearCarriedFwd: 0,
          DeemedIncomeUs115JC:      0,
        },

        // ── PartB_TTI ────────────────────────────────────────────────────
        PartB_TTI: {
          ComputationOfTaxLiability: {
            TaxPayableOnDeemedTI: {
              TaxDeemedTISec115JC:  0,
              SurchargeOnAboveCrore: 0,
              EducationCess:        0,
              TotalTax:             0,
            },
            TaxPayableOnTI: {
              TaxAtNormalRatesOnAggrInc:        toInt(taxComp.NetTaxPayable),
              TaxAtSpecialRates:                Math.round(ltcg112ATotal > 0 ? Math.max(0, ltcg112ATotal - cfg.ltcg112AExempt) * cfg.ltcg112ARate : 0) + Math.round(stcg111ATotal * cfg.stcg111ARate),
              RebateOnAgriInc:                  0,
              TaxPayableOnTotInc:               toInt(taxComp.NetTaxPayable) + Math.round(ltcg112ATotal > 0 ? Math.max(0, ltcg112ATotal - cfg.ltcg112AExempt) * cfg.ltcg112ARate : 0) + Math.round(stcg111ATotal * cfg.stcg111ARate),
              Rebate87A:                        toInt(taxComp.Rebate87A),
              TaxPayableOnRebate:               toInt(taxComp.TaxAfterRebate),
              Surcharge25ofSI:                  0,
              SurchargeOnAboveCrore:            toInt(taxComp.Surcharge),
              Surcharge25ofSIBeforeMarginal:    0,
              SurchargeOnAboveCroreBeforeMarginal: toInt(taxComp.Surcharge),
              TotalSurcharge:                   toInt(taxComp.Surcharge),
              EducationCess:                    toInt(taxComp.HealthEducationCess),
              GrossTaxLiability:                netTaxLiability,
            },
            GrossTaxPayable: netTaxLiability,
            GrossTaxPay: {
              TaxInc17:            netTaxLiability,
              TaxDeferred17:       0,
              TaxDeferredPayableCY: 0,
            },
            CreditUS115JD:          0,
            TaxPayAfterCreditUs115JD: netTaxLiability,
            TaxRelief: {
              Section89:  0,
              Section90:  0,
              Section91:  0,
              TotTaxRelief: 0,
            },
            NetTaxLiability:       netTaxLiability,
            IntrstPay: {
              IntrstPayUs234A:  0,
              IntrstPayUs234B:  0,
              IntrstPayUs234C:  0,
              LateFilingFee234F: 0,
            },
            AggregateTaxInterestLiability: netTaxLiability,
          },
          TaxPaid: {
            TaxesPaid: {
              AdvanceTax:        advTax,
              TDS:               tdsSalary + tdsOther + tdsRent,
              TCS:               tcs,
              SelfAssessmentTax: satTax,
              TotalTaxesPaid:    totalTaxPaid,
            },
            BalTaxPayable: balPayable,
          },
          Refund: (() => {
            const bank = (rd as any).bankAccounts?.[0];
            return {
              RefundDue: refund,
              BankAccountDtls: {
                BankDtlsFlag: bank ? 'Y' : 'N',
                AddtnlBankDetails: bank ? [{
                  IFSCCode:      bank.ifscCode ?? '',
                  BankName:      bank.bankName ?? '',
                  BankAccountNo: bank.accountNumber ?? '',
                  AccountType:   mapAccountType(bank.accountType),
                  UseForRefund:  'true',
                }] : undefined,
              },
            };
          })(),
          AssetOutIndiaFlag: 'NO',
        },

        // ── ScheduleTDS1 (TDS on salary) — omit if no entries (minItems: 1) ──
        ...(rd.tds?.TDSOnSalaries?.length
          ? { ScheduleTDS1: buildTDSOnSalaries(rd.tds) }
          : { ScheduleTDS1: { TotalTDSonSalaries: 0 } }),

        // ── ScheduleTDS2 (TDS on other income) — omit if no entries ──────
        ...(rd.tds?.TDSOnOtherIncome?.length
          ? { ScheduleTDS2: buildTDSOnOtherIncome(rd.tds) }
          : { ScheduleTDS2: { TotalTDSonOthThanSals: 0 } }),

        // ── ScheduleTDS3 (TDS u/s 194IB rent) — omit if no entries ───────
        ...(rd.tds?.TDSOnRent16C?.length
          ? { ScheduleTDS3: buildTDS16C(rd.tds) }
          : { ScheduleTDS3: { TotalTDS3OnOthThanSal: 0 } }),

        // ── ScheduleIT (advance tax / SAT challans) — omit if no entries ─
        ...(rd.taxPayments && (rd.taxPayments.AdvanceTaxPayments?.length || rd.taxPayments.SelfAssessmentPayments?.length)
          ? { ScheduleIT: buildTaxPayments(rd.taxPayments) }
          : { ScheduleIT: { TotalTaxPayments: toInt(rd.taxPayments?.TotalTaxPaid) } }),

        // ── ScheduleTCS ───────────────────────────────────────────────────
        ScheduleTCS: rd.tds?.TCSEntries?.length
          ? {
              TCSDetails: rd.tds.TCSEntries.map((t) => ({
                TAN:           t.EmployerOrDeductorDetails?.TAN ?? '',
                CollectorName: t.EmployerOrDeductorDetails?.EmployerName ?? '',
                TotalTCS:      toInt(t.TCSCollected),
              })),
              TotalTCS: tcs,
            }
          : undefined,

        // ── Verification ──────────────────────────────────────────────────
        Verification: buildVerification(rd.verification ?? {} as any, date, client.pan, 'ITR23'),
      },
    },
  };
}

export function buildITRJson(input: BuildITRInput): object {
  switch (input.returnData.formType) {
    case 'ITR-1': return buildITR1(input);
    case 'ITR-2': return buildITR2(input);
    case 'ITR-3': return buildITR3(input);
    case 'ITR-4': return buildITR4(input);
    case 'ITR-5': return signITR5Json(reorderITR5Keys(buildITR5(input)));
    default:
      throw new Error(`Unsupported form type: ${(input.returnData as ReturnData).formType}`);
  }
}

/**
 * Serialize the ITR JSON to a formatted string for file download / upload.
 */
export function serializeITRJson(input: BuildITRInput): string {
  return JSON.stringify(buildITRJson(input), null, 2);
}

/**
 * Compute income summary from a ReturnData (exposed for UI pre-computation).
 */
export { computeIncomeSummary, computeTaxLiability, applyDeductionCaps };
