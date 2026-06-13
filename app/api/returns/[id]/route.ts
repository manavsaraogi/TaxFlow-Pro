import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

type Params = { params: { id: string } };

// GET /api/returns/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ret = await prisma.return.findFirst({
    where: { id: Number(params.id), client: { firmId: auth.firmId } },
    include: {
      client: { select: { fullName: true, pan: true } },
      assessmentYear: { select: { ayLabel: true, regime: true } },
      salarySchedule: { include: { employers: true } },
      hpSchedule: { select: { id: true, returnId: true, seqNo: true, ifLetOut: true, addrDetail: true, city: true, stateCode: true, pinCode: true, annualLetableValue: true, rentNotRealized: true, localTaxes: true, intOnBorwCap: true, incomeOfHP: true, selfOccInterestOnLoan: true, propertyOwner: true, propCoOwnedFlg: true, asseseeShareProperty: true, section24BJson: true, coOwnersJson: true, tenantDetailsJson: true, totalUnrealizedAndTax: true, balanceALV: true, annualOfPropOwned: true, thirtyPercentBalance: true, totalDeduct: true, arrearsUnrealRentRcvd: true, countryCode: true, totalInterestUs24B: true, createdAt: true, updatedAt: true, propertyOwnerOther: true } },
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

  return NextResponse.json({ data: ret });
}

// PATCH /api/returns/[id] — update status, formType, notes, etc.
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.return.findFirst({
    where: { id: Number(params.id), client: { firmId: auth.firmId } },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  const updated = await prisma.return.update({
    where: { id: Number(params.id) },
    data: {
      status: body.status ?? existing.status,
      notes: body.notes ?? existing.notes,
      formType: body.formType ?? existing.formType,
      filedAt: body.filedAt ? new Date(body.filedAt) : existing.filedAt,
      acknowledgementNumber: body.acknowledgementNumber ?? existing.acknowledgementNumber,
      grossTotalIncome: body.grossTotalIncome ?? existing.grossTotalIncome,
      totalDeductions: body.totalDeductions ?? existing.totalDeductions,
      taxableIncome: body.taxableIncome ?? existing.taxableIncome,
      grossTaxLiability: body.grossTaxLiability ?? existing.grossTaxLiability,
      totalTaxesPaid: body.totalTaxesPaid ?? existing.totalTaxesPaid,
      balTaxPayable: body.balTaxPayable ?? existing.balTaxPayable,
      refundDue: body.refundDue ?? existing.refundDue,
    },
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/returns/[id] — delete return and all child records
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.return.findFirst({
    where: { id: Number(params.id), client: { firmId: auth.firmId } },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Cascade-delete all child records then the return itself
  const id = Number(params.id);
  await prisma.$transaction([
    prisma.employerEntry.deleteMany({ where: { salarySchedule: { returnId: id } } }),
    prisma.salarySchedule.deleteMany({ where: { returnId: id } }),
    prisma.hPSchedule.deleteMany({ where: { returnId: id } }),
    prisma.oSSchedule.deleteMany({ where: { returnId: id } }),
    prisma.deductionSchedule.deleteMany({ where: { returnId: id } }),
    prisma.tDSEntry.deleteMany({ where: { returnId: id } }),
    prisma.taxPaymentEntry.deleteMany({ where: { returnId: id } }),
    prisma.lTCG112AEntry.deleteMany({ where: { returnId: id } }),
    prisma.sTCGEntry.deleteMany({ where: { returnId: id } }),
    prisma.presumptiveSchedule.deleteMany({ where: { returnId: id } }),
    prisma.returnVerification.deleteMany({ where: { returnId: id } }),
    prisma.return.delete({ where: { id } }),
  ]);

  return NextResponse.json({ data: { deleted: true } });
}
