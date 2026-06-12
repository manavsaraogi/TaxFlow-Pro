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
      assessmentYear: true,
      salarySchedule: { include: { employers: true } },
      hpSchedule: true,
      osSchedule: true,
      deductionSchedule: true,
      tdsEntries: true,
      taxPayments: true,
      ltcg112AEntries: true,
      presumptiveSchedule: true,
      verification: true,
    },
  });

  if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ data: ret });
}

// PATCH /api/returns/[id] — update status, notes, etc.
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
