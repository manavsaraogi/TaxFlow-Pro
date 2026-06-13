import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { NatureOfEmployment } from '@prisma/client';

type Params = { params: { id: string; key: string } };

// PUT /api/returns/[id]/schedule/[key]
// key: salary | houseProperty | otherSources | deductions | tds | taxPayments | ltcg112A | presumptiveIncome | verification
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
      await prisma.oSSchedule.upsert({
        where: { returnId },
        create: { returnId, ...sanitizeSchedule(body) },
        update: sanitizeSchedule(body),
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
      await prisma.taxPaymentEntry.deleteMany({ where: { returnId } });
      if (Array.isArray(body.entries) && body.entries.length > 0) {
        await prisma.taxPaymentEntry.createMany({
          data: body.entries.map((e: Record<string, unknown>) => ({
            returnId,
            paymentType: e.paymentType as string,
            bsrCode: e.bsrCode as string,
            dateOfDeposit: new Date(e.dateOfDeposit as string),
            challanSerialNo: e.challanSerialNo as string,
            taxAmount: Number(e.taxAmount ?? 0),
            totalAmount: Number(e.totalAmount ?? 0),
          })),
        });
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
