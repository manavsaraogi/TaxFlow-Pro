import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { decryptPassword } from '@/lib/portal-encrypt';

type Params = { params: { id: string } };

// GET /api/clients/[id]/portal-credentials
// Returns PAN + decrypted portal password for the local agent to use.
// Only callable by authenticated firm users (same auth as everything else).
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.$queryRaw<{ pan: string; portalPasswordEnc: string | null; dateOfBirth: Date | null }[]>`
    SELECT pan, "portalPasswordEnc", "dateOfBirth"
    FROM "Client"
    WHERE id = ${Number(params.id)} AND "firmId" = ${auth.firmId} AND "isActive" = true
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { pan, portalPasswordEnc, dateOfBirth } = rows[0];
  let portalPassword: string | null = null;
  if (portalPasswordEnc) {
    try {
      portalPassword = decryptPassword(portalPasswordEnc);
    } catch {
      return NextResponse.json({ error: 'Failed to decrypt portal password. Check PORTAL_ENCRYPTION_KEY env var.' }, { status: 500 });
    }
  }

  // Format DOB as DDMMYYYY — used as 26AS file password
  let dob: string | null = null;
  if (dateOfBirth) {
    const d = new Date(dateOfBirth);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    dob = `${dd}${mm}${yyyy}`;
  }

  return NextResponse.json({ data: { pan, portalPassword, dob } });
}
