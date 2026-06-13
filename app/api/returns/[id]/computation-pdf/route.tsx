import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import React from 'react';

type Params = { params: { id: string } };

// ─── Tax computation helpers (mirrors TaxSummary.tsx) ─────────────────────────

function computeNewRegimeTax(income: number): number {
  if (income <= 300_000) return 0;
  let tax = 0;
  const slabs: [number, number, number][] = [
    [300_000,   700_000, 0.05],
    [700_000, 1_000_000, 0.10],
    [1_000_000, 1_200_000, 0.15],
    [1_200_000, 1_500_000, 0.20],
    [1_500_000, Infinity,  0.30],
  ];
  for (const [lo, hi, rate] of slabs) {
    if (income <= lo) break;
    tax += (Math.min(income, hi) - lo) * rate;
  }
  return Math.floor(tax);
}

function computeOldRegimeTax(income: number): number {
  if (income <= 250_000) return 0;
  let tax = 0;
  if (income > 1_000_000) { tax += (income - 1_000_000) * 0.30; income = 1_000_000; }
  if (income > 500_000)   { tax += (income - 500_000)   * 0.20; income = 500_000; }
  if (income > 250_000)   { tax += (income - 250_000)   * 0.05; }
  return Math.floor(tax);
}

function surchargeRate(income: number): number {
  if (income > 50_000_000) return 0.37;
  if (income > 20_000_000) return 0.25;
  if (income > 10_000_000) return 0.15;
  if (income > 5_000_000)  return 0.10;
  return 0;
}

const INR = (n: number) => {
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-IN');
  return (n < 0 ? '(' : '') + '₹' + s + (n < 0 ? ')' : '');
};

// ─── PDF Styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, padding: '28pt 36pt', color: '#1a1a2e', backgroundColor: '#ffffff' },
  // Header
  headerBox:   { borderBottom: '2pt solid #1a3a5c', paddingBottom: 8, marginBottom: 10 },
  firmName:    { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1a3a5c', marginBottom: 2 },
  firmSub:     { fontSize: 8, color: '#555', marginBottom: 4 },
  docTitle:    { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', color: '#1a3a5c', marginBottom: 2 },
  clientRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, fontSize: 8.5 },
  clientCell:  { flex: 1 },
  label:       { color: '#666', marginRight: 4 },
  value:       { fontFamily: 'Helvetica-Bold', color: '#1a1a2e' },
  // Section header
  secHeader:   { backgroundColor: '#1a3a5c', color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 9, padding: '4pt 8pt', marginTop: 10, marginBottom: 0 },
  // Table rows
  row:         { flexDirection: 'row', borderBottom: '0.5pt solid #dde', paddingVertical: 3, paddingHorizontal: 6 },
  rowAlt:      { flexDirection: 'row', borderBottom: '0.5pt solid #dde', paddingVertical: 3, paddingHorizontal: 6, backgroundColor: '#f5f7fb' },
  rowTotal:    { flexDirection: 'row', borderTop: '1pt solid #1a3a5c', borderBottom: '1pt solid #1a3a5c', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#e8eef6' },
  rowHighlight:{ flexDirection: 'row', borderTop: '2pt solid #1a3a5c', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: '#1a3a5c' },
  descCol:     { flex: 3, fontSize: 8.5 },
  descColBold: { flex: 3, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  amtCol:      { flex: 1, textAlign: 'right', fontSize: 8.5 },
  amtColBold:  { flex: 1, textAlign: 'right', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  amtWhite:    { flex: 1, textAlign: 'right', fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  descWhite:   { flex: 3, fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  subText:     { fontSize: 7, color: '#888', marginTop: 1 },
  // Slab table
  slabRow:     { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 6, fontSize: 8 },
  slabCell:    { flex: 1, color: '#555' },
  footer:      { position: 'absolute', bottom: 20, left: 36, right: 36, borderTop: '0.5pt solid #ccc', paddingTop: 4, fontSize: 7, color: '#888', flexDirection: 'row', justifyContent: 'space-between' },
  disclaimer:  { marginTop: 14, fontSize: 7, color: '#888', borderTop: '0.5pt solid #dde', paddingTop: 6 },
  twoCol:      { flexDirection: 'row', gap: 12 },
  colHalf:     { flex: 1 },
});

// ─── PDF Document ─────────────────────────────────────────────────────────────

function ComputationPDF({ data }: { data: PDFData }) {
  const { firm, client, computation: c, inputs, ayLabel, regime, generatedAt } = data;

  const isRefund = c.balancePayable < 0;
  const regimeLabel = regime === 'NEW' ? 'New (Concessional) Regime' : 'Old Regime';

  const Row = ({ desc, sub, amount, alt, total, highlight }: {
    desc: string; sub?: string; amount: number | string;
    alt?: boolean; total?: boolean; highlight?: boolean;
  }) => {
    const RowStyle = highlight ? s.rowHighlight : total ? s.rowTotal : alt ? s.rowAlt : s.row;
    const DescStyle = highlight ? s.descWhite : total ? s.descColBold : s.descCol;
    const AmtStyle  = highlight ? s.amtWhite  : total ? s.amtColBold  : s.amtCol;
    return (
      <View style={RowStyle}>
        <View style={DescStyle}>
          <Text>{desc}</Text>
          {sub && <Text style={s.subText}>{sub}</Text>}
        </View>
        <Text style={AmtStyle}>{typeof amount === 'number' ? INR(amount) : amount}</Text>
      </View>
    );
  };

  // New-regime slab breakdown
  const newSlabs = [
    ['Upto ₹3,00,000', 0],
    ['₹3,00,001 – ₹7,00,000 @ 5%', Math.min(Math.max(0, c.normalTaxableIncome - 300_000), 400_000) * 0.05],
    ['₹7,00,001 – ₹10,00,000 @ 10%', Math.min(Math.max(0, c.normalTaxableIncome - 700_000), 300_000) * 0.10],
    ['₹10,00,001 – ₹12,00,000 @ 15%', Math.min(Math.max(0, c.normalTaxableIncome - 1_000_000), 200_000) * 0.15],
    ['₹12,00,001 – ₹15,00,000 @ 20%', Math.min(Math.max(0, c.normalTaxableIncome - 1_200_000), 300_000) * 0.20],
    ['Above ₹15,00,000 @ 30%', Math.max(0, c.normalTaxableIncome - 1_500_000) * 0.30],
  ] as [string, number][];

  const oldSlabs = [
    ['Upto ₹2,50,000', 0],
    ['₹2,50,001 – ₹5,00,000 @ 5%', Math.min(Math.max(0, c.normalTaxableIncome - 250_000), 250_000) * 0.05],
    ['₹5,00,001 – ₹10,00,000 @ 20%', Math.min(Math.max(0, c.normalTaxableIncome - 500_000), 500_000) * 0.20],
    ['Above ₹10,00,000 @ 30%', Math.max(0, c.normalTaxableIncome - 1_000_000) * 0.30],
  ] as [string, number][];

  const slabs = regime === 'NEW' ? newSlabs : oldSlabs;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.headerBox}>
          <Text style={s.firmName}>{firm.name}</Text>
          {firm.address && <Text style={s.firmSub}>{firm.address}{firm.phone ? '  |  Tel: ' + firm.phone : ''}</Text>}
          <Text style={s.docTitle}>INCOME TAX COMPUTATION SHEET</Text>
          <Text style={{ textAlign: 'center', fontSize: 8, color: '#555', marginBottom: 4 }}>
            Assessment Year {ayLabel}  ·  {regimeLabel}
          </Text>
          <View style={s.clientRow}>
            <View style={s.clientCell}>
              <Text><Text style={s.label}>Name: </Text><Text style={s.value}>{client.name}</Text></Text>
            </View>
            <View style={s.clientCell}>
              <Text><Text style={s.label}>PAN: </Text><Text style={s.value}>{client.pan}</Text></Text>
            </View>
            <View style={s.clientCell}>
              <Text><Text style={s.label}>Status: </Text><Text style={s.value}>Individual</Text></Text>
            </View>
            <View style={s.clientCell}>
              <Text style={{ textAlign: 'right' }}><Text style={s.label}>Date: </Text><Text style={s.value}>{generatedAt}</Text></Text>
            </View>
          </View>
        </View>

        {/* ── PART I: Income ── */}
        <Text style={s.secHeader}>PART I — COMPUTATION OF GROSS TOTAL INCOME</Text>
        <Row desc="A.  Income from Salaries" amount={inputs.grossSalary} alt />
        <Row desc="     Less: Standard Deduction u/s 16(ia)" sub="₹75,000 (New Regime) / ₹50,000 (Old Regime)"
          amount={-inputs.standardDeduction} />
        <Row desc="     Net Salary Income" amount={Math.max(0, inputs.grossSalary - inputs.standardDeduction)} alt />
        <Row desc="B.  Income from House Property"
          sub={inputs.housePropertyIncome < 0 ? 'Loss restricted to ₹2,00,000 u/s 71(3A)' : undefined}
          amount={Math.max(inputs.housePropertyIncome, -200_000)} />
        <Row desc="C.  Income from Other Sources" amount={inputs.otherSourcesIncome} alt />
        {inputs.lotteryIncome > 0 && <Row desc="D.  Lottery / Winnings u/s 115BB (@ 30%)" amount={inputs.lotteryIncome} />}
        <Row desc="GROSS TOTAL INCOME" amount={c.grossTotalIncome} total />

        {/* ── PART II: Deductions ── */}
        {regime === 'OLD' && (
          <>
            <Text style={s.secHeader}>PART II — DEDUCTIONS UNDER CHAPTER VI-A</Text>
            <Row desc="Total Deductions u/s Chapter VI-A" amount={inputs.chapterVIADeductions} alt />
            <Row desc="NET TAXABLE INCOME" amount={c.taxableIncome} total />
          </>
        )}
        {regime === 'NEW' && (
          <>
            <Text style={s.secHeader}>PART II — NET TAXABLE INCOME</Text>
            <Row desc="No Chapter VI-A deductions in New Regime" amount={0} alt />
            <Row desc="NET TAXABLE INCOME" amount={c.taxableIncome} total />
          </>
        )}

        {/* ── PART III: Tax ── */}
        <Text style={s.secHeader}>PART III — COMPUTATION OF TAX LIABILITY</Text>

        {/* Slab breakdown */}
        <View style={[s.row, { backgroundColor: '#f0f4fa' }]}>
          <Text style={[s.descCol, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Income Slab</Text>
          <Text style={[s.amtCol, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Tax</Text>
        </View>
        {slabs.map(([label, tax], i) => (
          <View key={i} style={s.slabRow}>
            <Text style={s.slabCell}>{label}</Text>
            <Text style={[s.slabCell, { textAlign: 'right' }]}>{tax > 0 ? INR(Math.floor(tax)) : 'Nil'}</Text>
          </View>
        ))}

        <Row desc="Tax on Normal Income (as per slabs)" amount={c.taxOnNormalIncome} total />
        {c.lotteryIncome > 0 && <Row desc="Add: Tax on Lottery Income @ 30% u/s 115BB" amount={c.taxOnLottery} alt />}
        <Row desc="GROSS TAX" amount={c.grossTax} total />
        {c.surcharge > 0 && (
          <Row desc={`Add: Surcharge @ ${Math.round(surchargeRate(c.taxableIncome) * 100)}%`}
            sub="Income exceeds ₹50 lakh" amount={c.surcharge} />
        )}
        <Row desc="Tax after Surcharge" amount={c.taxAfterSurcharge} alt />
        {c.rebate87A > 0 && (
          <Row desc={`Less: Rebate u/s 87A`}
            sub={`Taxable income ≤ ${regime === 'NEW' ? '₹7,00,000' : '₹5,00,000'}`}
            amount={-c.rebate87A} />
        )}
        <Row desc="Tax after Rebate" amount={c.taxAfterRebate} alt />
        <Row desc="Add: Health & Education Cess @ 4%" amount={c.cess} />
        <Row desc="NET TAX PAYABLE" amount={c.netTax} total />

        {/* ── PART IV: Pre-paid Taxes ── */}
        <Text style={s.secHeader}>PART IV — PRE-PAID TAXES</Text>
        <Row desc="TDS / TCS Deducted at Source" sub="As per Form 26AS / AIS" amount={inputs.tdsTCS} alt />
        <Row desc="Advance Tax Paid" amount={inputs.advanceTax} />
        <Row desc="Self-Assessment Tax Paid" amount={inputs.selfAssessmentTax} alt />
        <Row desc="TOTAL PRE-PAID TAXES" amount={c.totalPrePaid} total />

        {/* ── RESULT ── */}
        <Row
          desc={isRefund ? 'REFUND DUE' : 'BALANCE TAX PAYABLE'}
          sub="Interest u/s 234A/B/C to be computed at time of filing"
          amount={Math.abs(c.balancePayable)}
          highlight
        />

        {/* ── Disclaimer ── */}
        <Text style={s.disclaimer}>
          * This computation sheet is generated for reference purposes only. The actual tax liability may differ based on the
          Income Tax Return filed on the portal. Interest u/s 234A/B/C, if applicable, is not included above and will be
          computed by the Income Tax Portal at the time of filing. Prepared using TaxFlow Pro.
        </Text>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text>{firm.name}</Text>
          <Text>TaxFlow Pro  ·  AY {ayLabel}  ·  {client.pan}</Text>
          <Text>Generated: {generatedAt}</Text>
        </View>

      </Page>
    </Document>
  );
}

interface PDFData {
  firm: { name: string; address?: string; phone?: string };
  client: { name: string; pan: string };
  ayLabel: string;
  regime: 'OLD' | 'NEW';
  generatedAt: string;
  inputs: {
    grossSalary: number;
    standardDeduction: number;
    housePropertyIncome: number;
    otherSourcesIncome: number;
    lotteryIncome: number;
    chapterVIADeductions: number;
    tdsTCS: number;
    advanceTax: number;
    selfAssessmentTax: number;
  };
  computation: {
    grossTotalIncome: number; totalDeductions: number; taxableIncome: number;
    lotteryIncome: number; normalTaxableIncome: number;
    taxOnNormalIncome: number; taxOnLottery: number; grossTax: number;
    surcharge: number; taxAfterSurcharge: number; rebate87A: number;
    taxAfterRebate: number; cess: number; netTax: number;
    totalPrePaid: number; balancePayable: number;
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const returnId = Number(params.id);
  const ret = await prisma.return.findFirst({
    where: { id: returnId, client: { firmId: auth.firmId } },
    include: {
      client: { select: { fullName: true, pan: true } },
      assessmentYear: { select: { ayLabel: true, regime: true } },
      salarySchedule: true,
      hpSchedule: { select: { incomeOfHP: true } },
      osSchedule: true,
      deductionSchedule: true,
      tdsEntries: true,
      taxPayments: true,
    },
  });
  if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const firm = await prisma.firm.findUnique({ where: { id: auth.firmId } });

  // Build inputs
  const tdsEntries = ret.tdsEntries ?? [];
  const taxPayments = ret.taxPayments ?? [];
  const hpSchedule = ret.hpSchedule ?? [];

  const tdsTCS = tdsEntries.reduce((s, e: any) => s + (e.tdsDeducted ?? 0) + (e.tcsCollected ?? 0), 0);
  const advanceTax = taxPayments.filter((p: any) => p.paymentType === 'ADVANCE').reduce((s, p: any) => s + (p.totalAmount ?? 0), 0);
  const selfAssessmentTax = taxPayments.filter((p: any) => p.paymentType !== 'ADVANCE').reduce((s, p: any) => s + (p.totalAmount ?? 0), 0);
  const hpIncome = hpSchedule.reduce((s, hp: any) => s + (hp.incomeOfHP ?? 0), 0);

  const grossSalary = (ret.salarySchedule as any)?.totalGrossSalary ?? 0;
  const standardDeduction = (ret.salarySchedule as any)?.deductionUs16ia ?? 75_000;
  const otherSourcesIncome = (ret.osSchedule as any)?.incomeFromOtherSources ?? 0;
  const chapterVIADeductions = (ret.deductionSchedule as any)?.totalChapVIAAllowed ?? 0;
  const lotteryIncome = 0;
  const regime = (ret.assessmentYear?.regime ?? 'NEW') as 'OLD' | 'NEW';

  // Compute tax
  const hpCapped = Math.max(hpIncome, -200_000);
  const grossTotalIncome = Math.max(0, grossSalary - standardDeduction + hpCapped + otherSourcesIncome + lotteryIncome);
  const totalDeductions = regime === 'OLD' ? chapterVIADeductions : 0;
  const taxableIncome = Math.max(0, grossTotalIncome - totalDeductions);
  const normalTaxableIncome = Math.max(0, taxableIncome - lotteryIncome);
  const taxOnNormalIncome = regime === 'OLD' ? computeOldRegimeTax(normalTaxableIncome) : computeNewRegimeTax(normalTaxableIncome);
  const taxOnLottery = Math.floor(lotteryIncome * 0.30);
  const grossTax = taxOnNormalIncome + taxOnLottery;
  const sRate = surchargeRate(taxableIncome);
  const surcharge = Math.floor(grossTax * sRate);
  const taxAfterSurcharge = grossTax + surcharge;
  const rebateLimit = regime === 'NEW' ? 700_000 : 500_000;
  const rebateCap  = regime === 'NEW' ? 25_000 : 12_500;
  const rebate87A = taxableIncome <= rebateLimit ? Math.min(taxAfterSurcharge, rebateCap) : 0;
  const taxAfterRebate = Math.max(0, taxAfterSurcharge - rebate87A);
  const cess = Math.floor(taxAfterRebate * 0.04);
  const netTax = taxAfterRebate + cess;
  const totalPrePaid = tdsTCS + advanceTax + selfAssessmentTax;
  const balancePayable = netTax - totalPrePaid;

  const ayLabel = ret.assessmentYear?.ayLabel ?? 'AY 2026-27';
  const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  const pdfData: PDFData = {
    firm: { name: firm?.name ?? 'Tax Consultancy', address: firm?.address ?? undefined, phone: firm?.phone ?? undefined },
    client: { name: ret.client?.fullName ?? '', pan: ret.client?.pan ?? '' },
    ayLabel,
    regime,
    generatedAt: now,
    inputs: { grossSalary, standardDeduction, housePropertyIncome: hpIncome, otherSourcesIncome, lotteryIncome, chapterVIADeductions, tdsTCS, advanceTax, selfAssessmentTax },
    computation: { grossTotalIncome, totalDeductions, taxableIncome, lotteryIncome, normalTaxableIncome, taxOnNormalIncome, taxOnLottery, grossTax, surcharge, taxAfterSurcharge, rebate87A, taxAfterRebate, cess, netTax, totalPrePaid, balancePayable },
  };

  const buffer = await renderToBuffer(<ComputationPDF data={pdfData} /> as any);

  const filename = `TaxComputation-${ret.client?.pan ?? 'unknown'}-${ayLabel.replace(/\s/g, '')}.pdf`;
  const uint8 = new Uint8Array(buffer);
  return new NextResponse(uint8, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
