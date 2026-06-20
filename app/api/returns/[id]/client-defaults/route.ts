import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

type Params = { params: { id: string } };

// GET /api/returns/[id]/client-defaults
// Returns members, verification, and prior-year balance sheet from the most recent OTHER return for the same client.
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const thisReturn = await prisma.return.findFirst({
    where: { id: Number(params.id), client: { firmId: auth.firmId } },
    select: { clientId: true },
  });
  if (!thisReturn) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const others = await prisma.return.findMany({
    where: {
      clientId: thisReturn.clientId,
      id: { not: Number(params.id) },
      client: { firmId: auth.firmId },
    },
    orderBy: { createdAt: 'desc' },
    select: { itr5GeneralJson: true, itr5BalanceSheetJson: true, verification: true },
    take: 10,
  });

  let members: unknown[] | null = null;
  let verification: unknown | null = null;
  let priorBalanceSheet: unknown | null = null;

  for (const r of others) {
    if (!members && r.itr5GeneralJson) {
      try {
        const gen = JSON.parse(r.itr5GeneralJson as string);
        if (Array.isArray(gen?.members) && gen.members.length > 0) {
          members = gen.members;
        }
      } catch { /* skip */ }
    }
    if (!verification && r.verification) {
      verification = r.verification;
    }
    if (!priorBalanceSheet && r.itr5BalanceSheetJson) {
      try {
        priorBalanceSheet = JSON.parse(r.itr5BalanceSheetJson as string);
      } catch { /* skip */ }
    }
    if (members && verification && priorBalanceSheet) break;
  }

  return NextResponse.json({ data: { members, verification, priorBalanceSheet } });
}
