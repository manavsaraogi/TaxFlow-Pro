'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { ReturnData, TaxRegime } from '@/shared/types/itr';
import { computeBP5 } from './ITR5BP';

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

interface TaxInputs {
  // Income
  grossSalary: number;
  housePropertyIncome: number;       // can be negative (loss capped at -2,00,000)
  otherSourcesIncome: number;
  lotteryIncome: number;             // flat 30%
  businessIncome: number;            // ITR-5: net income from Schedule BP (Item 48)

  // Deductions
  standardDeduction: number;         // â‚¹75,000 under new; â‚¹50,000 old (from salary schedule)
  chapterVIADeductions: number;      // only old regime
  homeLoanInterest: number;          // from HP schedule

  // Credits
  tdsTCS: number;
  advanceTax: number;
  selfAssessmentTax: number;

  // Meta
  regime: TaxRegime;
  assessmentYear: string;
  filingDate: string;                // for 234A interest
  dueDate: string;                   // normally Jul 31

  // ITR-5 specific
  formType: string;
  entityType: string;                // 'FIRM' | 'LLP' | 'AOP' | 'BOI' | 'COOP' | 'LA' | 'AJP'
  usesMMR: boolean;                  // AOP/BOI taxed at Maximum Marginal Rate
  filingSection: string;             // '139(1)' | '139(8A)' etc.
  updatedAY: string;                 // e.g. '2024-25' — for 139(8A) period calc
}

interface TaxComputation {
  // Income building blocks
  grossTotalIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  lotteryIncome: number;
  normalTaxableIncome: number;

  // Tax
  taxOnNormalIncome: number;
  taxOnLottery: number;
  grossTax: number;
  surcharge: number;
  taxAfterSurcharge: number;
  rebate87A: number;
  taxAfterRebate: number;
  cess: number;
  netTax: number;

  // Interest
  interest234A: number;
  interest234B: number;
  interest234C: number;
  totalInterest: number;

  // 140B additional tax (139(8A) updated return)
  additionalTax140B: number;
  period140B: 1 | 2 | 3 | 4 | null;

  // Total demand / refund
  totalTaxDue: number;
  totalPrePaid: number;
  balancePayable: number;   // positive = payable, negative = refund
}

interface Props {
  returnId: string;
  returnData: ReturnData;
}

async function downloadComputationPDF(returnId: string) {
  const res = await fetch(`/api/returns/${returnId}/computation-pdf`);
  if (!res.ok) throw new Error('Failed to generate PDF');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="([^"]+)"/);
  a.download = match ? match[1] : `TaxComputation.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// â"€â"€â"€ Tax Slabs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// Old regime slabs for individuals/HUF (AY 2025-26 and 2026-27 — same)
function computeOldRegimeTax(income: number): number {
  if (income <= 250_000) return 0;
  let tax = 0;
  if (income > 1_000_000) { tax += (income - 1_000_000) * 0.30; income = 1_000_000; }
  if (income > 500_000)   { tax += (income - 500_000)   * 0.20; income = 500_000; }
  if (income > 250_000)   { tax += (income - 250_000)   * 0.05; }
  return Math.floor(tax);
}

// New regime slabs — AY-aware (Budget 2025 changed slabs for AY 2026-27 onwards)
function computeNewRegimeTax(income: number, ay = 'AY 2026-27'): number {
  const ayYear = parseInt(ay.replace('AY ', '').split('-')[0] ?? '2026');
  if (ayYear >= 2026) {
    // AY 2026-27+ (FY 2025-26): Budget 2025 new slabs
    if (income <= 400_000) return 0;
    let tax = 0;
    const slabs = [
      [400_000,   800_000, 0.05],
      [800_000, 1_200_000, 0.10],
      [1_200_000, 1_600_000, 0.15],
      [1_600_000, 2_000_000, 0.20],
      [2_000_000, 2_400_000, 0.25],
      [2_400_000, Infinity,  0.30],
    ] as const;
    for (const [lo, hi, rate] of slabs) {
      if (income <= lo) break;
      tax += (Math.min(income, hi) - lo) * rate;
    }
    return Math.floor(tax);
  }
  if (ayYear <= 2024) {
    // AY 2024-25 (FY 2023-24) slabs
    if (income <= 300_000) return 0;
    let tax = 0;
    const slabs = [
      [300_000,   600_000, 0.05],
      [600_000,   900_000, 0.10],
      [900_000, 1_200_000, 0.15],
      [1_200_000, 1_500_000, 0.20],
      [1_500_000, Infinity,  0.30],
    ] as const;
    for (const [lo, hi, rate] of slabs) {
      if (income <= lo) break;
      tax += (Math.min(income, hi) - lo) * rate;
    }
    return Math.floor(tax);
  }
  // AY 2025-26 (FY 2024-25)
  if (income <= 300_000) return 0;
  let tax = 0;
  const slabs = [
    [300_000,   700_000, 0.05],
    [700_000, 1_000_000, 0.10],
    [1_000_000, 1_200_000, 0.15],
    [1_200_000, 1_500_000, 0.20],
    [1_500_000, Infinity,  0.30],
  ] as const;
  for (const [lo, hi, rate] of slabs) {
    if (income <= lo) break;
    tax += (Math.min(income, hi) - lo) * rate;
  }
  return Math.floor(tax);
}

// Individual/AOP surcharge — tiered; new regime caps at 25% (37% removed by Budget 2023)
function surchargeRate(income: number, regime: string): number {
  const isNew = regime?.toLowerCase() === 'new';
  if (income > 50_000_000) return isNew ? 0.25 : 0.37;
  if (income > 20_000_000) return 0.25;
  if (income > 10_000_000) return 0.15;
  if (income > 5_000_000)  return 0.10;
  return 0;
}

// Firm/LLP surcharge: 12% flat if income > ₹1 Cr
function firmSurchargeRate(income: number): number {
  return income > 10_000_000 ? 0.12 : 0;
}

// Co-operative society slabs (old regime) — NO basic exemption, 10% from ₹1
function computeCoopTax(income: number): number {
  if (income <= 0) return 0;
  let tax = 0;
  if (income > 20_000) { tax += (income - 20_000) * 0.30; income = 20_000; }
  if (income > 10_000) { tax += (income - 10_000) * 0.20; income = 10_000; }
  tax += income * 0.10;
  return Math.floor(tax);
}

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN');

const Row = ({
  label,
  value,
  sub,
  highlight,
  deduction,
  bold,
  separator,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
  deduction?: boolean;
  bold?: boolean;
  separator?: boolean;
}) => (
  <tr style={separator ? { borderTop: '2px solid var(--border-strong)' } : undefined}>
    <td style={{ paddingTop: separator ? 12 : undefined }}>
      <span style={{ fontWeight: bold ? 700 : 400, fontSize: bold ? 14 : 13, color: highlight ? 'var(--brand-text)' : 'var(--text-primary)' }}>
        {label}
      </span>
      {sub && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</span>}
    </td>
    <td
      className="amount"
      style={{
        textAlign: 'right',
        fontWeight: bold ? 800 : 500,
        fontSize: bold ? 15 : 13,
        color: deduction
          ? '#4ade80'
          : highlight
          ? 'var(--brand-text)'
          : value < 0
          ? '#4ade80'
          : 'var(--text-primary)',
        paddingTop: separator ? 12 : undefined,
      }}
    >
      {deduction ? `(${fmt(value)})` : value < 0 ? `(${fmt(value)})` : fmt(value)}
    </td>
  </tr>
);

// â"€â"€â"€ Mock IPC â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// TaxSummary uses returnData prop directly — no extra fetch needed

// â"€â"€â"€ Computation engine â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function computeTax(inp: TaxInputs): TaxComputation {
  const isITR5 = inp.formType === 'ITR-5';
  const isFirmOrLLP = isITR5 && (inp.entityType === 'FIRM' || inp.entityType === 'LLP');
  const isCoop = isITR5 && inp.entityType === 'COOP';
  const isAOPMMR = isITR5 && inp.usesMMR;

  const hpIncome = Math.max(inp.housePropertyIncome, -200_000);
  const grossTotalIncome = isITR5
    ? Math.max(0, inp.businessIncome + hpIncome + inp.otherSourcesIncome + inp.lotteryIncome)
    : Math.max(0, inp.grossSalary - inp.standardDeduction + hpIncome + inp.otherSourcesIncome + inp.lotteryIncome);

  const totalDeductions = inp.regime?.toLowerCase() === 'old' && !isITR5 ? inp.chapterVIADeductions : 0;
  const taxableIncome = Math.max(0, grossTotalIncome - totalDeductions);
  const lotteryIncome = inp.lotteryIncome;
  const normalTaxableIncome = Math.max(0, taxableIncome - lotteryIncome);

  const ay = inp.assessmentYear ?? 'AY 2026-27';
  const isNew = inp.regime?.toLowerCase() === 'new';
  const ayYear = parseInt(ay.replace('AY ', '').split('-')[0] ?? '2026');

  let taxOnNormalIncome: number;
  if (isFirmOrLLP || isAOPMMR) {
    taxOnNormalIncome = Math.floor(normalTaxableIncome * 0.30);
  } else if (isCoop) {
    // 115BAD new regime: 22%; old regime: co-op slab (10/20/30% — no basic exemption)
    taxOnNormalIncome = isNew
      ? Math.floor(normalTaxableIncome * 0.22)
      : computeCoopTax(normalTaxableIncome);
  } else {
    taxOnNormalIncome = isNew
      ? computeNewRegimeTax(normalTaxableIncome, ay)
      : computeOldRegimeTax(normalTaxableIncome);
  }
  const taxOnLottery = Math.floor(lotteryIncome * 0.30);
  const grossTax = taxOnNormalIncome + taxOnLottery;

  // Surcharge with marginal relief at each threshold
  let surcharge = 0;
  if (isFirmOrLLP) {
    const rawSurcharge = taxableIncome > 10_000_000 ? Math.floor(grossTax * 0.12) : 0;
    if (rawSurcharge > 0) {
      const relief = Math.max(0, (grossTax + rawSurcharge) - (Math.floor(grossTax * 10_000_000 / taxableIncome) + (taxableIncome - 10_000_000)));
      surcharge = Math.max(0, rawSurcharge - relief);
    }
  } else {
    const sRate = surchargeRate(taxableIncome, inp.regime);
    const rawSurcharge = Math.floor(grossTax * sRate);
    if (rawSurcharge > 0) {
      // Marginal relief thresholds for tiered surcharge
      const thresholds = [5_000_000, 10_000_000, 20_000_000, 50_000_000];
      let relief = 0;
      for (const thr of thresholds) {
        if (taxableIncome > thr) {
          const taxAtThr = isNew ? computeNewRegimeTax(thr, ay) : computeOldRegimeTax(thr);
          const maxAdditionalTax = taxableIncome - thr;
          const actualAdditionalTax = grossTax + rawSurcharge - taxAtThr;
          if (actualAdditionalTax > maxAdditionalTax) {
            relief = Math.max(relief, actualAdditionalTax - maxAdditionalTax);
          }
        }
      }
      surcharge = Math.max(0, rawSurcharge - relief);
    }
  }
  const taxAfterSurcharge = grossTax + surcharge;

  // Rebate 87A — individuals only (not ITR-5 entities); limit and cap are AY-specific
  const rebateLimit = isNew ? (ayYear >= 2026 ? 1_200_000 : 700_000) : 500_000;
  const rebateCap   = isNew ? (ayYear >= 2026 ? 60_000 : 25_000) : 12_500;
  const rebate87A = (!isITR5 && taxableIncome <= rebateLimit) ? Math.min(taxAfterSurcharge, rebateCap) : 0;
  const taxAfterRebate = Math.max(0, taxAfterSurcharge - rebate87A);

  const cess = Math.floor(taxAfterRebate * 0.04);
  const netTax = taxAfterRebate + cess;

  // 139(8A) additional tax u/s 140B — 25%/50%/60%/70% based on period
  let additionalTax140B = 0;
  let period140B: 1 | 2 | 3 | 4 | null = null;
  if (inp.filingSection === '139(8A)') {
    const updAY = inp.updatedAY || '2024-25';
    const endYear = parseInt(updAY.split('-')[1] ?? '25') + 2000;
    const p1End = new Date(endYear + 1, 2, 31);
    const p2End = new Date(endYear + 2, 2, 31);
    const p3End = new Date(endYear + 3, 2, 31);
    const p4End = new Date(endYear + 4, 2, 31);
    const today = new Date();
    period140B = today <= p1End ? 1 : today <= p2End ? 2 : today <= p3End ? 3 : today <= p4End ? 4 : null;
    const rateMap = { 1: 0.25, 2: 0.50, 3: 0.60, 4: 0.70 } as const;
    if (period140B) {
      additionalTax140B = Math.round(netTax * rateMap[period140B]);
    }
  }

  // Simplified interest estimates
  const interest234A = 0;  // computed at portal based on filing date
  const interest234B = 0;  // requires advance tax schedule integration
  const interest234C = 0;
  const totalInterest = interest234A + interest234B + interest234C;

  const totalTaxDue = netTax + additionalTax140B + totalInterest;
  const totalPrePaid = inp.tdsTCS + inp.advanceTax + inp.selfAssessmentTax;
  const balancePayable = totalTaxDue - totalPrePaid; // negative = refund

  return {
    grossTotalIncome, totalDeductions, taxableIncome, lotteryIncome,
    normalTaxableIncome, taxOnNormalIncome, taxOnLottery, grossTax,
    surcharge, taxAfterSurcharge, rebate87A, taxAfterRebate, cess, netTax,
    additionalTax140B, period140B,
    interest234A, interest234B, interest234C, totalInterest,
    totalTaxDue, totalPrePaid, balancePayable,
  };
}

// â"€â"€â"€ Default inputs (mock / fallback) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function buildDefaultInputs(rd: any): TaxInputs {
  const tdsEntries: any[] = rd?.tdsEntries ?? [];
  const taxPayments: any[] = rd?.taxPayments ?? [];
  const hpSchedule: any[] = rd?.hpSchedule ?? [];

  const tdsTCS = tdsEntries.reduce((s: number, e: any) => s + (e.tdsDeducted ?? 0) + (e.tcsCollected ?? 0), 0);
  const advanceTax = taxPayments.filter((p: any) => p.paymentType === 'ADVANCE').reduce((s: number, p: any) => s + (p.totalAmount ?? 0), 0);
  const selfAssessmentTax = taxPayments.filter((p: any) => p.paymentType !== 'ADVANCE').reduce((s: number, p: any) => s + (p.totalAmount ?? 0), 0);
  const hpIncome = hpSchedule.reduce((s: number, hp: any) => s + (hp.incomeOfHP ?? 0), 0);

  // ITR-5: compute business income from BP schedule
  const formType: string = rd?.formType ?? '';
  const itr5General = formType === 'ITR-5'
    ? (rd?.itr5General ?? (rd?.itr5GeneralJson ? JSON.parse(rd.itr5GeneralJson) : null))
    : null;
  let businessIncome = 0;
  let entityType = 'AOP';
  let usesMMR = false;
  if (formType === 'ITR-5') {
    const itr5PL = rd?.itr5PL ?? (rd?.itr5PLJson ? JSON.parse(rd.itr5PLJson) : null);
    const itr5BP = rd?.itr5BP ?? (rd?.itr5BPJson ? JSON.parse(rd.itr5BPJson) : null);
    entityType = itr5General?.entityType ?? 'AOP';
    usesMMR = !itr5General?.sharesDeterminable || itr5General?.anyMemberExceedsExemption;
    const netProfitFromPL = itr5PL?.NetProfitBeforeTaxes ?? 0;
    if (itr5BP) {
      const computed = computeBP5(itr5BP, netProfitFromPL);
      businessIncome = (computed.Item36 ?? 0) + (computed.Item42 ?? 0) + (computed.Item48 ?? 0);
    } else {
      businessIncome = netProfitFromPL;
    }
  }

  return {
    grossSalary: rd?.salarySchedule?.totalGrossSalary ?? 0,
    housePropertyIncome: hpIncome,
    otherSourcesIncome: rd?.osSchedule?.incomeFromOtherSources ?? 0,
    lotteryIncome: 0,
    businessIncome,
    standardDeduction: rd?.salarySchedule?.deductionUs16ia ?? 75_000,
    chapterVIADeductions: rd?.deductionSchedule?.totalChapVIAAllowed ?? 0,
    homeLoanInterest: 0,
    tdsTCS,
    advanceTax,
    selfAssessmentTax,
    regime: (rd?.regime ?? (typeof rd?.assessmentYear === 'object' ? rd?.assessmentYear?.regime : undefined) ?? 'NEW') as TaxRegime,
    assessmentYear: typeof rd?.assessmentYear === 'string' ? rd.assessmentYear : (rd?.assessmentYear?.ayLabel ?? 'AY 2026-27'),
    filingDate: new Date().toISOString().slice(0, 10),
    dueDate: '2026-07-31',
    formType,
    entityType,
    usesMMR,
    filingSection: itr5General?.filingSection ?? '',
    updatedAY: itr5General?.updated?.updatedAY ?? '2024-25',
  };
}

// â"€â"€â"€ Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export default function TaxSummary({ returnId, returnData }: Props) {
  const [inputs, setInputs] = useState<TaxInputs>(() => buildDefaultInputs(returnData));
  const [clientPan, setClientPan] = useState<string>('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/returns/${returnId}`);
      if (res.ok) {
        const { data } = await res.json();
        setInputs(buildDefaultInputs(data));
        if (data?.client?.pan) setClientPan(data.client.pan);
      } else {
        setInputs(buildDefaultInputs(returnData));
      }
    } catch {
      setInputs(buildDefaultInputs(returnData));
    } finally {
      setRefreshing(false);
      setLastRefresh(new Date());
    }
  }, [returnId, returnData]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDownloadPDF = useCallback(async () => {
    setDownloadingPDF(true);
    try {
      await downloadComputationPDF(returnId);
    } catch {
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingPDF(false);
    }
  }, [returnId]);

  const c = computeTax(inputs);
  const isRefund = c.balancePayable < 0;

  const handleGenerateChallan = useCallback(() => {
    const pan = clientPan || '';
    const amount = Math.ceil(c.balancePayable);
    // e-Pay Tax portal with pre-filled parameters
    const params = new URLSearchParams({
      PAN: pan,
      AY: '202526',
      MajorHead: '0021',  // Income Tax
      MinorHead: '300',   // Self-Assessment Tax
      Amount: String(amount),
    });
    window.open(`https://epay.incometax.gov.in/ePay/challan/view/startPayment?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }, [clientPan, c.balancePayable]);

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* â"€â"€ Header bar â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--brand-text)' }}>
            Tax Computation — {inputs.assessmentYear}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Regime:{' '}
            <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>
              {inputs.regime?.toLowerCase() === 'new' ? 'New (Concessional)' : 'Old'}
            </span>
            {lastRefresh && (
              <span style={{ marginLeft: 12 }}>
                Last refreshed: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadPDF} disabled={downloadingPDF}>
            {downloadingPDF ? '⏳ Generating…' : '⬇ Computation Sheet PDF'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? '⏳ Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* â"€â"€ Stat cards row â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Gross Total Income', value: c.grossTotalIncome, color: 'var(--text-primary)' },
          { label: 'Total Deductions', value: c.totalDeductions, color: '#4ade80' },
          { label: 'Taxable Income', value: c.taxableIncome, color: 'var(--brand-text)' },
          { label: c.additionalTax140B > 0 ? 'Net Tax + 140B' : 'Net Tax Payable', value: c.totalTaxDue, color: c.totalTaxDue > 0 ? '#f87171' : '#4ade80' },
        ].map((s) => (
          <div key={s.label} className="stat-card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {s.label}
            </div>
            <div className="amount" style={{ fontSize: 20, fontWeight: 800, color: s.color }}>
              ₹{s.value.toLocaleString('en-IN')}
            </div>
          </div>
        ))}
      </div>

      {/* â"€â"€ Full Computation â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="card">
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--brand-text)' }}>
          Detailed Computation
        </h3>
        <table className="data-table" style={{ width: '100%' }}>
          <tbody>
            {/* Income */}
            {inputs.formType === 'ITR-5' ? (
              <Row label="Income from Business / Profession (Schedule BP — Item 48)" value={inputs.businessIncome}
                sub="Net income after all BP adjustments and depreciation" />
            ) : (
              <Row label="Gross Salary (after standard deduction)" value={Math.max(0, inputs.grossSalary - inputs.standardDeduction)}
                sub={`Standard deduction: ₹${inputs.standardDeduction.toLocaleString('en-IN')}`} />
            )}
            <Row label="Income from House Property" value={inputs.housePropertyIncome}
              sub={inputs.housePropertyIncome < 0 ? 'Loss (capped at ₹2,00,000 set-off)' : undefined} />
            <Row label="Income from Other Sources" value={inputs.otherSourcesIncome} />
            {c.lotteryIncome > 0 && (
              <Row label="Lottery / Winnings (u/s 115BB)" value={c.lotteryIncome}
                sub="Taxed flat @ 30% — not included in slab" />
            )}
            <Row label="Gross Total Income" value={c.grossTotalIncome} bold separator />

            {/* Deductions */}
            {inputs.regime?.toLowerCase() === 'old' && c.totalDeductions > 0 && (
              <>
                <Row label="Less: Deductions u/s Chapter VI-A" value={c.totalDeductions} deduction />
                <Row label="Taxable Income" value={c.taxableIncome} bold separator />
              </>
            )}
            {inputs.regime?.toLowerCase() === 'new' && (
              <Row label="Taxable Income (no Chapter VI-A in new regime)" value={c.taxableIncome} bold separator />
            )}

            {/* Tax computation */}
            <Row label="Tax on Normal Income" value={c.taxOnNormalIncome}
              sub={
                (inputs.entityType === 'FIRM' || inputs.entityType === 'LLP') ? 'Flat rate @ 30% (Firm/LLP)' :
                inputs.entityType === 'COOP' ? (inputs.regime?.toLowerCase() === 'new' ? 'Co-operative — Sec 115BAD @ 22%' : 'Co-operative society slabs') :
                inputs.usesMMR ? 'Maximum Marginal Rate @ 30% (AOP/BOI)' :
                inputs.regime?.toLowerCase() === 'new' ? 'New regime slabs (FY 2025-26)' : 'Old regime slabs'
              } separator />
            {c.lotteryIncome > 0 && (
              <Row label="Tax on Lottery @ 30% (u/s 115BB)" value={c.taxOnLottery} />
            )}
            <Row label="Gross Tax" value={c.grossTax} bold />
            {c.surcharge > 0 && (
              <Row label={`Surcharge @ ${Math.round(surchargeRate(c.taxableIncome, inputs.regime) * 100)}%`} value={c.surcharge}
                sub={c.taxableIncome > 5_000_000 ? 'Subject to marginal relief' : undefined} />
            )}
            <Row label="Tax after Surcharge" value={c.taxAfterSurcharge} />
            {c.rebate87A > 0 && (
              <Row label="Less: Rebate u/s 87A" value={c.rebate87A} deduction
                sub={`Income ≤ ₹${inputs.regime?.toLowerCase() === 'new' ? (parseInt((inputs.assessmentYear ?? '').replace('AY ','').split('-')[0] ?? '2026') >= 2026 ? '12,00,000' : '7,00,000') : '5,00,000'}`} />
            )}
            <Row label="Tax after Rebate" value={c.taxAfterRebate} />
            <Row label="Health & Education Cess @ 4%" value={c.cess} />
            <Row label="Net Tax Payable" value={c.netTax} bold highlight separator />

            {/* Interest */}
            <Row label="Interest u/s 234A (late filing)" value={c.interest234A}
              sub="Computed at portal based on actual filing date" separator />
            <Row label="Interest u/s 234B (advance tax shortfall)" value={c.interest234B}
              sub="If < 90% of tax paid as advance tax" />
            <Row label="Interest u/s 234C (deferment of instalments)" value={c.interest234C} />
            <Row label="Total Interest" value={c.totalInterest} bold />

            {/* 140B additional tax for 139(8A) updated return */}
            {c.additionalTax140B > 0 && (
              <Row
                label={`Add: Additional Tax u/s 140B (${c.period140B === 1 ? '25%' : c.period140B === 2 ? '50%' : c.period140B === 3 ? '60%' : '70%'} — Period ${c.period140B})`}
                value={c.additionalTax140B}
                sub={c.period140B === 1 ? 'Within 12 months of AY end' : c.period140B === 2 ? '12–24 months after AY end' : c.period140B === 3 ? '24–36 months after AY end' : '36–48 months after AY end'}
                separator
              />
            )}

            {/* Total demand */}
            <Row label="Total Tax + Interest + 140B" value={c.totalTaxDue} bold highlight separator />

            {/* Pre-paid taxes */}
            <Row label="Less: TDS / TCS Credit" value={inputs.tdsTCS} deduction separator />
            <Row label="Less: Advance Tax Paid" value={inputs.advanceTax} deduction />
            <Row label="Less: Self-Assessment Tax Paid" value={inputs.selfAssessmentTax} deduction />
            <Row label="Total Pre-Paid Taxes" value={c.totalPrePaid} bold deduction />

            {/* Result */}
            <tr style={{ borderTop: '3px solid var(--brand-primary)' }}>
              <td style={{ paddingTop: 16, fontWeight: 800, fontSize: 16, color: isRefund ? '#4ade80' : '#f87171' }}>
                {isRefund ? '🎉 Refund Due' : '⚠️ Balance Tax Payable'}
              </td>
              <td
                className="amount"
                style={{ textAlign: 'right', paddingTop: 16, fontWeight: 900, fontSize: 20, color: isRefund ? '#4ade80' : '#f87171' }}
              >
                {fmt(c.balancePayable)}
              </td>
            </tr>
          </tbody>
        </table>

        {c.interest234A === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, marginBottom: 0 }}>
            * Interest u/s 234A/B/C is indicative. Final amounts are computed by the Income Tax Portal at the time of filing based on the actual filing date and advance tax payment dates.
          </p>
        )}
      </div>

      {/* â"€â"€ Regime comparison nudge â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {Math.abs(c.balancePayable) > 10_000 && (
        <div style={{ background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--brand-text)' }}>💡 Tip:</strong> Compare tax under both regimes using the Regime Comparison tool in Return Settings to ensure the client is on the optimal regime.
        </div>
      )}

      {/* ── Generate Tax Challan ────────────────────────────────────────── */}
      {c.balancePayable > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#dc2626', marginBottom: 3 }}>
              ₹{c.balancePayable.toLocaleString('en-IN')} payable
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Self-Assessment Tax (Minor Head 300) · Major Head 0021 · AY 2025-26
            </div>
          </div>
          <button
            onClick={handleGenerateChallan}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
              background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(220,38,38,0.3)',
            }}
          >
            🏦 Generate Tax Challan
          </button>
        </div>
      )}
    </div>
  );
}

