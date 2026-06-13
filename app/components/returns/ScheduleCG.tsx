'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { ReturnData, STCG111AEntry, STCGOtherEntry } from '@/shared/types/itr';

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
  ltcg112A: LTCG112AEntry[];
  stcg111A: STCG111AEntry[];
  stcgOther: STCGOtherEntry[];
}

const LTCG_EXEMPTION = 125_000;

function uid() {
  return Math.random().toString(36).slice(2);
}

function calcLTCGGain(e: LTCG112AEntry): number {
  const effectiveCost = Math.max(e.purchaseCost, e.fmvAsOn31Jan2018);
  return Math.max(0, e.salesValue - effectiveCost - e.expenditure);
}

function calc111AGain(e: STCG111AEntry): number {
  return e.salesValue - e.purchaseCost - e.expenditure;
}

function calcOtherGain(e: STCGOtherEntry): number {
  return e.salesValue - e.purchaseCost - e.expenditure;
}

function defaultState(): CGState {
  return { ltcg112A: [], stcg111A: [], stcgOther: [] };
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

  useEffect(() => {
    const lg = (returnData as any).ltcg112A;
    const sg = (returnData as any).stcg;

    setState({
      ltcg112A: lg?.Entries?.length
        ? lg.Entries.map((e: any) => ({
            id: uid(),
            isin: e.ISIN ?? '',
            shareOrUnitName: e.ShareOrUnitName ?? '',
            salesValue: e.SalesValue ?? 0,
            purchaseCost: e.PurchaseCost ?? 0,
            fmvAsOn31Jan2018: e.FMVasOn31Jan2018 ?? 0,
            expenditure: e.Expenditure ?? 0,
            gainLoss: e.GainLoss ?? 0,
          }))
        : [],
      stcg111A: sg?.Entries111A?.length
        ? sg.Entries111A.map((e: any) => ({
            id: uid(),
            isin: e.isin ?? '',
            shareOrUnitName: e.shareOrUnitName ?? '',
            salesValue: e.salesValue ?? 0,
            purchaseCost: e.purchaseCost ?? 0,
            expenditure: e.expenditure ?? 0,
            gainLoss: e.gainLoss ?? 0,
          }))
        : [],
      stcgOther: sg?.OtherEntries?.length
        ? sg.OtherEntries.map((e: any) => ({
            id: uid(),
            assetDesc: e.assetDesc ?? '',
            salesValue: e.salesValue ?? 0,
            purchaseCost: e.purchaseCost ?? 0,
            expenditure: e.expenditure ?? 0,
            gainLoss: e.gainLoss ?? 0,
          }))
        : [],
    });
  }, [returnData]);

  const update = useCallback((fn: (prev: CGState) => CGState) => {
    setState(fn);
    setDirty(true);
  }, [setDirty]);

  // LTCG totals
  const totalLtcgGain   = state.ltcg112A.reduce((s, e) => s + e.gainLoss, 0);
  const taxableLtcg     = Math.max(0, totalLtcgGain - LTCG_EXEMPTION);
  const totalLtcgSales  = state.ltcg112A.reduce((s, e) => s + e.salesValue, 0);
  const totalLtcgCost   = state.ltcg112A.reduce((s, e) => s + e.purchaseCost, 0);

  // STCG 111A totals
  const total111A = state.stcg111A.reduce((s, e) => s + e.gainLoss, 0);
  // STCG other totals
  const totalOther = state.stcgOther.reduce((s, e) => s + e.gainLoss, 0);
  const totalStcg = total111A + totalOther;

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      // Save LTCG 112A
      const ltcgEntries = state.ltcg112A.map(e => ({
        isin: e.isin,
        shareOrUnitName: e.shareOrUnitName,
        salesValue: e.salesValue,
        purchaseCost: e.purchaseCost,
        fmvAsOn31Jan2018: e.fmvAsOn31Jan2018,
        expenditure: e.expenditure,
        gainLoss: e.gainLoss,
      }));
      const r1 = await fetch(`/api/returns/${returnId}/schedule/ltcg112A`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: ltcgEntries }),
      });
      if (!r1.ok) throw new Error('LTCG save failed');

      // Save STCG
      const r2 = await fetch(`/api/returns/${returnId}/schedule/stcg`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries111A: state.stcg111A.map(e => ({ isin: e.isin, shareOrUnitName: e.shareOrUnitName, salesValue: e.salesValue, purchaseCost: e.purchaseCost, expenditure: e.expenditure, gainLoss: e.gainLoss })),
          entriesOther: state.stcgOther.map(e => ({ assetDesc: e.assetDesc, salesValue: e.salesValue, purchaseCost: e.purchaseCost, expenditure: e.expenditure, gainLoss: e.gainLoss })),
        }),
      });
      if (!r2.ok) throw new Error('STCG save failed');

      setMsg('Saved');
      setDirty(false);
      onSaved({
        ...returnData,
        ltcg112A: {
          Entries: state.ltcg112A.map(e => ({
            ISIN: e.isin, ShareOrUnitName: e.shareOrUnitName,
            SalesValue: e.salesValue, PurchaseCost: e.purchaseCost,
            FMVasOn31Jan2018: e.fmvAsOn31Jan2018, Expenditure: e.expenditure, GainLoss: e.gainLoss,
          })),
          TotalSalesValue: totalLtcgSales, TotalPurchaseCost: totalLtcgCost,
          TotalGain: totalLtcgGain, ExemptionLimit: LTCG_EXEMPTION, TaxableLTCG112A: taxableLtcg,
        },
        stcg: {
          Entries111A: state.stcg111A.map(e => ({ ...e })),
          TotalSTCG111A: total111A,
          OtherEntries: state.stcgOther.map(e => ({ ...e })),
          TotalSTCGOther: totalOther,
          TotalSTCG: totalStcg,
        },
      } as any);
    } catch (err: any) {
      setMsg(err.message ?? 'Error saving');
    } finally {
      setSaving(false);
    }
  }

  // ── Reusable currency input ──
  const numInput = (value: number, onChange: (v: number) => void) => (
    <input
      className="form-input"
      style={{ fontSize: '12px', padding: '5px 8px', textAlign: 'right' }}
      type="number"
      min={0}
      value={value || ''}
      onChange={e => onChange(Number(e.target.value))}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ══ LTCG 112A ══════════════════════════════════════════════════════════ */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div className="section-title">LTCG u/s 112A — Equity Shares / Equity MF</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Listed equity / equity-oriented MF held &gt;12 months. Tax: 12.5%. Exemption: first ₹1.25L per year.
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({
              ...p,
              ltcg112A: [...p.ltcg112A, { id: uid(), isin: '', shareOrUnitName: '', salesValue: 0, purchaseCost: 0, fmvAsOn31Jan2018: 0, expenditure: 0, gainLoss: 0 }],
            }))
          }>+ Add Entry</button>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(212,160,23,0.08)', border: '1px solid var(--brand-primary)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Gain = Sale Value − max(Purchase Cost, FMV on 31-Jan-2018) − Transfer Expenses. First ₹1,25,000 exempt u/s 112A.
        </div>

        {state.ltcg112A.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No LTCG entries. Click "+ Add Entry" to add equity / MF redemptions.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 100px 100px 100px 100px 36px', gap: '8px', padding: '6px 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>ISIN</span><span>Name</span><span>Sale ₹</span><span>Cost ₹</span><span>FMV 31-Jan-18</span><span>Expenses ₹</span><span>Gain / Loss</span><span></span>
            </div>
            {state.ltcg112A.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 100px 100px 100px 100px 36px', gap: '8px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.isin} placeholder="ISIN"
                  onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => j === i ? { ...x, isin: ev.target.value } : x) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.shareOrUnitName} placeholder="Company / Fund name"
                  onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => j === i ? { ...x, shareOrUnitName: ev.target.value } : x) }))} />
                {numInput(e.salesValue, v => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, salesValue: v }; return { ...u, gainLoss: calcLTCGGain(u) }; }) })))}
                {numInput(e.purchaseCost, v => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, purchaseCost: v }; return { ...u, gainLoss: calcLTCGGain(u) }; }) })))}
                {numInput(e.fmvAsOn31Jan2018, v => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, fmvAsOn31Jan2018: v }; return { ...u, gainLoss: calcLTCGGain(u) }; }) })))}
                {numInput(e.expenditure, v => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, expenditure: v }; return { ...u, gainLoss: calcLTCGGain(u) }; }) })))}
                <div style={{ fontSize: '13px', fontWeight: 600, textAlign: 'right', color: e.gainLoss >= 0 ? 'var(--success)' : 'var(--error)', padding: '5px 0' }}>
                  ₹{e.gainLoss.toLocaleString('en-IN')}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '4px', minWidth: 0 }}
                  onClick={() => update(p => ({ ...p, ltcg112A: p.ltcg112A.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Gain: <strong style={{ color: 'var(--text-primary)' }}>₹{totalLtcgGain.toLocaleString('en-IN')}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Exemption: <strong>₹{LTCG_EXEMPTION.toLocaleString('en-IN')}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Taxable LTCG: <strong style={{ color: 'var(--brand-text)' }}>₹{taxableLtcg.toLocaleString('en-IN')}</strong></span>
            </div>
          </>
        )}
      </section>

      {/* ══ STCG 111A ══════════════════════════════════════════════════════════ */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div className="section-title">STCG u/s 111A — Listed Equity / Equity MF</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Listed equity shares / equity-oriented MF held ≤12 months. Tax rate: 20% (flat). No basic exemption.
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({
              ...p,
              stcg111A: [...p.stcg111A, { id: uid(), isin: '', shareOrUnitName: '', salesValue: 0, purchaseCost: 0, expenditure: 0, gainLoss: 0 }],
            }))
          }>+ Add Entry</button>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Gain = Sale Value − Purchase Cost − Transfer Expenses. Taxed at 20% (Budget 2024). Applies to STT-paid transactions on recognised stock exchanges.
        </div>

        {state.stcg111A.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No STCG 111A entries. Click "+ Add Entry" to add short-term equity / MF transactions.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px 110px 100px 100px 36px', gap: '8px', padding: '6px 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>ISIN</span><span>Name</span><span>Sale ₹</span><span>Purchase ₹</span><span>Expenses ₹</span><span>Gain / Loss</span><span></span>
            </div>
            {state.stcg111A.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px 110px 100px 100px 36px', gap: '8px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.isin} placeholder="ISIN"
                  onChange={ev => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => j === i ? { ...x, isin: ev.target.value } : x) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.shareOrUnitName} placeholder="Company / Fund name"
                  onChange={ev => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => j === i ? { ...x, shareOrUnitName: ev.target.value } : x) }))} />
                {numInput(e.salesValue, v => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => { if (j !== i) return x; const u = { ...x, salesValue: v }; return { ...u, gainLoss: calc111AGain(u) }; }) })))}
                {numInput(e.purchaseCost, v => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => { if (j !== i) return x; const u = { ...x, purchaseCost: v }; return { ...u, gainLoss: calc111AGain(u) }; }) })))}
                {numInput(e.expenditure, v => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => { if (j !== i) return x; const u = { ...x, expenditure: v }; return { ...u, gainLoss: calc111AGain(u) }; }) })))}
                <div style={{ fontSize: '13px', fontWeight: 600, textAlign: 'right', color: e.gainLoss >= 0 ? 'var(--success)' : 'var(--error)', padding: '5px 0' }}>
                  ₹{e.gainLoss.toLocaleString('en-IN')}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '4px', minWidth: 0 }}
                  onClick={() => update(p => ({ ...p, stcg111A: p.stcg111A.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total STCG 111A: <strong style={{ color: 'var(--brand-text)' }}>₹{total111A.toLocaleString('en-IN')}</strong></span>
            </div>
          </>
        )}
      </section>

      {/* ══ STCG — Other Assets ════════════════════════════════════════════════ */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div className="section-title">STCG — Other Assets (Slab Rate)</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Short-term gains on land, gold, debt MF, unlisted shares, jewellery, etc. Taxed at applicable slab rate (added to total income).
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({
              ...p,
              stcgOther: [...p.stcgOther, { id: uid(), assetDesc: '', salesValue: 0, purchaseCost: 0, expenditure: 0, gainLoss: 0 }],
            }))
          }>+ Add Entry</button>
        </div>

        {state.stcgOther.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No other STCG entries. Click "+ Add Entry" to add gains on land, gold, debt MF, etc.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 100px 36px', gap: '8px', padding: '6px 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>Asset Description</span><span>Sale ₹</span><span>Cost ₹</span><span>Expenses ₹</span><span>Gain / Loss</span><span></span>
            </div>
            {state.stcgOther.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 100px 36px', gap: '8px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.assetDesc} placeholder="e.g. Gold jewellery, Land at Pune, Debt MF"
                  onChange={ev => update(p => ({ ...p, stcgOther: p.stcgOther.map((x, j) => j === i ? { ...x, assetDesc: ev.target.value } : x) }))} />
                {numInput(e.salesValue, v => update(p => ({ ...p, stcgOther: p.stcgOther.map((x, j) => { if (j !== i) return x; const u = { ...x, salesValue: v }; return { ...u, gainLoss: calcOtherGain(u) }; }) })))}
                {numInput(e.purchaseCost, v => update(p => ({ ...p, stcgOther: p.stcgOther.map((x, j) => { if (j !== i) return x; const u = { ...x, purchaseCost: v }; return { ...u, gainLoss: calcOtherGain(u) }; }) })))}
                {numInput(e.expenditure, v => update(p => ({ ...p, stcgOther: p.stcgOther.map((x, j) => { if (j !== i) return x; const u = { ...x, expenditure: v }; return { ...u, gainLoss: calcOtherGain(u) }; }) })))}
                <div style={{ fontSize: '13px', fontWeight: 600, textAlign: 'right', color: e.gainLoss >= 0 ? 'var(--success)' : 'var(--error)', padding: '5px 0' }}>
                  ₹{e.gainLoss.toLocaleString('en-IN')}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '4px', minWidth: 0 }}
                  onClick={() => update(p => ({ ...p, stcgOther: p.stcgOther.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total STCG Other: <strong style={{ color: 'var(--brand-text)' }}>₹{totalOther.toLocaleString('en-IN')}</strong></span>
            </div>
          </>
        )}
      </section>

      {/* ══ Summary & Save ═════════════════════════════════════════════════════ */}
      <div style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '14px' }}>
          {[
            ['Taxable LTCG 112A (12.5%)', taxableLtcg],
            ['STCG 111A (20%)', total111A],
            ['STCG Other (slab)', totalOther],
            ['Total CG Income', taxableLtcg + totalStcg],
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
