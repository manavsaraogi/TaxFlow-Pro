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
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    let client;
    try {
      client = await prisma.client.create({
        data: {
          firmId: auth.firmId,
          pan: (body.pan as string).toUpperCase(),
          assesseeType: body.assesseeType,
          fullName: body.fullName ?? body.name,
          dateOfBirth: (body.dateOfBirth ?? body.dateOfBirthOrIncorporation) ? new Date(body.dateOfBirth ?? body.dateOfBirthOrIncorporation) : null,
          mobileNumber: body.mobileNumber ?? body.mobile ?? null,
          email: body.email ?? null,
          address: body.address ?? body.addressLine1 ?? null,
          city: body.city ?? null,
          stateCode: body.stateCode ?? body.state ?? null,
          pinCode: (body.pinCode ?? body.pincode) ? Number(body.pinCode ?? body.pincode) : null,
          aadhaarNumber: body.aadhaarNumber ?? null,
          residentialStatus: body.residentialStatus ?? 'RES',
          employerCategory: body.employerCategory ?? 'OTH',
          taxRegimePreference: body.taxRegimePreference ?? 'NEW',
          portalUsername: body.portalUsername ?? null,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return NextResponse.json({ error: 'A client with this PAN already exists.' }, { status: 409 });
      }
      const msg = e?.message ?? 'Failed to create client';
      console.error('[POST /api/clients] prisma error:', msg, e?.code);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ data: { id: String(client.id) } }, { status: 201 });
  } catch (e: any) {
    const msg = e?.message ?? 'Unexpected server error';
    console.error('[POST /api/clients] unhandled:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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
