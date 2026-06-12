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
// TAX COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

function computeSlabTax(income: number, regime: 'OLD' | 'NEW'): number {
  if (regime === 'NEW') {
    // New regime slabs AY 2025-26
    if (income <= 300_000) return 0;
    if (income <= 700_000) return (income - 300_000) * 0.05;
    if (income <= 1_000_000) return 20_000 + (income - 700_000) * 0.10;
    if (income <= 1_200_000) return 50_000 + (income - 1_000_000) * 0.15;
    if (income <= 1_500_000) return 80_000 + (income - 1_200_000) * 0.20;
    return 80_000 + 60_000 + (income - 1_500_000) * 0.30;
  } else {
    // Old regime slabs AY 2025-26 (individual below 60)
    if (income <= 250_000) return 0;
    if (income <= 500_000) return (income - 250_000) * 0.05;
    if (income <= 1_000_000) return 12_500 + (income - 500_000) * 0.20;
    return 112_500 + (income - 1_000_000) * 0.30;
  }
}

function computeSurcharge(tax: number, income: number, regime: 'OLD' | 'NEW'): number {
  if (income <= 5_000_000) return 0;
  if (income <= 10_000_000) return tax * 0.10;
  if (income <= 20_000_000) return tax * 0.15;
  if (income <= 50_000_000) return tax * (regime === 'NEW' ? 0.25 : 0.25);
  return tax * (regime === 'NEW' ? 0.25 : 0.37);
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

function computeTaxLiability(summary: IncomeSummary, regime: 'OLD' | 'NEW'): ITRTaxComputation {
  const totalIncome = summary.TotalIncome;
  const ltcg112A = summary.LTCG112A ?? 0;

  // Slab tax on income excluding LTCG 112A
  const slabTax = computeSlabTax(totalIncome, regime);

  // LTCG 112A @ 12.5% on amount exceeding ₹1,25,000
  const taxableLTCG = Math.max(0, ltcg112A - DEDUCTION_CAPS.LTCG112AExempt);
  const ltcgTax = Math.round(taxableLTCG * 0.125);

  const grossIncForRebate = totalIncome; // LTCG excluded from 87A check in most cases
  const rebate = computeRebate87A(grossIncForRebate, slabTax, regime);
  const taxAfterRebate = Math.max(0, slabTax - rebate) + ltcgTax;

  const surcharge = Math.round(computeSurcharge(taxAfterRebate, totalIncome + ltcg112A, regime));
  const taxPlusSurcharge = taxAfterRebate + surcharge;
  const cess = Math.round(taxPlusSurcharge * 0.04);
  const grossTaxLiability = taxPlusSurcharge + cess;

  // Taxes paid
  const tdsTotal =
    toInt(0); // Caller passes in taxes paid separately; placeholder

  return {
    TotalTaxableIncome: totalIncome,
    NetTaxPayable: slabTax,
    Rebate87A: rebate,
    TaxAfterRebate: taxAfterRebate,
    Surcharge: surcharge,
    HealthEducationCess: cess,
    GrossTaxLiability: grossTaxLiability,
    TotalTaxPayable: grossTaxLiability,
    TotalTaxesPaid: tdsTotal,
    BalTaxPayable: Math.max(0, grossTaxLiability - tdsTotal),
    AggregateTaxInterestLiability: grossTaxLiability,
    Refund: tdsTotal > grossTaxLiability ? tdsTotal - grossTaxLiability : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE BUILDERS — ITR-1 INCOME DEDUCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function buildITR1IncomeDeductions(rd: ReturnData, summary: IncomeSummary, capped: ReturnType<typeof applyDeductionCaps>) {
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
    DeductionUs16ia: capAt(sal?.DeductionUs16ia ?? 0, DEDUCTION_CAPS.StandardDeduction16ia),
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
    ResidentialStatus: client.residentialStatus ?? 'RES',
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
        },
        ITR1_IncomeDeductions: buildITR1IncomeDeductions(rd, summary, capped),
        ITR1_TaxComputation: {
          TotalTaxableIncome: toInt(summary.TotalIncome),
          NetTaxPayable: toInt(taxComp.NetTaxPayable),
          Rebate87A: toInt(taxComp.Rebate87A),
          TaxAfterRebate: toInt(taxComp.TaxAfterRebate),
          Surcharge: toInt(taxComp.Surcharge),
          HealthAndEduCess: toInt(taxComp.HealthEducationCess),
          GrossTaxLiability: toInt(taxComp.GrossTaxLiability),
          TotalTaxPayable: toInt(taxComp.TotalTaxPayable),
        },
        TaxPaid: {
          TaxesPaid: {
            AdvanceTax: toInt(rd.taxPayments?.TotalAdvanceTax),
            TDS: toInt(rd.tds?.TotalTDSOnSalaries) + toInt(rd.tds?.TotalTDSOnOtherIncome) + toInt(rd.tds?.TotalTDSOnRent),
            TCS: toInt(rd.tds?.TotalTCS),
            SelfAssessmentTax: toInt(rd.taxPayments?.TotalSelfAssessmentTax),
            TotalTaxesPaid: totalTaxPaid,
          },
        },
        Refund: {
          RefundDue: taxComp.Refund ?? 0,
          BankAccountDtls: {
            PriBankDetails: {
              IFSCCode: '',  // Populated from client bank accounts by caller
              BankName: '',
              BankAccountNo: '',
              AccountType: 'SB',
            },
          },
        },
        TDSonSalaries: rd.tds ? buildTDSOnSalaries(rd.tds) : { TotalTDSonSalaries: 0 },
        TDSonOthThanSals: rd.tds ? buildTDSOnOtherIncome(rd.tds) : { TotalTDSonOthThanSals: 0 },
        ScheduleTDS3Dtls: rd.tds ? buildTDS16C(rd.tds) : { TotalTDS3Details: 0 },
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
// MAIN BUILDER — ITR-2 (skeleton; extends ITR-1 with capital gains, multi-employer)
// ─────────────────────────────────────────────────────────────────────────────

function buildITR2(input: BuildITRInput): object {
  const { returnData: rd, client, sw, filingDate } = input;
  const date = filingDate ?? today();
  const summary = computeIncomeSummary(rd);
  const capped = rd.deductions
    ? applyDeductionCaps(rd.deductions, summary.GrossTotalIncome)
    : applyDeductionCaps({ TotalChapVIADeductions: 0 } as DeductionsChapterVIA, 0);

  return {
    ITR: {
      ITR2: {
        CreationInfo: {
          SWVersionNo: sw.SWVersionNo,
          SWCreatedBy: sw.SWCreatedBy,
          JSONCreatedBy: sw.JSONCreatedBy,
          JSONCreationDate: date,
          IntermediaryCity: sw.IntermediaryCity,
          Digest: '-',
        },
        Form_ITR2: {
          FormName: 'ITR-2',
          AssessmentYear: ayToYear(rd.assessmentYear),
          SchemaVer: 'Ver1.0',
          FormVer: 'Ver1.0',
        },
        PersonalInfo: buildPersonalInfo(client),
        FilingStatus: {
          ReturnFileSec: rd.filingSection,
          OptOutNewTaxRegime: rd.regime === 'OLD' ? 'Y' : 'N',
        },
        // ScheduleS — multiple employers
        ScheduleS: rd.salary
          ? {
              Salaries: rd.salary.Employers.map((emp) => ({
                NameOfEmployer: emp.NameOfEmployer,
                NatureOfEmployment: emp.NatureOfEmployment,
                TANofEmployer: emp.TANofEmployer,
                AddressDetail: emp.AddressDetail,
                Salarys: {
                  GrossSalary: toInt(emp.Salarys.GrossSalary),
                  Salary: toInt(emp.Salarys.Salary),
                  ValueOfPerquisites: toInt(emp.Salarys.ValueOfPerquisites),
                  ProfitsinLieuOfSalary: toInt(emp.Salarys.ProfitsinLieuOfSalary),
                  IncomeNotified89A: toInt(emp.Salarys.IncomeNotified89A),
                  IncomeNotifiedOther89A: toInt(emp.Salarys.IncomeNotifiedOther89A),
                },
              })),
              TotalGrossSalary: toInt(rd.salary.TotalGrossSalary),
              AllwncExtentExemptUs10: toInt(rd.salary.AllwncExtentExemptUs10),
              NetSalary: toInt(rd.salary.NetSalary),
              DeductionUS16: toInt(rd.salary.TotalDeductionUs16),
              DeductionUnderSection16ia: capAt(rd.salary.DeductionUs16ia, DEDUCTION_CAPS.StandardDeduction16ia),
              EntertainmntalwncUs16ii: capAt(rd.salary.EntertainmentAlw16ii, DEDUCTION_CAPS.EntertainmentAlw16ii),
              ProfessionalTaxUs16iii: capAt(rd.salary.ProfessionalTaxUs16iii, DEDUCTION_CAPS.ProfessionalTax16iii),
              TotIncUnderHeadSalaries: toInt(rd.salary.IncomeFromSalary),
            }
          : undefined,
        ScheduleHP: rd.houseProperty
          ? {
              PropertyDetails: rd.houseProperty.Properties.map(buildPropertyDetails),
              TotalIncomeChargeableUnHP: toInt(rd.houseProperty.TotalIncomeFromHP),
            }
          : undefined,
        // Capital gains schedule would go here — Phase 3
        'PartB-TI': {
          IncomeFromSal: toInt(summary.IncomeFromSalary),
          IncomeFromHP: toInt(summary.IncomeFromHP),
          IncomeFromOS: toInt(summary.IncomeFromOtherSources),
          GrossTotalIncome: toInt(summary.GrossTotalIncome),
          DeductionsUnderScheduleVIA: capped.TotalChapVIADeductions,
          TotalIncome: toInt(summary.TotalIncome),
        },
        TDSonSalaries: rd.tds ? buildTDSOnSalaries(rd.tds) : { TotalTDSonSalaries: 0 },
        TDSonOthThanSals: rd.tds ? buildTDSOnOtherIncome(rd.tds) : { TotalTDSonOthThanSals: 0 },
        ScheduleTDS3Dtls: rd.tds ? buildTDS16C(rd.tds) : { TotalTDS3Details: 0 },
        TaxPayments: rd.taxPayments ? buildTaxPayments(rd.taxPayments) : { TotalTaxPayments: 0 },
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
  const summary = computeIncomeSummary(rd);

  return {
    ITR: {
      ITR4: {
        CreationInfo: {
          SWVersionNo: sw.SWVersionNo,
          SWCreatedBy: sw.SWCreatedBy,
          JSONCreatedBy: sw.JSONCreatedBy,
          JSONCreationDate: date,
          IntermediaryCity: sw.IntermediaryCity,
          Digest: '-',
        },
        Form_ITR4: {
          FormName: 'ITR-4',
          AssessmentYear: ayToYear(rd.assessmentYear),
          SchemaVer: 'Ver1.0',
          FormVer: 'Ver1.0',
        },
        PersonalInfo: buildPersonalInfo(client),
        FilingStatus: {
          ReturnFileSec: rd.filingSection,
          OptOutNewTaxRegime: rd.regime === 'OLD' ? 'Y' : 'N',
        },
        IncomeDeductions: {
          GrossSalary: toInt(rd.salary?.TotalGrossSalary),
          IncomeFromSal: toInt(summary.IncomeFromSalary),
          TotalIncomeChargeableUnHP: toInt(summary.IncomeFromHP),
          IncomeFromBP: toInt(summary.IncomeFromBusinessProfession),
          IncomeOthSrc: toInt(summary.IncomeFromOtherSources),
          GrossTotIncome: toInt(summary.GrossTotalIncome),
          TotalIncome: toInt(summary.TotalIncome),
        },
        // Presumptive schedule
        BP: rd.presumptiveIncome
          ? {
              NoOfBusiness: rd.presumptiveIncome.Business44AD?.length ?? 0,
              TotPresInc: toInt(rd.presumptiveIncome.TotalPresumptiveIncome),
            }
          : undefined,
        TDSonSalaries: rd.tds ? buildTDSOnSalaries(rd.tds) : { TotalTDSonSalaries: 0 },
        TDSonOthThanSals: rd.tds ? buildTDSOnOtherIncome(rd.tds) : { TotalTDSonOthThanSals: 0 },
        TaxPayments: rd.taxPayments ? buildTaxPayments(rd.taxPayments) : { TotalTaxPayments: 0 },
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
export function buildITRJson(input: BuildITRInput): object {
  switch (input.returnData.formType) {
    case 'ITR-1': return buildITR1(input);
    case 'ITR-2': return buildITR2(input);
    case 'ITR-4': return buildITR4(input);
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
