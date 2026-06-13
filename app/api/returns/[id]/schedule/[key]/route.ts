import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { NatureOfEmployment } from '@prisma/client';

type Params = { params: { id: string; key: string } };

// PUT /api/returns/[id]/schedule/[key]
// key: salary | houseProperty | otherSources | deductions | tds | taxPayments | ltcg112A | stcg | presumptiveIncome | verification
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const returnId = Number(params.id);
  const ret = await prisma.return.findFirst({
    where: { id: returnId, client: { firmId: auth.firmId } },
  });
  if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  switch (params.key) {
    case 'salary': {
      const employers: Record<string, unknown>[] = Array.isArray(body.employers) ? body.employers : [];
      const stdDeduction = Number(body.standardDeduction ?? 50000);
      const entAlw = Number(body.entertainmentAllowance ?? 0);
      const profTax = Number(body.professionalTax ?? 0);
      const totalDeduct = stdDeduction + entAlw + profTax;

      const salaryData = {
        totalGrossSalary: Number(body.grossSalary ?? 0),
        allwncExtentExemptUs10: Number(body.allowancesExempt10 ?? 0),
        netSalary: Number(body.netSalary ?? 0),
        deductionUs16ia: stdDeduction,
        entertainmentAlw16ii: entAlw,
        professionalTaxUs16iii: profTax,
        totalDeductionUs16: totalDeduct,
        incomeFromSalary: Number(body.incomeFromSalary ?? body.netSalary ?? 0),
        increliefus89A: Number(body.increliefus89A ?? 0),
        hraDetailsJson: body.hraInputs ? JSON.stringify(body.hraInputs) : null,
        allowancesJson: JSON.stringify({ useComputedHra: body.useComputedHra ?? false, section16: body.section16 ?? {} }),
      };

      const salarySchedule = await prisma.salarySchedule.upsert({
        where: { returnId },
        create: { returnId, ...salaryData },
        update: salaryData,
      });

      // Replace employer entries
      await prisma.employerEntry.deleteMany({ where: { salaryScheduleId: salarySchedule.id } });
      if (employers.length > 0) {
        await prisma.employerEntry.createMany({
          data: employers.map((e, i) => ({
            salaryScheduleId: salarySchedule.id,
            seqNo: i + 1,
            nameOfEmployer: String(e.employerName ?? ''),
            natureOfEmployment: mapEmployerCategory(String(e.employerCategory ?? 'others')) as NatureOfEmployment,
            tanOfEmployer: e.tan ? String(e.tan) : null,
            grossSalary: Number(e.grossSalary ?? 0),
            salary: Number(e.grossSalary ?? 0),
            valueOfPerquisites: Number(e.perquisites ?? 0),
            profitsinLieuOfSalary: Number(e.profitInLieuOfSalary ?? 0) + Number(e.retirementBenefits ?? 0),
          })),
        });
      }
      break;
    }
    case 'otherSources': {
      // body is the ScheduleOS payload: { savingsInterest, fdInterest, dividends, totalOSIncome, deductionU57, _fdEntries, ... }
      // Serialize entire payload into otherSourceItemsJson for round-trip fidelity
      const osData = {
        otherSourceItemsJson: JSON.stringify(body),
        deductionUs57iia: Number(body.deductionU57 ?? 0),
        incomeFromOtherSources: Number(body.totalOSIncome ?? 0),
      };
      await prisma.oSSchedule.upsert({
        where: { returnId },
        create: { returnId, ...osData },
        update: osData,
      });
      break;
    }
    case 'deductions': {
      await prisma.deductionSchedule.upsert({
        where: { returnId },
        create: { returnId, ...sanitizeSchedule(body) },
        update: sanitizeSchedule(body),
      });
      break;
    }
    case 'presumptiveIncome': {
      await prisma.presumptiveSchedule.upsert({
        where: { returnId },
        create: { returnId, ...sanitizeSchedule(body) },
        update: sanitizeSchedule(body),
      });
      break;
    }
    case 'verification': {
      const vData = {
        assesseeVerName: body.AssesseeVerName ?? '',
        fatherName: body.FatherName ?? null,
        placeVerSign: body.PlaceVerSign ?? '',
        dateVerSign: body.DateVerSign ? new Date(body.DateVerSign) : new Date(),
        capacity: body.Capacity ?? 'S',
        everifyFlag: body.EverifyFlag ?? 'Y',
        aadhaarOTPFlag: body.AadhaarOTPFlag ?? 'N',
        bankAccountFlag: body.BankAccountFlag ?? 'N',
        dematAccountFlag: body.DematAccountFlag ?? 'N',
      };
      await prisma.returnVerification.upsert({
        where: { returnId },
        create: { returnId, ...vData },
        update: vData,
      });
      break;
    }
    case 'tds': {
      // Replace all TDS entries
      await prisma.tDSEntry.deleteMany({ where: { returnId } });
      if (Array.isArray(body.entries) && body.entries.length > 0) {
        await prisma.tDSEntry.createMany({
          data: body.entries.map((e: Record<string, unknown>) => ({ returnId, ...e })),
        });
      }
      break;
    }
    case 'taxPayments': {
      // Accepts either { entries: [...] } (AIS import) or { advanceTax: [...], selfAssessmentTax: [...] } (component save)
      const challanFromEntry = (e: Record<string, unknown>, type: string) => ({
        returnId,
        paymentType: (e.paymentType as string) ?? type,
        bsrCode: (e.bsrCode as string) ?? '',
        dateOfDeposit: e.dateOfDeposit ? new Date(e.dateOfDeposit as string) : new Date(),
        challanSerialNo: (e.challanSerialNo ?? e.challanSerial ?? '') as string,
        taxAmount: Number(e.taxAmount ?? 0),
        surchargeAmount: Number(e.surcharge ?? e.surchargeAmount ?? 0),
        educationCess: Number(e.educationCess ?? 0),
        interestAmount: Number(e.interestPaid ?? e.interestAmount ?? 0),
        feeAmount: Number(e.penaltyPaid ?? e.feeAmount ?? 0),
        totalAmount: Number(e.totalAmount ?? 0),
      });

      await prisma.taxPaymentEntry.deleteMany({ where: { returnId } });

      const allEntries: Record<string, unknown>[] = [];
      if (Array.isArray(body.entries)) {
        allEntries.push(...body.entries.map((e: Record<string, unknown>) => challanFromEntry(e, 'ADVANCE')));
      } else {
        if (Array.isArray(body.advanceTax)) {
          allEntries.push(...body.advanceTax.map((e: Record<string, unknown>) => challanFromEntry(e, 'ADVANCE')));
        }
        if (Array.isArray(body.selfAssessmentTax)) {
          allEntries.push(...body.selfAssessmentTax.map((e: Record<string, unknown>) => challanFromEntry(e, 'SAT')));
        }
      }

      if (allEntries.length > 0) {
        await prisma.taxPaymentEntry.createMany({ data: allEntries as any });
      }
      break;
    }
    case 'ltcg112A': {
      await prisma.lTCG112AEntry.deleteMany({ where: { returnId } });
      if (Array.isArray(body.entries) && body.entries.length > 0) {
        await prisma.lTCG112AEntry.createMany({
          data: body.entries.map((e: Record<string, unknown>) => ({ returnId, ...e })),
        });
      }
      break;
    }
    case 'stcg': {
      await prisma.sTCGEntry.deleteMany({ where: { returnId } });
      const allStcg: Record<string, unknown>[] = [];
      if (Array.isArray(body.entries111A)) {
        for (const e of body.entries111A) {
          allStcg.push({ returnId, entryType: '111A', isin: e.isin ?? '', shareOrUnitName: e.shareOrUnitName ?? '', salesValue: Number(e.salesValue ?? 0), purchaseCost: Number(e.purchaseCost ?? 0), expenditure: Number(e.expenditure ?? 0), gainLoss: Number(e.gainLoss ?? 0) });
        }
      }
      if (Array.isArray(body.entriesOther)) {
        for (const e of body.entriesOther) {
          allStcg.push({ returnId, entryType: 'OTHER', assetDesc: e.assetDesc ?? '', salesValue: Number(e.salesValue ?? 0), purchaseCost: Number(e.purchaseCost ?? 0), expenditure: Number(e.expenditure ?? 0), gainLoss: Number(e.gainLoss ?? 0) });
        }
      }
      if (allStcg.length > 0) {
        await prisma.sTCGEntry.createMany({ data: allStcg as any });
      }
      break;
    }
    case 'houseProperty': {
      // Replace all HP schedules
      await prisma.hPSchedule.deleteMany({ where: { returnId } });
      if (Array.isArray(body.Properties) && body.Properties.length > 0) {
        await prisma.hPSchedule.createMany({
          data: body.Properties.map((p: Record<string, unknown>, i: number) => ({
            returnId,
            seqNo: i + 1,
            ...sanitizeSchedule(p),
          })),
        });
      }
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown schedule key: ${params.key}` }, { status: 400 });
  }

  return NextResponse.json({ data: { success: true } });
}

function sanitizeSchedule(obj: Record<string, unknown>): Record<string, unknown> {
  // Remove id, returnId, createdAt, updatedAt from incoming data to avoid conflicts
  const { id: _id, returnId: _rid, createdAt: _ca, updatedAt: _ua, ...rest } = obj;
  return rest;
}

function mapEmployerCategory(cat: string): string {
  const map: Record<string, string> = {
    govt: 'CGOV',
    psu: 'PSU',
    others: 'OTH',
    pensioners: 'PE',
  };
  return map[cat] ?? 'OTH';
}
