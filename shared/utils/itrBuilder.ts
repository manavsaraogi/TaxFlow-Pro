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

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function ayToYear(ay: string): string {
  // "2025-26" → "2026" (end year, used in Form_ITR fields)
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

  const os = toInt(rd.otherSources?.IncomeFromOtherSources);
  const presumptive = toInt(rd.presumptiveIncome?.TotalPresumptiveIncome);
  const ltcg112A = toInt(rd.ltcg112A?.TaxableLTCG112A);
  const stcg111A = toInt(rd.stcg?.TotalSTCG111A);
  const stcgOther = toInt(rd.stcg?.TotalSTCGOther);

  // Slab-income base (STCG other assets included, LTCG/111A excluded — taxed separately)
  const grossTotal = salary + hp + os + presumptive + stcgOther;
  const grossTotalIncCG = grossTotal + ltcg112A + stcg111A;

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

function computeSurcharge(tax: number, income: number, regime: 'OLD' | 'NEW'): number {
  if (income <= 5_000_000) return 0;
  if (income <= 10_000_000) return tax * 0.10;
  if (income <= 20_000_000) return tax * 0.15;
  if (income <= 50_000_000) return tax * 0.25;
  return tax * (regime === 'NEW' ? 0.25 : 0.37);
}

function computeRebate87A(income: number, tax: number, regime: 'OLD' | 'NEW', cfg: AYConfig): number {
  if (regime === 'NEW') {
    if (income <= cfg.rebateLimit_new) return Math.min(tax, cfg.rebate87A_new);
  } else {
    if (income <= cfg.rebateLimit_old) return Math.min(tax, cfg.rebate87A_old);
  }
  return 0;
}

function computeTaxLiability(summary: IncomeSummary, regime: 'OLD' | 'NEW', ay: string): ITRTaxComputation {
  const cfg = getAYConfig(ay);
  const totalIncome = summary.TotalIncome;
  const ltcg112A = summary.LTCG112A ?? 0;
  const stcg111A = summary.STCG111A ?? 0;

  const slabTax = computeSlabTax(totalIncome, regime, cfg);

  const taxableLTCG = Math.max(0, ltcg112A - cfg.ltcg112AExempt);
  const ltcgTax = Math.round(taxableLTCG * cfg.ltcg112ARate);
  const stcg111ATax = Math.round(stcg111A * cfg.stcg111ARate);

  const rebate = computeRebate87A(totalIncome, slabTax, regime, cfg);
  const taxAfterRebate = Math.max(0, slabTax - rebate) + ltcgTax + stcg111ATax;

  const surcharge = Math.round(computeSurcharge(taxAfterRebate, totalIncome + ltcg112A + stcg111A, regime));
  const taxPlusSurcharge = taxAfterRebate + surcharge;
  const cess = Math.round(taxPlusSurcharge * 0.04);
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
// SCHEDULE BUILDERS — ITR-1 INCOME DEDUCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function buildITR1IncomeDeductions(rd: ReturnData, summary: IncomeSummary, capped: ReturnType<typeof applyDeductionCaps>, stdDedCap: number) {
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
    UsrDeductUndChapVIA: buildUsrDeductions(rd.deductions),
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

function buildUsrDeductions(d: DeductionsChapterVIA | null) {
  if (!d) return {
    Section80C: 0, Section80CCC: 0, Section80CCDEmployeeOrSE: 0,
    Section80CCD1B: 0, Section80CCDEmployer: 0, Section80D: 0,
    Section80DD: 0, Section80DDB: 0, Section80E: 0, Section80EE: 0,
    Section80G: 0, Section80GG: 0, Section80GGA: 0, Section80GGC: 0,
    Section80U: 0, Section80TTA: 0, Section80TTB: 0, AnyOthSec80CCH: 0,
    TotalChapVIADeductions: 0,
  };
  return {
    Section80C: toInt(d.Section80C),
    Section80CCC: toInt(d.Section80CCC),
    PensionContribution80CCC: d.PensionContribution80CCC,
    Section80CCDEmployeeOrSE: toInt(d.Section80CCDEmployeeOrSE),
    Section80CCD1B: toInt(d.Section80CCD1B),
    Section80CCDEmployer: toInt(d.Section80CCDEmployer),
    PRANDtls: d.PRANNumbers?.map((p) => ({ PRANNum: p })),
    Section80D: toInt(d.Section80D),
    Section80DD: toInt(d.Section80DD),
    Section80DDBUsrType: d.Claimant80DDB,
    NameOfSpecDisease80DDB: d.SpecialDisease80DDB,
    Section80DDB: toInt(d.Section80DDB),
    Section80E: toInt(d.Section80E),
    Section80EE: toInt(d.Section80EE),
    Section80EEA: toInt(d.Section80EEA),
    Section80EEB: toInt(d.Section80EEB),
    Section80G: toInt(d.Section80G),
    Section80GG: toInt(d.Section80GG),
    Form10BAAckNum: d.Form10BAAckNum,
    Section80GGA: toInt(d.Section80GGA),
    Section80GGC: toInt(d.Section80GGC),
    Section80U: toInt(d.Section80U),
    Section80TTA: toInt(d.Section80TTA),
    Section80TTB: toInt(d.Section80TTB),
    AnyOthSec80CCH: toInt(d.AnyOthSec80CCH),
    TotalChapVIADeductions: toInt(d.TotalChapVIADeductions),
  };
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
  const name = splitName(client.fullName);
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
        ResidenceNo: client.address || '-',
        ResidenceName: '',
        RoadOrStreet: '',
        LocalityOrArea: client.city ?? '-',
        CityOrTownOrDistrict: client.city ?? '',
        StateCode: (client.state ?? '11') as string,
        CountryCode: '91' as const,
        PinCode: client.pinCode,
        CountryCodeMobile: 91,
        MobileNo: mobileInt ?? 9999999999,
        EmailAddress: client.email ?? 'noreply@example.com',
      },
      SecondaryAdd: 'N' as const,
      Status: statusCode,
    };
  }

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
      ResidenceNo: '',
      ResidenceName: '',
      RoadOrStreet: client.address,
      LocalityOrArea: '',
      CityOrTownOrDistrict: client.city ?? '',
      StateCode: (client.state ?? '11') as string,
      CountryCode: '91',
      PinCode: client.pinCode,
      MobileNo: client.mobileNumber,
      EmailAddress: client.email,
    },
    SecondaryAdd: 'N' as const,
    ResidentialStatus: client.residentialStatus ?? 'RES',
    EmployerCategory: 'OTH' as const,
    ...(opts?.includeStatus ? { Status: opts.includeStatus } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildVerification(v: Verification, filingDate: string) {
  return {
    Declaration: {
      AssesseeVerName: v.AssesseeVerName,
      FatherName: v.FatherName,
      PlaceVerSign: v.PlaceVerSign,
      DateVerSign: v.DateVerSign || filingDate,
      Capacity: v.Capacity,
    },
    Verification: 'I',
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
          Description: 'For individuals being a resident (other than not ordinarily resident) having total income upto Rs.50 lakh, having Income from Salaries, one house property, other sources (Interest etc.), and agricultural income upto Rs.5000',
          AssessmentYear: ayToYear(rd.assessmentYear),
          SchemaVer: 'Ver1.0',
          FormVer: 'Ver1.0',
        },
        PersonalInfo: buildPersonalInfo(client),
        FilingStatus: {
          ReturnFileSec: rd.filingSection,
          OptOutNewTaxRegime: rd.regime === 'OLD' ? 'Y' : 'N',
          AsseseeRepFlg: 'N',
          ItrFilingDueDate: cfg.dueDateIndividual,
        },
        ITR1_IncomeDeductions: buildITR1IncomeDeductions(rd, summary, capped, rd.regime === 'NEW' ? cfg.stdDeduction_new : cfg.stdDeduction_old),
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
          BankAccountDtls: {
            AddtnlBankDetails: [{
              IFSCCode:      '',
              BankName:      '',
              BankAccountNo: '',
              AccountType:   'SB',
              IsPrimaryAccount: 'Y',
            }],
          },
        },
        TDSonSalaries: rd.tds ? buildTDSOnSalaries(rd.tds) : { TDSonSalary: [], TotalTDSonSalaries: 0 },
        TDSonOthThanSals: rd.tds ? buildTDSOnOtherIncome(rd.tds) : { TDSonOthThanSal: [], TotalTDSonOthThanSals: 0 },
        ScheduleTDS3Dtls: rd.tds ? buildTDS16C(rd.tds) : { TDS3Details: [], TotalTDS3Details: 0 },
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
        Verification: rd.verification ? buildVerification(rd.verification, date) : undefined,
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
            BankAccountDtls: {
              PriBankDetails: {
                IFSCCode:      '',
                BankName:      '',
                BankAccountNo: '',
                AccountType:   'SB',
              },
            },
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

        Verification: rd.verification ? buildVerification(rd.verification, date) : undefined,
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
            ItrFilingDueDate:            cfg.dueDateAudit,
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
          BankAccountDtls: {
            AddtnlBankDetails: [{
              IFSCCode:         '',
              BankName:         '',
              BankAccountNo:    '',
              AccountType:      'SB',
              IsPrimaryAccount: 'Y',
            }],
          },
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
        Verification: rd.verification ? buildVerification(rd.verification, date) : undefined,
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
        const crossHeads    = toI(bp5.dividendCreditedToPL) + toI(bp5.interestCreditedToPL)
                            + toI(bp5.rentalIncomeCreditedToPL) + toI(bp5.capitalGainCreditedToPL)
                            + toI(bp5.otherCrossHeadDeductions);
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
  function getSurchargeRate(inc: number): number {
    if (inc <= 5000000)   return 0;
    if (inc <= 10000000)  return 0.10;
    if (inc <= 20000000)  return 0.15;
    if (inc <= 50000000)  return 0.25;
    return 0.37;
  }
  // Surcharge on CG is capped at 15%
  const cgSurchargeRate  = Math.min(getSurchargeRate(grossTotalIncome), 0.15);
  const normalSurRate    = getSurchargeRate(grossTotalIncome);
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
  const deemedIncome115JC  = amtApplies ? grossTotalIncome : 0;
  const taxDeemed115JC     = amtApplies ? amtLiability : 0;

  // Interest u/s 234A/234B/234C/234F (user-entered; default 0)
  const int234A = toI(gen.interest234A);
  const int234B = toI(gen.interest234B);
  const int234C = toI(gen.interest234C);
  const int234F = toI(gen.interest234F);
  const totalInterest = int234A + int234B + int234C + int234F;

  // Taxes paid
  const advTax   = toI(rd.taxPayments?.TotalAdvanceTax);
  const tdsOther = toI(rd.tds?.TotalTDSOnOtherIncome);
  const tcs      = toI(rd.tds?.TotalTCS);
  const satTax   = toI(rd.taxPayments?.TotalSelfAssessmentTax);
  const totalTaxPaid = advTax + tdsOther + tcs + satTax;
  const netTaxLiab   = Math.max(0, grossTaxLiab + totalInterest - totalTaxPaid);
  const refund       = Math.max(0, totalTaxPaid - grossTaxLiab - totalInterest);

  // Bank for refund — pulled from returnData bankAccounts
  const primaryBank = (rd as any).bankAccounts?.[0];

  // Chapter VI-A deductions
  const cappedVIA = rd.deductions
    ? applyDeductionCaps(rd.deductions, grossTotalIncome)
    : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);
  const viaDeductions = cappedVIA.TotalChapVIADeductions;
  const totalIncome   = Math.max(0, grossTotalIncome - viaDeductions);

  const cylaInc = (n: number) => ({
    IncCYLA: { IncOfCurYrUnderThatHead: n, OthSrcLossNoRaceHorseSetoff: 0, IncOfCurYrAfterSetOff: n },
  });
  const bflaRow = (n: number) => ({
    IncBFLA: { IncOfCurYrAfterCYLABFLA: n, BFlossPrevYrUndSameHeadSetoff: 0, IncAfterBFLA: n },
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
          SWVersionNo:      sw.SWVersionNo,
          SWCreatedBy:      sw.SWCreatedBy,
          JSONCreatedBy:    sw.JSONCreatedBy,
          JSONCreationDate: date,
          IntermediaryCity: sw.IntermediaryCity ?? 'Delhi',
          Digest:           '-',
        },
        Form_ITR5: {
          FormName:       'ITR-5',
          Description:    'For persons other than- (i) individual, (ii) HUF, (iii) company and (iv) person filing Form ITR-7',
          AssessmentYear: effectiveAYYear,
          SchemaVer:      'Ver1.0',
          FormVer:        'Ver1.0',
        },
        // ── 139(8A) Updated Return ─────────────────────────────────────────────
        ...(upd ? {
          PartA_139_8A: {
            PAN:                         client.pan ?? '',
            Name:                        client.fullName ?? '',
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
            LaidOutIn_139_8A:    upd.laidOutFlag ? 'Y' : 'N',
            ITRFormUpdatingInc:  'ITR5',
            UpdatedReturnDuringPeriod: upd.periodCode ?? '1',
            ...(Array.isArray(upd.reasons) && upd.reasons.length > 0 ? {
              UpdatingInc: {
                ReasonsForUpdatingIncDtls: upd.reasons.map((r: string) => ({
                  ReasonsForUpdatingIncome: r,
                })),
              },
            } : {}),
          },
        } : {}),
        PartA_GEN1: {
          OrgFirmInfo: {
            AssesseeName: { SurNameOrOrgName: client.fullName ?? '' },
            PAN: client.pan ?? '',
            Address: {
              ResidenceNo:          client.address?.split(',')[0]?.trim() ?? '',
              LocalityOrArea:       client.city ?? '',
              CityOrTownOrDistrict: client.city ?? '',
              StateCode:            client.state ?? '07',
              CountryCode:          'IN',
              CountryCodeMobile:    91,
              MobileNo:             Number((client.mobileNumber ?? '9999999999').replace(/\D/g, '')) || 9999999999,
              EmailAddress:         client.email ?? '',
              ...(client.pinCode ? { PinCode: client.pinCode } : {}),
            },
            DateOFFormOrIncorp:   gen.dateOfFormation ?? '2000-01-01',
            StatusOrCompanyType:  entityStatus.StatusOrCompanyType,
            ...(entityStatus.SubStatus ? { SubStatus: entityStatus.SubStatus } : {}),
          },
          FilingStatus: {
            ReturnFileSec: {
              IncomeTaxSec: incomeTaxSec,
            },
            ResidentialStatus:     (client.residentialStatus ?? 'RES') === 'RNR' ? 'NOR' : (client.residentialStatus ?? 'RES'),
            BusinessTrustFlag:     'N',
            InvstmntFundRefrdSec115UB: 'N',
            ForeignExchangeFlag:   'N',
            StartUpDPIITFlag:      'N',
            ifMSME:                'N',
          },
        },
        PartA_GEN2: {
          LiableSec44AAflg:    gen.maintainsRegularBooks ? 'Y' : 'N',
          IncDclrdUs:          noAccountCase ? 'N' : 'N',
          LiableSec44ABflg:    gen.isAuditRequired ? 'Y' : 'N',
          LiableSec92Eflg:     'N',
          PrevYrMemPartChange: 'N',
          AuditedByAccountantFlg: gen.isAuditRequired ? 'Y' : 'N',
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
          // Rule 13: Nature of business — mandatory
          NatOfBus: {
            NatureOfBusiness: [{ Code: gen.businessCode || '19009' }],
          },
          // Rule 32: Partners/members/trustees info — mandatory for AOP/BOI/Trust
          ...(Array.isArray(gen.members) && gen.members.length > 0 ? {
            PartnerOrMemberInfo: gen.members.map((m: any) => ({
              PartnerOrMemberName: m.name ?? '',
              AddressDetailWithZipCode: {
                FlatDoorBlockNo:       m.flatNo ?? '',
                NameOfPremises:        m.buildingName ?? '',
                RoadOrStreet:          m.streetName ?? '',
                LocalityOrArea:        m.localityOrArea ?? '',
                CityOrTownOrDistrict:  m.cityOrTownOrDistrict ?? '',
                StateCode:             m.stateCode ?? '27',
                PinCode:               m.pinCode ?? '',
                CountryCode:           m.countryCode ?? '91',
              },
              SharePercentage:  Number(m.sharePercentage) || 0,
              Status:           m.status ?? 'TRUSTEE',
              RateOfInterest:   Number(m.rateOfInterest) || 0,
              RemunerationPaid: Math.round(Number(m.remunerationPaid) || 0),
              ...(m.pan ? { PAN: m.pan } : {}),
              ...(m.aadhaar ? { AadhaarCardNo: m.aadhaar } : {}),
            })),
          } : {}),
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
                TotCurrLiabilitiesProv: totCurrLiabilities + totProvisions,
              },
            },
            MiscExpndtr: toI(bs.MiscExpenditure),
            DeferredTaxAsset: toI(bs.DeferredTaxAsset),
            DebitBalPLAccount: toI(bs.DebitPLBalance),
            TotAppFund: totFixedAsset + totInvestments
              + totCurrAssetLoanAdv - (totCurrLiabilities + totProvisions)
              + toI(bs.MiscExpenditure) + toI(bs.DeferredTaxAsset) + toI(bs.DebitPLBalance),
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
            },
            TotCreditsToPL: totCreditsToPL,
          },
          DebitsToPL: {
            FreightOutward:     toI(pl.PL16),
            ConsumpStoresSpares: toI(pl.PL17),
            PowerAndFuel:       toI(pl.PL18),
            Rents:              toI(pl.PL19),
            RepairsBuilding:    toI(pl.PL20),
            RepairsMachinery:   toI(pl.PL21),
            TotalEmployeeComp:  toI(pl.PL22xi),
            TotalInsurance:     toI(pl.PL23i) + toI(pl.PL23ii) + toI(pl.PL23iii) + toI(pl.PL23iv),
            WorkmenWelfare:     toI(pl.PL24),
            Entertainment:      toI(pl.PL25),
            Hospitality:        toI(pl.PL26),
            Conference:         toI(pl.PL27),
            SalesPromotion:     toI(pl.PL28),
            Advertisement:      toI(pl.PL29),
            TotalCommission:    toI(pl.PL30i) + toI(pl.PL30ii),
            Royalty:            toI(pl.PL31i) + toI(pl.PL31ii),
            TotalProfFees:      toI(pl.PL32i) + toI(pl.PL32ii),
            HotelBoardingLodging: toI(pl.PL33),
            TravellingExpenses: toI(pl.PL34),
            ForeignTravelling:  toI(pl.PL35),
            ConveyanceExpenses: toI(pl.PL36),
            TelephoneExpenses:  toI(pl.PL37),
            GuestHouse:         toI(pl.PL38),
            ClubExpenses:       toI(pl.PL39),
            FestivalExpenses:   toI(pl.PL40),
            Scholarship:        toI(pl.PL41),
            Gift:               toI(pl.PL42),
            Donation:           toI(pl.PL43),
            TotalRatesAndTaxes: toI(pl.PL44x),
            AuditFee:           toI(pl.PL45),
            PartnersSalary:     toI(pl.PL46),
            OtherExpenses:      toI(pl.PL47),
            TotalBadDebts:      toI(pl.PL48iv),
            ProvisionBadDebts:  toI(pl.PL49),
            OtherProvisions:    toI(pl.PL50),
            InterestPaid:       toI(pl.PL52ia) + toI(pl.PL52ib) + toI(pl.PL52iia) + toI(pl.PL52iib),
            DepreciationPL:     toI(pl.PL53),
            NetProfitBeforeTax: toI(pl.NetProfitBeforeTaxes),
            TotDebitsToPL:      totDebitsToPL,
          },
        },

        // ── ScheduleBP (regular books case) ──────────────────────────────
        ...(!noAccountCase ? (() => {
          const netProfit       = toI(pl.NetProfitBeforeTaxes);
          const additions       = toI(bp5.personalExpenses) + toI(bp5.inadmissibleU40aIa) + toI(bp5.inadmissibleU40A3)
                                + toI(bp5.provisionIncomeTax) + toI(bp5.salaryToPartnersExcess)
                                + toI(bp5.interestToPartnersExcess) + toI(bp5.otherAdditions);
          const crossHeads      = toI(bp5.dividendCreditedToPL) + toI(bp5.interestCreditedToPL)
                                + toI(bp5.rentalIncomeCreditedToPL) + toI(bp5.capitalGainCreditedToPL)
                                + toI(bp5.otherCrossHeadDeductions);
          const bpDeds          = toI(bp5.depreciationITAct) + toI(bp5.deductionU35) + toI(bp5.deductionU10AA)
                                + toI(bp5.deductionU80IC) + toI(bp5.otherBPDeductions);
          const fromOtherHeads  = toI(bp5.amtFromOtherHeadsToBP);
          const taxableBPIncome = netProfit + additions + fromOtherHeads - crossHeads - bpDeds;
          return {
            ScheduleBP: {
              NetProfitOfBusOrProf: netProfit,
              AdditionsToNetProfit: additions,
              AmtDebToCPAofBusorProf: {
                PersonalExpenses:           toI(bp5.personalExpenses),
                InadmissU40aIA:             toI(bp5.inadmissibleU40aIa),
                InadmissU40A3:              toI(bp5.inadmissibleU40A3),
                ProvisionIncomeTax:         toI(bp5.provisionIncomeTax),
                ExcessSalaryPartners40b:    toI(bp5.salaryToPartnersExcess),
                ExcessInterestPartners40b:  toI(bp5.interestToPartnersExcess),
                OtherInadmissExpenses:      toI(bp5.otherAdditions),
                TotAmtDebToCPAofBusorProf:  additions,
              },
              AmtCrToP_L_NotTaxblBP: {
                DividendCreditedToPL:     toI(bp5.dividendCreditedToPL),
                InterestCreditedToPL:     toI(bp5.interestCreditedToPL),
                RentalIncomeCreditedToPL: toI(bp5.rentalIncomeCreditedToPL),
                CapGainCreditedToPL:      toI(bp5.capitalGainCreditedToPL),
                OtherCrossHeadAmts:       toI(bp5.otherCrossHeadDeductions),
                TotAmtCrToP_L_NotTaxblBP: crossHeads,
              },
              DeductFrmNetProfit: {
                DepreciationITAct:  toI(bp5.depreciationITAct),
                DeductionU35:       toI(bp5.deductionU35),
                DeductionU10AA:     toI(bp5.deductionU10AA),
                DeductionU80IC:     toI(bp5.deductionU80IC),
                OtherDeductions:    toI(bp5.otherBPDeductions),
                TotDeductFrmNetProfit: bpDeds,
              },
              IncChargblFromOtherHeads: fromOtherHeads,
              IncChargblUnderBP: Math.max(0, taxableBPIncome),
            },
          };
        })() : {}),

        // ── ScheduleHP ────────────────────────────────────────────────────
        ScheduleHP: rd.houseProperty
          ? {
              PropertyDetails:           rd.houseProperty.Properties.map(buildPropertyDetails),
              TotalIncomeChargeableUnHP: toI(rd.houseProperty.TotalIncomeFromHP),
            }
          : { PropertyDetails: [], TotalIncomeChargeableUnHP: 0 },

        // ── ScheduleOS ────────────────────────────────────────────────────
        ScheduleOS: {
          OtherSrcThanOwnRaceHorse: Math.max(0, osIncome),
          OthSrcItems: Array.isArray(rd.otherSources?.OtherSourceItems)
            ? rd.otherSources!.OtherSourceItems.map(buildOtherSourceItem)
            : [],
          DeductionUs57iia: toI(rd.otherSources?.DeductionUs57iia),
          IncomeOthSrc:     Math.max(0, osIncome),
        },

        // ── ScheduleCG ────────────────────────────────────────────────────
        ScheduleCGFor23: {
          ShortTermCapGainFor23: (() => {
            const stcg = rd.stcg;
            const otherAssets = stcg?.OtherEntries ?? [];
            return {
              EquityMFDTDtls111A: stcg?.Entries111A?.length
                ? {
                    ShareUnitSaleDetails111A: stcg.Entries111A.map(e => ({
                      ISIN:            e.isin ?? '',
                      ShareUnitName:   e.shareOrUnitName ?? '',
                      SaleValue:       toI(e.salesValue),
                      CostAcquisition: toI(e.purchaseCost),
                      Expenditure:     toI(e.expenditure),
                      GainLoss:        toI(e.gainLoss),
                    })),
                    TotalSaleValue:   stcg.Entries111A.reduce((s,e) => s + toI(e.salesValue), 0),
                    TotalCostOfAcq:   stcg.Entries111A.reduce((s,e) => s + toI(e.purchaseCost), 0),
                    TotalExpenditure: stcg.Entries111A.reduce((s,e) => s + toI(e.expenditure), 0),
                    TotalSTCG111A:    stcg111A,
                  }
                : undefined,
              NRITransacSec48Dtl:   { NRITransactionSec48: 0 },
              NRISecur115AD:        { NRISecuritiesIncome: 0, NRISecuritiesTax: 0 },
              SaleOnOtherAssets:    {
                SaleValue:       otherAssets.reduce((s,e) => s + toI(e.salesValue), 0),
                CostAcquisition: otherAssets.reduce((s,e) => s + toI(e.purchaseCost), 0),
                LowDeductions:   otherAssets.reduce((s,e) => s + toI(e.expenditure), 0),
                CapGain:         stcgOther,
              },
              TotalAmtDeemedStcg:       0,
              PassThrIncNatureSTCG:     0,
              TotalAmtNotTaxUsDTAAStcg: 0,
              TotalAmtTaxUsDTAAStcg:    0,
              TotalSTCG:                totalSTCG,
            };
          })(),
          LongTermCapGain23: (() => {
            const entries = rd.ltcg112A?.Entries ?? [];
            return {
              SaleOfEquityShareUs112A: entries.length
                ? {
                    SaleOfEquityDtls: entries.map(e => ({
                      ISIN:              e.ISIN ?? '',
                      ShareUnitName:     e.ShareOrUnitName ?? '',
                      SaleValue:         toI(e.SalesValue),
                      PurchaseCost:      toI(e.PurchaseCost),
                      FMVasOn31Jan2018:  toI(e.FMVasOn31Jan2018),
                      Expenditure:       toI(e.Expenditure),
                      GainLoss:          toI(e.GainLoss),
                    })),
                    TotalSaleValue:   entries.reduce((s,e) => s + toI(e.SalesValue), 0),
                    TotalCostOfAcq:   entries.reduce((s,e) => s + toI(e.PurchaseCost), 0),
                    TotalExpenditure: 0,
                    TotalLTCG112A:    ltcg112A,
                  }
                : undefined,
              NRIProvisoSec48:            { NRITransactionSec48: 0 },
              NRIOnSec112and115:          { NRISecuritiesIncome: 0, NRISecuritiesTax: 0 },
              NRISaleOfEquityShareUs112A: { NRIEquityIncome: 0, NRIEquityTax: 0 },
              NRISaleofForeignAsset:      { NRIForeignAssetIncome: 0, NRIForeignAssetTax: 0 },
              SaleofAssetNADtls:          { SaleValue: 0, CostAcquisition: 0, LowDeductions: 0, CapGain: 0 },
              TotalAmtDeemedLtcg:         0,
              PassThrIncNatureLTCG:       0,
              TotalAmtNotTaxUsDTAALtcg:   0,
              TotalAmtTaxUsDTAALtcg:      0,
              TotalLTCG:                  ltcg112A,
            };
          })(),
          SumOfCGIncm:        totalCG,
          IncmFromVDATrnsf:   0,
          TotScheduleCGFor23: totalCG,
        },

        // ── ScheduleSI (Special Income rates) ────────────────────────────
        ScheduleSI: {
          SIDetails: [
            ...(stcg111A > 0 ? [{ SecCode: '1A', SplRateInc: stcg111A, SplRateIncTax: taxOnSTCG111A }] : []),
            ...(ltcg112A > 0 ? [{ SecCode: '112A', SplRateInc: ltcg112A, SplRateIncTax: taxOnLTCG112A }] : []),
          ],
          TotSplRateInc:    stcg111A + ltcg112A,
          TotSplRateIncTax: taxOnSTCG111A + taxOnLTCG112A,
        },

        // ── ScheduleVIA ───────────────────────────────────────────────────
        ...(rd.deductions ? {
          ScheduleVIA: { UsrDeductions: buildUsrDeductions(rd.deductions) },
        } : {}),

        // ── ScheduleGST ───────────────────────────────────────────────────
        ScheduleGST: {
          GSTINDtls: Array.isArray(gen.gstDetails)
            ? gen.gstDetails.map((g: any) => ({
                GSTIN:              g.gstin ?? '',
                GSTTurnover:        toI(g.turnover),
                NameOfBusiness:     g.businessName ?? '',
                RegistrationStatus: g.registrationStatus ?? 'REG',
              }))
            : [],
          TotTurnover: toI(gen.gstTurnover),
        },

        // ── ScheduleCYLA ─────────────────────────────────────────────────
        ScheduleCYLA: {
          HP: cylaInc(Math.max(0, hpIncome)),
          STCG20Per:    cylaInc(stcg111A),
          STCG30Per:    cylaInc(0),
          STCGAppRate:  cylaInc(stcgOther),
          STCGDTAARate: cylaInc(0),
          LTCG12_5Per:  cylaInc(ltcg112A),
          LTCGDTAARate: cylaInc(0),
          OthSrcExclRaceHorse: cylaInc(Math.max(0, osIncome)),
          BusinessIncome: cylaInc(Math.max(0, bpIncome)),
          TotalCurYr: {
            TotalCurYrInc:  grossTotalIncome,
            TotalCurYrLoss: 0,
          },
          TotalLossSetOff:  { TotalLossSetOff: 0 },
          LossRemAftSetOff: { LossRemainingAfterSetOff: 0 },
        },

        // ── ScheduleBFLA ─────────────────────────────────────────────────
        ScheduleBFLA: {
          HP:           bflaRow(Math.max(0, hpIncome)),
          STCG20Per:    bflaRow(stcg111A),
          STCG30Per:    bflaRow(0),
          STCGAppRate:  bflaRow(stcgOther),
          STCGDTAARate: bflaRow(0),
          LTCG12_5Per:  bflaRow(ltcg112A),
          LTCGDTAARate: bflaRow(0),
          BusinessIncome: bflaRow(Math.max(0, bpIncome)),
          IncomeOfCurrYrAftCYLABFLA: grossTotalIncome,
          TotalBFLossSetOff: 0,
        },

        // ── ScheduleCFL ───────────────────────────────────────────────────
        ScheduleCFL: {
          LossCFFromPrev8: { TotalLossCFFromPrev8: 0 },
          TotalOfBFLosses: { TotalBFLoss: 0 },
          CurrentYrLoss:   { TotalCurrentYrLoss: 0 },
        },

        // ── ScheduleEI (Exempt Income) ────────────────────────────────────
        ScheduleEI: (() => {
          const agriInc  = toI(gen.agriIncome);
          const othItems = Array.isArray(gen.exemptIncome) ? gen.exemptIncome : [];
          const othTotal = othItems.reduce((s: number, item: any) => s + toI(item.amount), 0);
          return {
            ExemptIncAgri:      agriInc,
            ExemptIncAgriType:  [],
            ExemptIncAgriTotal: agriInc,
            ExemptIncOthers:    othItems,
            TotExemptInc:       agriInc + othTotal,
          };
        })(),

        // ── PartB-TI ─────────────────────────────────────────────────────
        'PartB-TI': {
          IncomeFromHP:  Math.max(0, hpIncome),
          CapGain: {
            ShortTerm: {
              ShortTerm20Per:       stcg111A,
              ShortTerm30Per:       0,
              ShortTermAppRate:     stcgOther,
              ShortTermSplRateDTAA: 0,
              TotalShortTerm:       totalSTCG,
            },
            LongTerm: {
              LongTerm12_5Per:     ltcg112A,
              LongTermSplRateDTAA: 0,
              TotalLongTerm:       ltcg112A,
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
          ProfitsAndGainsFromBP: Math.max(0, bpIncome),
          TotalTI:                  grossTotalIncome,
          CurrentYearLoss:          0,
          BalanceAfterSetoffLosses: grossTotalIncome,
          BroughtFwdLossesSetoff:   0,
          GrossTotalIncome:         grossTotalIncome,
          IncChargeTaxSplRate111A112: stcg111A + ltcg112A,
          DeductionsUnderScheduleVIA: viaDeductions,
          TotalIncome:               totalIncome,
          IncChargeableTaxSplRates:  stcg111A + ltcg112A,
          NetAgricultureIncomeOrOtherIncomeForRate: 0,
          AggregateIncome:           totalIncome,
          LossesOfCurrentYearCarriedFwd: 0,
          DeemedIncomeUs115JC:       deemedIncome115JC,
        },

        // ── PartB_TTI ─────────────────────────────────────────────────────
        PartB_TTI: {
          TaxPayDeemedTotIncUs115JC:  taxDeemed115JC,
          Surcharge:                  surcharge,
          HealthEduCess:              cess,
          TotalTaxPayablDeemedTotInc: 0,
          ComputationOfTaxLiability: {
            TaxPayableOnTI:               taxPayableOnTI,
            Rebate87A:                    0,
            TaxPayableOnRebate:           taxPayableOnTI,
            Surcharge25ofSI:              surchargeOnCG,
            SurchargeOnAboveCrore:        surchargeOnNormal,
            Surcharge25ofSIBeforeMarginal: surchargeOnCG,
            SurchargeOnAboveCroreBeforeMarginal: surchargeOnNormal,
            TotalSurcharge:               surcharge,
            EducationCess:                cess,
            GrossTaxLiability:            grossTaxLiab,
            GrossTaxPayable:              grossTaxLiab,
            GrossTaxPay:                  grossTaxLiab,
            CreditUS115JD:                0,
            TaxPayAfterCreditUs115JD:     grossTaxLiab,
            TaxRelief:                    0,
            NetTaxLiability:              netTaxLiab,
            IntrstPay: {
              IntrstPayUs234A: int234A,
              IntrstPayUs234B: int234B,
              IntrstPayUs234C: int234C,
              IntrstPayUs234F: int234F,
              TotalIntrstPay:  totalInterest,
            },
            AggregateTaxInterestLiability: netTaxLiab,
          },
          TaxPaid: {
            TaxesPaid: {
              AdvanceTax:        advTax,
              TDS2:              tdsOther,
              TCS:               tcs,
              SelfAssessmentTax: satTax,
              TotalTaxesPaid:    totalTaxPaid,
            },
          },
          Refund: {
            RefundDue: refund,
            BankAccountDtls: {
              PriBankDetails: {
                IFSCCode:      primaryBank?.ifscCode ?? '',
                BankName:      primaryBank?.bankName ?? '',
                BankAccountNo: primaryBank?.accountNumber ?? '',
                AccountType:   (primaryBank?.accountType as string) ?? 'SB',
              },
            },
          },
          AssetOutIndiaFlag: 'N',
        },

        // ── ScheduleTDS2 (TDS on income other than salary) ───────────────
        ScheduleTDS2: rd.tds ? buildTDSOnOtherIncome(rd.tds) : { TDSonOthThanSal: [], TotalTDSonOthThanSals: 0 },

        // ── ScheduleTDS3 (TDS u/s 194IB rent) ────────────────────────────
        ScheduleTDS3Dtls: rd.tds ? buildTDS16C(rd.tds) : { TDS3Details: [], TotalTDS3Details: 0 },

        // ── ScheduleIT (advance tax / self-assessment challans) ───────────
        ScheduleIT: rd.taxPayments ? buildTaxPayments(rd.taxPayments) : { TotalTaxPayments: 0 },

        // ── Verification ─────────────────────────────────────────────────
        Verification: rd.verification ? buildVerification(rd.verification, date) : undefined,
      },
    },
  };
}

export function buildITRJson(input: BuildITRInput): object {
  switch (input.returnData.formType) {
    case 'ITR-1': return buildITR1(input);
    case 'ITR-2': return buildITR2(input);
    case 'ITR-4': return buildITR4(input);
    case 'ITR-5': return buildITR5(input);
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
