import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

type Params = { params: { id: string } };

// POST /api/clients/[id]/bank-accounts
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = await prisma.client.findFirst({
    where: { id: Number(params.id), firmId: auth.firmId },
  });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  // If this account is primary, unset others
  if (body.isPrimary) {
    await prisma.bankAccount.updateMany({
      where: { clientId: client.id },
      data: { isPrimary: false },
    });
  }

  const account = await prisma.bankAccount.create({
    data: {
      clientId: client.id,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      ifscCode: body.ifsc,
      accountType: body.accountType ?? 'SAVINGS',
      isPrimary: body.isPrimary ?? false,
    },
  });

  return NextResponse.json({ data: { id: String(account.id) } }, { status: 201 });
}

// DELETE /api/clients/[id]/bank-accounts?accountId=123
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = Number(new URL(request.url).searchParams.get('accountId'));
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, client: { firmId: auth.firmId } },
  });
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.bankAccount.delete({ where: { id: accountId } });
  return NextResponse.json({ data: { success: true } });
}
