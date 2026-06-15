'use client';

/**
 * ScheduleFinancialParticulars.tsx
 * ITR-4 mandatory: PartA-BS4 (Balance Sheet) + PartA-PL4 (Profit & Loss)
 * Required for ALL ITR-4 filers regardless of presumptive income scheme.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BS4 {
  // Sources of Funds
  capitalOpeningBal:          number;
  addProfitFromPL:            number;
  lessDrawings:               number;
  securedLoansFromBanks:      number;
  securedLoansFromOthers:     number;
  unsecuredLoans:             number;
  advances:                   number;
  sundryCreditorsForGoods:    number;
  sundryCreditorsForExpenses: number;
  otherLiabilities:           number;
  // Application of Funds
  grossBlock:                 number;
  depreciation:               number;
  investments:                number;
  sundryDebtorsMoreThan6M:    number;
  sundryDebtorsOthers:        number;
  cashInHand:                 number;
  balanceWithBanksCurrentAcc: number;
  balanceWithBanksDepositAcc: number;
  loansAndAdvances:           number;
  advanceTaxAndTDS:           number;
  stockInTrade:               number;
  otherCurrentAssets:         number;
}

interface PL4 {
  grossTurnoverReceipts: number;
  grossProfit:           number;
  otherIncome:           number;
  totalExpenses:         number;
  netProfit:             number;
}

interface FPState {
  bs: BS4;
  pl: PL4;
}

const EMPTY_BS: BS4 = {
  capitalOpeningBal: 0, addProfitFromPL: 0, lessDrawings: 0,
  securedLoansFromBanks: 0, securedLoansFromOthers: 0,
  unsecuredLoans: 0, advances: 0,
  sundryCreditorsForGoods: 0, sundryCreditorsForExpenses: 0,
  otherLiabilities: 0,
  grossBlock: 0, depreciation: 0,
  investments: 0,
  sundryDebtorsMoreThan6M: 0, sundryDebtorsOthers: 0,
  cashInHand: 0,
  balanceWithBanksCurrentAcc: 0, balanceWithBanksDepositAcc: 0,
  loansAndAdvances: 0, advanceTaxAndTDS: 0,
  stockInTrade: 0, otherCurrentAssets: 0,
};

const EMPTY_PL: PL4 = {
  grossTurnoverReceipts: 0,
  grossProfit: 0,
  otherIncome: 0,
  totalExpenses: 0,
  netProfit: 0,
};

function emptyState(): FPState {
  return { bs: { ...EMPTY_BS }, pl: { ...EMPTY_PL } };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!n) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  returnId: string;
  returnData: any;
  onSaved: (rd: any) => void;
  setDirty: (d: boolean) => void;
}

export default function ScheduleFinancialParticulars({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<FPState>(emptyState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fp = (returnData as any)?.financialParticulars ?? (returnData as any)?.financialParticularsJson;
    const parsed = typeof fp === 'string' ? JSON.parse(fp) : fp;
    if (parsed?.PartABS4) {
      const b = parsed.PartABS4;
      setState({
        bs: {
          capitalOpeningBal:          toNum(b.CapitalOpeningBal),
          addProfitFromPL:            toNum(b.AddProfitFromPL),
          lessDrawings:               toNum(b.LessDrawings),
          securedLoansFromBanks:      toNum(b.SecuredLoansFromBanks),
          securedLoansFromOthers:     toNum(b.SecuredLoansFromOthers),
          unsecuredLoans:             toNum(b.UnsecuredLoans),
          advances:                   toNum(b.Advances),
          sundryCreditorsForGoods:    toNum(b.SundryCreditorsForGoods),
          sundryCreditorsForExpenses: toNum(b.SundryCreditorsForExpenses),
          otherLiabilities:           toNum(b.OtherLiabilities),
          grossBlock:                 toNum(b.GrossBlock),
          depreciation:               toNum(b.Depreciation),
          investments:                toNum(b.Investments),
          sundryDebtorsMoreThan6M:    toNum(b.SundryDebtorsMoreThan6M),
          sundryDebtorsOthers:        toNum(b.SundryDebtorsOthers),
          cashInHand:                 toNum(b.CashInHand),
          balanceWithBanksCurrentAcc: toNum(b.BalanceWithBanksCurrentAcc),
          balanceWithBanksDepositAcc: toNum(b.BalanceWithBanksDepositAcc),
          loansAndAdvances:           toNum(b.LoansAndAdvances),
          advanceTaxAndTDS:           toNum(b.AdvanceTaxAndTDS),
          stockInTrade:               toNum(b.StockInTrade),
          otherCurrentAssets:         toNum(b.OtherCurrentAssets),
        },
        pl: parsed.PartAPL4 ? {
          grossTurnoverReceipts: toNum(parsed.PartAPL4.GrossTurnoverReceipts),
          grossProfit:           toNum(parsed.PartAPL4.GrossProfit),
          otherIncome:           toNum(parsed.PartAPL4.OtherIncome),
          totalExpenses:         toNum(parsed.PartAPL4.TotalExpenses),
          netProfit:             toNum(parsed.PartAPL4.NetProfit),
        } : { ...EMPTY_PL },
      });
    }
  }, [returnData]);

  // ── Computed values ────────────────────────────────────────────────────────

  const bs = state.bs;
  const pl = state.pl;

  const capitalClosing     = bs.capitalOpeningBal + bs.addProfitFromPL - bs.lessDrawings;
  const totalSecuredLoans  = bs.securedLoansFromBanks + bs.securedLoansFromOthers;
  const totalCreditors     = bs.sundryCreditorsForGoods + bs.sundryCreditorsForExpenses;
  const totalCapLiab       = capitalClosing + totalSecuredLoans + bs.unsecuredLoans + bs.advances + totalCreditors + bs.otherLiabilities;
  const netBlock           = bs.grossBlock - bs.depreciation;
  const totalDebtors       = bs.sundryDebtorsMoreThan6M + bs.sundryDebtorsOthers;
  const totalBanks         = bs.balanceWithBanksCurrentAcc + bs.balanceWithBanksDepositAcc;
  const totalAssets        = netBlock + bs.investments + totalDebtors + bs.cashInHand + totalBanks + bs.loansAndAdvances + bs.advanceTaxAndTDS + bs.stockInTrade + bs.otherCurrentAssets;
  const bsBalanced         = Math.abs(totalCapLiab - totalAssets) < 2;

  const netProfitComputed  = pl.grossProfit + pl.otherIncome - pl.totalExpenses;

  // ── Persist ────────────────────────────────────────────────────────────────

  const persist = useCallback(async (s: FPState) => {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        PartABS4: {
          CapitalOpeningBal:          s.bs.capitalOpeningBal,
          AddProfitFromPL:            s.bs.addProfitFromPL,
          LessDrawings:               s.bs.lessDrawings,
          SecuredLoansFromBanks:      s.bs.securedLoansFromBanks,
          SecuredLoansFromOthers:     s.bs.securedLoansFromOthers,
          UnsecuredLoans:             s.bs.unsecuredLoans,
          Advances:                   s.bs.advances,
          SundryCreditorsForGoods:    s.bs.sundryCreditorsForGoods,
          SundryCreditorsForExpenses: s.bs.sundryCreditorsForExpenses,
          OtherLiabilities:           s.bs.otherLiabilities,
          GrossBlock:                 s.bs.grossBlock,
          Depreciation:               s.bs.depreciation,
          Investments:                s.bs.investments,
          SundryDebtorsMoreThan6M:    s.bs.sundryDebtorsMoreThan6M,
          SundryDebtorsOthers:        s.bs.sundryDebtorsOthers,
          CashInHand:                 s.bs.cashInHand,
          BalanceWithBanksCurrentAcc: s.bs.balanceWithBanksCurrentAcc,
          BalanceWithBanksDepositAcc: s.bs.balanceWithBanksDepositAcc,
          LoansAndAdvances:           s.bs.loansAndAdvances,
          AdvanceTaxAndTDS:           s.bs.advanceTaxAndTDS,
          StockInTrade:               s.bs.stockInTrade,
          OtherCurrentAssets:         s.bs.otherCurrentAssets,
        },
        PartAPL4: {
          GrossTurnoverReceipts: s.pl.grossTurnoverReceipts,
          GrossProfit:           s.pl.grossProfit,
          OtherIncome:           s.pl.otherIncome,
          TotalExpenses:         s.pl.totalExpenses,
          NetProfit:             s.pl.netProfit,
        },
      };
      const res = await fetch(`/api/returns/${returnId}/schedule/financialParticulars`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      onSaved({ ...returnData, financialParticulars: body });
      setDirty(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [returnId, returnData, onSaved, setDirty]);

  function updateBS(patch: Partial<BS4>) {
    setState(prev => {
      const next = { ...prev, bs: { ...prev.bs, ...patch } };
      setDirty(true);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => persist(next), 1500);
      return next;
    });
  }

  function updatePL(patch: Partial<PL4>) {
    setState(prev => {
      const next = { ...prev, pl: { ...prev.pl, ...patch } };
      setDirty(true);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => persist(next), 1500);
      return next;
    });
  }

  function handleSave() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    persist(state);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '900px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Financial Particulars of Business</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Part A-BS4 (Balance Sheet) + Part A-P&amp;L (Profit &amp;Loss) — mandatory for ITR-4
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saving && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Saving…</span>}
          {saveError && <span style={{ fontSize: '12px', color: 'var(--status-error)' }}>{saveError}</span>}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>Save</button>
        </div>
      </div>

      {/* ── Part A-P&L ─────────────────────────────────────────────────────── */}
      <Section title="Part A — Profit & Loss Account">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>

          {/* Left column: Credits / Receipts */}
          <div style={{ borderRight: '1px solid var(--border-subtle)' }}>
            <ColHeader title="Credits / Receipts" />
            <PLRow label="Gross Turnover / Gross Receipts" value={pl.grossTurnoverReceipts}
              onChange={v => updatePL({ grossTurnoverReceipts: v })} />
            <PLRow label="Gross Profit" value={pl.grossProfit}
              onChange={v => updatePL({ grossProfit: v })} />
            <PLRow label="Other Income (Business)" value={pl.otherIncome}
              onChange={v => updatePL({ otherIncome: v })} />
            <PLTotal label="Total Credits" value={pl.grossProfit + pl.otherIncome} />
          </div>

          {/* Right column: Debits / Expenses */}
          <div>
            <ColHeader title="Debits / Expenses" />
            <PLRow label="Total Expenditure" value={pl.totalExpenses}
              onChange={v => {
                const netProfit = pl.grossProfit + pl.otherIncome - v;
                updatePL({ totalExpenses: v, netProfit });
              }} />
            <PLTotal
              label="Net Profit / (Loss)"
              value={netProfitComputed}
              highlight
              onSync={netProfitComputed !== pl.netProfit ? () => updatePL({ netProfit: netProfitComputed }) : undefined}
            />
            <div style={{ height: '40px' }} />
          </div>
        </div>

        {/* Net profit field (editable override) */}
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '160px' }}>Net Profit (override)</label>
          <AmtInput value={pl.netProfit} onChange={v => updatePL({ netProfit: v })} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Computed: {fmt(netProfitComputed)}</span>
          {netProfitComputed !== pl.netProfit && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px' }}
              onClick={() => updatePL({ netProfit: netProfitComputed })}>
              ↑ Use computed
            </button>
          )}
        </div>
      </Section>

      {/* ── Part A-BS4 ─────────────────────────────────────────────────────── */}
      <Section title="Part A-BS4 — Balance Sheet as at 31st March">

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>

          {/* Left column: Sources of Funds */}
          <div style={{ borderRight: '1px solid var(--border-subtle)' }}>
            <ColHeader title="Sources of Funds (Liabilities)" />

            <SubHeader label="Proprietor's Fund" />
            <BSRow label="Opening Capital Balance" value={bs.capitalOpeningBal} onChange={v => updateBS({ capitalOpeningBal: v })} />
            <BSRow label="Add: Profit transferred from P&L" value={bs.addProfitFromPL} onChange={v => updateBS({ addProfitFromPL: v })} />
            <BSRow label="Less: Drawings" value={bs.lessDrawings} onChange={v => updateBS({ lessDrawings: v })} />
            <BSTotal label="Closing Capital Balance" value={capitalClosing} />

            <SubHeader label="Secured Loans" />
            <BSRow label="Borrowings from Banks" value={bs.securedLoansFromBanks} onChange={v => updateBS({ securedLoansFromBanks: v })} />
            <BSRow label="Borrowings from Others" value={bs.securedLoansFromOthers} onChange={v => updateBS({ securedLoansFromOthers: v })} />
            <BSTotal label="Total Secured Loans" value={totalSecuredLoans} />

            <SubHeader label="" />
            <BSRow label="Unsecured Loans" value={bs.unsecuredLoans} onChange={v => updateBS({ unsecuredLoans: v })} />
            <BSRow label="Advances (received)" value={bs.advances} onChange={v => updateBS({ advances: v })} />

            <SubHeader label="Sundry Creditors" />
            <BSRow label="For Goods Purchased" value={bs.sundryCreditorsForGoods} onChange={v => updateBS({ sundryCreditorsForGoods: v })} />
            <BSRow label="For Expenses / Others" value={bs.sundryCreditorsForExpenses} onChange={v => updateBS({ sundryCreditorsForExpenses: v })} />
            <BSTotal label="Total Sundry Creditors" value={totalCreditors} />

            <SubHeader label="" />
            <BSRow label="Other Liabilities & Provisions" value={bs.otherLiabilities} onChange={v => updateBS({ otherLiabilities: v })} />

            <BSGrandTotal label="Total Capital & Liabilities" value={totalCapLiab} />
          </div>

          {/* Right column: Application of Funds */}
          <div>
            <ColHeader title="Application of Funds (Assets)" />

            <SubHeader label="Fixed Assets" />
            <BSRow label="Gross Block" value={bs.grossBlock} onChange={v => updateBS({ grossBlock: v })} />
            <BSRow label="Less: Depreciation" value={bs.depreciation} onChange={v => updateBS({ depreciation: v })} />
            <BSTotal label="Net Block" value={netBlock} />

            <SubHeader label="" />
            <BSRow label="Investments" value={bs.investments} onChange={v => updateBS({ investments: v })} />

            <SubHeader label="Sundry Debtors" />
            <BSRow label="Outstanding > 6 months" value={bs.sundryDebtorsMoreThan6M} onChange={v => updateBS({ sundryDebtorsMoreThan6M: v })} />
            <BSRow label="Other Debtors" value={bs.sundryDebtorsOthers} onChange={v => updateBS({ sundryDebtorsOthers: v })} />
            <BSTotal label="Total Sundry Debtors" value={totalDebtors} />

            <SubHeader label="" />
            <BSRow label="Cash in Hand" value={bs.cashInHand} onChange={v => updateBS({ cashInHand: v })} />

            <SubHeader label="Balance with Banks" />
            <BSRow label="In Current Accounts" value={bs.balanceWithBanksCurrentAcc} onChange={v => updateBS({ balanceWithBanksCurrentAcc: v })} />
            <BSRow label="In Deposit / Savings Accounts" value={bs.balanceWithBanksDepositAcc} onChange={v => updateBS({ balanceWithBanksDepositAcc: v })} />
            <BSTotal label="Total Bank Balances" value={totalBanks} />

            <SubHeader label="" />
            <BSRow label="Loans & Advances (given)" value={bs.loansAndAdvances} onChange={v => updateBS({ loansAndAdvances: v })} />
            <BSRow label="Advance Tax / TDS / TCS receivable" value={bs.advanceTaxAndTDS} onChange={v => updateBS({ advanceTaxAndTDS: v })} />
            <BSRow label="Stock in Trade" value={bs.stockInTrade} onChange={v => updateBS({ stockInTrade: v })} />
            <BSRow label="Other Current Assets" value={bs.otherCurrentAssets} onChange={v => updateBS({ otherCurrentAssets: v })} />

            <BSGrandTotal label="Total Assets" value={totalAssets} />
          </div>
        </div>

        {/* Balance check */}
        <div style={{
          marginTop: '10px', padding: '10px 14px', borderRadius: '6px',
          background: bsBalanced ? 'rgba(22,163,74,0.08)' : 'rgba(224,92,75,0.08)',
          border: `1px solid ${bsBalanced ? 'rgba(22,163,74,0.3)' : 'rgba(224,92,75,0.3)'}`,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: bsBalanced ? '#166534' : '#991B1B' }}>
            {bsBalanced ? '✓ Balance Sheet is balanced' : '⚠ Balance Sheet does not tally'}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Capital & Liabilities: {fmt(totalCapLiab)} &nbsp;|&nbsp; Assets: {fmt(totalAssets)} &nbsp;|&nbsp; Difference: {fmt(totalCapLiab - totalAssets)}
          </span>
        </div>
      </Section>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ColHeader({ title }: { title: string }) {
  return (
    <div style={{ background: '#1E293B', padding: '7px 12px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {title}
    </div>
  );
}

function SubHeader({ label }: { label: string }) {
  return (
    <div style={{ background: '#F8FAFC', padding: '4px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', minHeight: '24px' }}>
      {label}
    </div>
  );
}

function BSRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', minHeight: '34px', padding: '0 12px', gap: '8px' }}>
      <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
      <AmtInput value={value} onChange={onChange} />
    </div>
  );
}

function BSTotal({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', background: '#F0F4FA', padding: '5px 12px', minHeight: '30px' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{fmt(value)}</span>
    </div>
  );
}

function BSGrandTotal({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1E293B', padding: '8px 12px', minHeight: '36px' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#E2E8F0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 800, color: '#93C5FD', fontFamily: 'var(--font-mono)' }}>{fmt(value)}</span>
    </div>
  );
}

function PLRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', minHeight: '36px', padding: '0 12px', gap: '8px' }}>
      <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
      <AmtInput value={value} onChange={onChange} />
    </div>
  );
}

function PLTotal({ label, value, highlight, onSync }: { label: string; value: number; highlight?: boolean; onSync?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: highlight ? '#1E293B' : '#F0F4FA', padding: '7px 12px', minHeight: '36px', gap: '8px' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: highlight ? '#E2E8F0' : 'var(--text-primary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onSync && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px', padding: '1px 6px' }} onClick={onSync}>↑ Sync</button>
        )}
        <span style={{ fontSize: '13px', fontWeight: 800, color: highlight ? '#93C5FD' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{fmt(value)}</span>
      </div>
    </div>
  );
}

function AmtInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value));
  useEffect(() => { setRaw(value === 0 ? '' : String(value)); }, [value]);
  return (
    <input
      type="number"
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={() => { const n = toNum(raw); setRaw(n === 0 ? '' : String(n)); onChange(n); }}
      placeholder="0"
      style={{ width: '120px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 8px', border: '1px solid var(--border-subtle)', borderRadius: '4px', background: 'var(--bg-input, #fff)' }}
    />
  );
}
