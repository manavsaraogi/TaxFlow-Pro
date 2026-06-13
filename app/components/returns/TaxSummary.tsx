/**
 * TaxSummary.tsx
 * Directory: renderer/app/components/returns/TaxSummary.tsx
 *
 * Full tax computation display:
 *  GTI â†’ Deductions â†’ Taxable Income â†’ Tax â†’ Surcharge â†’ Cess
 *  â†’ Rebate u/s 87A â†’ Net Tax â†’ Interest (234A/B/C) â†’ Total Due
 *  â†’ TDS/TCS/Advance Tax/SAT â†’ Refund or Balance Payable
 *
 * Rules:
 *  - Old regime: slabs + Chapter VI-A deductions
 *  - New regime: concessional slabs, no Chapter VI-A
 *  - Surcharge on income > â‚¹50L (graduated)
 *  - Rebate u/s 87A: â‚¹25,000 if taxable income â‰¤ â‚¹7,00,000 (new) / â‚¹5,00,000 (old)
 *  - Health & Education Cess: 4%
 *  - Lottery / special rate income taxed flat @ 30% u/s 115BB (excluded from slab)
 *  - Read-only computed view â€” no editable fields (all inputs come from other schedules)
 *  - Refresh button to re-pull latest data via IPC
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { ReturnData, TaxRegime } from '@/shared/types/itr';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TaxInputs {
  // Income
  grossSalary: number;
  housePropertyIncome: number;       // can be negative (loss capped at -2,00,000)
  otherSourcesIncome: number;
  lotteryIncome: number;             // flat 30%

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

  // Total demand / refund
  totalTaxDue: number;
  totalPrePaid: number;
  balancePayable: number;   // positive = payable, negative = refund
}

interface Props {
  returnId: string;
  returnData: ReturnData;
}

// â”€â”€â”€ Tax Slabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function computeOldRegimeTax(income: number): number {
  if (income <= 250_000) return 0;
  let tax = 0;
  if (income > 1_000_000) { tax += (income - 1_000_000) * 0.30; income = 1_000_000; }
  if (income > 500_000)   { tax += (income - 500_000)   * 0.20; income = 500_000; }
  if (income > 250_000)   { tax += (income - 250_000)   * 0.05; }
  return Math.floor(tax);
}

function computeNewRegimeTax(income: number): number {
  // FY 2025-26 new regime slabs
  if (income <= 300_000) return 0;
  let tax = 0;
  const slabs = [
    [300_000,  700_000, 0.05],
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

function surchargeRate(income: number): number {
  if (income > 50_000_000) return 0.37;
  if (income > 20_000_000) return 0.25;
  if (income > 10_000_000) return 0.15;
  if (income > 5_000_000)  return 0.10;
  return 0;
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmt = (n: number) => 'â‚¹' + Math.abs(n).toLocaleString('en-IN');

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

// â”€â”€â”€ Mock IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// TaxSummary uses returnData prop directly — no extra fetch needed

// â”€â”€â”€ Computation engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function computeTax(inp: TaxInputs): TaxComputation {
  const hpIncome = Math.max(inp.housePropertyIncome, -200_000); // HP loss cap
  const grossTotalIncome = Math.max(
    0,
    inp.grossSalary - inp.standardDeduction + hpIncome + inp.otherSourcesIncome + inp.lotteryIncome
  );

  const totalDeductions = inp.regime?.toLowerCase() === 'old' ? inp.chapterVIADeductions : 0;
  const taxableIncome = Math.max(0, grossTotalIncome - totalDeductions);
  const lotteryIncome = inp.lotteryIncome;
  const normalTaxableIncome = Math.max(0, taxableIncome - lotteryIncome);

  const taxOnNormalIncome =
    inp.regime?.toLowerCase() === 'old'
      ? computeOldRegimeTax(normalTaxableIncome)
      : computeNewRegimeTax(normalTaxableIncome);
  const taxOnLottery = Math.floor(lotteryIncome * 0.30);
  const grossTax = taxOnNormalIncome + taxOnLottery;

  const sRate = surchargeRate(taxableIncome);
  const surcharge = Math.floor(grossTax * sRate);
  const taxAfterSurcharge = grossTax + surcharge;

  // Rebate 87A
  const rebateLimit = inp.regime?.toLowerCase() === 'new' ? 700_000 : 500_000;
  const rebateCap = inp.regime?.toLowerCase() === 'new' ? 25_000 : 12_500;
  const rebate87A = taxableIncome <= rebateLimit ? Math.min(taxAfterSurcharge, rebateCap) : 0;
  const taxAfterRebate = Math.max(0, taxAfterSurcharge - rebate87A);

  const cess = Math.floor(taxAfterRebate * 0.04);
  const netTax = taxAfterRebate + cess;

  // Simplified interest estimates
  const interest234A = 0;  // computed at portal based on filing date
  const interest234B = 0;  // requires advance tax schedule integration
  const interest234C = 0;
  const totalInterest = interest234A + interest234B + interest234C;

  const totalTaxDue = netTax + totalInterest;
  const totalPrePaid = inp.tdsTCS + inp.advanceTax + inp.selfAssessmentTax;
  const balancePayable = totalTaxDue - totalPrePaid; // negative = refund

  return {
    grossTotalIncome, totalDeductions, taxableIncome, lotteryIncome,
    normalTaxableIncome, taxOnNormalIncome, taxOnLottery, grossTax,
    surcharge, taxAfterSurcharge, rebate87A, taxAfterRebate, cess, netTax,
    interest234A, interest234B, interest234C, totalInterest,
    totalTaxDue, totalPrePaid, balancePayable,
  };
}

// â”€â”€â”€ Default inputs (mock / fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildDefaultInputs(returnData: ReturnData): TaxInputs {
  return {
    grossSalary: (returnData as any)?.scheduleSalary?.grossSalary ?? 0,
    housePropertyIncome: (returnData as any)?.scheduleHP?.netAnnualValue ?? 0,
    otherSourcesIncome: (returnData as any)?.scheduleOS?.totalOtherIncome ?? 0,
    lotteryIncome: (returnData as any)?.scheduleOS?.lotteryIncome ?? 0,
    standardDeduction: (returnData as any)?.scheduleSalary?.standardDeduction ?? 75_000,
    chapterVIADeductions: (returnData as any)?.deductions?.total ?? 0,
    homeLoanInterest: (returnData as any)?.scheduleHP?.homeLoanInterest ?? 0,
    tdsTCS: (returnData as any)?.scheduleTDS?.grandTotal ?? 0,
    advanceTax: (returnData as any)?.taxPayments?.advanceTax ?? 0,
    selfAssessmentTax: (returnData as any)?.taxPayments?.selfAssessmentTax ?? 0,
    regime: ((returnData as any)?.regime ?? 'NEW') as TaxRegime,
    assessmentYear: (returnData as any)?.assessmentYear ?? 'AY 2026-27',
    filingDate: new Date().toISOString().slice(0, 10),
    dueDate: '2026-07-31',
  };
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function TaxSummary({ returnId, returnData }: Props) {
  const [inputs, setInputs] = useState<TaxInputs>(() => buildDefaultInputs(returnData));
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    setInputs(buildDefaultInputs(returnData));
    setLastRefresh(new Date());
  }, [returnData]);

  useEffect(() => { refresh(); }, [refresh]);

  const c = computeTax(inputs);
  const isRefund = c.balancePayable < 0;

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* â”€â”€ Header bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--brand-text)' }}>
            Tax Computation â€” {inputs.assessmentYear}
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
        <button className="btn btn-secondary btn-sm" onClick={refresh}>
          ↻ Refresh
        </button>
      </div>

      {/* â”€â”€ Stat cards row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Gross Total Income', value: c.grossTotalIncome, color: 'var(--text-primary)' },
          { label: 'Total Deductions', value: c.totalDeductions, color: '#4ade80' },
          { label: 'Taxable Income', value: c.taxableIncome, color: 'var(--brand-text)' },
          { label: 'Net Tax Payable', value: c.netTax, color: c.netTax > 0 ? '#f87171' : '#4ade80' },
        ].map((s) => (
          <div key={s.label} className="stat-card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {s.label}
            </div>
            <div className="amount" style={{ fontSize: 20, fontWeight: 800, color: s.color }}>
              â‚¹{s.value.toLocaleString('en-IN')}
            </div>
          </div>
        ))}
      </div>

      {/* â”€â”€ Full Computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card">
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--brand-text)' }}>
          Detailed Computation
        </h3>
        <table className="data-table" style={{ width: '100%' }}>
          <tbody>
            {/* Income */}
            <Row label="Gross Salary (after standard deduction)" value={Math.max(0, inputs.grossSalary - inputs.standardDeduction)}
              sub={`Standard deduction: â‚¹${inputs.standardDeduction.toLocaleString('en-IN')}`} />
            <Row label="Income from House Property" value={inputs.housePropertyIncome}
              sub={inputs.housePropertyIncome < 0 ? 'Loss (capped at â‚¹2,00,000 set-off)' : undefined} />
            <Row label="Income from Other Sources" value={inputs.otherSourcesIncome} />
            {c.lotteryIncome > 0 && (
              <Row label="Lottery / Winnings (u/s 115BB)" value={c.lotteryIncome}
                sub="Taxed flat @ 30% â€” not included in slab" />
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
            <Row label="Tax on Normal Income (slab)" value={c.taxOnNormalIncome}
              sub={inputs.regime?.toLowerCase() === 'new' ? 'New regime slabs' : 'Old regime slabs'} separator />
            {c.lotteryIncome > 0 && (
              <Row label="Tax on Lottery @ 30% (u/s 115BB)" value={c.taxOnLottery} />
            )}
            <Row label="Gross Tax" value={c.grossTax} bold />
            {c.surcharge > 0 && (
              <Row label={`Surcharge @ ${Math.round(surchargeRate(c.taxableIncome) * 100)}%`} value={c.surcharge}
                sub="Applicable as income > â‚¹50 lakh" />
            )}
            <Row label="Tax after Surcharge" value={c.taxAfterSurcharge} />
            {c.rebate87A > 0 && (
              <Row label="Less: Rebate u/s 87A" value={c.rebate87A} deduction
                sub={`Income â‰¤ â‚¹${inputs.regime?.toLowerCase() === 'new' ? '7,00,000' : '5,00,000'}`} />
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

            {/* Total demand */}
            <Row label="Total Tax + Interest" value={c.totalTaxDue} bold highlight separator />

            {/* Pre-paid taxes */}
            <Row label="Less: TDS / TCS Credit" value={inputs.tdsTCS} deduction separator />
            <Row label="Less: Advance Tax Paid" value={inputs.advanceTax} deduction />
            <Row label="Less: Self-Assessment Tax Paid" value={inputs.selfAssessmentTax} deduction />
            <Row label="Total Pre-Paid Taxes" value={c.totalPrePaid} bold deduction />

            {/* Result */}
            <tr style={{ borderTop: '3px solid var(--brand-primary)' }}>
              <td style={{ paddingTop: 16, fontWeight: 800, fontSize: 16, color: isRefund ? '#4ade80' : '#f87171' }}>
                {isRefund ? 'ðŸŽ‰ Refund Due' : 'âš ï¸ Balance Tax Payable'}
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

      {/* â”€â”€ Regime comparison nudge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {Math.abs(c.balancePayable) > 10_000 && (
        <div style={{ background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--brand-text)' }}>ðŸ’¡ Tip:</strong> Compare tax under both regimes using the Regime Comparison tool in Return Settings to ensure the client is on the optimal regime.
        </div>
      )}
    </div>
  );
}

