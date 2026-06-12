import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

// GET /api/returns?clientId=xxx
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = request.nextUrl.searchParams.get('clientId');

  const where = clientId
    ? { clientId: Number(clientId), client: { firmId: auth.firmId } }
    : { client: { firmId: auth.firmId } };

  const returns = await prisma.return.findMany({
    where,
    include: {
      client: { select: { fullName: true, pan: true } },
      assessmentYear: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const data = returns.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.fullName,
    clientPAN: r.client.pan,
    formType: r.formType,
    assessmentYear: r.assessmentYear.ayLabel,
    regime: r.regime,
    status: r.status,
    filingType: r.filingType,
    filedAt: r.filedAt?.toISOString() ?? null,
    acknowledgementNumber: r.acknowledgementNumber,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ data });
}

// POST /api/returns — create a new return
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Verify client belongs to this firm
  const client = await prisma.client.findFirst({
    where: { id: Number(body.clientId), firmId: auth.firmId },
  });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Upsert AssessmentYear
  const ay = await prisma.assessmentYear.upsert({
    where: { clientId_ayLabel: { clientId: client.id, ayLabel: body.assessmentYear } },
    create: {
      clientId: client.id,
      ayLabel: body.assessmentYear,
      regime: body.regime ?? 'NEW',
    },
    update: {},
  });

  const ret = await prisma.return.create({
    data: {
      clientId: client.id,
      assessmentYearId: ay.id,
      formType: body.formType ?? 'ITR-1',
      regime: body.regime ?? 'NEW',
      filingType: body.filingType ?? 'ORIGINAL',
    },
  });

  return NextResponse.json({ data: { id: ret.id } }, { status: 201 });
}
