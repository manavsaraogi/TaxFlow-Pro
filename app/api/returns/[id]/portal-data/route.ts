import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const returnId = parseInt(params.id);
  if (isNaN(returnId)) return NextResponse.json({ error: 'Invalid return ID' }, { status: 400 });

  try {
    // Use raw query since portalData may not be in generated Prisma client yet
    const rows = await prisma.$queryRaw<Array<{ portalData: string | null }>>`
      SELECT "portalData" FROM "Return"
      WHERE id = ${returnId}
        AND "clientId" IN (SELECT id FROM "Client" WHERE "firmId" = ${auth.firmId})
      LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const raw = rows[0].portalData;
    return NextResponse.json({ data: raw ? JSON.parse(raw) : null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const returnId = parseInt(params.id);
  if (isNaN(returnId)) return NextResponse.json({ error: 'Invalid return ID' }, { status: 400 });

  try {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Return"
      WHERE id = ${returnId}
        AND "clientId" IN (SELECT id FROM "Client" WHERE "firmId" = ${auth.firmId})
      LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.$executeRaw`
      UPDATE "Return" SET "portalData" = NULL, "updatedAt" = NOW()
      WHERE id = ${returnId}
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const returnId = parseInt(params.id);
  if (isNaN(returnId)) return NextResponse.json({ error: 'Invalid return ID' }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Return"
      WHERE id = ${returnId}
        AND "clientId" IN (SELECT id FROM "Client" WHERE "firmId" = ${auth.firmId})
      LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.$executeRaw`
      UPDATE "Return" SET "portalData" = ${JSON.stringify(body)}, "updatedAt" = NOW()
      WHERE id = ${returnId}
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
