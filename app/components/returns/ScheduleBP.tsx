'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ReturnData } from '@/shared/types/itr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Business44ADEntry {
  id: string;
  tradeName: string;
  natureCode: string;
  turnover: number;
  presumptiveIncome: number;
  isDigital: boolean;
}

interface Profession44ADAEntry {
  id: string;
  professionName: string;
  professionCode: string;
  grossReceipts: number;
  presumptiveIncome: number;
}

interface GoodsCarriage44AEEntry {
  id: string;
  vehicleRegNo: string;
  isHeavy: boolean;
  ownedMonths: number;
  grossWeight: number; // tonnes (only for heavy)
  presumptiveIncome: number;
}

interface Form10IEA {
  optOut: boolean;         // true = opting out of 115BAC (choosing old regime)
  ackNo: string;
  dateOfFiling: string;   // YYYY-MM-DD
}

interface BPState {
  business44AD: Business44ADEntry[];
  profession44ADA: Profession44ADAEntry[];
  goodsCarriage44AE: GoodsCarriage44AEEntry[];
  form10IEA: Form10IEA;
}

function uid() { return Math.random().toString(36).slice(2); }

function defaultState(): BPState {
  return {
    business44AD: [],
    profession44ADA: [],
    goodsCarriage44AE: [],
    form10IEA: { optOut: false, ackNo: '', dateOfFiling: '' },
  };
}

function totalPresumptive(state: BPState): number {
  return (
    state.business44AD.reduce((s, e) => s + e.presumptiveIncome, 0) +
    state.profession44ADA.reduce((s, e) => s + e.presumptiveIncome, 0) +
    state.goodsCarriage44AE.reduce((s, e) => s + e.presumptiveIncome, 0)
  );
}

function fmt(n: number) {
  if (!n) return '—';
  return '₹' + n.toLocaleString('en-IN');
}

// ─── Inline input helpers ─────────────────────────────────────────────────────

function TxtInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      placeholder={placeholder ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'inherit', padding: '2px 4px', outline: 'none' }}
    />
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value || ''}
      min={0}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'var(--font-mono)', textAlign: 'right', padding: '2px 4px', outline: 'none' }}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  returnId: string;
  returnData: ReturnData;
  regime?: string;
  onSaved: (rd: ReturnData) => void;
  setDirty: (d: boolean) => void;
}

export default function ScheduleBP({ returnId, returnData, regime, onSaved, setDirty }: Props) {
  const [state, setState] = useState<BPState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from returnData
  useEffect(() => {
    const pi = (returnData as any).presumptiveIncome;
    if (!pi) return;
    setState({
      business44AD:     pi.Business44AD     ?? [],
      profession44ADA:  pi.Profession44ADA  ?? [],
      goodsCarriage44AE: pi.GoodsCarriage44AE ?? [],
      form10IEA: pi.Form10IEA ?? { optOut: false, ackNo: '', dateOfFiling: '' },
    });
  }, [returnData]);

  const update = useCallback((fn: (prev: BPState) => BPState) => {
    setState(prev => {
      const next = fn(prev);
      setDirty(true);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => persist(next), 2000);
      return next;
    });
  }, [setDirty]);

  async function persist(s: BPState) {
    const total = totalPresumptive(s);
    await fetch(`/api/returns/${returnId}/schedule/presumptiveIncome`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business44ADJson:      JSON.stringify(s.business44AD),
        profession44ADAJson:   JSON.stringify(s.profession44ADA),
        goodsCarriage44AEJson: JSON.stringify(s.goodsCarriage44AE),
        totalPresumptive:      total,
        form10IEA:             s.form10IEA,
      }),
    }).catch(() => null);
  }

  async function handleSave() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setSaving(true); setSaveMsg('');
    try {
      await persist(state);
      const total = totalPresumptive(state);
      setSaveMsg('Saved');
      setDirty(false);
      onSaved({ ...returnData, presumptiveIncome: {
        Business44AD: state.business44AD,
        Profession44ADA: state.profession44ADA,
        GoodsCarriage44AE: state.goodsCarriage44AE,
        Form10IEA: state.form10IEA,
        TotalPresumptiveIncome: total,
      } } as any);
    } catch {
      setSaveMsg('Error saving');
    } finally {
      setSaving(false);
    }
  }

  const totalPI = totalPresumptive(state);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: 'var(--brand-primary)', color: '#000', padding: '2px 6px', borderRadius: '3px' }}>BP</span>
        <div>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Business &amp; Profession</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>Presumptive income u/s 44AD / 44ADA / 44AE</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveMsg && <span style={{ fontSize: '11px', color: saveMsg === 'Saved' ? 'var(--success)' : 'var(--error)' }}>{saveMsg}</span>}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ── 44AD: Business ── */}
        <section>
          <div className="itr-schedule-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="schedule-badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>44AD</span>
              <span className="schedule-title">Business Income</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Turnover ≤ ₹3 Cr — 8% cash / 6% digital</span>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() =>
              update(p => ({ ...p, business44AD: [...p.business44AD, { id: uid(), tradeName: '', natureCode: '', turnover: 0, presumptiveIncome: 0, isDigital: true }] }))
            }>+ Add</button>
          </div>

          <table className="itr-form" style={{ width: '100%' }}>
            <thead>
              <tr className="itr-section-head">
                <th style={{ width: '28px' }}>#</th>
                <th>Trade / Business Name</th>
                <th style={{ width: '120px' }}>Nature Code</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Turnover (₹)</th>
                <th style={{ width: '60px', textAlign: 'center' }}>Digital</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Presumptive Income (₹)</th>
                <th style={{ width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {state.business44AD.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No business entries added.</td></tr>
              ) : state.business44AD.map((e, i) => (
                <tr key={e.id} className="itr-row">
                  <td className="itr-num">{i + 1}</td>
                  <td className="itr-label"><TxtInput value={e.tradeName} onChange={v => update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, tradeName: v } : x) }))} placeholder="Business name" /></td>
                  <td><TxtInput value={e.natureCode} onChange={v => update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, natureCode: v } : x) }))} placeholder="Code" /></td>
                  <td className="itr-amount">
                    <NumInput value={e.turnover} onChange={turnover => {
                      const rate = e.isDigital ? 0.06 : 0.08;
                      update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, turnover, presumptiveIncome: Math.round(turnover * rate) } : x) }));
                    }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={e.isDigital} onChange={ev => {
                      const isDigital = ev.target.checked;
                      const rate = isDigital ? 0.06 : 0.08;
                      update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, isDigital, presumptiveIncome: Math.round(x.turnover * rate) } : x) }));
                    }} />
                  </td>
                  <td className="itr-amount">
                    <NumInput value={e.presumptiveIncome} onChange={v => update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, presumptiveIncome: v } : x) }))} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '0 4px' }} onClick={() => update(p => ({ ...p, business44AD: p.business44AD.filter((_, j) => j !== i) }))}>✕</button>
                  </td>
                </tr>
              ))}
              {state.business44AD.length > 0 && (
                <tr className="itr-row subtotal">
                  <td colSpan={5} className="itr-label" style={{ textAlign: 'right', fontWeight: 600 }}>Total 44AD</td>
                  <td className="itr-amount" style={{ fontWeight: 700, color: 'var(--brand-text)' }}>{fmt(state.business44AD.reduce((s, e) => s + e.presumptiveIncome, 0))}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* ── 44ADA: Profession ── */}
        <section>
          <div className="itr-schedule-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="schedule-badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>44ADA</span>
              <span className="schedule-title">Professional Income</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Gross receipts ≤ ₹75 L — 50% presumptive</span>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() =>
              update(p => ({ ...p, profession44ADA: [...p.profession44ADA, { id: uid(), professionName: '', professionCode: '', grossReceipts: 0, presumptiveIncome: 0 }] }))
            }>+ Add</button>
          </div>

          <table className="itr-form" style={{ width: '100%' }}>
            <thead>
              <tr className="itr-section-head">
                <th style={{ width: '28px' }}>#</th>
                <th>Nature of Profession</th>
                <th style={{ width: '120px' }}>Code</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Gross Receipts (₹)</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Presumptive (50%) (₹)</th>
                <th style={{ width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {state.profession44ADA.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No profession entries added.</td></tr>
              ) : state.profession44ADA.map((e, i) => (
                <tr key={e.id} className="itr-row">
                  <td className="itr-num">{i + 1}</td>
                  <td className="itr-label"><TxtInput value={e.professionName} onChange={v => update(p => ({ ...p, profession44ADA: p.profession44ADA.map((x, j) => j === i ? { ...x, professionName: v } : x) }))} placeholder="e.g. Medical, Legal, Architecture" /></td>
                  <td><TxtInput value={e.professionCode} onChange={v => update(p => ({ ...p, profession44ADA: p.profession44ADA.map((x, j) => j === i ? { ...x, professionCode: v } : x) }))} placeholder="Code" /></td>
                  <td className="itr-amount">
                    <NumInput value={e.grossReceipts} onChange={gr => {
                      update(p => ({ ...p, profession44ADA: p.profession44ADA.map((x, j) => j === i ? { ...x, grossReceipts: gr, presumptiveIncome: Math.round(gr * 0.5) } : x) }));
                    }} />
                  </td>
                  <td className="itr-amount">
                    <NumInput value={e.presumptiveIncome} onChange={v => update(p => ({ ...p, profession44ADA: p.profession44ADA.map((x, j) => j === i ? { ...x, presumptiveIncome: v } : x) }))} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '0 4px' }} onClick={() => update(p => ({ ...p, profession44ADA: p.profession44ADA.filter((_, j) => j !== i) }))}>✕</button>
                  </td>
                </tr>
              ))}
              {state.profession44ADA.length > 0 && (
                <tr className="itr-row subtotal">
                  <td colSpan={4} className="itr-label" style={{ textAlign: 'right', fontWeight: 600 }}>Total 44ADA</td>
                  <td className="itr-amount" style={{ fontWeight: 700, color: 'var(--brand-text)' }}>{fmt(state.profession44ADA.reduce((s, e) => s + e.presumptiveIncome, 0))}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* ── 44AE: Goods Carriage ── */}
        <section>
          <div className="itr-schedule-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="schedule-badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>44AE</span>
              <span className="schedule-title">Goods Carriage</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Heavy ≥ 12T: ₹1,000/T/month · Other: ₹7,500/vehicle/month</span>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() =>
              update(p => ({ ...p, goodsCarriage44AE: [...p.goodsCarriage44AE, { id: uid(), vehicleRegNo: '', isHeavy: false, ownedMonths: 12, grossWeight: 0, presumptiveIncome: 0 }] }))
            }>+ Add</button>
          </div>

          <table className="itr-form" style={{ width: '100%' }}>
            <thead>
              <tr className="itr-section-head">
                <th style={{ width: '28px' }}>#</th>
                <th style={{ width: '130px' }}>Reg. No.</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Heavy?</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Gross Wt (T)</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Months</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Presumptive (₹)</th>
                <th style={{ width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {state.goodsCarriage44AE.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No vehicles added.</td></tr>
              ) : state.goodsCarriage44AE.map((e, i) => (
                <tr key={e.id} className="itr-row">
                  <td className="itr-num">{i + 1}</td>
                  <td><TxtInput value={e.vehicleRegNo} onChange={v => update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, vehicleRegNo: v } : x) }))} placeholder="MH12AB1234" /></td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={e.isHeavy} onChange={ev => {
                      const isHeavy = ev.target.checked;
                      const pi = isHeavy ? e.ownedMonths * 1000 * (e.grossWeight || 16) : e.ownedMonths * 7500;
                      update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, isHeavy, presumptiveIncome: pi } : x) }));
                    }} />
                  </td>
                  <td className="itr-amount">
                    <NumInput value={e.grossWeight} onChange={grossWeight => {
                      const pi = e.isHeavy ? e.ownedMonths * 1000 * grossWeight : e.ownedMonths * 7500;
                      update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, grossWeight, presumptiveIncome: pi } : x) }));
                    }} />
                  </td>
                  <td className="itr-amount">
                    <NumInput value={e.ownedMonths} onChange={ownedMonths => {
                      const m = Math.min(12, Math.max(1, ownedMonths));
                      const pi = e.isHeavy ? m * 1000 * (e.grossWeight || 16) : m * 7500;
                      update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, ownedMonths: m, presumptiveIncome: pi } : x) }));
                    }} />
                  </td>
                  <td className="itr-amount">
                    <NumInput value={e.presumptiveIncome} onChange={v => update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, presumptiveIncome: v } : x) }))} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '0 4px' }} onClick={() => update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.filter((_, j) => j !== i) }))}>✕</button>
                  </td>
                </tr>
              ))}
              {state.goodsCarriage44AE.length > 0 && (
                <tr className="itr-row subtotal">
                  <td colSpan={5} className="itr-label" style={{ textAlign: 'right', fontWeight: 600 }}>Total 44AE</td>
                  <td className="itr-amount" style={{ fontWeight: 700, color: 'var(--brand-text)' }}>{fmt(state.goodsCarriage44AE.reduce((s, e) => s + e.presumptiveIncome, 0))}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* ── Total BP Income ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
          {[
            { label: '44AD Business', val: state.business44AD.reduce((s, e) => s + e.presumptiveIncome, 0) },
            { label: '44ADA Profession', val: state.profession44ADA.reduce((s, e) => s + e.presumptiveIncome, 0) },
            { label: '44AE Goods Carriage', val: state.goodsCarriage44AE.reduce((s, e) => s + e.presumptiveIncome, 0) },
          ].map((item, i, arr) => (
            <div key={item.label} style={{ flex: 1, padding: '10px 14px', borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : undefined }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: item.val ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{fmt(item.val)}</div>
            </div>
          ))}
          <div style={{ padding: '10px 14px', background: 'rgba(212,160,23,0.08)', borderLeft: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total BP Income</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: totalPI ? 'var(--brand-text)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{fmt(totalPI)}</div>
          </div>
        </div>

        {/* ── Form 10-IEA ── */}
        <section>
          <div className="itr-schedule-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="schedule-badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>10-IEA</span>
            <span className="schedule-title">Regime Declaration</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Opt out of new tax regime u/s 115BAC(1A)</span>
            {/* Applicability pill */}
            {totalPI > 0 && (
              regime === 'OLD'
                ? <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: 700, background: 'rgba(212,160,23,0.2)', color: 'var(--brand-text)', padding: '2px 7px', borderRadius: '3px', letterSpacing: '0.03em' }}>APPLICABLE — Old Regime</span>
                : <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: 700, background: 'var(--bg-elevated)', color: 'var(--text-muted)', padding: '2px 7px', borderRadius: '3px', border: '1px solid var(--border-subtle)', letterSpacing: '0.03em' }}>NOT REQUIRED — New Regime</span>
            )}
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px', opacity: regime !== 'OLD' ? 0.5 : 1, pointerEvents: regime !== 'OLD' ? 'none' : undefined }}>
            {regime !== 'OLD' ? (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Form 10-IEA is only applicable when the old tax regime is selected for this return. Switch to Old Regime to enable this section.
              </p>
            ) : (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={state.form10IEA.optOut}
                    onChange={ev => update(p => ({ ...p, form10IEA: { ...p.form10IEA, optOut: ev.target.checked } }))}
                  />
                  <span>I have filed Form 10-IEA to opt out of section 115BAC (new tax regime) and choose the old regime</span>
                </label>

                {state.form10IEA.optOut && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Acknowledgement No.</label>
                      <input
                        className="form-input"
                        value={state.form10IEA.ackNo}
                        placeholder="e.g. 12345678901234"
                        onChange={e => update(p => ({ ...p, form10IEA: { ...p.form10IEA, ackNo: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Date of Filing</label>
                      <input
                        className="form-input"
                        type="date"
                        value={state.form10IEA.dateOfFiling}
                        onChange={e => update(p => ({ ...p, form10IEA: { ...p.form10IEA, dateOfFiling: e.target.value } }))}
                      />
                    </div>
                  </div>
                )}

                {!state.form10IEA.optOut && (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Individuals with business income cannot switch regimes each year — Form 10-IEA locks in the choice. If you want to be taxed under the old regime this year, check the box above.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
