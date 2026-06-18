/**
 * shared/types/itr.ts
 *
 * TypeScript types derived from official ITR JSON schemas for AY 2025-26:
 *   - ITR-1_2026_Main_V1.0_0.json  (Individuals — salary + one house property + other sources)
 *   - ITR-2_2026_Main_V1.0_0.json  (Individuals/HUF — capital gains, multiple properties, foreign assets)
 *   - ITR-4_2026_Main_V1.0_0.json  (Individuals/HUF/Firms — presumptive income u/s 44AD/44ADA/44AE)
 *
 * Rules:
 *  - All monetary amounts are integers (values in rupees, whole numbers only — no paise).
 *  - Dates are always "YYYY-MM-DD" strings.
 *  - PAN pattern: [A-Z]{5}[0-9]{4}[A-Z]
 *  - TAN pattern: [A-Z]{4}[0-9]{5}[A-Z]
 *  - Aadhaar pattern: [0-9]{12}
 *
 * These types are used by:
 *  - shared/utils/itrBuilder.ts        — to assemble ITR JSON from DB data
 *  - renderer components               — for form state typing
 *  - electron/main/ipc/returnHandlers  — for return save/load operations
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS & LITERAL UNIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Which ITR form is applicable */
export type ITRFormType = 'ITR-1' | 'ITR-2' | 'ITR-4' | 'ITR-5';

/** Tax regime */
export type TaxRegime = 'OLD' | 'NEW';

/** Nature of employment (employer category) */
export type NatureOfEmployment =
  | 'CGOV'  // Central Government
  | 'SGOV'  // State Government
  | 'PSU'   // Public Sector Undertaking
  | 'PE'    // Pensioners - Central Government
  | 'PESG'  // Pensioners - State Government
  | 'PEPS'  // Pensioners - Public Sector Undertaking
  | 'PEO'   // Pensioners - Others
  | 'OTH';  // Others

/** Property usage type */
export type PropertyType =
  | 'S'  // Self Occupied
  | 'L'  // Let Out
  | 'D'; // Deemed Let Out

/** Property owner type */
export type PropertyOwner =
  | 'SE'  // Self
  | 'MI'  // Minor
  | 'SP'  // Spouse
  | 'OT'; // Others

/** Loan source for Section 24B */
export type LoanTakenFrom = 'B' | 'I'; // Bank | Institution/Other

/** Other source income nature codes */
export type OtherSourceNature =
  | 'SAV'          // Interest from Savings Account
  | 'IFD'          // Interest from Deposit (Bank/Post Office/Co-op)
  | 'TAX'          // Interest from IT Refund
  | 'FAP'          // Family Pension
  | 'DIV'          // Dividend
  | '10(11)(iP)'   // PF interest taxable (first proviso s.10(11))
  | '10(11)(iiP)'  // PF interest taxable (second proviso s.10(11))
  | '10(12)(iP)'   // PF interest taxable (first proviso s.10(12))
  | '10(12)(iiP)'  // PF interest taxable (second proviso s.10(12))
  | 'OTH';         // Any Other

/** Allowance exemption codes under Section 10 */
export type AllowanceExemptCode =
  | '10(5)'                // Leave Travel Concession
  | '10(6)'                // Remuneration as embassy official
  | '10(7)'                // Allowances paid outside India by Govt.
  | '10(10)'               // Death-cum-retirement gratuity
  | '10(10A)'              // Commuted pension
  | '10(10AA)'             // Earned leave encashment on retirement
  | '10(10B)(i)'           // Compensation — CG gazette notification limit
  | '10(10B)(ii)'          // Compensation — CG approved scheme
  | '10(10C)'              // VRS amount
  | '10(10CC)'             // Tax paid by employer on non-monetary perquisite
  | '10(13A)'              // HRA — actual allowance to meet house rent
  | '10(14)(i)'            // Prescribed allowances for work expenses
  | '10(14)(ii)'           // Prescribed personal expense allowances
  | '10(14)(i)(115BAC)'
  | '10(14)(ii)(115BAC)'
  | 'EIC'                  // Exempt income — Supreme Court/High Court judges
  | '10(17)';              // Allowance for MP/MLA/MLC

/** Exempt income category under Section 10 */
export type ExemptIncomeCategory =
  | 'AGRI'  // Agricultural & related incomes
  | 'GOVC'  // Compensation from Govt.
  | 'ISI'   // Income from specified investments
  | 'SSRA'  // Specified sums — armed forces
  | 'SRSC'  // Senior Citizens/Minors
  | 'SRST'  // Specified category of taxpayers
  | 'SRPC'  // Sums from LIC/NPS/PF/Sukanya Samriddhi
  | 'OTH';  // Other

/** TDS section codes (Form 16A / 26AS) */
export type TDSSection =
  | '92A' | '92B' | '92C' | '192A' | '193' | '194'
  | '94A' | '94B' | '94BA' | '4BB' | '94C' | '94D'
  | '4DA' | '94E' | '4EE' | '4F' | '4G' | '4H'
  | '4-IA' | '4-IB' | '4IA' | '4IB' | '4IC'
  | '94J-A' | '94J-B' | '94K' | '4LA' | '4LB'
  | '4LC1' | '4LC2' | '4LC3'
  | '4BA1' | '4BA2' | 'LBA1' | 'LBA2' | 'LBA3' | 'LBB'
  | '94R' | '94S' | '94B-P' | '94R-P' | '94S-P' | 'LBC'
  | '4LD' | '94M' | '94N' | '94N-F' | '94N-C' | '94N-FT'
  | '94O' | '94P' | '94Q' | '195'
  | '96A' | '96B' | '96C' | '96D' | '96DA' | '94BA-P';

/** Deduction year (year in which TDS was deducted) */
export type DeductedYear =
  | '2025' | '2024' | '2023' | '2022' | '2021' | '2020'
  | '2019' | '2018' | '2017' | '2016' | '2015' | '2014'
  | '2013' | '2012' | '2011' | '2010' | '2009' | '2008';

/** State codes per Income Tax dept. */
export type StateCode =
  | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10'
  | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20'
  | '21' | '22' | '23' | '24' | '25' | '26' | '27' | '28' | '29' | '30'
  | '31' | '32' | '33' | '34' | '35' | '36' | '37' | '99'; // 99 = Foreign

/** Metro / Non-Metro for HRA calculation */
export type PlaceOfWork = '1' | '2'; // 1 = Metro, 2 = Non-Metro

/** Filing section codes */
export type FilingSection =
  | '11'  // 139(1) — On or before due date
  | '12'  // 139(4) — After due date
  | '13'  // 142(1)
  | '14'  // 148
  | '16'  // 153C
  | '17'  // 139(5) — Revised
  | '18'  // 139(9)
  | '20'; // 119(2)(b) — After condonation of delay

/** Verification capacity */
export type VerificationCapacity = 'S' | 'R'; // Self | Representative

/** Disability type for 80DD / 80U */
export type DisabilityType = '1' | '2'; // 1 = Normal disability, 2 = Severe disability

/** Disability nature for 80DD */
export type DisabilityNature = '1' | '2'; // 1 = Autism/Cerebral Palsy/Multiple, 2 = Others

/** Disease name for 80DDB */
export type SpecialDisease80DDB =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'
  | 'i' | 'j' | 'k' | 'l' | 'm' | 'n';
// a=Dementia, b=Dystonia, c=Motor Neuron, d=Ataxia, e=Chorea, f=Hemiballismus,
// g=Aphasia, h=Parkinson's, i=Malignant Cancers, j=AIDS, k=Chronic Renal,
// l=Hematological, m=Hemophilia, n=Thalassaemia

/** 80DDB claimant type */
export type Claimant80DDB = '1' | '2'; // 1 = Self/Dependent, 2 = Self/Dependent Senior Citizen

/** Pension fund identifier type */
export type PranIdentifierType = 'PRAN' | 'OTHPRAN';

/** Tax payment type for advance tax / self-assessment */
export type TaxPaymentType = 'ADVANCE_TAX' | 'SELF_ASSESSMENT';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BUILDING BLOCKS
// ─────────────────────────────────────────────────────────────────────────────

/** Address for employer / deductor (no country code required) */
export interface AddressDetail {
  AddrDetail: string;            // max 200 chars
  CityOrTownOrDistrict: string;  // max 50 chars
  StateCode: StateCode;
  PinCode?: number;              // 100000–999999
  ZipCode?: string;              // max 8 chars (for foreign addresses)
}

/** Address with country code (used in PropertyDetails) */
export interface AddressDetailWithZipCode {
  AddrDetail: string;
  CityOrTownOrDistrict: string;
  StateCode: StateCode;
  CountryCode: string;  // numeric country code string e.g. "91" for India
  PinCode?: number;
  ZipCode?: string;
}

/** Employer / Deductor / Collector details (used in TDS entries) */
export interface EmployerOrDeductorDetails {
  TAN: string;           // TAN pattern [A-Z]{4}[0-9]{5}[A-Z]
  EmployerName: string;  // max 125 chars
  AddressDetail?: AddressDetail;
}

/** Dividend income quarterly split (used for 234C advance tax calculation) */
export interface DividendDateRange {
  DateRange: {
    Upto15Of6: number;        // Q1: Apr 1 – Jun 15
    Upto15Of9: number;        // Q2: Jun 16 – Sep 15
    Up16Of9To15Of12: number;  // Q3: Sep 16 – Dec 15
    Up16Of12To15Of3: number;  // Q4: Dec 16 – Mar 15
    Up16Of3To31Of3: number;   // Q4 tail: Mar 16 – Mar 31
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE S — SALARY
// ─────────────────────────────────────────────────────────────────────────────

/** A single employer's salary breakup (ITR-2 Salaries definition) */
export interface EmployerSalaryEntry {
  NameOfEmployer: string;           // max 125 chars
  NatureOfEmployment: NatureOfEmployment;
  TANofEmployer?: string;           // [A-Z]{4}[0-9]{5}[A-Z]
  AddressDetail: AddressDetail;
  Salarys: {
    GrossSalary: number;
    Salary: number;                 // Basic + DA
    ValueOfPerquisites: number;
    ProfitsinLieuOfSalary: number;
    IncomeNotified89A: number;      // Relief u/s 89A — notified country
    IncomeNotifiedOther89A: number;
    IncomeNotifiedPrYr89A?: number;
    NatureOfSalary?: Array<{ NatureDesc: string; Amount: number }>;
    NatureOfPerquisites?: Array<{ PerqDesc: string; Amount: number }>;
    NatureOfProfitInLieuOfSalary?: Array<{ ProfitDesc: string; Amount: number }>;
  };
}

/** Allowance exemption item under Section 10 */
export interface AllowanceExemptItem {
  SalNatureDesc: AllowanceExemptCode;
  SalOthAmount: number;
}

/** HRA calculation worksheet (Section 10(13A)) */
export interface HRADetails {
  Placeofwork: PlaceOfWork;        // 1 = Metro, 2 = Non-Metro
  ActlHRARecv: number;             // Actual HRA received from employer
  ActlRentPaid: number;            // Actual rent paid by employee
  DtlsSalUsSec171: number;         // Basic salary (for 10% calculation)
  ActlRentPaid10Per: number;       // ActlRentPaid minus 10% of basic
  Sal40Or50Per: number;            // 40% (non-metro) or 50% (metro) of basic
  EligbleExmpAllwncUs13A: number;  // Least of three = exempt HRA
}

/** Full salary schedule — covers both ITR-1 (single employer) and ITR-2 (multiple employers) */
export interface ScheduleSalary {
  // ITR-2 style: array of employers. ITR-1 uses first entry only.
  Employers: EmployerSalaryEntry[];

  // Totals
  TotalGrossSalary: number;
  AllwncExtentExemptUs10: number;    // Total exempt u/s 10 allowances
  AllwncExemptUs10Items: AllowanceExemptItem[];

  // HRA (Section 10(13A))
  HRADetails?: HRADetails;

  // Net after exempt allowances
  NetSalary: number;

  // Deductions u/s 16
  DeductionUs16ia: number;           // Standard deduction (max ₹75,000 AY 2025-26)
  EntertainmentAlw16ii: number;      // Entertainment allowance (max ₹5,000, Govt only)
  ProfessionalTaxUs16iii: number;    // Professional tax (max ₹5,000)
  TotalDeductionUs16: number;

  // Income from salary (after u/s 16 deductions)
  IncomeFromSalary: number;

  // Relief u/s 89A (income from foreign retirement accounts)
  Increliefus89A?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE HP — HOUSE PROPERTY
// ─────────────────────────────────────────────────────────────────────────────

/** Co-owner details */
export interface CoOwner {
  CoOwnersSNo: number;
  NameCoOwner: string;           // max 125 chars
  PAN_CoOwner?: string;
  Aadhaar_CoOwner?: string;
  PercentShareProperty?: number; // 0.00–100.00
}

/** Tenant details (for let-out property) */
export interface TenantDetail {
  TenantSNo: number;
  NameofTenant: string;          // max 125 chars
  PANofTenant?: string;
  AadhaarofTenant?: string;
  PANTANofTenant?: string;       // Either PAN or TAN of tenant
}

/** Loan details for Section 24B interest deduction */
export interface LoanDetail24B {
  LoanTknFrom: LoanTakenFrom;
  BankOrInstnName: string;
  LoanAccNoOfBankOrInstnRefNo: string;
  DateofLoan: string;            // YYYY-MM-DD
  TotalLoanAmt: number;
  LoanOutstndngAmt: number;
  InterestUs24B: number;
}

/** Rent computation details (for let-out / deemed let-out) */
export interface RentDetails {
  AnnualLetableValue: number;
  RentNotRealized?: number;
  LocalTaxes?: number;
  TotalUnrealizedAndTax: number;
  BalanceALV: number;
  AnnualOfPropOwned: number;
  ThirtyPercentOfBalance: number;
  IntOnBorwCap: number;
  Section24B?: {
    Section24BDtls: LoanDetail24B[];
    TotalInterestUs24B: number;
  };
  TotalDeduct: number;
  ArrearsUnrealizedRentRcvd?: number;
  IncomeOfHP: number;            // Can be negative (loss)
}

/** Single property entry */
export interface PropertyEntry {
  HPSNo: number;                 // Serial number (1-based)
  AddressDetail: AddressDetailWithZipCode;
  PropertyOwner: PropertyOwner;
  PropertyOwnerOther?: string;   // Required when PropertyOwner = 'OT'
  PropCoOwnedFlg: 'YES' | 'NO';
  AsseseeShareProperty?: number; // Percentage share 0–100
  CoOwners?: CoOwner[];
  ifLetOut: PropertyType;
  TenantDetails?: TenantDetail[];
  Rentdetails?: RentDetails;     // Required for L and D
  // For self-occupied: interest on loan (limited to ₹2,00,000 or ₹30,000)
  SelfOccInterestOnLoan?: number;
}

/** House property schedule */
export interface ScheduleHP {
  Properties: PropertyEntry[];   // max 2 for ITR-1; no limit for ITR-2
  TotalIncomeFromHP: number;     // Net HP income (can be negative, capped at -2,00,000)
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE OS — OTHER SOURCES
// ─────────────────────────────────────────────────────────────────────────────

/** Single other source income item */
export interface OtherSourceItem {
  OthSrcNatureDesc: OtherSourceNature;
  OthSrcOthNatOfInc?: string;    // Free text when OTH is chosen (max 125 chars)
  OthSrcOthAmount: number;
  DividendInc?: DividendDateRange; // Required when nature = DIV
}

/** Exempt income item under Section 10 */
export interface ExemptIncomeItem {
  Category: ExemptIncomeCategory;
  SubCategory?: string;
  OthAmount: number;
}

/** Other sources schedule */
export interface ScheduleOS {
  OtherSourceItems: OtherSourceItem[];
  DeductionUs57iia?: number;     // Family pension deduction (max ₹25,000)
  IncomeFromOtherSources: number;

  // Exempt income — disclosed but not taxed
  ExemptIncomeItems?: ExemptIncomeItem[];
  TotalExemptIncome?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE VI-A — DEDUCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Pension contribution fund detail for 80CCC */
export interface PensionContributionFund {
  TypeofIdentifier: PranIdentifierType;
  NameofIdentifier: string;
  Amount: number;
}

/** Insurance details for Schedule 80D */
export interface InsuranceDetails80D {
  PremiumSelf?: number;
  PremiumSeniorCitSelf?: number;
  PreventiveHealthCheckupSelf?: number;
  MedicalExpSeniorCitSelf?: number;
  PremiumParents?: number;
  PremiumSeniorCitParents?: number;
  PreventiveHealthCheckupParents?: number;
  MedicalExpSeniorCitParents?: number;
}

/** Chapter VI-A deductions — user-entered amounts (before cap enforcement) */
export interface DeductionsChapterVIA {
  // 80C cluster (combined cap ₹1,50,000)
  Section80C?: number;
  Section80CCC?: number;
  PensionContribution80CCC?: PensionContributionFund[];
  Section80CCDEmployeeOrSE?: number;   // Employee/self-employed NPS (within 80C cap)
  Section80CCD1B?: number;             // Additional NPS over 80C (max ₹50,000)
  Section80CCDEmployer?: number;       // Employer NPS contribution (no cap)
  PRANNumbers?: string[];              // PRAN numbers (12-digit)

  // Health & disability
  Section80D?: number;
  InsuranceDetails?: InsuranceDetails80D;
  Section80DD?: number;
  DisabilityType80DD?: DisabilityType;
  DisabilityNature80DD?: DisabilityNature;
  Section80DDB?: number;
  Claimant80DDB?: Claimant80DDB;
  SpecialDisease80DDB?: SpecialDisease80DDB;
  Section80U?: number;
  DisabilityType80U?: DisabilityType;
  DisabilityNature80U?: DisabilityNature;

  // Loans
  Section80E?: number;                 // Education loan interest (no cap)
  Section80EE?: number;                // Housing loan interest (max ₹50,000)
  Section80EEA?: number;               // Affordable housing loan (max ₹1,50,000)
  Section80EEB?: number;               // EV loan interest (max ₹1,50,000)

  // Donations
  Section80G?: number;
  Section80GGA?: number;
  Section80GGC?: number;
  Form10BAAckNum?: string;             // Form 10BA acknowledgement number

  // Rent (when HRA not received from employer)
  Section80GG?: number;                // max ₹60,000

  // Interest income
  Section80TTA?: number;               // Savings account interest (max ₹10,000)
  Section80TTB?: number;               // Senior citizen interest (max ₹50,000)

  // Agnipath Scheme / 80CCH
  AnyOthSec80CCH?: number;

  // Computed total (system calculates — do not allow user to override)
  TotalChapVIADeductions: number;
}

/** Capped deductions as actually allowed (system-computed, used for ITR JSON) */
export interface DeductionsAllowed {
  Section80C: number;                  // max ₹1,50,000
  Section80CCC: number;                // max ₹1,50,000
  Section80CCDEmployeeOrSE: number;    // max ₹1,50,000
  Section80CCD1B: number;              // max ₹50,000
  Section80CCDEmployer: number;
  Section80D: number;                  // max ₹1,00,000
  Section80DD: number;                 // max ₹1,25,000
  Section80DDB: number;                // max ₹1,00,000
  Section80E: number;
  Section80EE: number;                 // max ₹50,000
  Section80EEA: number;                // max ₹1,50,000
  Section80EEB: number;                // max ₹1,50,000
  Section80G: number;
  Section80GG: number;                 // max ₹60,000
  Section80GGA: number;
  Section80GGC: number;
  Section80U: number;                  // max ₹1,25,000
  Section80TTA: number;                // max ₹10,000
  Section80TTB: number;                // max ₹50,000
  AnyOthSec80CCH: number;              // max ₹2,88,000
  TotalChapVIADeductions: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TDS SCHEDULES
// ─────────────────────────────────────────────────────────────────────────────

/** TDS on salary entry (Form 16) */
export interface TDSSalaryEntry {
  EmployerOrDeductorDetails: EmployerOrDeductorDetails;
  IncomeChargeable: number;   // Income chargeable under salary head
  TDSDeducted: number;        // Total TDS deducted
}

/** TDS on income other than salary (Form 16A) */
export interface TDSOtherEntry {
  EmployerOrDeductorDetails: EmployerOrDeductorDetails;
  TDSSection: TDSSection;
  AmtForTaxDeduct: number;    // Gross amount on which TDS was deducted
  DeductedYear: DeductedYear;
  TDSDeducted: number;        // Total TDS deducted
  TDSClaimed: number;         // Amount claimed for this year
}

/** TDS on rent (Form 16C — Section 194IB) */
export interface TDS16CEntry {
  PANofTenant: string;
  AadhaarofTenant?: string;
  NameOfTenant: string;
  TDSSection: TDSSection;     // Typically '4IB'
  GrossRentReceived: number;
  DeductedYear: DeductedYear;
  TDSDeducted: number;
  TDSClaimed: number;
}

/** TCS entry (Form 27D) */
export interface TCSEntry {
  EmployerOrDeductorDetails: EmployerOrDeductorDetails;
  TCSSection: string;
  AmountOnWhichTCSCollected: number;
  DeductedYear: DeductedYear;
  TCSCollected: number;
  TCSClaimed: number;
}

/** Complete TDS/TCS schedule */
export interface ScheduleTDS {
  TDSOnSalaries: TDSSalaryEntry[];
  TotalTDSOnSalaries: number;

  TDSOnOtherIncome: TDSOtherEntry[];
  TotalTDSOnOtherIncome: number;

  TDSOnRent16C: TDS16CEntry[];
  TotalTDSOnRent: number;

  TCSEntries: TCSEntry[];
  TotalTCS: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX PAYMENTS — ADVANCE TAX & SELF ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

/** Single tax payment challan */
export interface TaxPaymentEntry {
  BSRCode: string;            // 7-digit BSR code of bank branch
  DateOfDeposit: string;      // YYYY-MM-DD (on or after 2025-04-01)
  ChallanSerialNo: string;    // 5-digit challan serial number
  TaxAmount: number;
  SurchargeAmount?: number;
  EducationCess?: number;
  InterestAmount?: number;
  FeeAmount?: number;         // Fee u/s 234F
  TotalAmount: number;
  PaymentType: TaxPaymentType;
  StateCode?: StateCode;
}

/** Tax payments schedule */
export interface ScheduleTaxPayments {
  AdvanceTaxPayments: TaxPaymentEntry[];
  SelfAssessmentPayments: TaxPaymentEntry[];
  TotalAdvanceTax: number;
  TotalSelfAssessmentTax: number;
  TotalTaxPaid: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

/** Tax computation (covers ITR-1; ITR-2/ITR-4 extend this) */
export interface ITRTaxComputation {
  TotalTaxableIncome: number;
  NetTaxPayable: number;
  Rebate87A: number;
  TaxAfterRebate: number;
  Surcharge: number;
  HealthEducationCess: number;
  GrossTaxLiability: number;
  // Relief u/s 89 / 90 / 90A / 91
  TaxReliefUs89?: number;
  TaxReliefUs90?: number;
  TaxReliefUs90A?: number;
  TaxReliefUs91?: number;
  TotalTaxPayable: number;
  TotalTaxesPaid: number;
  BalTaxPayable: number;
  // Interest
  IntrstPay234A?: number;
  IntrstPay234B?: number;
  IntrstPay234C?: number;
  IntrstPay234F?: number;      // Late filing fee
  AggregateTaxInterestLiability: number;
  Refund?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LTCG 112A — EQUITY / EQUITY MF
// ─────────────────────────────────────────────────────────────────────────────

/** LTCG u/s 112A entry */
export interface LTCG112AEntry {
  ISIN: string;
  ShareOrUnitName: string;
  FMVasOn31Jan2018?: number;  // Grandfathered cost for pre-Feb 2018 assets
  SalesValue: number;
  PurchaseCost: number;
  Expenditure?: number;
  GainLoss: number;
}

/** LTCG 112A schedule */
export interface ScheduleLTCG112A {
  Entries: LTCG112AEntry[];
  TotalSalesValue: number;
  TotalPurchaseCost: number;
  TotalGain: number;
  ExemptionLimit: number;      // ₹1,25,000 from AY 2025-26
  TaxableLTCG112A: number;
}

// ─── STCG ────────────────────────────────────────────────────────────────────

export interface STCG111AEntry {
  id: string;
  isin: string;
  shareOrUnitName: string;
  purchaseDate?: string;
  saleDate?: string;
  salesValue: number;
  purchaseCost: number;
  expenditure: number;
  gainLoss: number;
}

export interface STCGOtherEntry {
  id: string;
  assetDesc: string;
  purchaseDate?: string;
  saleDate?: string;
  salesValue: number;
  purchaseCost: number;
  expenditure: number;
  gainLoss: number;
}

export interface ScheduleSTCG {
  Entries111A: STCG111AEntry[];
  TotalSTCG111A: number;
  OtherEntries: STCGOtherEntry[];
  TotalSTCGOther: number;
  TotalSTCG: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL PARTICULARS — Part A-BS "No Account Case", E11–E25 (ITR-4 mandatory)
// Flat single-column balance sheet exactly as in the ITR-4 Excel utility.
// Mandatory: E15, E19, E20, E21, E22.
// ─────────────────────────────────────────────────────────────────────────────

export interface FinancialParticulars {
  E11_ProprietorFund:        number;  // Partners/members own capital
  E12_SecuredLoans:          number;
  E13_UnsecuredLoans:        number;
  E14_Advances:               number;
  E15_SundryCreditors:        number;  // mandatory
  E16_OtherLiabilities:       number;
  // E17 Total capital and liabilities = E11+E12+E13+E14+E15+E16 (computed)
  E18_FixedAssets:            number;
  E18a_Investments:           number;
  E19_Inventories:            number;  // mandatory
  E20_SundryDebtors:          number;  // mandatory
  E21_BalanceWithBanks:       number;  // mandatory
  E22_CashInHand:             number;  // mandatory
  E23_LoansAndAdvances:       number;
  E24_OtherAssets:            number;
  // E25 Total assets = E18+E18a+E19+E20+E21+E22+E23+E24 (computed)
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export interface Verification {
  AssesseeVerName: string;
  FatherName?: string;         // Required for individual assessees
  PlaceVerSign: string;        // City of signing
  DateVerSign: string;         // YYYY-MM-DD
  Capacity: VerificationCapacity;
  EverifyFlag?: 'Y' | 'N';
  AadhaarOTPFlag?: 'Y' | 'N';
  BankAccountFlag?: 'Y' | 'N';
  DematAccountFlag?: 'Y' | 'N';
  // TRP details (if filed through Tax Return Preparer)
  TRPName?: string;
  TRPIdentification?: string;
  TRPAddress?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// INCOME SUMMARY (computed internally — not a direct schema object)
// ─────────────────────────────────────────────────────────────────────────────

/** Aggregated income summary used in UI and tax computation */
export interface IncomeSummary {
  IncomeFromSalary: number;
  IncomeFromHP: number;               // Net (can be negative, capped at -2,00,000)
  IncomeFromOtherSources: number;
  IncomeFromBusinessProfession?: number;  // ITR-4 only
  IncomeFromCapitalGains?: number;        // ITR-2 only
  GrossTotalIncome: number;           // Sum before deductions
  GrossTotalIncomeIncLTCG112A?: number;
  TotalDeductions: number;            // Chapter VI-A total
  TotalIncome: number;                // Taxable income after deductions
  LTCG112A?: number;                  // Excluded from slab, taxed separately at 12.5%
  STCG111A?: number;                  // Excluded from slab, taxed separately at 20%
}

// ─────────────────────────────────────────────────────────────────────────────
// ITR-4 SPECIFICS — PRESUMPTIVE INCOME
// ─────────────────────────────────────────────────────────────────────────────

/** Business details for u/s 44AD */
export interface BusinessDetails44AD {
  NameOfBusiness: string;
  BusinessCode: string;
  TurnoverCash: number;        // receipts by cash — 8%
  TurnoverDigital: number;     // receipts by banking/digital — 6%
  GrossReceipts: number;       // TurnoverCash + TurnoverDigital
  PresumptiveIncome: number;   // (TurnoverCash×8%) + (TurnoverDigital×6%)
  GSTINOfBusiness?: string;
}

/** Professional details for u/s 44ADA */
export interface ProfessionalDetails44ADA {
  NameOfProfession: string;
  ProfessionCode: string;
  GrossReceipts: number;
  PresumptiveIncome: number;   // 50% of GrossReceipts (minimum)
}

/** Goods carriage details for u/s 44AE */
export interface GoodsCarriageDetails44AE {
  RegistrationNo: string;
  OwnedOrHired: 'OWN' | 'HRD';
  DateOfPurchase?: string;      // YYYY-MM-DD — mandatory per schema
  TonnageCapacity?: number;     // gross weight in tonnes (for heavy vehicles)
  MonthsOwned: number;
  TaxableIncome: number;
}

/** GST registration details — mandatory for registered businesses */
export interface ScheduleGST {
  GSTINNo: string;
  GrossRcptsAsPerGST: number;
  TurnoverAsPerGST?: number;
}

/** Assets & Liabilities — mandatory when total income > ₹50L */
export interface ScheduleAL {
  ImmovableAssets: number;    // land + building value
  MovableAssets: number;      // jewellery, vehicles, shares, cash etc.
  CashInHand: number;
  BankDeposits: number;
  SharesAndSecurities: number;
  InsurancePolicies: number;
  LoansTaken: number;         // liabilities
  OtherLiabilities: number;
}

/** Form 10-IEA declaration for old regime opt-out */
export interface Form10IEADetails {
  optOut: boolean;
  ackNo: string;
  dateOfFiling: string;       // YYYY-MM-DD
}

/** Presumptive income schedule */
export interface SchedulePresumptiveIncome {
  Business44AD?: BusinessDetails44AD[];
  TotalIncome44AD?: number;
  Profession44ADA?: ProfessionalDetails44ADA[];
  TotalIncome44ADA?: number;
  GoodsCarriage44AE?: GoodsCarriageDetails44AE[];
  TotalIncome44AE?: number;
  TotalPresumptiveIncome: number;
  Form10IEA?: Form10IEADetails;
  ScheduleGST?: ScheduleGST[];
  ScheduleAL?: ScheduleAL;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ITR-5 — For AOP / BOI / Firm / LLP / Co-operative / AJP
// ─────────────────────────────────────────────────────────────────────────────

export type ITR5EntityType = 'AOP' | 'BOI' | 'AJP' | 'LA' | 'COOP' | 'FIRM' | 'LLP';

export type ITR5MemberStatus =
  | 'INDIVIDUAL' | 'IND_WORKING' | 'IND_RETIRED' | 'HUF' | 'FIRM' | 'LLP'
  | 'DOMESTIC_COMPANY' | 'FOREIGN_COMPANY' | 'CO_OPERATIVE_SOCIETY'
  | 'LOCAL_AUTHORITY' | 'TRUST' | 'AOP_BOI' | 'ANY_OTHER_AJP'
  | 'SETTLER' | 'TRUSTEE' | 'BENEFICIARY' | 'PRINCIPAL_OFFICER' | 'EXECUTOR';

export interface ITR5Member {
  name:             string;
  pan?:             string;
  aadhaar?:         string;
  status:           ITR5MemberStatus;
  sharePercentage:  number;
  rateOfInterest:   number;
  remunerationPaid: number;
  // address (simplified)
  flatNo?:          string;
  buildingName?:    string;
  streetName?:      string;
  localityOrArea?:  string;
  cityOrTownOrDistrict?: string;
  stateCode?:       string;
  pinCode?:         string;
  countryCode?:     string;
}

export type ITR5UpdatedAY = '2024-25' | '2025-26';

export type ITR5UpdateReason =
  | '1'   // Return previously not filed
  | '2'   // Income not reported correctly
  | '3'   // Wrong heads of income chosen
  | '4'   // Reduction of carried forward loss
  | '5'   // Reduction of unabsorbed depreciation
  | '6'   // Reduction of tax credit u/s 115JB/115JC
  | '7'   // Wrong rate of tax
  | 'OTH';

export type ITR5UpdatedPeriod = '1' | '2' | '3' | '4';

export interface ITR5Updated {
  updatedAY:          ITR5UpdatedAY;       // Which AY is being updated
  previouslyFiled:    boolean;             // PreviouslyFiledForThisAY
  previousFilingType: '1' | '2';           // 1=139(1), 2=Other
  origAckNo:          string;              // 15-digit acknowledgement no. of original return
  origFilingDate:     string;              // YYYY-MM-DD date of original filing
  laidOutFlag:        boolean;             // LaidOutIn_139_8A
  periodCode:         ITR5UpdatedPeriod;   // 1=≤12m, 2=12-24m, 3=24-36m, 4=36-48m
  reasons:            ITR5UpdateReason[];  // UpdatingInc reasons
}

export interface ITR5General {
  entityType:            ITR5EntityType;
  subStatus?:            string;       // schema SubStatus code e.g. '13' for Trust
  dateOfFormation?:      string;       // YYYY-MM-DD
  businessCode?:         string;       // NatOfBus code for NatOfBus in PartA_GEN2
  maintainsRegularBooks: boolean;
  isAuditRequired:       boolean;
  auditorName?:          string;
  auditorMembership?:    string;
  auditFirmName?:        string;
  auditFirmRegNo?:       string;
  auditFirmPAN?:         string;
  auditReportDate?:      string;
  auditAckNo?:           string;
  udin?:                 string;
  members:               ITR5Member[]; // PartnerOrMemberInfo (Table F for trusts)
  // Tax rate determination (Section 167B)
  sharesDeterminable:    boolean;      // true → slab rates possible; false → MMR 30%
  anyMemberExceedsExemption: boolean; // if shares determinable AND any member > basic exemption → MMR
  // 139(8A) updated return
  isUpdatedReturn:       boolean;
  updated?:              ITR5Updated | null;
}

export interface ITR5BalanceSheet {
  // ── Sources of Funds ──────────────────────────────────────────────────────
  PartnersCapital:               number;
  ReservesRevaluation:           number;
  ReservesCapital:               number;
  ReservesStatutory:             number;
  ReservesOther:                 number;
  ReservesPLCredit:              number;
  SecuredFCYLoans:               number;  // AY 25-26: Foreign Currency Loans (Secured)
  SecuredLoansFromBanks:         number;
  SecuredLoansFromOthers:        number;
  UnsecuredFCYLoans:             number;  // AY 25-26: Foreign Currency Loans (Unsecured)
  UnsecuredLoansFromBanks:       number;
  UnsecuredLoansFrom40A2b:       number;
  UnsecuredLoansFromOthers:      number;
  DeferredTaxLiability:          number;
  AdvancesFrom40A2b:             number;
  AdvancesFromOthers:            number;
  // ── Application of Funds ──────────────────────────────────────────────────
  GrossBlock:                    number;
  Depreciation:                  number;
  CapitalWIP:                    number;
  LTInvProperty:                 number;
  LTInvListedEquity:             number;
  LTInvUnlistedEquity:           number;
  LTInvPrefShares:               number;
  LTInvGovtTrust:                number;
  LTInvDebentures:               number;
  LTInvMF:                       number;
  LTInvOthers:                   number;
  STInvListedEquity:             number;
  STInvUnlistedEquity:           number;
  STInvPrefShares:               number;
  STInvGovtTrust:                number;
  STInvDebentures:               number;
  STInvMF:                       number;
  STInvOthers:                   number;
  InventoriesRawMaterial:        number;
  InventoriesWIP:                number;
  InventoriesFinishedGoods:      number;
  InventoriesStockInTrade:       number;
  InventoriesOthers:             number;
  SundryDebtorsMoreThan1Yr:      number;
  SundryDebtorsOthers:           number;
  BalanceWithBanks:              number;
  CashInHand:                    number;
  OtherCashBankBalances:         number;
  OtherCurrentAssets:            number;
  LoansRecoverable:              number;
  LoansDepositsToOthers:         number;
  LoansRevenueAuthorities:       number;
  CLSundryCreditors1Yr:          number;
  CLSundryCreditsOthers:         number;
  CLLeasedAssets:                number;  // AY 25-26: Liability for Leased Assets
  CLInterestOnLeasedAsset:       number;  // AY 25-26: Interest Accrued on Leased Asset
  CLInterestAccruedNotDue:       number;  // AY 25-26: Interest Accrued but Not Due
  CLIncomeReceivedInAdvance:     number;  // AY 25-26: Income Received in Advance
  CLOtherPayables:               number;  // AY 25-26: Other Payables (replaces CLOther)
  CLOther:                       number;  // kept for backward compat (AY 24-25)
  ProvisionsIncomeTax:           number;
  ProvisionsLeaveGratuity:       number;  // AY 25-26: EL/Superannuation/Gratuity
  ProvisionsOther:               number;
  MiscExpenditure:               number;
  DeferredTaxAsset:              number;
  DebitPLBalance:                number;
}

export interface ITR5PL {
  // No-Account Case (item 65) — used when maintainsRegularBooks = false
  BizGrossReceiptsElectronic: number;
  BizGrossReceiptsOther:      number;
  BizGrossProfit:             number;
  BizExpenses:                number;
  BizNetProfit:               number;
  ProfGrossReceiptsElectronic: number;
  ProfGrossReceiptsOther:     number;
  ProfGrossProfit:            number;
  ProfExpenses:               number;
  ProfNetProfit:              number;
  // Full P&L key items (items 13–61) — used when maintainsRegularBooks = true
  GrossProfitFromTrading:     number;
  OtherIncomeRent:            number;
  OtherIncomeCommission:      number;
  OtherIncomeDividend:        number;
  OtherIncomeInterest:        number;
  OtherIncomeOther:           number;
  FreightOutward:             number;
  PowerAndFuel:               number;
  Rents:                      number;
  RepairsBuilding:            number;
  RepairsMachinery:           number;
  TotalEmployeeComp:          number;
  TotalInsurance:             number;
  WorkmenWelfare:             number;
  Advertisement:              number;
  TotalCommission:            number;
  TotalProfFees:              number;
  TravellingExpenses:         number;
  TelephoneExpenses:          number;
  Donation:                   number;
  TotalRatesAndTaxes:         number;
  AuditFee:                   number;
  PartnersSalary:             number;
  OtherExpenses:              number;
  TotalBadDebts:              number;
  DepreciationPL:             number;
  NetProfitBeforeTaxes:       number;
  ProvisionCurrentTax:        number;
  ProfitAfterTax:             number;
  BalanceBroughtForward:      number;
  TransferToReserves:         number;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE RETURN DATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ReturnData is the internal representation of a complete return.
 * itrBuilder.ts converts this to the exact ITR JSON for e-filing upload.
 * All optional schedules are null when not applicable or not yet entered.
 */
export interface ReturnData {
  formType: ITRFormType;
  assessmentYear: string;          // e.g. "2025-26"
  regime: TaxRegime;
  filingSection: FilingSection;    // e.g. "11" = original on time

  salary: ScheduleSalary | null;
  houseProperty: ScheduleHP | null;
  otherSources: ScheduleOS | null;
  deductions: DeductionsChapterVIA | null;
  deductionsAllowed: DeductionsAllowed | null;  // System-computed caps

  tds: ScheduleTDS | null;
  taxPayments: ScheduleTaxPayments | null;
  ltcg112A: ScheduleLTCG112A | null;
  stcg: ScheduleSTCG | null;

  // ITR-4 only
  presumptiveIncome: SchedulePresumptiveIncome | null;
  financialParticulars: FinancialParticulars | null;

  // ITR-5 only
  itr5General: ITR5General | null;
  itr5BalanceSheet: ITR5BalanceSheet | null;
  itr5PL: ITR5PL | null;

  incomeSummary: IncomeSummary | null;
  taxComputation: ITRTaxComputation | null;
  verification: Verification | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE GUARDS
// ─────────────────────────────────────────────────────────────────────────────

export const isITR1 = (f: ITRFormType): boolean => f === 'ITR-1';
export const isITR2 = (f: ITRFormType): boolean => f === 'ITR-2';
export const isITR4 = (f: ITRFormType): boolean => f === 'ITR-4';
export const isITR5 = (f: ITRFormType): boolean => f === 'ITR-5';

export const supportsMultipleEmployers = (f: ITRFormType): boolean =>
  f === 'ITR-2' || f === 'ITR-4';

export const supportsCapitalGains = (f: ITRFormType): boolean => f === 'ITR-2';

export const supportsPresumptiveIncome = (f: ITRFormType): boolean => f === 'ITR-4';

export const isLetOut = (p: PropertyEntry): boolean =>
  p.ifLetOut === 'L' || p.ifLetOut === 'D';

export const isSelfOccupied = (p: PropertyEntry): boolean => p.ifLetOut === 'S';

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY CONSTRUCTORS — initialise blank schedules for new forms
// ─────────────────────────────────────────────────────────────────────────────

export function emptyDeductions(): DeductionsChapterVIA {
  return {
    Section80C: 0,
    Section80CCC: 0,
    Section80CCDEmployeeOrSE: 0,
    Section80CCD1B: 0,
    Section80CCDEmployer: 0,
    Section80D: 0,
    Section80DD: 0,
    Section80DDB: 0,
    Section80E: 0,
    Section80EE: 0,
    Section80EEA: 0,
    Section80EEB: 0,
    Section80G: 0,
    Section80GG: 0,
    Section80GGA: 0,
    Section80GGC: 0,
    Section80U: 0,
    Section80TTA: 0,
    Section80TTB: 0,
    AnyOthSec80CCH: 0,
    TotalChapVIADeductions: 0,
  };
}

export function emptyScheduleOS(): ScheduleOS {
  return {
    OtherSourceItems: [],
    DeductionUs57iia: 0,
    IncomeFromOtherSources: 0,
  };
}

export function emptyScheduleTDS(): ScheduleTDS {
  return {
    TDSOnSalaries: [],
    TotalTDSOnSalaries: 0,
    TDSOnOtherIncome: [],
    TotalTDSOnOtherIncome: 0,
    TDSOnRent16C: [],
    TotalTDSOnRent: 0,
    TCSEntries: [],
    TotalTCS: 0,
  };
}

export function emptyScheduleTaxPayments(): ScheduleTaxPayments {
  return {
    AdvanceTaxPayments: [],
    SelfAssessmentPayments: [],
    TotalAdvanceTax: 0,
    TotalSelfAssessmentTax: 0,
    TotalTaxPaid: 0,
  };
}

export function emptyIncomeSummary(): IncomeSummary {
  return {
    IncomeFromSalary: 0,
    IncomeFromHP: 0,
    IncomeFromOtherSources: 0,
    GrossTotalIncome: 0,
    TotalDeductions: 0,
    TotalIncome: 0,
  };
}

export function emptyReturnData(
  formType: ITRFormType,
  assessmentYear: string,
  regime: TaxRegime
): ReturnData {
  return {
    formType,
    assessmentYear,
    regime,
    filingSection: '11',
    salary: null,
    houseProperty: null,
    otherSources: null,
    deductions: null,
    deductionsAllowed: null,
    tds: null,
    taxPayments: null,
    ltcg112A: null,
    stcg: null,
    presumptiveIncome: null,
    financialParticulars: null,
    itr5General: null,
    itr5BalanceSheet: null,
    itr5PL: null,
    incomeSummary: null,
    taxComputation: null,
    verification: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUCTION CAPS — AY 2025-26 (from schema maxima)
// ─────────────────────────────────────────────────────────────────────────────

// ─── AY 2026-27 (FY 2025-26) — Finance Act 2025 ─────────────────────────────
export const DEDUCTION_CAPS = {
  // Section 16 — Salary deductions
  StandardDeduction16ia: 75_000,         // Both new & old regime (Budget 2024)
  StandardDeduction16ia_old: 50_000,     // Old regime only (kept for reference)
  EntertainmentAlw16ii: 5_000,
  ProfessionalTax16iii: 5_000,

  // 80C cluster — old regime only
  Section80C: 150_000,
  Section80CCC: 150_000,
  Section80CCDEmployeeOrSE: 150_000,
  Section80CCD1B: 50_000,

  // Health & disability — old regime only
  Section80D_selfNormal: 25_000,
  Section80D_selfSenior: 50_000,
  Section80D_parentsNormal: 25_000,
  Section80D_parentsSenior: 50_000,
  Section80D_max: 100_000,
  Section80DD_normal: 75_000,
  Section80DD_severe: 125_000,
  Section80DDB_normal: 40_000,
  Section80DDB_senior: 100_000,
  Section80U_normal: 75_000,
  Section80U_severe: 125_000,

  // Loans — old regime only
  Section80EE: 50_000,
  Section80EEA: 150_000,
  Section80EEB: 150_000,

  // Other
  Section80GG: 60_000,
  Section80TTA: 10_000,
  Section80TTB: 50_000,
  AnyOthSec80CCH: 288_000,

  // HP loss
  HPLossSetOff: 200_000,
  FamilyPensionDeduction57iia: 25_000,

  // Capital gains — AY 2026-27
  LTCG112AExempt: 125_000,              // ₹1.25L (Budget 2024)
  LTCG112A_rate: 0.125,                 // 12.5% (Budget 2024)
  STCG111A_rate: 0.20,                 // 20% (Budget 2024, up from 15%)

  // Rebate u/s 87A — AY 2026-27
  Rebate87A_new: 60_000,               // New regime — ₹60,000
  Rebate87A_old: 12_500,               // Old regime — ₹12,500
  Rebate87A_incomeLimit_new: 1_200_000, // ₹12L — new regime
  Rebate87A_incomeLimit_old: 500_000,   // ₹5L — old regime

  // Cess & surcharge
  HealthEducationCess: 0.04,
  Surcharge10pct_threshold: 5_000_000,
  Surcharge15pct_threshold: 10_000_000,
  Surcharge25pct_threshold: 20_000_000,
} as const;

// ─── NEW REGIME SLABS — AY 2026-27 (Budget 2025) ─────────────────────────────
export const NEW_REGIME_SLABS_AY2627 = [
  { from: 0,         to: 400_000,   rate: 0.00 },  // Nil
  { from: 400_000,   to: 800_000,   rate: 0.05 },  // 5%
  { from: 800_000,   to: 1_200_000, rate: 0.10 },  // 10%
  { from: 1_200_000, to: 1_600_000, rate: 0.15 },  // 15%
  { from: 1_600_000, to: 2_000_000, rate: 0.20 },  // 20%
  { from: 2_000_000, to: 2_400_000, rate: 0.25 },  // 25%
  { from: 2_400_000, to: Infinity,  rate: 0.30 },  // 30%
] as const;

// ─── OLD REGIME SLABS — AY 2026-27 (unchanged) ───────────────────────────────
export const OLD_REGIME_SLABS_AY2627 = [
  { from: 0,         to: 250_000,   rate: 0.00 },  // Nil (below 60)
  { from: 250_000,   to: 500_000,   rate: 0.05 },  // 5%
  { from: 500_000,   to: 1_000_000, rate: 0.20 },  // 20%
  { from: 1_000_000, to: Infinity,  rate: 0.30 },  // 30%
] as const;
