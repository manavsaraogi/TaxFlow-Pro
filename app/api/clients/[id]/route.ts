import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { encryptPassword } from '@/lib/portal-encrypt';

type Params = { params: { id: string } };

// GET /api/clients/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = await prisma.client.findFirst({
    where: { id: Number(params.id), firmId: auth.firmId },
    include: {
      bankAccounts: { where: { isActive: true } },
      returns: {
        orderBy: { createdAt: 'desc' },
        include: { assessmentYear: true },
      },
    },
  });

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = {
    id: client.id,
    pan: client.pan,
    fullName: client.fullName,
    // legacy aliases for compatibility
    name: client.fullName,
    assesseeType: client.assesseeType,
    dateOfBirth: client.dateOfBirth?.toISOString().split('T')[0] ?? null,
    dateOfBirthOrIncorporation: client.dateOfBirth?.toISOString().split('T')[0] ?? null,
    mobileNumber: client.mobileNumber,
    mobile: client.mobileNumber,
    email: client.email,
    address: client.address,
    addressLine1: client.address,
    city: client.city,
    stateCode: client.stateCode,
    state: client.stateCode,
    pinCode: client.pinCode ? String(client.pinCode) : null,
    pincode: client.pinCode ? String(client.pinCode) : null,
    aadhaarNumber: client.aadhaarNumber,
    residentialStatus: client.residentialStatus ?? 'RES',
    employerCategory: client.employerCategory ?? 'OTH',
    taxRegimePreference: client.taxRegimePreference,
    portalUsername: client.portalUsername,
    hasPortalPassword: !!(client as any).portalPasswordEnc,
    isActive: client.isActive,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    bankAccounts: client.bankAccounts.map((b) => ({
      id: b.id,
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      ifscCode: b.ifscCode,
      ifsc: b.ifscCode,
      accountType: b.accountType,
      isPrimary: b.isPrimary,
    })),
    returns: client.returns.map((r) => ({
      id: r.id,
      status: r.status,
      formType: r.formType,
      regime: r.regime,
      grossTotalIncome: r.grossTotalIncome,
      grossTaxLiability: r.grossTaxLiability,
      refundDue: r.refundDue,
      balTaxPayable: r.balTaxPayable,
      filedAt: r.filedAt?.toISOString() ?? null,
      acknowledgementNumber: r.acknowledgementNumber,
      createdAt: r.createdAt.toISOString(),
      assessmentYear: r.assessmentYear
        ? { ayLabel: r.assessmentYear.ayLabel }
        : null,
    })),
  };

  return NextResponse.json({ data });
}

// PUT /api/clients/[id]
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.client.findFirst({
    where: { id: Number(params.id), firmId: auth.firmId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const dob = body.dateOfBirth ?? body.dateOfBirthOrIncorporation;

  await prisma.client.update({
    where: { id: Number(params.id) },
    data: {
      fullName: body.fullName ?? body.name ?? existing.fullName,
      mobileNumber: body.mobileNumber ?? body.mobile ?? existing.mobileNumber,
      email: body.email ?? existing.email,
      address: body.address ?? body.addressLine1 ?? existing.address,
      city: body.city ?? existing.city,
      stateCode: body.stateCode ?? body.state ?? existing.stateCode,
      pinCode: (body.pinCode ?? body.pincode) ? Number(body.pinCode ?? body.pincode) : existing.pinCode,
      aadhaarNumber: body.aadhaarNumber ?? existing.aadhaarNumber,
      residentialStatus: body.residentialStatus ?? existing.residentialStatus,
      employerCategory: body.employerCategory ?? existing.employerCategory,
      taxRegimePreference: body.taxRegimePreference ?? existing.taxRegimePreference,
      portalUsername: body.portalUsername ?? existing.portalUsername,
      dateOfBirth: dob ? new Date(dob) : existing.dateOfBirth,
    },
  });

  // Update encrypted portal password if provided
  if (body.portalPassword) {
    try {
      const enc = encryptPassword(body.portalPassword);
      await prisma.$executeRaw`
        UPDATE "Client" SET "portalPasswordEnc" = ${enc} WHERE id = ${Number(params.id)}
      `;
    } catch {
      // Non-fatal — encryption key may not be set
    }
  }

  return NextResponse.json({ data: { success: true } });
}

// DELETE /api/clients/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.client.findFirst({
    where: { id: Number(params.id), firmId: auth.firmId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.client.update({
    where: { id: Number(params.id) },
    data: { isActive: false },
  });

  return NextResponse.json({ data: { success: true } });
}
