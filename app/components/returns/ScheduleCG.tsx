'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { ReturnData } from '@/shared/types/itr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LTCG112AEntry {
  id: string;
  isin: string;
  shareOrUnitName: string;
  salesValue: number;
  purchaseCost: number;
  fmvAsOn31Jan2018: number;
  expenditure: number;
  gainLoss: number;
}

interface CGState {
  ltcg112A: LTCG112AEntry[]; // LTCG u/s 112A — equity shares / equity MF
}

const LTCG_EXEMPTION = 125_000; // ₹1.25 lakh exemption u/s 112A

function uid() {
  return Math.random().toString(36).slice(2);
}

function calcGain(e: LTCG112AEntry): number {
  // Effective cost = max(actual purchase, FMV as on 31 Jan 2018)
  const effectiveCost = Math.max(e.purchaseCost, e.fmvAsOn31Jan2018);
  return Math.max(0, e.salesValue - effectiveCost - e.expenditure);
}

function defaultState(): CGState {
  return { ltcg112A: [] };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  returnId: string;
  returnData: ReturnData;
  onSaved: (rd: ReturnData) => void;
  setDirty: (d: boolean) => void;
}

export default function ScheduleCG({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<CGState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Hydrate from returnData
  useEffect(() => {
    const lg = (returnData as any).ltcg112A;
    if (!lg?.Entries?.length) return;
    setState({
      ltcg112A: lg.Entries.map((e: any) => ({
        id:               uid(),
        isin:             e.ISIN ?? '',
        shareOrUnitName:  e.ShareOrUnitName ?? '',
        salesValue:       e.SalesValue ?? 0,
        purchaseCost:     e.PurchaseCost ?? 0,
        fmvAsOn31Jan2018: e.FMVasOn31Jan2018 ?? 0,
        expenditure:      e.Expenditure ?? 0,
        gainLoss:         e.GainLoss ?? 0,
      })),
    });
  }, [returnData]);

  const update = useCallback((fn: (prev: CGState) => CGState) => {
    setState(fn);
    setDirty(true);
  }, [setDirty]);

  const totalGain      = state.ltcg112A.reduce((s, e) => s + e.gainLoss, 0);
  const taxableGain    = Math.max(0, totalGain - LTCG_EXEMPTION);
  const totalSales     = state.ltcg112A.reduce((s, e) => s + e.salesValue, 0);
  const totalCost      = state.ltcg112A.reduce((s, e) => s + e.purchaseCost, 0);

  function recalcEntry(e: LTCG112AEntry): LTCG112AEntry {
    return { ...e, gainLoss: calcGain(e) };
  }

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const entries = state.ltcg112A.map(e => ({
        isin:             e.isin,
        shareOrUnitName:  e.shareOrUnitName,
        salesValue:       e.salesValue,
        purchaseCost:     e.purchaseCost,
        fmvAsOn31Jan2018: e.fmvAsOn31Jan2018,
        expenditure:      e.expenditure,
        gainLoss:         e.gainLoss,
      }));
      const res = await fetch(`/api/returns/${returnId}/schedule/ltcg112A`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) throw new Error('Save failed');
      setMsg('Saved');
      setDirty(false);
      onSaved({
        ...returnData,
        ltcg112A: {
          Entries: state.ltcg112A.map(e => ({
            ISIN: e.isin,
            ShareOrUnitName: e.shareOrUnitName,
            SalesValue: e.salesValue,
            PurchaseCost: e.purchaseCost,
            FMVasOn31Jan2018: e.fmvAsOn31Jan2018,
            Expenditure: e.expenditure,
            GainLoss: e.gainLoss,
          })),
          TotalSalesValue: totalSales,
          TotalPurchaseCost: totalCost,
          TotalGain: totalGain,
          ExemptionLimit: LTCG_EXEMPTION,
          TaxableLTCG112A: taxableGain,
        },
      } as any);
    } catch {
      setMsg('Error saving');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── LTCG 112A ── */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <div className="section-title">LTCG u/s 112A — Equity Shares / Equity MF</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Long-term capital gains on listed equity shares and equity-oriented mutual funds held &gt; 12 months.
              Tax rate: 12.5%. Exemption: first ₹1.25 lakh of gain per year.
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({
              ...p,
              ltcg112A: [...p.ltcg112A, { id: uid(), isin: '', shareOrUnitName: '', salesValue: 0, purchaseCost: 0, fmvAsOn31Jan2018: 0, expenditure: 0, gainLoss: 0 }],
            }))
          }>+ Add Entry</button>
        </div>

        {/* Exemption notice */}
        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(212,160,23,0.08)', border: '1px solid var(--brand-primary)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Gain = Sale Value - max(Purchase Cost, FMV on 31-Jan-2018) - Transfer Expenses.
          First ₹1,25,000 of total gain is exempt u/s 112A.
        </div>

        {state.ltcg112A.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No LTCG entries. Click "+ Add Entry" to add equity / MF redemptions.</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 100px 100px 100px 100px 36px', gap: '8px', padding: '6px 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>ISIN</span><span>Name</span><span>Sale Value</span><span>Purchase Cost</span><span>FMV 31-Jan-18</span><span>Expenses</span><span>Gain / Loss</span><span></span>
            </div>
            {state.ltcg112A.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 100px 100px 100px 100px 36px', gap: '8px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }}
                  value={e.isin} placeholder="INE000A01036"
                  onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => j === i ? { ...x, isin: ev.target.value } : x) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }}
                  value={e.shareOrUnitName} placeholder="Company / Fund name"
                  onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => j === i ? { ...x, shareOrUnitName: ev.target.value } : x) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px', textAlign: 'right' }} type="number" min={0}
                  value={e.salesValue || ''}
                  onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, salesValue: Number(ev.target.value) }; return recalcEntry(u); }) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px', textAlign: 'right' }} type="number" min={0}
                  value={e.purchaseCost || ''}
                  onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, purchaseCost: Number(ev.target.value) }; return recalcEntry(u); }) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px', textAlign: 'right' }} type="number" min={0}
                  value={e.fmvAsOn31Jan2018 || ''}
                  placeholder="0"
                  onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, fmvAsOn31Jan2018: Number(ev.target.value) }; return recalcEntry(u); }) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px', textAlign: 'right' }} type="number" min={0}
                  value={e.expenditure || ''}
                  onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, expenditure: Number(ev.target.value) }; return recalcEntry(u); }) }))} />
                <div style={{ fontSize: '13px', fontWeight: 600, textAlign: 'right', color: e.gainLoss >= 0 ? 'var(--success)' : 'var(--error)', padding: '5px 0' }}>
                  ₹{e.gainLoss.toLocaleString('en-IN')}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '4px', minWidth: 0 }}
                  onClick={() => update(p => ({ ...p, ltcg112A: p.ltcg112A.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
          </>
        )}
      </section>

      {/* ── STCG placeholder ── */}
      <section className="schedule-section">
        <div className="section-title" style={{ marginBottom: '6px' }}>STCG — Short-Term Capital Gains</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
          Short-term capital gains entry (STCG u/s 111A at 20%, other assets at applicable slab rate) — coming soon.
        </div>
      </section>

      {/* ── Summary & Save ── */}
      <div style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '14px' }}>
          {[
            ['Total Sale Value', totalSales],
            ['Total Purchase Cost', totalCost],
            ['Total LTCG Gain', totalGain],
            ['Taxable LTCG (after ₹1.25L exemption)', taxableGain],
          ].map(([label, val]) => (
            <div key={label as string}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--brand-text)', marginTop: '4px' }}>
                ₹{(val as number).toLocaleString('en-IN')}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
          {msg && <span style={{ fontSize: '12px', color: msg === 'Saved' ? 'var(--success)' : 'var(--error)' }}>{msg}</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
