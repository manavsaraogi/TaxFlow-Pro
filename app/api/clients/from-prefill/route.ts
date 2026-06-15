import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { encryptPassword } from '@/lib/portal-encrypt';

/**
 * POST /api/clients/from-prefill
 *
 * Accepts the ITR prefill JSON captured by the portal agent,
 * creates (or upserts) the client, creates a return for the AY,
 * and injects all income schedule data so the return is pre-filled.
 *
 * Body: { prefill: <raw ITR prefill JSON>, password?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { prefill: unknown; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.prefill) {
    return NextResponse.json({ error: 'prefill data is required' }, { status: 400 });
  }

  // ── 1. Parse prefill JSON ──────────────────────────────────────────────────
  const parsed = parsePrefillJson(body.prefill);
  if (!parsed.pan) {
    return NextResponse.json({ error: 'Could not extract PAN from prefill JSON' }, { status: 422 });
  }

  // ── 2. Upsert client ───────────────────────────────────────────────────────
  let portalPasswordEnc: string | null = null;
  if (body.password) {
    try { portalPasswordEnc = encryptPassword(body.password); } catch {}
  }

  let client = await prisma.client.findFirst({
    where: { pan: parsed.pan.toUpperCase(), firmId: auth.firmId },
  });

  const clientData = {
    fullName: parsed.fullName || undefined,
    ...(parsed.fatherName ? { fatherName: parsed.fatherName } : {}),
    ...(parsed.gender ? { gender: parsed.gender } : {}),
    dateOfBirth: parsed.dob ? new Date(parsed.dob) : undefined,
    mobileNumber: parsed.mobile || undefined,
    email: parsed.email || undefined,
    flatDoorBlockNo: parsed.flatDoorBlockNo || undefined,
    nameBuildingVillage: parsed.nameBuildingVillage || undefined,
    roadOrStreet: parsed.roadOrStreet || undefined,
    localityOrArea: parsed.localityOrArea || undefined,
    address: parsed.address || undefined,
    city: parsed.city || undefined,
    stateCode: parsed.stateCode || undefined,
    pinCode: parsed.pinCode ? Number(parsed.pinCode) : undefined,
    aadhaarNumber: parsed.aadhaar || undefined,
    residentialStatus: (parsed.residentialStatus as any) || undefined,
  };

  if (client) {
    client = await prisma.client.update({
      where: { id: client.id },
      data: Object.fromEntries(Object.entries(clientData).filter(([, v]) => v !== undefined)) as any,
    });
  } else {
    try {
      client = await prisma.client.create({
        data: {
          firmId: auth.firmId,
          pan: parsed.pan.toUpperCase(),
          fullName: parsed.fullName || parsed.pan,
          assesseeType: 'INDIVIDUAL',
          taxRegimePreference: parsed.regime || 'NEW',
          portalUsername: parsed.pan.toUpperCase(),
          ...(Object.fromEntries(Object.entries(clientData).filter(([, v]) => v !== undefined)) as any),
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        client = await prisma.client.findFirst({
          where: { pan: parsed.pan.toUpperCase(), firmId: auth.firmId },
        });
        if (!client) throw e;
        client = await prisma.client.update({
          where: { id: client.id },
          data: Object.fromEntries(Object.entries(clientData).filter(([, v]) => v !== undefined)) as any,
        });
      } else {
        throw e;
      }
    }
  }

  if (portalPasswordEnc) {
    await prisma.$executeRaw`UPDATE "Client" SET "portalPasswordEnc" = ${portalPasswordEnc} WHERE id = ${client.id}`;
  }

  // ── 3. Create return for the AY ────────────────────────────────────────────
  const ayLabel = parsed.assessmentYear || '2026-27';
  const ay = await prisma.assessmentYear.upsert({
    where: { clientId_ayLabel: { clientId: client.id, ayLabel } },
    create: { clientId: client.id, ayLabel, regime: parsed.regime || 'NEW' },
    update: {},
  });

  // Check if return already exists for this AY
  let ret = await prisma.return.findFirst({
    where: { clientId: client.id, assessmentYearId: ay.id },
  });

  if (!ret) {
    ret = await prisma.return.create({
      data: {
        clientId: client.id,
        assessmentYearId: ay.id,
        formType: parsed.formType || 'ITR-1',
        regime: parsed.regime || 'NEW',
        filingType: 'ORIGINAL',
        filingSection: parsed.filingSection || '11',
        status: 'DRAFT',
      },
    });
  }

  const returnId = ret.id;

  // ── 4. Inject income schedule data ────────────────────────────────────────
  const imported: Record<string, number> = {};

  // Salary
  if (parsed.salary) {
    await injectSalary(returnId, parsed.salary);
    imported.salaryEntries = parsed.salary.employers?.length ?? 0;
  }

  // House Property
  if (parsed.houseProperties?.length) {
    await injectHouseProperty(returnId, parsed.houseProperties);
    imported.hpEntries = parsed.houseProperties.length;
  }

  // TDS entries
  if (parsed.tdsEntries?.length) {
    await injectTDS(returnId, parsed.tdsEntries);
    imported.tdsEntries = parsed.tdsEntries.length;
  }

  // TCS entries
  if (parsed.tcsEntries?.length) {
    await injectTCS(returnId, parsed.tcsEntries);
    imported.tcsEntries = parsed.tcsEntries.length;
  }

  // Tax payments (advance tax / self-assessment)
  if (parsed.taxPayments?.length) {
    await injectTaxPayments(returnId, parsed.taxPayments);
    imported.taxPayments = parsed.taxPayments.length;
  }

  // Bank account (for refund)
  if (parsed.bankAccount) {
    await injectBankAccount(client.id, parsed.bankAccount);
    imported.bankAccount = 1;
  }

  return NextResponse.json({
    data: {
      clientId: client.id,
      returnId,
      ayLabel,
      clientName: client.fullName,
      pan: client.pan,
      isNew: !ret || imported.salaryEntries !== undefined,
      imported,
    },
  }, { status: 201 });
}

// ─── Prefill JSON parser ───────────────────────────────────────────────────────

interface ParsedPrefill {
  pan: string;
  fullName: string;
  fatherName?: string;
  gender?: string;
  dob?: string;        // ISO date
  mobile?: string;
  email?: string;
  flatDoorBlockNo?: string;
  nameBuildingVillage?: string;
  roadOrStreet?: string;
  localityOrArea?: string;
  address?: string;    // combined fallback
  city?: string;
  stateCode?: string;
  pinCode?: string;
  aadhaar?: string;
  residentialStatus?: string;
  assessmentYear?: string;
  formType?: string;
  filingSection?: string;
  regime?: 'NEW' | 'OLD';
  salary?: {
    grossSalary: number;
    allowancesExempt10: number;
    standardDeduction: number;
    professionalTax: number;
    netSalary: number;
    employers: any[];
  };
  houseProperties?: any[];
  tdsEntries?: any[];
  tcsEntries?: any[];
  taxPayments?: any[];
  bankAccount?: { ifsc: string; accountNo: string; bankName: string };
}

function parsePrefillJson(raw: unknown): ParsedPrefill {
  const out: ParsedPrefill = { pan: '', fullName: '' };

  // Unwrap outer ITR wrapper / API response envelope
  let obj: any = raw;
  // IT portal wraps prefill in { content: "<JSON string>", responseCode: 0, ... }
  if (typeof obj?.content === 'string') {
    try { obj = JSON.parse(obj.content); } catch {}
  }
  // Unwrap common API envelope: { data: {...}, status: "S" }
  if (obj?.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) obj = obj.data;
  if (obj?.ITR) obj = obj.ITR;
  const itrKey = Object.keys(obj || {}).find(k => /^(ITR[1-9U]|Form_ITR)/i.test(k));
  if (itrKey) obj = obj[itrKey];
  if (!obj) return out;

  // PersonalInfo
  const pi: any = obj?.PartA?.PersonalInfo
    ?? obj?.PersonalInfo
    ?? obj?.personalInfo
    ?? {};

  // PAN
  const pan = (pi?.PAN ?? pi?.pan ?? '').toUpperCase();
  if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) out.pan = pan;

  // Name
  const nm: any = pi?.AssesseeName ?? pi?.assesseeName ?? {};
  const first = nm?.FirstName ?? nm?.firstName ?? '';
  const mid   = nm?.MiddleName ?? nm?.middleName ?? '';
  const last  = nm?.SurName ?? nm?.surName ?? nm?.surNameOrOrgName ?? nm?.lastName ?? '';
  out.fullName = [first, mid, last].filter(Boolean).join(' ').trim() || pi?.Name || pi?.assesseeVerName || '';

  // Father's Name
  out.fatherName = (pi?.FatherName ?? pi?.fatherName ?? '').trim() || undefined;

  // Gender
  const genderRaw = (pi?.Gender ?? pi?.gender ?? '').toUpperCase();
  if (genderRaw === 'M' || genderRaw === 'MALE') out.gender = 'M';
  else if (genderRaw === 'F' || genderRaw === 'FEMALE') out.gender = 'F';
  else if (genderRaw === 'T') out.gender = 'T';

  // DOB
  const dobRaw: string = pi?.DOB ?? pi?.dob ?? '';
  if (dobRaw) {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dobRaw)) {
      const [d, m, y] = dobRaw.split('/');
      out.dob = `${y}-${m}-${d}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dobRaw)) {
      out.dob = dobRaw;
    }
  }

  // Contact
  out.mobile = String(pi?.MobileNo ?? pi?.mobileNo ?? pi?.address?.mobileNo ?? pi?.mobile ?? '').replace(/\D/g, '').slice(-10) || undefined;
  out.email  = pi?.EmailAddress ?? pi?.emailAddress ?? pi?.email ?? undefined;
  const rawAadhaar = String(pi?.AadhaarCardNo ?? pi?.aadhaarCardNo ?? '');
  // Aadhaar may be base64-encoded on portal
  const decodedAadhaar = /^[A-Za-z0-9+/]+=*$/.test(rawAadhaar) && rawAadhaar.length > 12
    ? (() => { try { return Buffer.from(rawAadhaar, 'base64').toString('utf8'); } catch { return rawAadhaar; } })()
    : rawAadhaar;
  out.aadhaar = decodedAadhaar.replace(/\D/g, '') || undefined;

  // Address — separate IT Portal components
  const addr: any = obj?.PartA?.Address ?? obj?.Address ?? (typeof pi?.address === 'object' ? pi.address : null) ?? {};
  out.flatDoorBlockNo   = (addr?.FlatDoorBlockNo ?? addr?.flatDoorBlockNo ?? addr?.residenceNo ?? '').trim() || undefined;
  out.nameBuildingVillage = (addr?.NameBuildingVillage ?? addr?.nameBuildingVillage ?? addr?.residenceName ?? '').trim() || undefined;
  out.roadOrStreet      = (addr?.RoadOrStreet ?? addr?.roadOrStreet ?? addr?.RoadStreet ?? addr?.roadStreet ?? '').trim() || undefined;
  out.localityOrArea    = (addr?.LocalityOrArea ?? addr?.localityOrArea ?? '').trim() || undefined;
  const addrParts = [out.flatDoorBlockNo, out.nameBuildingVillage, out.roadOrStreet, out.localityOrArea].filter(Boolean);
  if (addrParts.length) out.address = addrParts.join(', ');
  // localityOrArea = actual city ("Shillong"); cityOrTownOrDistrict = district ("EAST KHASI HILLS")
  out.city = (addr?.localityOrArea ?? addr?.LocalityOrArea ?? addr?.CityOrTownOrDistrict ?? addr?.cityOrTownOrDistrict ?? undefined)?.trim() || undefined;
  // if localityOrArea field isn't set yet, put the district there
  if (!out.localityOrArea) {
    const district = (addr?.CityOrTownOrDistrict ?? addr?.cityOrTownOrDistrict ?? '').trim();
    if (district && district !== out.city) out.localityOrArea = district;
  }
  out.stateCode = String(addr?.StateCode ?? addr?.stateCode ?? '').padStart(2, '0') || undefined;
  out.pinCode   = String(addr?.PinCode ?? addr?.pinCode ?? addr?.pincode ?? '').replace(/\D/g, '') || undefined;

  // Filing meta
  const fs: any = obj?.PartA?.FilingStatus ?? obj?.FilingStatus ?? pi?.filingStatus ?? {};
  out.assessmentYear = fs?.AssessmentYear ?? fs?.assessmentYear ?? obj?.PartA?.AY ?? undefined;
  out.residentialStatus = fs?.ResidentialStatus ?? fs?.residentialStatus ?? 'RES';
  out.filingSection = fs?.ReturnFileSec ?? fs?.returnFileSec ?? '11';
  const taxRegime = fs?.TaxRegime ?? fs?.taxRegime ?? fs?.regime ?? '';
  out.regime = /new|115bac/i.test(taxRegime) ? 'NEW' : /old/i.test(taxRegime) ? 'OLD' : 'NEW';

  // Detect form type from structure
  if (itrKey) {
    const k = itrKey.toUpperCase();
    if (k.includes('ITR4')) out.formType = 'ITR-4';
    else if (k.includes('ITR2')) out.formType = 'ITR-2';
    else if (k.includes('ITR3')) out.formType = 'ITR-3';
    else out.formType = 'ITR-1';
  }

  // ── Salary (Schedule S) ────────────────────────────────────────────────────
  const schedS: any = obj?.ScheduleS ?? obj?.scheduleS ?? obj?.Salary ?? obj?.IncomeDeductions;
  if (schedS) {
    const gross = num(schedS?.TotGrossSalary ?? schedS?.grossSalary ?? schedS?.Salaries);
    const exempt = num(schedS?.TotAllwncExemptUs10 ?? schedS?.AllwncExemptUs10 ?? schedS?.allowancesExempt10);
    const stdDedn = num(schedS?.DeductionUs16ia ?? schedS?.standardDeduction ?? 75000);
    const proTax = num(schedS?.DeductionUs16iii ?? schedS?.professionalTax ?? 0);
    const netSal = num(schedS?.NetSalary ?? schedS?.netSalary ?? schedS?.incomeFromSalary ?? (gross - exempt - stdDedn - proTax));

    // Extract employer entries
    const empArr: any[] = Array.isArray(schedS?.EmpDetails ?? schedS?.employers ?? schedS?.EmployerInfo)
      ? (schedS?.EmpDetails ?? schedS?.employers ?? schedS?.EmployerInfo)
      : schedS?.EmpDetails ? [schedS.EmpDetails] : [];

    out.salary = {
      grossSalary: gross,
      allowancesExempt10: exempt,
      standardDeduction: stdDedn,
      professionalTax: proTax,
      netSalary: netSal,
      employers: empArr.map((e: any) => ({
        nameOfEmployer: e?.EmployerName ?? e?.nameOfEmployer ?? e?.NameOfEmployer ?? '',
        tanOfEmployer: e?.TAN ?? e?.tan ?? e?.TANofEmployer ?? '',
        natureOfEmployment: e?.NatureOfEmployment ?? e?.natureOfEmployment ?? 'OTH',
        grossSalary: num(e?.Salary ?? e?.grossSalary ?? e?.GrossSalary),
        valueOfPerquisites: num(e?.ValueOfPerquisites ?? e?.valueOfPerquisites ?? 0),
        profitsinLieuOfSalary: num(e?.ProfitsInLieuOfSalary ?? e?.profitsinLieuOfSalary ?? 0),
      })),
    };

    if (!out.salary.employers.length && gross > 0) {
      out.salary.employers = [{
        nameOfEmployer: '', tanOfEmployer: '', natureOfEmployment: 'OTH',
        grossSalary: gross, valueOfPerquisites: 0, profitsinLieuOfSalary: 0,
      }];
    }
  }

  // ── House Property ────────────────────────────────────────────────────────
  const schedHP: any[] = toArray(
    obj?.ScheduleHP ?? obj?.scheduleHP ?? obj?.HouseProperty ?? obj?.HP
  );
  if (schedHP.length) {
    out.houseProperties = schedHP.map((p: any) => ({
      propertyType: mapPropertyType(p?.PropertyType ?? p?.propertyType ?? p?.TypeOfProperty),
      address: [p?.Address ?? p?.address ?? '', p?.CityOrTownOrDistrict ?? ''].filter(Boolean).join(', '),
      annualRentReceived: num(p?.GrossRentReceived ?? p?.AnnualRentReceivable ?? p?.annualRentReceived),
      municipalTaxesPaid: num(p?.TaxesPaidLocalAuth ?? p?.municipalTaxesPaid),
      interestOnLoan: num(p?.InterestPayable ?? p?.InterestOnBorrowedCapital ?? p?.interestOnLoan),
      preConstructionInterest: num(p?.PriorPeriodInterest ?? p?.preConstructionInterest),
    }));
  }

  // ── TDS (Schedule TDS / TDS2 / form26as) ─────────────────────────────────
  const tds1: any[] = toArray(obj?.ScheduleTDS1 ?? obj?.TDS1 ?? obj?.scheduleTDS1);
  const tds2: any[] = toArray(obj?.ScheduleTDS2 ?? obj?.TDS2 ?? obj?.scheduleTDS2);
  const tds3: any[] = toArray(obj?.ScheduleTDS3 ?? obj?.TDS3 ?? obj?.scheduleTDS3);
  // flat format: form26as.tdsOnOthThanSals.tdSonOthThanSal
  const f26as: any = obj?.form26as ?? obj?.Form26AS ?? {};
  const tds26Salary: any[] = toArray(f26as?.tdsOnSals?.tdSonSal);
  const tds26Other: any[] = toArray(f26as?.tdsOnOthThanSals?.tdSonOthThanSal);
  const allTDS = [...tds1, ...tds2, ...tds3, ...tds26Salary, ...tds26Other];

  if (allTDS.length) {
    out.tdsEntries = allTDS.map((e: any) => {
      const isSalary = tds1.includes(e) || tds26Salary.includes(e);
      const deductorDetail = e?.employerOrDeductorOrCollectDetl ?? {};
      return {
        entryType: isSalary ? 'SALARY' : 'OTHER',
        nameOfDeductor: e?.NameOfDeductor ?? e?.nameOfDeductor ?? deductorDetail?.employerOrDeductorOrCollecterName ?? '',
        tanOfDeductor: e?.TANofDeductor ?? e?.tanOfDeductor ?? deductorDetail?.tan ?? e?.TAN ?? '',
        tdsSection: e?.Section ?? e?.tdsSection ?? e?.sectionCode ?? e?.NatureOfPayment ?? '',
        incomeChargeable: num(e?.IncomeChargeable ?? e?.incomeChargeable ?? e?.grossAmount ?? e?.GrossAmt ?? e?.AmtForTaxDeduct),
        tdsDeducted: num(e?.TDSDeducted ?? e?.tdsDeducted ?? e?.taxDeductCreditDtls?.taxDeductedOwnHands ?? e?.TaxDeducted ?? e?.TDSCredited),
        tdsClaimed: num(e?.TDSClaimed ?? e?.tdsClaimed ?? e?.taxDeductCreditDtls?.taxClaimedOwnHands ?? e?.TDSDeducted ?? e?.tdsDeducted ?? 0),
      };
    });
  }

  // ── TCS ───────────────────────────────────────────────────────────────────
  const tcsArr: any[] = toArray(obj?.ScheduleTCS ?? obj?.TCS ?? obj?.scheduleTCS);
  if (tcsArr.length) {
    out.tcsEntries = tcsArr.map((e: any) => ({
      entryType: 'TCS',
      nameOfDeductor: e?.NameOfCollector ?? e?.nameOfCollector ?? '',
      tanOfDeductor: e?.TANofCollector ?? e?.tanOfCollector ?? '',
      amtOnWhichTCS: num(e?.AmtOnWhichTCS ?? e?.amtOnWhichTCS ?? 0),
      tcsCollected: num(e?.TCSCollected ?? e?.tcsCollected ?? 0),
      tcsClaimed: num(e?.TCSClaimed ?? e?.tcsClaimed ?? e?.TCSCollected ?? 0),
    }));
  }

  // ── Tax Payments ───────────────────────────────────────────────────────────
  const advArr: any[] = toArray(
    obj?.ScheduleTaxPayments ?? obj?.TaxPayments
      ?? obj?.ScheduleIT?.AdvanceTax ?? obj?.AdvanceTax
  );
  if (advArr.length) {
    out.taxPayments = advArr.map((e: any) => ({
      paymentType: /self|SAT/i.test(e?.Type ?? e?.paymentType ?? '') ? 'SAT' : 'ADVANCE',
      bsrCode: e?.BSRCode ?? e?.bsrCode ?? '',
      dateOfDeposit: parseDate(e?.DateDep ?? e?.dateOfDeposit ?? '') || new Date().toISOString().slice(0, 10),
      challanSerialNo: String(e?.ChallanNo ?? e?.challanSerialNo ?? ''),
      taxAmount: num(e?.TaxPaid ?? e?.taxAmount ?? e?.Amt ?? 0),
      totalAmount: num(e?.TotalAmount ?? e?.totalAmount ?? e?.TaxPaid ?? e?.Amt ?? 0),
    }));
  }

  // ── Bank Account ──────────────────────────────────────────────────────────
  // flat format: bankAccountDtls[0].addtnlBankDetails[]
  const flatBankArr: any[] = toArray(
    obj?.bankAccountDtls?.[0]?.addtnlBankDetails ?? obj?.bankAccountDtls?.[0]?.BankDetail
  );
  const bankArr: any[] = flatBankArr.length ? flatBankArr : toArray(
    obj?.BankAccountDetails?.BankDetail ?? obj?.BankDetail ?? obj?.ScheduleBank
  );
  const refundBank = bankArr.find((b: any) =>
    b?.UseForRefund === 'Y' || b?.useForRefund === 'Y' || b?.useForRefund === 'true'
  ) ?? bankArr[0];
  if (refundBank) {
    out.bankAccount = {
      ifsc: refundBank?.IFSCCode ?? refundBank?.ifscCode ?? refundBank?.ifsccode ?? refundBank?.IFSC ?? '',
      accountNo: refundBank?.BankAccountNo ?? refundBank?.bankAccountNo ?? refundBank?.AccountNo ?? '',
      bankName: refundBank?.BankName ?? refundBank?.bankName ?? '',
    };
  }

  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function toArray(v: unknown): any[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function parseDate(s: string): string {
  if (!s) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try { return new Date(s).toISOString().slice(0, 10); } catch { return ''; }
}

function mapPropertyType(raw: unknown): string {
  const s = String(raw ?? '').toUpperCase();
  if (/^S|SELF|SOP/i.test(s)) return 'self_occupied';
  if (/^D|DEEMED|DLOP/i.test(s)) return 'deemed_let_out';
  return 'let_out';
}

// ─── Schedule injectors ────────────────────────────────────────────────────────

async function injectSalary(returnId: number, salary: NonNullable<ParsedPrefill['salary']>) {
  const existing = await prisma.salarySchedule.findFirst({ where: { returnId } });
  if (existing) return;

  const sched = await prisma.salarySchedule.create({
    data: {
      returnId,
      totalGrossSalary: salary.grossSalary,
      allwncExtentExemptUs10: salary.allowancesExempt10,
      netSalary: salary.netSalary,
      deductionUs16ia: salary.standardDeduction,
      professionalTaxUs16iii: salary.professionalTax,
      incomeFromSalary: salary.netSalary,
      totalDeductionUs16: salary.standardDeduction + salary.professionalTax,
    },
  });

  for (const e of salary.employers) {
    await prisma.employerEntry.create({
      data: {
        salaryScheduleId: sched.id,
        nameOfEmployer: e.nameOfEmployer ?? '',
        tanOfEmployer: e.tanOfEmployer ?? null,
        natureOfEmployment: (e.natureOfEmployment as any) ?? 'OTH',
        salary: e.grossSalary ?? 0,
        valueOfPerquisites: e.valueOfPerquisites ?? 0,
        profitsinLieuOfSalary: e.profitsinLieuOfSalary ?? 0,
      },
    });
  }
}

async function injectHouseProperty(returnId: number, properties: any[]) {
  const existing = await prisma.hPSchedule.count({ where: { returnId } });
  if (existing) return;

  for (let i = 0; i < properties.length; i++) {
    const p = properties[i];
    const nav = Math.max(0, (p.annualRentReceived ?? 0) - (p.municipalTaxesPaid ?? 0));
    await prisma.hPSchedule.create({
      data: {
        returnId,
        seqNo: i + 1,
        ifLetOut: p.propertyType === 'self_occupied' ? 'S' : p.propertyType === 'deemed_let_out' ? 'D' : 'L',
        localTaxes: p.municipalTaxesPaid ?? 0,
        annualLetableValue: p.annualRentReceived ?? 0,
        balanceALV: nav,
        thirtyPercentBalance: Math.round(nav * 0.3),
        intOnBorwCap: p.interestOnLoan ?? 0,
        selfOccInterestOnLoan: p.propertyType === 'self_occupied' ? Math.min(p.interestOnLoan ?? 0, 200000) : null,
        incomeOfHP: p.propertyType === 'self_occupied'
          ? -Math.min(p.interestOnLoan ?? 0, 200000)
          : nav - Math.round(nav * 0.3) - (p.interestOnLoan ?? 0),
      },
    });
  }
}

async function injectTDS(returnId: number, entries: any[]) {
  const existing = await prisma.tDSEntry.count({ where: { returnId } });
  if (existing) return;

  for (const e of entries) {
    await prisma.tDSEntry.create({
      data: {
        returnId,
        entryType: e.entryType ?? 'OTHER',
        nameOfDeductor: e.nameOfDeductor ?? '',
        tanOfDeductor: e.tanOfDeductor ?? '',
        tdsSection: e.tdsSection ?? '',
        incomeChargeable: e.incomeChargeable ?? 0,
        tdsDeducted: e.tdsDeducted ?? 0,
        tdsClaimed: e.tdsClaimed ?? e.tdsDeducted ?? 0,
      },
    });
  }
}

async function injectTCS(returnId: number, entries: any[]) {
  for (const e of entries) {
    await prisma.tDSEntry.create({
      data: {
        returnId,
        entryType: 'TCS',
        nameOfDeductor: e.nameOfDeductor ?? '',
        tanOfDeductor: e.tanOfDeductor ?? '',
        amtOnWhichTCS: e.amtOnWhichTCS ?? 0,
        tcsCollected: e.tcsCollected ?? 0,
        tcsClaimed: e.tcsClaimed ?? e.tcsCollected ?? 0,
      },
    });
  }
}

async function injectTaxPayments(returnId: number, payments: any[]) {
  const existing = await prisma.taxPaymentEntry.count({ where: { returnId } });
  if (existing) return;

  for (const p of payments) {
    await prisma.taxPaymentEntry.create({
      data: {
        returnId,
        paymentType: p.paymentType ?? 'ADVANCE',
        bsrCode: p.bsrCode ?? '',
        dateOfDeposit: p.dateOfDeposit ? new Date(p.dateOfDeposit) : new Date(),
        challanSerialNo: p.challanSerialNo ?? '',
        taxAmount: p.taxAmount ?? 0,
        totalAmount: p.totalAmount ?? p.taxAmount ?? 0,
      },
    });
  }
}

async function injectBankAccount(clientId: number, bank: NonNullable<ParsedPrefill['bankAccount']>) {
  if (!bank.ifsc || !bank.accountNo) return;
  const existing = await prisma.bankAccount.findFirst({ where: { clientId } });
  if (existing) return;
  await prisma.bankAccount.create({
    data: {
      clientId,
      ifscCode: bank.ifsc,
      accountNumber: bank.accountNo,
      bankName: bank.bankName,
      accountType: 'SAVINGS',
      isPrimary: true,
    },
  });
}
