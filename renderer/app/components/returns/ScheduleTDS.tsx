/**
 * ScheduleTDS.tsx
 * Directory: renderer/app/components/returns/ScheduleTDS.tsx
 *
 * TDS / TCS credit schedule:
 *  - Part A: TDS on Salary (Form 16) — employer-wise
 *  - Part B: TDS on Other Income (Form 16A) — bank FD, rent, etc.
 *  - Part C: TDS on Sale of Immovable Property (Form 16B) — buyer deducts
 *  - Part D: TDS on Rent (Form 16C) — tenant deducts
 *  - Part E: TCS — tax collected at source
 *
 * Rules:
 *  - TAN validation (10-char alphanumeric)
 *  - PAN validation for buyer (Form 16B)
 *  - Each row: deductor name, TAN/PAN, income credited, TDS/TCS deducted
 *  - Running total shown per part and grand total
 *  - Auto-save: dirty flag + 1.5 s debounce
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReturnData } from '../../../shared/types/itr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TDSSalaryEntry {
  id: string;
  employerName: string;
  employerTAN: string;
  grossSalary: number;
  tdsDeducted: number;
}

interface TDSOtherEntry {
  id: string;
  deductorName: string;
  deductorTAN: string;
  incomeType: string;
  incomeCredited: number;
  tdsDeducted: number;
}

interface TDSPropertyEntry {
  id: string;
  buyerName: string;
  buyerPAN: string;
  considerationAmount: number;
  tdsDeducted: number;
}

interface TDSRentEntry {
  id: string;
  tenantName: string;
  tenantPAN: string;
  rentPaid: number;
  tdsDeducted: number;
}

interface TCSEntry {
  id: string;
  collectorName: string;
  collectorTAN: string;
  amountPaid: number;
  tcsCollected: number;
}

interface TDSState {
  salarySources: TDSSalaryEntry[];
  otherSources: TDSOtherEntry[];
  propertySources: TDSPropertyEntry[];
  rentSources: TDSRentEntry[];
  tcsSources: TCSEntry[];
}

interface Props {
  returnId: string;
  returnData: ReturnData;
  onSaved?: () => void;
  setDirty?: (dirty: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => (n === 0 ? '—' : '₹' + n.toLocaleString('en-IN'));
const isValidTAN = (s: string) => /^[A-Z]{4}[0-9]{5}[A-Z]$/i.test(s.trim());
const isValidPAN = (s: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(s.trim());
const uuid = () => crypto.randomUUID();

const INCOME_TYPES = [
  'Interest on FD',
  'Interest on RD',
  'Interest on Savings',
  'Dividend',
  'Commission',
  'Professional Fees',
  'Rent (194I)',
  'Contractor Payment',
  'Other (specify)',
];

const EMPTY_STATE: TDSState = {
  salarySources: [],
  otherSources: [],
  propertySources: [],
  rentSources: [],
  tcsSources: [],
};

// ─── Mock IPC ─────────────────────────────────────────────────────────────────

const mockIPC = {
  getTDS: async (_id: string) => null,
  upsertTDS: async (_id: string, _data: unknown) => ({ ok: true }),
};

function ipc() {
  if (typeof window !== 'undefined' && (window as any).taxflow?.returns) {
    return (window as any).taxflow.returns as typeof mockIPC;
  }
  return mockIPC;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PartHeader({ part, title, sub }: { part: string; title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
      <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', letterSpacing: 1 }}>
        {part}
      </span>
      <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{title}</span>
      {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{sub}</span>}
    </div>
  );
}

function TotalsRow({ label, income, tds, tdsLabel = 'TDS Deducted' }: { label: string; income?: number; tds: number; tdsLabel?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, marginTop: 12 }}>
      {income !== undefined && (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {label}: <strong className="amount">{fmt(income)}</strong>
        </span>
      )}
      <span style={{ fontSize: 13, color: 'var(--brand-text)', fontWeight: 700 }}>
        {tdsLabel}: <span className="amount">{fmt(tds)}</span>
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduleTDS({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<TDSState>(EMPTY_STATE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = await ipc().getTDS(returnId);
        if (saved) setState(saved as TDSState);
      } catch (e) {
        console.error('ScheduleTDS load error', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [returnId]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  const persist = useCallback(
    (data: TDSState) => {
      setDirty?.(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        setSaveError(null);
        try {
          await ipc().upsertTDS(returnId, data);
          setDirty?.(false);
          onSaved?.();
        } catch (e: any) {
          setSaveError(e?.message ?? 'Save failed');
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [returnId, onSaved, setDirty]
  );

  const update = useCallback(
    (patch: Partial<TDSState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalTDSSalary = state.salarySources.reduce((s, r) => s + r.tdsDeducted, 0);
  const totalTDSOther = state.otherSources.reduce((s, r) => s + r.tdsDeducted, 0);
  const totalTDSProperty = state.propertySources.reduce((s, r) => s + r.tdsDeducted, 0);
  const totalTDSRent = state.rentSources.reduce((s, r) => s + r.tdsDeducted, 0);
  const totalTCS = state.tcsSources.reduce((s, r) => s + r.tcsCollected, 0);
  const grandTotal = totalTDSSalary + totalTDSOther + totalTDSProperty + totalTDSRent + totalTCS;

  if (!loaded) {
    return (
      <div className="card animate-in" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading TDS details…
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Part A: TDS on Salary ─────────────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part A" title="TDS on Salary" sub="Form 16 from each employer" />
        {state.salarySources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No salary TDS entries. Add your employer details from Form 16.</div>
        )}
        {state.salarySources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Employer #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ salarySources: state.salarySources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Employer Name</label>
                <input className="form-input" value={row.employerName} placeholder="As in Form 16"
                  onChange={(e) => update({ salarySources: state.salarySources.map((r) => r.id === row.id ? { ...r, employerName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Employer TAN</label>
                <input
                  className={`form-input pan-field${row.employerTAN && !isValidTAN(row.employerTAN) ? ' form-error' : ''}`}
                  value={row.employerTAN} maxLength={10} placeholder="AAAA00000A"
                  onChange={(e) => update({ salarySources: state.salarySources.map((r) => r.id === row.id ? { ...r, employerTAN: e.target.value.toUpperCase() } : r) })} />
                {row.employerTAN && !isValidTAN(row.employerTAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid TAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Gross Salary Paid / Credited (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.grossSalary || ''}
                  onChange={(e) => update({ salarySources: state.salarySources.map((r) => r.id === row.id ? { ...r, grossSalary: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Deducted (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tdsDeducted || ''}
                  onChange={(e) => update({ salarySources: state.salarySources.map((r) => r.id === row.id ? { ...r, tdsDeducted: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ salarySources: [...state.salarySources, { id: uuid(), employerName: '', employerTAN: '', grossSalary: 0, tdsDeducted: 0 }] })}>
          + Add Employer
        </button>
        {state.salarySources.length > 0 && (
          <TotalsRow label="Total Gross Salary" income={state.salarySources.reduce((s, r) => s + r.grossSalary, 0)} tds={totalTDSSalary} />
        )}
      </div>

      {/* ── Part B: TDS on Other Income ───────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part B" title="TDS on Other Income" sub="Form 16A — FD interest, professional fees, etc." />
        {state.otherSources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No TDS entries. Add income sources where TDS was deducted (Form 16A).</div>
        )}
        {state.otherSources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Entry #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ otherSources: state.otherSources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Deductor Name</label>
                <input className="form-input" value={row.deductorName} placeholder="Bank / Company name"
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, deductorName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Deductor TAN</label>
                <input
                  className={`form-input pan-field${row.deductorTAN && !isValidTAN(row.deductorTAN) ? ' form-error' : ''}`}
                  value={row.deductorTAN} maxLength={10} placeholder="AAAA00000A"
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, deductorTAN: e.target.value.toUpperCase() } : r) })} />
                {row.deductorTAN && !isValidTAN(row.deductorTAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid TAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Nature of Income</label>
                <select className="form-input" value={row.incomeType}
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, incomeType: e.target.value } : r) })}>
                  <option value="">— Select —</option>
                  {INCOME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Income Credited (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.incomeCredited || ''}
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, incomeCredited: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Deducted (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tdsDeducted || ''}
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, tdsDeducted: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ otherSources: [...state.otherSources, { id: uuid(), deductorName: '', deductorTAN: '', incomeType: '', incomeCredited: 0, tdsDeducted: 0 }] })}>
          + Add Entry
        </button>
        {state.otherSources.length > 0 && (
          <TotalsRow label="Total Income" income={state.otherSources.reduce((s, r) => s + r.incomeCredited, 0)} tds={totalTDSOther} />
        )}
      </div>

      {/* ── Part C: TDS on Property Sale ──────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part C" title="TDS on Sale of Immovable Property" sub="Form 16B — buyer deducts @ 1% u/s 194IA" />
        {state.propertySources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No property TDS entries. Add if buyer deducted TDS on property sale.</div>
        )}
        {state.propertySources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Property Sale #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ propertySources: state.propertySources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Buyer Name</label>
                <input className="form-input" value={row.buyerName} placeholder="Name of buyer"
                  onChange={(e) => update({ propertySources: state.propertySources.map((r) => r.id === row.id ? { ...r, buyerName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Buyer PAN</label>
                <input
                  className={`form-input pan-field${row.buyerPAN && !isValidPAN(row.buyerPAN) ? ' form-error' : ''}`}
                  value={row.buyerPAN} maxLength={10} placeholder="AAAAA0000A"
                  onChange={(e) => update({ propertySources: state.propertySources.map((r) => r.id === row.id ? { ...r, buyerPAN: e.target.value.toUpperCase() } : r) })} />
                {row.buyerPAN && !isValidPAN(row.buyerPAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid PAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Sale Consideration (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.considerationAmount || ''}
                  onChange={(e) => update({ propertySources: state.propertySources.map((r) => r.id === row.id ? { ...r, considerationAmount: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Deducted @ 1% (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tdsDeducted || ''}
                  onChange={(e) => update({ propertySources: state.propertySources.map((r) => r.id === row.id ? { ...r, tdsDeducted: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ propertySources: [...state.propertySources, { id: uuid(), buyerName: '', buyerPAN: '', considerationAmount: 0, tdsDeducted: 0 }] })}>
          + Add Property Sale
        </button>
        {state.propertySources.length > 0 && (
          <TotalsRow label="Total Consideration" income={state.propertySources.reduce((s, r) => s + r.considerationAmount, 0)} tds={totalTDSProperty} />
        )}
      </div>

      {/* ── Part D: TDS on Rent ───────────────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part D" title="TDS on Rent" sub="Form 16C — tenant deducts @ 5% u/s 194IB" />
        {state.rentSources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No rent TDS entries. Add if tenant deducted TDS on rent payments to you.</div>
        )}
        {state.rentSources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Rent #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ rentSources: state.rentSources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Tenant Name</label>
                <input className="form-input" value={row.tenantName} placeholder="Name of tenant"
                  onChange={(e) => update({ rentSources: state.rentSources.map((r) => r.id === row.id ? { ...r, tenantName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Tenant PAN</label>
                <input
                  className={`form-input pan-field${row.tenantPAN && !isValidPAN(row.tenantPAN) ? ' form-error' : ''}`}
                  value={row.tenantPAN} maxLength={10} placeholder="AAAAA0000A"
                  onChange={(e) => update({ rentSources: state.rentSources.map((r) => r.id === row.id ? { ...r, tenantPAN: e.target.value.toUpperCase() } : r) })} />
                {row.tenantPAN && !isValidPAN(row.tenantPAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid PAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Total Rent Paid to You (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.rentPaid || ''}
                  onChange={(e) => update({ rentSources: state.rentSources.map((r) => r.id === row.id ? { ...r, rentPaid: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Deducted @ 5% (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tdsDeducted || ''}
                  onChange={(e) => update({ rentSources: state.rentSources.map((r) => r.id === row.id ? { ...r, tdsDeducted: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ rentSources: [...state.rentSources, { id: uuid(), tenantName: '', tenantPAN: '', rentPaid: 0, tdsDeducted: 0 }] })}>
          + Add Rent TDS
        </button>
        {state.rentSources.length > 0 && (
          <TotalsRow label="Total Rent" income={state.rentSources.reduce((s, r) => s + r.rentPaid, 0)} tds={totalTDSRent} />
        )}
      </div>

      {/* ── Part E: TCS ───────────────────────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part E" title="Tax Collected at Source (TCS)" sub="Vehicle purchase, foreign remittance, etc." />
        {state.tcsSources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No TCS entries. Add if any seller collected tax at source from you.</div>
        )}
        {state.tcsSources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>TCS Entry #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ tcsSources: state.tcsSources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Collector Name</label>
                <input className="form-input" value={row.collectorName} placeholder="Seller / dealer name"
                  onChange={(e) => update({ tcsSources: state.tcsSources.map((r) => r.id === row.id ? { ...r, collectorName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Collector TAN</label>
                <input
                  className={`form-input pan-field${row.collectorTAN && !isValidTAN(row.collectorTAN) ? ' form-error' : ''}`}
                  value={row.collectorTAN} maxLength={10} placeholder="AAAA00000A"
                  onChange={(e) => update({ tcsSources: state.tcsSources.map((r) => r.id === row.id ? { ...r, collectorTAN: e.target.value.toUpperCase() } : r) })} />
                {row.collectorTAN && !isValidTAN(row.collectorTAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid TAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Amount Paid / Credited (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.amountPaid || ''}
                  onChange={(e) => update({ tcsSources: state.tcsSources.map((r) => r.id === row.id ? { ...r, amountPaid: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TCS Collected (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tcsCollected || ''}
                  onChange={(e) => update({ tcsSources: state.tcsSources.map((r) => r.id === row.id ? { ...r, tcsCollected: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ tcsSources: [...state.tcsSources, { id: uuid(), collectorName: '', collectorTAN: '', amountPaid: 0, tcsCollected: 0 }] })}>
          + Add TCS Entry
        </button>
        {state.tcsSources.length > 0 && (
          <TotalsRow label="Total Amount" income={state.tcsSources.reduce((s, r) => s + r.amountPaid, 0)} tds={totalTCS} tdsLabel="TCS Collected" />
        )}
      </div>

      {/* ── Grand Total ───────────────────────────────────────────────────────── */}
      <div className="card stat-card">
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--brand-text)' }}>TDS / TCS Summary</h3>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Part</th>
              <th>Source</th>
              <th style={{ textAlign: 'right' }}>TDS / TCS</th>
            </tr>
          </thead>
          <tbody>
            {[
              { part: 'A', label: 'TDS on Salary (Form 16)', val: totalTDSSalary },
              { part: 'B', label: 'TDS on Other Income (Form 16A)', val: totalTDSOther },
              { part: 'C', label: 'TDS on Property Sale (Form 16B)', val: totalTDSProperty },
              { part: 'D', label: 'TDS on Rent (Form 16C)', val: totalTDSRent },
              { part: 'E', label: 'TCS (Tax Collected at Source)', val: totalTCS },
            ].map((row) => (
              <tr key={row.part}>
                <td><span className="badge-primary" style={{ fontSize: 11, padding: '2px 6px' }}>Part {row.part}</span></td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{row.label}</td>
                <td className="amount" style={{ textAlign: 'right', color: row.val > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{fmt(row.val)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
              <td colSpan={2} style={{ fontWeight: 700, fontSize: 14, paddingTop: 10 }}>Total TDS / TCS Credit</td>
              <td className="amount" style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: 'var(--brand-text)', paddingTop: 10 }}>{fmt(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Save status ───────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', minHeight: 20 }}>
        {saving && '💾 Saving…'}
        {saveError && <span style={{ color: '#f87171' }}>⚠ {saveError}</span>}
      </div>
    </div>
  );
}
