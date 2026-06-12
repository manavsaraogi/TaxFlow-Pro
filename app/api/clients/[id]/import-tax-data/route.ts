import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

type Params = { params: { id: string } };

/**
 * POST /api/clients/[id]/import-tax-data
 * Body: { type: 'AIS' | 'TIS' | '26AS', returnId?: number, data: object }
 *
 * Parses AIS / TIS / 26AS JSON from the ITD portal and auto-fills:
 *  - TDS entries (salary, other income, rent)
 *  - TCS entries
 *  - Advance tax / self-assessment challans
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = await prisma.client.findFirst({
    where: { id: Number(params.id), firmId: auth.firmId },
  });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const body = await request.json();
  const { type, returnId, data } = body as {
    type: 'AIS' | 'TIS' | '26AS';
    returnId?: number;
    data: Record<string, unknown>;
  };

  if (!type || !data) {
    return NextResponse.json({ error: 'type and data are required' }, { status: 400 });
  }

  let ret = null;
  if (returnId) {
    ret = await prisma.return.findFirst({
      where: { id: returnId, clientId: client.id },
    });
    if (!ret) return NextResponse.json({ error: 'Return not found' }, { status: 404 });
  }

  const summary: Record<string, unknown> = {};

  if (type === '26AS') {
    const result = await parse26AS(data, client.id, ret?.id);
    Object.assign(summary, result);
  } else if (type === 'AIS') {
    const result = await parseAIS(data, client.id, ret?.id);
    Object.assign(summary, result);
  } else if (type === 'TIS') {
    const result = parseTIS(data);
    Object.assign(summary, result);
  }

  return NextResponse.json({ data: { type, summary } });
}

// ─── 26AS Parser ──────────────────────────────────────────────────────────────

async function parse26AS(
  raw: Record<string, unknown>,
  clientId: number,
  returnId?: number
) {
  const imported = { tdsEntries: 0, tcsEntries: 0, challans: 0 };

  // Handle both ITD JSON format and simplified format
  const entries26AS = extractArray(raw, [
    'Form26AS', 'TaxCredit', 'AnnualTaxStatement',
    'TDS', 'TDSEntries', 'Details',
  ]);

  // TDS on salary (Part A)
  const tdsOnSalary = extractArray(raw, ['PartA', 'TDSonSalary', 'TDS_Salary']);
  for (const e of tdsOnSalary) {
    if (!returnId) continue;
    const entry = e as Record<string, unknown>;
    await prisma.tDSEntry.create({
      data: {
        returnId,
        entryType: 'SALARY',
        tanOfDeductor: str(entry, ['TAN', 'tan', 'TANOfDeductor']),
        nameOfDeductor: str(entry, ['Name', 'name', 'NameOfDeductor', 'DeductorName']),
        incomeChargeable: num(entry, ['AmtPaidCredited', 'Income', 'IncomeChargeable']),
        tdsDeducted: num(entry, ['TaxDeducted', 'TDSDeducted', 'TaxDed']),
        tdsClaimed: num(entry, ['TaxClaimed', 'TDSClaimed', 'TaxDeducted', 'TaxDed']),
      },
    });
    imported.tdsEntries++;
  }

  // TDS other than salary (Part A1)
  const tdsOther = extractArray(raw, ['PartA1', 'TDSOtherThanSalary', 'TDS_Other', 'PartB']);
  for (const e of tdsOther) {
    if (!returnId) continue;
    const entry = e as Record<string, unknown>;
    await prisma.tDSEntry.create({
      data: {
        returnId,
        entryType: 'OTHER',
        tanOfDeductor: str(entry, ['TAN', 'tan', 'TANOfDeductor']),
        nameOfDeductor: str(entry, ['Name', 'name', 'NameOfDeductor', 'DeductorName']),
        tdsSection: str(entry, ['Section', 'section', 'SectionCode']),
        incomeChargeable: num(entry, ['AmtPaidCredited', 'Income', 'IncomeChargeable']),
        tdsDeducted: num(entry, ['TaxDeducted', 'TDSDeducted', 'TaxDed']),
        tdsClaimed: num(entry, ['TaxClaimed', 'TDSClaimed', 'TaxDeducted', 'TaxDed']),
      },
    });
    imported.tdsEntries++;
  }

  // TCS (Part C)
  const tcsEntries = extractArray(raw, ['PartC', 'TCSEntries', 'TCS']);
  for (const e of tcsEntries) {
    if (!returnId) continue;
    const entry = e as Record<string, unknown>;
    await prisma.tDSEntry.create({
      data: {
        returnId,
        entryType: 'TCS',
        tanOfDeductor: str(entry, ['TAN', 'CollectorTAN']),
        nameOfDeductor: str(entry, ['Name', 'CollectorName']),
        tcsSection: str(entry, ['Section', 'SectionCode']),
        amtOnWhichTCS: num(entry, ['AmtCollected', 'TaxableAmount']),
        tcsCollected: num(entry, ['TaxCollected', 'TCSCollected']),
        tcsClaimed: num(entry, ['TaxClaimed', 'TCSClaimed', 'TaxCollected']),
      },
    });
    imported.tcsEntries++;
  }

  // Advance tax / self-assessment (Part F)
  const challans = extractArray(raw, ['PartF', 'Challans', 'TaxPayments', 'AdvanceTax']);
  for (const e of challans) {
    if (!returnId) continue;
    const entry = e as Record<string, unknown>;
    const payType = str(entry, ['Type', 'PaymentType', 'ChallanType']) ?? 'ADVANCE_TAX';
    const dateStr = str(entry, ['DateOfDeposit', 'Date', 'PaymentDate']);
    if (!dateStr) continue;
    await prisma.taxPaymentEntry.create({
      data: {
        returnId,
        paymentType: payType.includes('SELF') ? 'SELF_ASSESSMENT' : 'ADVANCE_TAX',
        bsrCode: str(entry, ['BSRCode', 'BSR', 'bsrCode']) ?? '0000000',
        dateOfDeposit: new Date(dateStr),
        challanSerialNo: str(entry, ['ChallanNo', 'SerialNo', 'ChallanSerialNo']) ?? '0',
        taxAmount: num(entry, ['TaxAmount', 'Tax', 'Amount']),
        totalAmount: num(entry, ['TotalAmount', 'Total', 'Amount']),
      },
    });
    imported.challans++;
  }

  return imported;
}

// ─── AIS Parser ───────────────────────────────────────────────────────────────

async function parseAIS(
  raw: Record<string, unknown>,
  clientId: number,
  returnId?: number
) {
  const summary: Record<string, number> = {};

  // AIS has sections: Salary, Interest, Dividend, SFT, Others
  const salaryItems = extractArray(raw, ['Salary', 'SalaryIncome', 'AIS_Salary']);
  summary.salaryTotal = salaryItems.reduce((s: number, e) => s + num(e as Record<string, unknown>, ['Amount', 'Income', 'GrossAmount']), 0);

  const interestItems = extractArray(raw, ['Interest', 'InterestIncome', 'AIS_Interest']);
  summary.interestTotal = interestItems.reduce((s: number, e) => s + num(e as Record<string, unknown>, ['Amount', 'Income']), 0);

  const dividendItems = extractArray(raw, ['Dividend', 'DividendIncome', 'AIS_Dividend']);
  summary.dividendTotal = dividendItems.reduce((s: number, e) => s + num(e as Record<string, unknown>, ['Amount', 'Income']), 0);

  const rentItems = extractArray(raw, ['RentalIncome', 'Rent', 'AIS_Rent']);
  summary.rentTotal = rentItems.reduce((s: number, e) => s + num(e as Record<string, unknown>, ['Amount', 'Income']), 0);

  // TDS from AIS
  const tdsItems = extractArray(raw, ['TDS', 'TDSDetails', 'AIS_TDS']);
  summary.tdsTotal = tdsItems.reduce((s: number, e) => s + num(e as Record<string, unknown>, ['TaxDeducted', 'TDS', 'Amount']), 0);

  if (returnId) {
    for (const e of tdsItems) {
      const entry = e as Record<string, unknown>;
      const entryType = str(entry, ['Type', 'IncomeType', 'Source']) ?? 'OTHER';
      await prisma.tDSEntry.create({
        data: {
          returnId,
          entryType: entryType.toUpperCase().includes('SAL') ? 'SALARY' : 'OTHER',
          tanOfDeductor: str(entry, ['TAN', 'DeductorTAN']),
          nameOfDeductor: str(entry, ['DeductorName', 'Name']),
          incomeChargeable: num(entry, ['Income', 'Amount', 'IncomeChargeable']),
          tdsDeducted: num(entry, ['TaxDeducted', 'TDS']),
          tdsClaimed: num(entry, ['TaxDeducted', 'TDS']),
        },
      });
    }
  }

  return summary;
}

// ─── TIS Parser (read-only summary, no DB writes) ─────────────────────────────

function parseTIS(raw: Record<string, unknown>) {
  const summary: Record<string, number> = {};

  const sections = ['Salary', 'Interest', 'Dividend', 'RentFromImmovableProperty',
    'CapitalGains', 'OtherIncome', 'ForeignRemittance', 'BusinessProfession'];

  for (const sec of sections) {
    const items = extractArray(raw, [sec, `TIS_${sec}`]);
    if (items.length > 0) {
      summary[sec] = items.reduce((s: number, e) =>
        s + num(e as Record<string, unknown>, ['DerivedAmount', 'ModifiedAmount', 'Amount']), 0);
    }
  }

  return summary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractArray(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const k of keys) {
    if (obj[k] && Array.isArray(obj[k])) return obj[k] as unknown[];
    // Try nested
    for (const topKey of Object.keys(obj)) {
      const sub = obj[topKey];
      if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
        const nested = (sub as Record<string, unknown>)[k];
        if (Array.isArray(nested)) return nested as unknown[];
      }
    }
  }
  return [];
}

function str(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return String(obj[k]);
  }
  return undefined;
}

function num(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) {
      const n = Number(v);
      if (!isNaN(n)) return Math.round(n);
    }
  }
  return 0;
}
