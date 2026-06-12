/**
 * shared/utils/itrBuilder.ts
 *
 * Assembles the final ITR JSON payload for AY 2026-27 (FY 2025-26)
 * Per Finance Act 2025 / Budget 2025
 *
 * Key AY 2026-27 changes:
 *   - New regime slabs: 0/5/10/15/20/25/30% with ₹4L base exemption
 *   - Standard deduction: ₹75,000 (new & old regime)
 *   - Rebate 87A: ₹60,000 (new), ₹12,500 (old)
 *   - LTCG 112A: 12.5% above ₹1.25L exemption
 *   - STCG 111A: 20% (up from 15%)
 *   - Income up to ₹12.75L tax-free under new regime (₹12L + ₹75K std deduction)
 */

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
  dateOfBirth: string;
  mobileNumber?: string;
  email?: string;
  aadhaarNumber?: string;
  address: string;
  city?: string;
  state?: string;
  pinCode?: number;
  residentialStatus?: 'RES' | 'NRI' | 'RNR';
}

export interface BuilderFirm {
  name: string;
  address: string;
  city: string;
  swVersionNo?: string;
  swCreatedBy?: string;
  jsonCreatedBy?: string;
  intermediaryCity?: string;
}

export interface BuilderSWDetails {
  SWVersionNo: string;
  SWCreatedBy: string;
  JSONCreatedBy: string;
  IntermediaryCity: string;
}

export interface BuildITRInput {
  returnData: ReturnData;
  client: BuilderClient;
  firm: BuilderFirm;
  sw: BuilderSWDetails;
  filingDate?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function toInt(n: number | undefined | null): number {
  return Math.round(n ?? 0);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function ayToYear(ay: string): string {
  const parts = ay.split('-');
  if (parts.length === 2) {
    const start = parseInt(parts[0], 10);
    return String(start + 1);
  }
  return parts[0];
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
// TAX COMPUTATION — AY 2026-27
// ─────────────────────────────────────────────────────────────────────────────

function computeSlabTax_New(income: number): number {
  // New regime AY 2026-27 — Budget 2025
  // Slabs: 0-4L=0%, 4-8L=5%, 8-12L=10%, 12-16L=15%, 16-20L=20%, 20-24L=25%, 24L+=30%
  if (income <= 400_000) return 0;
  let tax = 0;
  if (income > 400_000) tax += Math.min(income - 400_000, 400_000) * 0.05;
  if (income > 800_000) tax += Math.min(income - 800_000, 400_000) * 0.10;
  if (income > 1_200_000) tax += Math.min(income - 1_200_000, 400_000) * 0.15;
  if (income > 1_600_000) tax += Math.min(income - 1_600_000, 400_000) * 0.20;
  if (income > 2_000_000) tax += Math.min(income - 2_000_000, 400_000) * 0.25;
  if (income > 2_400_000) tax += (income - 2_400_000) * 0.30;
  return Math.round(tax);
}

function computeSlabTax_Old(income: number): number {
  // Old regime AY 2026-27 — unchanged
  // Individual below 60: 0-2.5L=0%, 2.5-5L=5%, 5-10L=20%, 10L+=30%
  if (income <= 250_000) return 0;
  let tax = 0;
  if (income > 250_000) tax += Math.min(income - 250_000, 250_000) * 0.05;
  if (income > 500_000) tax += Math.min(income - 500_000, 500_000) * 0.20;
  if (income > 1_000_000) tax += (income - 1_000_000) * 0.30;
  return Math.round(tax);
}

function computeSurcharge(tax: number, totalIncome: number): number {
  if (totalIncome <= 5_000_000) return 0;
  if (totalIncome <= 10_000_000) return Math.round(tax * 0.10);
  if (totalIncome <= 20_000_000) return Math.round(tax * 0.15);
  // Max surcharge 25% for new regime (no 37% in new regime)
  return Math.round(tax * 0.25);
}

function computeRebate87A(income: number, tax: number, regime: 'OLD' | 'NEW'): number {
  if (regime === 'NEW') {
    if (income <= DEDUCTION_CAPS.Rebate87A_incomeLimit_new) {
      return Math.min(tax, DEDUCTION_CAPS.Rebate87A_new);
    }
  } else {
    if (income <= DEDUCTION_CAPS.Rebate87A_incomeLimit_old) {
      return Math.min(tax, DEDUCTION_CAPS.Rebate87A_old);
    }
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUCTION CAP ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

export function applyDeductionCaps(d: DeductionsChapterVIA, grossTotalIncome: number) {
  // Under new regime, most deductions not allowed except:
  // - Standard deduction 16ia (applied at salary stage)
  // - 80CCD(2) employer NPS
  // - 80CCH Agnipath

  const s80C = capAt(d.Section80C ?? 0, DEDUCTION_CAPS.Section80C);
  const s80CCC = capAt(d.Section80CCC ?? 0, DEDUCTION_CAPS.Section80CCC);
  const s80CCDEmp = capAt(d.Section80CCDEmployeeOrSE ?? 0, DEDUCTION_CAPS.Section80CCDEmployeeOrSE);

  // Combined 80C+80CCC+80CCD(1) cap = ₹1,50,000
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

  const total = s80CScaled + s80CCCScaled + s80CCDEmpScaled +
    s80CCD1B + s80CCDEmployer + s80D + s80DD + s80DDB +
    s80E + s80EE + s80EEA + s80EEB + s80G + s80GG +
    s80GGA + s80GGC + s80U + s80TTA + s80TTB + s80CCH;

  const cappedTotal = Math.min(total, Math.max(0, grossTotalIncome));

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
// INCOME SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export function computeIncomeSummary(rd: ReturnData): IncomeSummary {
  const salary = toInt(rd.salary?.IncomeFromSalary);
  const hpRaw = toInt(rd.houseProperty?.TotalIncomeFromHP);
  const hp = hpRaw < 0 ? Math.max(hpRaw, -DEDUCTION_CAPS.HPLossSetOff) : hpRaw;
  const os = toInt(rd.otherSources?.IncomeFromOtherSources);
  const presumptive = toInt(rd.presumptiveIncome?.TotalPresumptiveIncome);
  const ltcg112A = toInt(rd.ltcg112A?.TaxableLTCG112A);

  const grossTotal = salary + hp + os + presumptive;
  const grossTotalIncLTCG = grossTotal + ltcg112A;

  const deductions = rd.deductions
    ? applyDeductionCaps(rd.deductions, grossTotal).TotalChapVIADeductions
    : 0;

  const totalIncome = Math.max(0, grossTotal - deductions);

  return {
    IncomeFromSalary: salary,
    IncomeFromHP: hp,
    IncomeFromOtherSources: os,
    IncomeFromBusinessProfession: presumptive || undefined,
    GrossTotalIncome: grossTotal,
    GrossTotalIncomeIncLTCG112A: ltcg112A > 0 ? grossTotalIncLTCG : undefined,
    TotalDeductions: deductions,
    TotalIncome: totalIncome,
    LTCG112A: ltcg112A || undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX LIABILITY — AY 2026-27
// ─────────────────────────────────────────────────────────────────────────────

export function computeTaxLiability(summary: IncomeSummary, regime: 'OLD' | 'NEW'): ITRTaxComputation {
  const totalIncome = summary.TotalIncome;
  const ltcg112A = summary.LTCG112A ?? 0;

  // Slab tax on normal income (excluding LTCG 112A)
  const slabTax = regime === 'NEW'
    ? computeSlabTax_New(totalIncome)
    : computeSlabTax_Old(totalIncome);

  // LTCG 112A @ 12.5% on amount exceeding ₹1,25,000
  const taxableLTCG = Math.max(0, ltcg112A - DEDUCTION_CAPS.LTCG112AExempt);
  const ltcgTax = Math.round(taxableLTCG * 0.125);

  // Rebate 87A — not on capital gains
  const rebate = computeRebate87A(totalIncome, slabTax, regime);
  const taxAfterRebate = Math.max(0, slabTax - rebate) + ltcgTax;

  const surcharge = computeSurcharge(taxAfterRebate, totalIncome + ltcg112A);
  const taxPlusSurcharge = taxAfterRebate + surcharge;
  const cess = Math.round(taxPlusSurcharge * DEDUCTION_CAPS.HealthEducationCess);
  const grossTaxLiability = taxPlusSurcharge + cess;

  return {
    TotalTaxableIncome: totalIncome,
    NetTaxPayable: slabTax,
    Rebate87A: rebate,
    TaxAfterRebate: taxAfterRebate,
    Surcharge: surcharge,
    HealthEducationCess: cess,
    GrossTaxLiability: grossTaxLiability,
    TotalTaxPayable: grossTaxLiability,
    TotalTaxesPaid: 0,
    BalTaxPayable: grossTaxLiability,
    AggregateTaxInterestLiability: grossTaxLiability,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL INFO
// ─────────────────────────────────────────────────────────────────────────────

function buildPersonalInfo(client: BuilderClient) {
  const name = splitName(client.fullName);
  return {
    AssesseeName: {
      FirstName: name.FirstName,
      MiddleName: name.MiddleName,
      SurName: name.SurName,
    },
    PAN: client.pan.toUpperCase(),
    DOB: client.dateOfBirth,
    AadhaarCardNo: client.aadhaarNumber,
    Address: {
      RoadOrStreet: client.address,
      CityOrTownOrDistrict: client.city ?? '',
      StateCode: (client.state ?? '11') as string,
      CountryCode: '91',
      PinCode: client.pinCode,
      MobileNo: client.mobileNumber,
      EmailAddress: client.email,
    },
    ResidentialStatus: client.residentialStatus ?? 'RES',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export function buildITRJson(input: BuildITRInput): object {
  const { returnData: rd, client, sw, filingDate } = input;
  const date = filingDate ?? today();
  const summary = computeIncomeSummary(rd);
  const capped = rd.deductions
    ? applyDeductionCaps(rd.deductions, summary.GrossTotalIncome)
    : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);
  const taxComp = computeTaxLiability(summary, rd.regime);

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

  const formType = rd.formType;

  const base = {
    CreationInfo: {
      SWVersionNo: sw.SWVersionNo,
      SWCreatedBy: sw.SWCreatedBy,
      JSONCreatedBy: sw.JSONCreatedBy,
      JSONCreationDate: date,
      IntermediaryCity: sw.IntermediaryCity,
      Digest: '-',
    },
    PersonalInfo: buildPersonalInfo(client),
    FilingStatus: {
      ReturnFileSec: rd.filingSection,
      OptOutNewTaxRegime: rd.regime === 'OLD' ? 'Y' : 'N',
      AssessmentYear: ayToYear(rd.assessmentYear),
    },
  };

  if (formType === 'ITR-1') {
    return { ITR: { ITR1: { ...base, Form_ITR1: { FormName: 'ITR-1', AssessmentYear: ayToYear(rd.assessmentYear), SchemaVer: 'Ver1.0' } } } };
  }
  if (formType === 'ITR-2') {
    return { ITR: { ITR2: { ...base, Form_ITR2: { FormName: 'ITR-2', AssessmentYear: ayToYear(rd.assessmentYear), SchemaVer: 'Ver1.0' } } } };
  }
  return { ITR: { ITR4: { ...base, Form_ITR4: { FormName: 'ITR-4', AssessmentYear: ayToYear(rd.assessmentYear), SchemaVer: 'Ver1.0' } } } };
}

export function serializeITRJson(input: BuildITRInput): string {
  return JSON.stringify(buildITRJson(input), null, 2);
}
