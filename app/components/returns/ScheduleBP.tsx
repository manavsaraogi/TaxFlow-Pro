'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { ReturnData } from '@/shared/types/itr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Business44ADEntry {
  id: string;
  tradeName: string;
  natureOfBusiness: string;
  turnover: number;
  presumptiveIncome: number; // 6% digital / 8% cash
  isDigital: boolean; // true = 6%, false = 8%
}

interface Profession44ADAEntry {
  id: string;
  nameOfProfession: string;
  grossReceipts: number;
  presumptiveIncome: number; // 50% of gross receipts
}

interface GoodsCarriage44AEEntry {
  id: string;
  vehicleRegNo: string;
  isHeavy: boolean;
  ownedMonths: number;
  presumptiveIncome: number; // ₹1,000/ton/month (heavy) or ₹7,500/vehicle/month
}

interface BPState {
  business44AD: Business44ADEntry[];
  profession44ADA: Profession44ADAEntry[];
  goodsCarriage44AE: GoodsCarriage44AEEntry[];
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function defaultState(): BPState {
  return { business44AD: [], profession44ADA: [], goodsCarriage44AE: [] };
}

function totalPresumptive(state: BPState): number {
  return (
    state.business44AD.reduce((s, e) => s + e.presumptiveIncome, 0) +
    state.profession44ADA.reduce((s, e) => s + e.presumptiveIncome, 0) +
    state.goodsCarriage44AE.reduce((s, e) => s + e.presumptiveIncome, 0)
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  returnId: string;
  returnData: ReturnData;
  onSaved: (rd: ReturnData) => void;
  setDirty: (d: boolean) => void;
}

export default function ScheduleBP({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<BPState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Hydrate from returnData
  useEffect(() => {
    const pi = (returnData as any).presumptiveIncome;
    if (!pi) return;
    setState({
      business44AD:    pi.Business44AD    ?? [],
      profession44ADA: pi.Profession44ADA ?? [],
      goodsCarriage44AE: pi.GoodsCarriage44AE ?? [],
    });
  }, [returnData]);

  const update = useCallback((fn: (prev: BPState) => BPState) => {
    setState(fn);
    setDirty(true);
  }, [setDirty]);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    const total = totalPresumptive(state);
    try {
      const res = await fetch(`/api/returns/${returnId}/schedule/presumptiveIncome`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business44ADJson:     JSON.stringify(state.business44AD),
          profession44ADAJson:  JSON.stringify(state.profession44ADA),
          goodsCarriage44AEJson: JSON.stringify(state.goodsCarriage44AE),
          totalPresumptive:     total,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setMsg('Saved');
      setDirty(false);
      onSaved({ ...returnData, presumptiveIncome: {
        Business44AD: state.business44AD,
        Profession44ADA: state.profession44ADA,
        GoodsCarriage44AE: state.goodsCarriage44AE,
        TotalPresumptiveIncome: total,
      } } as any);
    } catch {
      setMsg('Error saving');
    } finally {
      setSaving(false);
    }
  }

  const totalPI = totalPresumptive(state);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── 44AD — Business ── */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div className="section-title">Business Income u/s 44AD</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              For businesses with turnover ≤ ₹3 Cr — 8% of turnover (6% if received digitally)
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({ ...p, business44AD: [...p.business44AD, { id: uid(), tradeName: '', natureOfBusiness: '', turnover: 0, presumptiveIncome: 0, isDigital: true }] }))
          }>+ Add Business</button>
        </div>
        {state.business44AD.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No business entries. Click "+ Add Business" to add.</div>
        ) : state.business44AD.map((e, i) => (
          <div key={e.id} style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '14px', marginBottom: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
              <div className="form-group">
                <label className="form-label">Trade / Business Name</label>
                <input className="form-input" value={e.tradeName} placeholder="e.g. ABC Trading Co."
                  onChange={ev => update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, tradeName: ev.target.value } : x) }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Nature of Business</label>
                <input className="form-input" value={e.natureOfBusiness} placeholder="e.g. Retail Trade"
                  onChange={ev => update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, natureOfBusiness: ev.target.value } : x) }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Total Turnover / Gross Receipts (₹)</label>
                <input className="form-input" type="number" min={0} value={e.turnover || ''}
                  onChange={ev => {
                    const turnover = Number(ev.target.value);
                    const rate = e.isDigital ? 0.06 : 0.08;
                    const presumptiveIncome = Math.round(turnover * rate);
                    update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, turnover, presumptiveIncome } : x) }));
                  }} />
              </div>
              <div className="form-group">
                <label className="form-label">Presumptive Income (₹)</label>
                <input className="form-input" type="number" min={0} value={e.presumptiveIncome || ''}
                  onChange={ev => update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, presumptiveIncome: Number(ev.target.value) } : x) }))} />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Auto-calculated; override if needed</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={e.isDigital}
                  onChange={ev => {
                    const isDigital = ev.target.checked;
                    const rate = isDigital ? 0.06 : 0.08;
                    const presumptiveIncome = Math.round(e.turnover * rate);
                    update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, isDigital, presumptiveIncome } : x) }));
                  }} />
                <span style={{ color: 'var(--text-secondary)' }}>Receipts via digital / banking channel (6% rate)</span>
              </label>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}
                onClick={() => update(p => ({ ...p, business44AD: p.business44AD.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          </div>
        ))}
      </section>

      {/* ── 44ADA — Profession ── */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div className="section-title">Professional Income u/s 44ADA</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              For eligible professionals with gross receipts ≤ ₹75 L — 50% of gross receipts
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({ ...p, profession44ADA: [...p.profession44ADA, { id: uid(), nameOfProfession: '', grossReceipts: 0, presumptiveIncome: 0 }] }))
          }>+ Add Profession</button>
        </div>
        {state.profession44ADA.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No profession entries.</div>
        ) : state.profession44ADA.map((e, i) => (
          <div key={e.id} style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '14px', marginBottom: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Nature of Profession</label>
                <input className="form-input" value={e.nameOfProfession} placeholder="e.g. Medical, Legal, Engineering"
                  onChange={ev => update(p => ({ ...p, profession44ADA: p.profession44ADA.map((x, j) => j === i ? { ...x, nameOfProfession: ev.target.value } : x) }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Gross Receipts (₹)</label>
                <input className="form-input" type="number" min={0} value={e.grossReceipts || ''}
                  onChange={ev => {
                    const grossReceipts = Number(ev.target.value);
                    const presumptiveIncome = Math.round(grossReceipts * 0.5);
                    update(p => ({ ...p, profession44ADA: p.profession44ADA.map((x, j) => j === i ? { ...x, grossReceipts, presumptiveIncome } : x) }));
                  }} />
              </div>
              <div className="form-group">
                <label className="form-label">Presumptive Income — 50% (₹)</label>
                <input className="form-input" type="number" min={0} value={e.presumptiveIncome || ''}
                  onChange={ev => update(p => ({ ...p, profession44ADA: p.profession44ADA.map((x, j) => j === i ? { ...x, presumptiveIncome: Number(ev.target.value) } : x) }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}
                onClick={() => update(p => ({ ...p, profession44ADA: p.profession44ADA.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          </div>
        ))}
      </section>

      {/* ── 44AE — Goods Carriage ── */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div className="section-title">Goods Carriage u/s 44AE</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Heavy vehicle: ₹1,000/ton/month. Other vehicle: ₹7,500/month
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({ ...p, goodsCarriage44AE: [...p.goodsCarriage44AE, { id: uid(), vehicleRegNo: '', isHeavy: false, ownedMonths: 12, presumptiveIncome: 0 }] }))
          }>+ Add Vehicle</button>
        </div>
        {state.goodsCarriage44AE.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No goods carriage entries.</div>
        ) : state.goodsCarriage44AE.map((e, i) => (
          <div key={e.id} style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '14px', marginBottom: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '10px' }}>
              <div className="form-group">
                <label className="form-label">Vehicle Reg. No.</label>
                <input className="form-input" value={e.vehicleRegNo} placeholder="MH12AB1234"
                  onChange={ev => update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, vehicleRegNo: ev.target.value } : x) }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Months Owned in FY</label>
                <input className="form-input" type="number" min={1} max={12} value={e.ownedMonths}
                  onChange={ev => {
                    const ownedMonths = Math.min(12, Math.max(1, Number(ev.target.value)));
                    const presumptiveIncome = e.isHeavy ? ownedMonths * 1000 * 16 : ownedMonths * 7500;
                    update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, ownedMonths, presumptiveIncome } : x) }));
                  }} />
              </div>
              <div className="form-group">
                <label className="form-label">Presumptive Income (₹)</label>
                <input className="form-input" type="number" min={0} value={e.presumptiveIncome || ''}
                  onChange={ev => update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, presumptiveIncome: Number(ev.target.value) } : x) }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={e.isHeavy}
                  onChange={ev => {
                    const isHeavy = ev.target.checked;
                    const presumptiveIncome = isHeavy ? e.ownedMonths * 1000 * 16 : e.ownedMonths * 7500;
                    update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, isHeavy, presumptiveIncome } : x) }));
                  }} />
                <span style={{ color: 'var(--text-secondary)' }}>Heavy goods vehicle (&gt;12 tonnes — ₹1,000/tonne/month)</span>
              </label>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}
                onClick={() => update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          </div>
        ))}
      </section>

      {/* ── Total & Save ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
        <div>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Total Presumptive Income</span>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--brand-text)', marginTop: '2px' }}>
            ₹{totalPI.toLocaleString('en-IN')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {msg && <span style={{ fontSize: '12px', color: msg === 'Saved' ? 'var(--success)' : 'var(--error)' }}>{msg}</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
