import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

type Params = { params: { id: string } };

// GET /api/clients/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = await prisma.client.findFirst({
    where: { id: Number(params.id), firmId: auth.firmId },
    include: { bankAccounts: { where: { isActive: true } } },
  });

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = {
    id: String(client.id),
    pan: client.pan,
    name: client.fullName,
    assesseeType: client.assesseeType,
    mobile: client.mobileNumber,
    email: client.email,
    city: client.city,
    state: client.stateCode,
    residentialStatus: client.residentialStatus,
    taxRegimePreference: client.taxRegimePreference,
    dateOfBirthOrIncorporation: client.dateOfBirth?.toISOString().split('T')[0] ?? null,
    addressLine1: client.address,
    pincode: client.pinCode ? String(client.pinCode) : null,
    portalUsername: client.portalUsername,
    activeReturnsCount: 0,
    lastReturnAY: null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    bankAccounts: client.bankAccounts.map((b) => ({
      id: String(b.id),
      accountNumber: b.accountNumber,
      ifsc: b.ifscCode,
      bankName: b.bankName,
      accountType: b.accountType,
      isPrimary: b.isPrimary,
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

  await prisma.client.update({
    where: { id: Number(params.id) },
    data: {
      fullName: body.name ?? existing.fullName,
      mobileNumber: body.mobile ?? existing.mobileNumber,
      email: body.email ?? existing.email,
      address: body.addressLine1 ?? existing.address,
      city: body.city ?? existing.city,
      stateCode: body.state ?? existing.stateCode,
      pinCode: body.pincode ? Number(body.pincode) : existing.pinCode,
      residentialStatus: body.residentialStatus ?? existing.residentialStatus,
      taxRegimePreference: body.taxRegimePreference ?? existing.taxRegimePreference,
      portalUsername: body.portalUsername ?? existing.portalUsername,
      dateOfBirth: body.dateOfBirthOrIncorporation ? new Date(body.dateOfBirthOrIncorporation) : existing.dateOfBirth,
    },
  });

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

  // Soft delete
  await prisma.client.update({
    where: { id: Number(params.id) },
    data: { isActive: false },
  });

  return NextResponse.json({ data: { success: true } });
}
