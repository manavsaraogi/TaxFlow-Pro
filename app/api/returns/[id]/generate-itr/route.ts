import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { buildITRJson } from '@/shared/utils/itrBuilder';
import type {
  ReturnData,
  ScheduleSalary,
  ScheduleHP,
  ScheduleOS,
  DeductionsChapterVIA,
  ScheduleTDS,
  ScheduleTaxPayments,
  ScheduleLTCG112A,
  PropertyEntry,
  TaxPaymentEntry,
  TDSSalaryEntry,
  TDSOtherEntry,
  TDS16CEntry,
} from '@/shared/types/itr';
import type { BuilderClient, BuilderFirm, BuilderSWDetails } from '@/shared/utils/itrBuilder';

type Params = { params: { id: string } };

// GET /api/returns/[id]/generate-itr
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Load return with all schedules
  const ret = await prisma.return.findFirst({
    where: { id: Number(params.id), client: { firmId: auth.firmId } },
    include: {
      client: {
        include: {
          bankAccounts: { where: { isPrimary: true, isActive: true }, take: 1 },
        },
      },
      assessmentYear: true,
      salarySchedule: { include: { employers: true } },
      hpSchedule: true,
      osSchedule: true,
      deductionSchedule: true,
      tdsEntries: true,
      taxPayments: true,
      ltcg112AEntries: true,
      stcgEntries: true,
      presumptiveSchedule: true,
      verification: true,
    },
  });

  if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Load firm
  const firm = await prisma.firm.findUnique({ where: { id: auth.firmId } });
  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 500 });

  // ── Map client ──
  const c = ret.client;
  const builderClient: BuilderClient = {
    pan: c.pan,
    fullName: c.fullName,
    dateOfBirth: c.dateOfBirth ? c.dateOfBirth.toISOString().split('T')[0] : '1990-01-01',
    mobileNumber: c.mobileNumber ?? undefined,
    email: c.email ?? undefined,
    aadhaarNumber: c.aadhaarNumber ?? undefined,
    address: c.address ?? '',
    city: c.city ?? undefined,
    state: c.stateCode ?? undefined,
    pinCode: c.pinCode ?? undefined,
    residentialStatus: (c.residentialStatus as 'RES' | 'NRI' | 'RNR') ?? 'RES',
  };

  // ── Map firm ──
  const builderFirm: BuilderFirm = {
    name: firm.name,
    address: firm.address ?? '',
    city: firm.intermediaryCity ?? '',
    swVersionNo: firm.swVersionNo ?? '1.0',
    swCreatedBy: firm.swCreatedBy ?? 'SW00000001',
    jsonCreatedBy: firm.swCreatedBy ?? 'SW00000001',
    intermediaryCity: firm.intermediaryCity ?? undefined,
  };

  const sw: BuilderSWDetails = {
    SWVersionNo: firm.swVersionNo ?? '1.0',
    SWCreatedBy: firm.swCreatedBy ?? 'SW00000001',
    JSONCreatedBy: firm.swCreatedBy ?? 'SW00000001',
    IntermediaryCity: firm.intermediaryCity ?? firm.address ?? 'Delhi',
  };

  // ── Map salary schedule ──
  let salary: ScheduleSalary | null = null;
  if (ret.salarySchedule) {
    const ss = ret.salarySchedule;
    salary = {
      Employers: ss.employers.map((emp) => ({
        NameOfEmployer: emp.nameOfEmployer,
        NatureOfEmployment: emp.natureOfEmployment as any,
        TANofEmployer: emp.tanOfEmployer ?? '',
        AddressDetail: {
          AddrDetail: emp.addrDetail ?? '',
          CityOrTownOrDistrict: emp.city ?? '',
          StateCode: (emp.stateCode ?? '07') as any,
          PinCode: emp.pinCode ?? undefined,
        },
        Salarys: {
          GrossSalary: emp.grossSalary,
          Salary: emp.salary,
          ValueOfPerquisites: emp.valueOfPerquisites,
          ProfitsinLieuOfSalary: emp.profitsinLieuOfSalary,
          IncomeNotified89A: emp.incomeNotified89A,
          IncomeNotifiedOther89A: emp.incomeNotifiedOther89A,
        },
      })),
      TotalGrossSalary: ss.totalGrossSalary,
      AllwncExtentExemptUs10: ss.allwncExtentExemptUs10,
      AllwncExemptUs10Items: ss.allowancesJson ? JSON.parse(ss.allowancesJson) : [],
      NetSalary: ss.netSalary,
      DeductionUs16ia: ss.deductionUs16ia,
      EntertainmentAlw16ii: ss.entertainmentAlw16ii,
      ProfessionalTaxUs16iii: ss.professionalTaxUs16iii,
      TotalDeductionUs16: ss.totalDeductionUs16,
      IncomeFromSalary: ss.incomeFromSalary,
    };
  }

  // ── Map HP schedule ──
  let houseProperty: ScheduleHP | null = null;
  if (ret.hpSchedule && ret.hpSchedule.length > 0) {
    const props: PropertyEntry[] = ret.hpSchedule.map((hp, idx) => ({
      HPSNo: idx + 1,
      AddressDetail: {
        AddrDetail: hp.addrDetail ?? '',
        CityOrTownOrDistrict: hp.city ?? '',
        StateCode: (hp.stateCode ?? '07') as any,
        CountryCode: hp.countryCode ?? '91',
        PinCode: hp.pinCode ?? undefined,
        ZipCode: undefined,
      },
      PropertyOwner: (hp.propertyOwner ?? 'SE') as any,
      PropertyOwnerOther: hp.propertyOwnerOther ?? undefined,
      PropCoOwnedFlg: hp.propCoOwnedFlg as 'YES' | 'NO',
      AsseseeShareProperty: hp.asseseeShareProperty ?? 100,
      CoOwners: hp.coOwnersJson ? JSON.parse(hp.coOwnersJson) : undefined,
      ifLetOut: (hp.ifLetOut ?? 'S') as any,
      TenantDetails: hp.tenantDetailsJson ? JSON.parse(hp.tenantDetailsJson) : undefined,
      Rentdetails: hp.annualLetableValue != null
        ? {
            AnnualLetableValue: hp.annualLetableValue ?? 0,
            RentNotRealized: hp.rentNotRealized ?? 0,
            LocalTaxes: hp.localTaxes ?? 0,
            TotalUnrealizedAndTax: hp.totalUnrealizedAndTax ?? 0,
            BalanceALV: hp.balanceALV ?? 0,
            AnnualOfPropOwned: hp.annualOfPropOwned ?? 0,
            ThirtyPercentOfBalance: hp.thirtyPercentBalance ?? 0,
            IntOnBorwCap: hp.intOnBorwCap ?? 0,
            Section24B: hp.section24BJson ? JSON.parse(hp.section24BJson) : undefined,
            TotalDeduct: hp.totalDeduct ?? 0,
            ArrearsUnrealizedRentRcvd: hp.arrearsUnrealRentRcvd ?? 0,
            IncomeOfHP: hp.incomeOfHP ?? 0,
          }
        : undefined,
    }));

    const totalHP = props.reduce((sum, p) => sum + (p.Rentdetails?.IncomeOfHP ?? 0), 0);
    houseProperty = {
      Properties: props,
      TotalIncomeFromHP: totalHP,
    };
  }

  // ── Map OS schedule ──
  let otherSources: ScheduleOS | null = null;
  if (ret.osSchedule) {
    const os = ret.osSchedule;
    otherSources = {
      OtherSourceItems: os.otherSourceItemsJson ? JSON.parse(os.otherSourceItemsJson) : [],
      DeductionUs57iia: os.deductionUs57iia,
      IncomeFromOtherSources: os.incomeFromOtherSources,
      ExemptIncomeItems: os.exemptIncomeItemsJson ? JSON.parse(os.exemptIncomeItemsJson) : [],
      TotalExemptIncome: os.totalExemptIncome,
    };
  }

  // ── Map deductions ──
  let deductions: DeductionsChapterVIA | null = null;
  if (ret.deductionSchedule) {
    const d = ret.deductionSchedule;
    deductions = {
      Section80C: d.section80C,
      Section80CCC: d.section80CCC,
      Section80CCDEmployeeOrSE: d.section80CCDEmployeeOrSE,
      Section80CCD1B: d.section80CCD1B,
      Section80CCDEmployer: d.section80CCDEmployer,
      PRANNumbers: d.pranNumbersJson ? JSON.parse(d.pranNumbersJson) : undefined,
      Section80D: d.section80D,
      Section80DD: d.section80DD,
      Claimant80DDB: (d.claimant80DDB ?? undefined) as any,
      SpecialDisease80DDB: (d.specialDisease80DDB ?? undefined) as any,
      Section80DDB: d.section80DDB,
      Section80U: d.section80U,
      Section80E: d.section80E,
      Section80EE: d.section80EE,
      Section80EEA: d.section80EEA,
      Section80EEB: d.section80EEB,
      Section80G: d.section80G,
      Section80GG: d.section80GG,
      Form10BAAckNum: d.form10BAAckNum ?? undefined,
      Section80GGA: d.section80GGA,
      Section80GGC: d.section80GGC,
      Section80TTA: d.section80TTA,
      Section80TTB: d.section80TTB,
      AnyOthSec80CCH: d.anyOthSec80CCH,
      TotalChapVIADeductions: d.totalChapVIAAllowed,
    };
  }

  // ── Map TDS entries ──
  let tds: ScheduleTDS | null = null;
  const tdsOnSalary = ret.tdsEntries.filter((e) => e.entryType === 'SALARY');
  const tdsOnOther = ret.tdsEntries.filter((e) => e.entryType === 'OTHER');
  const tdsOnRent = ret.tdsEntries.filter((e) => e.entryType === 'RENT_16C');
  const tcsEntries = ret.tdsEntries.filter((e) => e.entryType === 'TCS');

  if (ret.tdsEntries.length > 0) {
    const tdsOnSalaryMapped: TDSSalaryEntry[] = tdsOnSalary.map((e) => ({
      EmployerOrDeductorDetails: {
        TAN: e.tanOfDeductor ?? '',
        EmployerName: e.nameOfDeductor ?? '',
      },
      IncomeChargeable: e.incomeChargeable ?? 0,
      TDSDeducted: e.tdsDeducted,
    }));

    const tdsOnOtherMapped: TDSOtherEntry[] = tdsOnOther.map((e) => ({
      EmployerOrDeductorDetails: {
        TAN: e.tanOfDeductor ?? '',
        EmployerName: e.nameOfDeductor ?? '',
      },
      TDSSection: (e.tdsSection ?? '195') as any,
      AmtForTaxDeduct: e.amtForTaxDeduct ?? 0,
      DeductedYear: (e.deductedYear ?? '2025') as any,
      TDSDeducted: e.tdsDeducted,
      TDSClaimed: e.tdsClaimed,
    }));

    const tdsOnRentMapped: TDS16CEntry[] = tdsOnRent.map((e) => ({
      PANofTenant: e.panOfTenant ?? '',
      AadhaarofTenant: e.aadhaarOfTenant ?? undefined,
      TDSSection: (e.tdsSection ?? '4IB') as any,
      NameOfTenant: e.nameOfTenant ?? '',
      GrossRentReceived: e.grossRentReceived ?? 0,
      DeductedYear: (e.deductedYear ?? '2025') as any,
      TDSDeducted: e.tdsDeducted,
      TDSClaimed: e.tdsClaimed,
    }));

    tds = {
      TDSOnSalaries: tdsOnSalaryMapped,
      TotalTDSOnSalaries: tdsOnSalary.reduce((s, e) => s + e.tdsDeducted, 0),
      TDSOnOtherIncome: tdsOnOtherMapped,
      TotalTDSOnOtherIncome: tdsOnOther.reduce((s, e) => s + e.tdsDeducted, 0),
      TDSOnRent16C: tdsOnRentMapped,
      TotalTDSOnRent: tdsOnRent.reduce((s, e) => s + e.tdsDeducted, 0),
      TCSEntries: tcsEntries.map((e) => ({
        EmployerOrDeductorDetails: {
          TAN: e.tanOfDeductor ?? '',
          EmployerName: e.nameOfDeductor ?? '',
        },
        TCSSection: e.tcsSection ?? '',
        AmountOnWhichTCSCollected: e.amtOnWhichTCS ?? 0,
        DeductedYear: (e.deductedYear ?? '2025') as any,
        TCSCollected: e.tcsCollected ?? 0,
        TCSClaimed: e.tcsClaimed ?? 0,
      })),
      TotalTCS: tcsEntries.reduce((s, e) => s + (e.tcsCollected ?? 0), 0),
    };
  }

  // ── Map tax payments ──
  let taxPayments: ScheduleTaxPayments | null = null;
  if (ret.taxPayments.length > 0) {
    const advance = ret.taxPayments.filter((p) => p.paymentType === 'ADVANCE');
    const selfAssessment = ret.taxPayments.filter((p) => p.paymentType === 'SELF_ASSESSMENT');

    const mapPayment = (p: typeof ret.taxPayments[0]): TaxPaymentEntry => ({
      BSRCode: p.bsrCode,
      DateOfDeposit: p.dateOfDeposit.toISOString().split('T')[0],
      ChallanSerialNo: p.challanSerialNo,
      TaxAmount: p.taxAmount,
      SurchargeAmount: p.surchargeAmount,
      EducationCess: p.educationCess,
      InterestAmount: p.interestAmount,
      FeeAmount: p.feeAmount,
      TotalAmount: p.totalAmount,
      PaymentType: p.paymentType === 'ADVANCE' ? 'ADVANCE_TAX' : 'SELF_ASSESSMENT',
    });

    taxPayments = {
      AdvanceTaxPayments: advance.map(mapPayment),
      TotalAdvanceTax: advance.reduce((s, p) => s + p.totalAmount, 0),
      SelfAssessmentPayments: selfAssessment.map(mapPayment),
      TotalSelfAssessmentTax: selfAssessment.reduce((s, p) => s + p.totalAmount, 0),
      TotalTaxPaid: ret.taxPayments.reduce((s, p) => s + p.totalAmount, 0),
    };
  }

  // ── Map LTCG 112A ──
  let ltcg112A: ScheduleLTCG112A | null = null;
  if (ret.ltcg112AEntries.length > 0) {
    const totalGain = ret.ltcg112AEntries.reduce((s, e) => s + e.gainLoss, 0);
    const totalSales = ret.ltcg112AEntries.reduce((s, e) => s + e.salesValue, 0);
    const totalCost = ret.ltcg112AEntries.reduce((s, e) => s + e.purchaseCost, 0);
    const exemptionLimit = 125_000;
    ltcg112A = {
      Entries: ret.ltcg112AEntries.map((e) => ({
        ISIN: e.isin,
        ShareOrUnitName: e.shareOrUnitName,
        FMVasOn31Jan2018: e.fmvAsOn31Jan2018 ?? 0,
        SalesValue: e.salesValue,
        PurchaseCost: e.purchaseCost,
        Expenditure: e.expenditure,
        GainLoss: e.gainLoss,
      })),
      TotalSalesValue: totalSales,
      TotalPurchaseCost: totalCost,
      TotalGain: totalGain,
      ExemptionLimit: exemptionLimit,
      TaxableLTCG112A: Math.max(0, totalGain - exemptionLimit),
    };
  }

  // ── Map STCG ──
  let stcg = null;
  const stcgAll = (ret as any).stcgEntries ?? [];
  if (stcgAll.length > 0) {
    const entries111A = stcgAll.filter((e: any) => e.entryType === '111A');
    const entriesOther = stcgAll.filter((e: any) => e.entryType === 'OTHER');
    const total111A = entries111A.reduce((s: number, e: any) => s + e.gainLoss, 0);
    const totalOther = entriesOther.reduce((s: number, e: any) => s + e.gainLoss, 0);
    stcg = {
      Entries111A: entries111A.map((e: any) => ({ id: String(e.id), isin: e.isin ?? '', shareOrUnitName: e.shareOrUnitName ?? '', salesValue: e.salesValue, purchaseCost: e.purchaseCost, expenditure: e.expenditure, gainLoss: e.gainLoss })),
      TotalSTCG111A: total111A,
      OtherEntries: entriesOther.map((e: any) => ({ id: String(e.id), assetDesc: e.assetDesc ?? '', salesValue: e.salesValue, purchaseCost: e.purchaseCost, expenditure: e.expenditure, gainLoss: e.gainLoss })),
      TotalSTCGOther: totalOther,
      TotalSTCG: total111A + totalOther,
    };
  }

  // ── Map verification ──
  let verification = null;
  if (ret.verification) {
    const v = ret.verification;
    verification = {
      AssesseeVerName: v.assesseeVerName,
      FatherName: v.fatherName ?? undefined,
      signatoryPAN: (v as any).signatoryPAN ?? undefined,
      PlaceVerSign: v.placeVerSign,
      DateVerSign: v.dateVerSign.toISOString().split('T')[0],
      Capacity: v.capacity as any,
    };
  }

  // ── Map presumptive income ──
  let presumptiveIncome = null;
  if (ret.presumptiveSchedule) {
    const ps = ret.presumptiveSchedule;
    presumptiveIncome = {
      Business44AD: ps.business44ADJson ? JSON.parse(ps.business44ADJson) : [],
      Profession44ADA: ps.profession44ADAJson ? JSON.parse(ps.profession44ADAJson) : [],
      GoodsCarriage44AE: ps.goodsCarriage44AEJson ? JSON.parse(ps.goodsCarriage44AEJson) : [],
      TotalPresumptiveIncome: ps.totalPresumptive,
    };
  }

  // ── Map financial particulars ──
  const financialParticulars = (ret as any).financialParticularsJson
    ? JSON.parse((ret as any).financialParticularsJson)
    : null;

  // ── Map ITR-5 schedules ──
  const itr5General = (ret as any).itr5GeneralJson ? JSON.parse((ret as any).itr5GeneralJson) : null;
  const itr5BalanceSheet = (ret as any).itr5BalanceSheetJson ? JSON.parse((ret as any).itr5BalanceSheetJson) : null;
  const itr5PL = (ret as any).itr5PLJson ? JSON.parse((ret as any).itr5PLJson) : null;

  // ── Assemble ReturnData ──
  const returnData: ReturnData = {
    formType: ret.formType as any,
    assessmentYear: ret.assessmentYear.ayLabel,
    regime: ret.assessmentYear.regime as any,
    filingSection: (ret.filingSection ?? '11') as any,
    salary,
    houseProperty,
    otherSources,
    deductions,
    deductionsAllowed: null,
    tds,
    taxPayments,
    ltcg112A,
    stcg,
    presumptiveIncome,
    financialParticulars,
    itr5General,
    itr5BalanceSheet,
    itr5PL,
    incomeSummary: null,
    taxComputation: null,
    verification,
    bankAccounts: ret.client.bankAccounts.map((b: any) => ({
      ifscCode: b.ifscCode,
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      accountType: b.accountType ?? 'SB',
      isPrimary: b.isPrimary,
    })),
  } as any;

  // ── Build ITR JSON ──
  const itrJson = buildITRJson({ returnData, client: builderClient, firm: builderFirm, sw }) as any;

  // ── Block if tax is still due ──
  const itr = itrJson?.ITR;
  const inner = itr?.ITR1 ?? itr?.ITR2 ?? itr?.ITR4 ?? itr?.ITR5;
  const partBTTI = inner?.PartB_TTI ?? inner?.PartBTTI;
  const balTaxPayable: number =
    partBTTI?.TaxPayable?.BalTaxPayable ??
    partBTTI?.BalTaxPayable ??
    0;

  if (balTaxPayable > 0) {
    const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
    return NextResponse.json(
      {
        error: 'tax_due',
        message: `Balance tax of ${fmt(balTaxPayable)} is still payable. Pay self-assessment tax and add the challan under Tax Payments before generating the JSON.`,
        balTaxPayable,
      },
      { status: 422 },
    );
  }

  const pan = c.pan.toUpperCase();
  const formType = ret.formType;
  // Use the effectiveAY from the JSON (handles 139(8A) where JSON AY differs from return's DB AY)
  const jsonAYYear: string | undefined =
    inner?.Form_ITR5?.AssessmentYear ??
    inner?.Form_ITR1?.AssessmentYear ??
    inner?.Form_ITR2?.AssessmentYear ??
    inner?.Form_ITR4?.AssessmentYear;
  // AssessmentYear in JSON is the start year ("2024" for AY 2024-25); reconstruct AY label as "2024-25"
  const effectiveAYLabel: string = jsonAYYear
    ? `${jsonAYYear}-${String(Number(jsonAYYear) + 1).slice(2)}`
    : ret.assessmentYear.ayLabel;
  const filename = `ITR-${formType.replace('ITR-', '')}-${pan}-AY${effectiveAYLabel}.json`;

  return NextResponse.json(itrJson, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/json',
    },
  });
}
