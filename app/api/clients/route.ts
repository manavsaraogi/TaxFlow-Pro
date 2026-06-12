import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

// GET /api/clients — list all clients for the firm
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clients = await prisma.client.findMany({
    where: { firmId: auth.firmId, isActive: true },
    include: {
      _count: { select: { returns: { where: { status: { not: 'CANCELLED' } } } } },
      returns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { assessmentYear: true },
      },
    },
    orderBy: { fullName: 'asc' },
  });

  const data = clients.map((c) => ({
    id: String(c.id),
    pan: c.pan,
    name: c.fullName,
    assesseeType: mapAssesseeType(c.assesseeType),
    mobile: c.mobileNumber,
    email: c.email,
    city: c.city,
    state: c.stateCode,
    residentialStatus: c.residentialStatus ?? 'RES',
    taxRegimePreference: c.taxRegimePreference,
    activeReturnsCount: c._count.returns,
    lastReturnAY: c.returns[0]?.assessmentYear?.ayLabel ?? null,
    createdAt: c.createdAt.toISOString(),
  }));

  return NextResponse.json({ data });
}

// POST /api/clients — create a client
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const client = await prisma.client.create({
    data: {
      firmId: auth.firmId,
      pan: (body.pan as string).toUpperCase(),
      assesseeType: body.assesseeType,
      fullName: body.name,
      dateOfBirth: body.dateOfBirthOrIncorporation ? new Date(body.dateOfBirthOrIncorporation) : null,
      mobileNumber: body.mobile ?? null,
      email: body.email ?? null,
      address: body.addressLine1 ?? null,
      city: body.city ?? null,
      stateCode: body.state ?? null,
      pinCode: body.pincode ? Number(body.pincode) : null,
      residentialStatus: body.residentialStatus ?? 'RES',
      taxRegimePreference: body.taxRegimePreference ?? 'NEW',
      portalUsername: body.portalUsername ?? null,
    },
  });

  return NextResponse.json({ data: { id: String(client.id) } }, { status: 201 });
}

function mapAssesseeType(t: string): string {
  const map: Record<string, string> = {
    INDIVIDUAL: 'Individual',
    HUF: 'HUF',
    DOMESTIC_COMPANY: 'Company_Domestic',
    FOREIGN_COMPANY: 'Company_Foreign',
    FIRM: 'Firm',
    LLP: 'LLP',
    AOP: 'AOP',
    BOI: 'BOI',
    AJP: 'AJP',
    OTHER: 'Other',
  };
  return map[t] ?? t;
}
