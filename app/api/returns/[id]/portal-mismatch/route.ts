import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export interface MismatchItem {
  type: 'MISSING_IN_ITR' | 'MISSING_IN_PORTAL' | 'AMOUNT_DIFFERS' | 'TDS_DIFFERS';
  severity: 'ERROR' | 'WARNING';
  tan?: string;
  name: string;
  field: string;
  portalValue?: number;
  itrValue?: number;
  message: string;
}

interface PortalTDSEntry {
  tan?: string;
  name: string;
  section?: string;
  incomeAmount?: number;
  tdsDeducted: number;
  entryType?: string;
}

interface ParsedPortalData {
  tdsEntries?: PortalTDSEntry[];
  tcsEntries?: Array<{ tan?: string; name: string; amount: number; tcsCollected: number }>;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const returnId = parseInt(params.id);
  if (isNaN(returnId)) return NextResponse.json({ error: 'Invalid return ID' }, { status: 400 });

  try {
    // Fetch return with portalData via raw query + TDS entries via Prisma
    const rows = await prisma.$queryRaw<Array<{ portalData: string | null }>>`
      SELECT "portalData" FROM "Return"
      WHERE id = ${returnId}
        AND "clientId" IN (SELECT id FROM "Client" WHERE "firmId" = ${auth.firmId})
      LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!rows[0].portalData) return NextResponse.json({ data: [], message: 'No portal data imported yet' });

    const tdsEntries = await prisma.tDSEntry.findMany({ where: { returnId } });
    const portal = JSON.parse(rows[0].portalData) as ParsedPortalData;
    const mismatches: MismatchItem[] = [];

    for (const pEntry of portal.tdsEntries ?? []) {
      const matched = tdsEntries.find(
        (e) =>
          (pEntry.tan && e.tanOfDeductor?.toUpperCase() === pEntry.tan.toUpperCase()) ||
          (pEntry.name &&
            e.nameOfDeductor
              ?.toUpperCase()
              .includes(pEntry.name.toUpperCase().slice(0, 8)))
      );

      if (!matched) {
        mismatches.push({
          type: 'MISSING_IN_ITR',
          severity: 'ERROR',
          tan: pEntry.tan,
          name: pEntry.name,
          field: 'TDS Entry',
          portalValue: pEntry.tdsDeducted,
          message: `Portal shows ₹${pEntry.tdsDeducted.toLocaleString('en-IN')} TDS from ${pEntry.name} (${pEntry.tan || 'no TAN'}) — not entered in ITR`,
        });
        continue;
      }

      const itrTds = matched.tdsClaimed ?? matched.tdsDeducted ?? 0;
      if (Math.abs(itrTds - pEntry.tdsDeducted) > 0) {
        mismatches.push({
          type: 'TDS_DIFFERS',
          severity: 'ERROR',
          tan: pEntry.tan,
          name: pEntry.name,
          field: 'TDS Deducted',
          portalValue: pEntry.tdsDeducted,
          itrValue: itrTds,
          message: `TDS mismatch for ${pEntry.name}: Portal ₹${pEntry.tdsDeducted.toLocaleString('en-IN')} vs ITR ₹${itrTds.toLocaleString('en-IN')}`,
        });
      }

      if (pEntry.incomeAmount && matched.incomeChargeable) {
        const diff = Math.abs(pEntry.incomeAmount - matched.incomeChargeable);
        const pct = diff / pEntry.incomeAmount;
        if (pct > 0.01) {
          mismatches.push({
            type: 'AMOUNT_DIFFERS',
            severity: 'WARNING',
            tan: pEntry.tan,
            name: pEntry.name,
            field: 'Income / Amount Credited',
            portalValue: pEntry.incomeAmount,
            itrValue: matched.incomeChargeable,
            message: `Income amount differs for ${pEntry.name}: Portal ₹${pEntry.incomeAmount.toLocaleString('en-IN')} vs ITR ₹${matched.incomeChargeable.toLocaleString('en-IN')}`,
          });
        }
      }
    }

    // Entries in ITR not found in portal
    for (const itrEntry of tdsEntries) {
      if (!itrEntry.tanOfDeductor) continue;
      const found = (portal.tdsEntries ?? []).find(
        (p) => p.tan && p.tan.toUpperCase() === itrEntry.tanOfDeductor!.toUpperCase()
      );
      if (!found) {
        mismatches.push({
          type: 'MISSING_IN_PORTAL',
          severity: 'WARNING',
          tan: itrEntry.tanOfDeductor,
          name: itrEntry.nameOfDeductor ?? 'Unknown',
          field: 'TDS Entry',
          itrValue: itrEntry.tdsClaimed ?? itrEntry.tdsDeducted,
          message: `ITR has TDS entry for ${itrEntry.nameOfDeductor} (${itrEntry.tanOfDeductor}) — not found in portal 26AS/AIS`,
        });
      }
    }

    return NextResponse.json({ data: mismatches });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
