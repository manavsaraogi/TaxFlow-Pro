'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ReturnData } from '@/shared/types/itr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImmovableEntry {
  id: string;
  description: string;      // address/description of property
  ownershipType: 'SELF' | 'JOINT';
  costOfAcquisition: number;
  assetsShare: number;      // amount at cost (assessee's share if joint)
}

interface MovableAssets {
  jewellery: number;
  archaeologicalCollections: number;
  vehicles: number;
  bankDeposits: number;
  sharesSecurities: number;
  insurancePolicies: number;
  loansAdvances: number;
  cashInHand: number;
  otherMovable: number;
}

interface LiabilityEntry {
  id: string;
  description: string;
  amount: number;
}

interface ALState {
  immovable: ImmovableEntry[];
  movable: MovableAssets;
  liabilities: LiabilityEntry[];
}

function uid() { return Math.random().toString(36).slice(2); }

function defaultMovable(): MovableAssets {
  return {
    jewellery: 0,
    archaeologicalCollections: 0,
    vehicles: 0,
    bankDeposits: 0,
    sharesSecurities: 0,
    insurancePolicies: 0,
    loansAdvances: 0,
    cashInHand: 0,
    otherMovable: 0,
  };
}

function defaultState(): ALState {
  return { immovable: [], movable: defaultMovable(), liabilities: [] };
}

function totalImmovable(state: ALState): number {
  return state.immovable.reduce((s, e) => s + e.assetsShare, 0);
}
function totalMovable(state: ALState): number {
  return Object.values(state.movable).reduce((s, v) => s + v, 0);
}
function totalAssets(state: ALState): number {
  return totalImmovable(state) + totalMovable(state);
}
function totalLiabilities(state: ALState): number {
  return state.liabilities.reduce((s, e) => s + e.amount, 0);
}

function fmt(n: number) {
  if (!n) return '—';
  return '₹' + n.toLocaleString('en-IN');
}

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
  grossTotalIncome: number;
  onSaved: (rd: ReturnData) => void;
  setDirty: (d: boolean) => void;
}

export default function ScheduleAL({ returnId, returnData, grossTotalIncome, onSaved, setDirty }: Props) {
  const [state, setState] = useState<ALState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const al = (returnData as any).assetsLiabilities;
    if (!al) return;
    setState({
      immovable:   al.immovable   ?? [],
      movable:     { ...defaultMovable(), ...(al.movable ?? {}) },
      liabilities: al.liabilities ?? [],
    });
  }, [returnData]);

  const update = useCallback((fn: (prev: ALState) => ALState) => {
    setState(prev => {
      const next = fn(prev);
      setDirty(true);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => persist(next), 2000);
      return next;
    });
  }, [setDirty]);

  async function persist(s: ALState) {
    await fetch(`/api/returns/${returnId}/schedule/assetsLiabilities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    }).catch(() => null);
  }

  async function handleSave() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setSaving(true); setSaveMsg('');
    try {
      await persist(state);
      setSaveMsg('Saved');
      setDirty(false);
      onSaved({ ...returnData, assetsLiabilities: state } as any);
    } catch {
      setSaveMsg('Error saving');
    } finally {
      setSaving(false);
    }
  }

  const movableLabels: { key: keyof MovableAssets; label: string; note?: string }[] = [
    { key: 'jewellery',               label: 'Jewellery, bullion, and other precious items' },
    { key: 'archaeologicalCollections', label: 'Archaeological collections, drawings, paintings, sculptures, art' },
    { key: 'vehicles',                label: 'Vehicles, yachts, boats, and aircraft' },
    { key: 'bankDeposits',            label: 'Bank deposits (current + savings + FD)', note: '(i)' },
    { key: 'sharesSecurities',        label: 'Shares and securities', note: '(ii)' },
    { key: 'insurancePolicies',       label: 'Insurance policies (surrender value / sum assured)', note: '(iii)' },
    { key: 'loansAdvances',           label: 'Loans and advances given', note: '(iv)' },
    { key: 'cashInHand',              label: 'Cash in hand (in excess of ₹1L not deposited in bank)', note: '(v)' },
    { key: 'otherMovable',            label: 'Other movable assets' },
  ];

  const ta = totalAssets(state);
  const tl = totalLiabilities(state);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: 'var(--brand-primary)', color: '#000', padding: '2px 6px', borderRadius: '3px' }}>AL</span>
        <div>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Assets &amp; Liabilities</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>Mandatory when total income exceeds ₹50 lakhs</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveMsg && <span style={{ fontSize: '11px', color: saveMsg === 'Saved' ? 'var(--success)' : 'var(--error)' }}>{saveMsg}</span>}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {/* ── Applicability Banner ── */}
      {grossTotalIncome > 0 && (
        <div style={{
          padding: '10px 20px',
          background: grossTotalIncome > 5000000
            ? 'rgba(224, 92, 75, 0.08)'
            : 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '12px',
          flexShrink: 0,
        }}>
          {grossTotalIncome > 5000000 ? (
            <>
              <span style={{ fontWeight: 700, color: 'var(--error, #e05c4b)', fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'rgba(224,92,75,0.15)', padding: '2px 6px', borderRadius: '3px' }}>MANDATORY</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                Schedule AL is required — gross total income of{' '}
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>₹{grossTotalIncome.toLocaleString('en-IN')}</strong>
                {' '}exceeds the ₹50 lakh threshold. Disclose all assets and liabilities as at 31 March.
              </span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border-subtle)' }}>NOT REQUIRED</span>
              <span style={{ color: 'var(--text-muted)' }}>
                Gross total income of{' '}
                <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{grossTotalIncome.toLocaleString('en-IN')}</strong>
                {' '}is below ₹50 lakhs. Schedule AL is optional unless income later increases.
              </span>
            </>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ── Part A: Immovable Property ── */}
        <section>
          <div className="itr-schedule-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="schedule-badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>Part A</span>
              <span className="schedule-title">Immovable Property</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Land, building, flat — at cost of acquisition</span>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() =>
              update(p => ({ ...p, immovable: [...p.immovable, { id: uid(), description: '', ownershipType: 'SELF', costOfAcquisition: 0, assetsShare: 0 }] }))
            }>+ Add Property</button>
          </div>

          <table className="itr-form" style={{ width: '100%' }}>
            <thead>
              <tr className="itr-section-head">
                <th style={{ width: '28px' }}>#</th>
                <th>Description / Address</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Ownership</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Cost of Acquisition (₹)</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Amount (Assessee's share) (₹)</th>
                <th style={{ width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {state.immovable.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No immovable property added.</td></tr>
              ) : state.immovable.map((e, i) => (
                <tr key={e.id} className="itr-row">
                  <td className="itr-num">{i + 1}</td>
                  <td className="itr-label">
                    <TxtInput value={e.description} onChange={v => update(p => ({ ...p, immovable: p.immovable.map((x, j) => j === i ? { ...x, description: v } : x) }))} placeholder="Plot no., address, building name…" />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <select
                      value={e.ownershipType}
                      onChange={ev => update(p => ({ ...p, immovable: p.immovable.map((x, j) => j === i ? { ...x, ownershipType: ev.target.value as 'SELF' | 'JOINT' } : x) }))}
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }}
                    >
                      <option value="SELF">Self</option>
                      <option value="JOINT">Joint</option>
                    </select>
                  </td>
                  <td className="itr-amount">
                    <NumInput value={e.costOfAcquisition} onChange={v => update(p => ({ ...p, immovable: p.immovable.map((x, j) => j === i ? { ...x, costOfAcquisition: v, assetsShare: e.ownershipType === 'SELF' ? v : x.assetsShare } : x) }))} />
                  </td>
                  <td className="itr-amount">
                    <NumInput value={e.assetsShare} onChange={v => update(p => ({ ...p, immovable: p.immovable.map((x, j) => j === i ? { ...x, assetsShare: v } : x) }))} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '0 4px' }} onClick={() => update(p => ({ ...p, immovable: p.immovable.filter((_, j) => j !== i) }))}>✕</button>
                  </td>
                </tr>
              ))}
              {state.immovable.length > 0 && (
                <tr className="itr-row subtotal">
                  <td colSpan={4} className="itr-label" style={{ textAlign: 'right', fontWeight: 600 }}>Total Immovable (Part A)</td>
                  <td className="itr-amount" style={{ fontWeight: 700, color: 'var(--brand-text)' }}>{fmt(totalImmovable(state))}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* ── Part B: Movable Assets ── */}
        <section>
          <div className="itr-schedule-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="schedule-badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>Part B</span>
            <span className="schedule-title">Movable Assets</span>
          </div>

          <table className="itr-form" style={{ width: '100%' }}>
            <thead>
              <tr className="itr-section-head">
                <th></th>
                <th>Category</th>
                <th style={{ width: '200px', textAlign: 'right' }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {movableLabels.map(({ key, label, note }) => (
                <tr key={key} className="itr-row">
                  <td className="itr-num" style={{ color: 'var(--text-muted)', width: '28px' }}>{note ?? ''}</td>
                  <td className="itr-label">{label}</td>
                  <td className="itr-amount">
                    <NumInput value={state.movable[key]} onChange={v => update(p => ({ ...p, movable: { ...p.movable, [key]: v } }))} />
                  </td>
                </tr>
              ))}
              <tr className="itr-row subtotal">
                <td colSpan={2} className="itr-label" style={{ textAlign: 'right', fontWeight: 600 }}>Total Movable (Part B)</td>
                <td className="itr-amount" style={{ fontWeight: 700, color: 'var(--brand-text)' }}>{fmt(totalMovable(state))}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ── Part C: Liabilities ── */}
        <section>
          <div className="itr-schedule-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="schedule-badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>Part C</span>
              <span className="schedule-title">Liabilities</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>In relation to assets at Part A and B</span>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() =>
              update(p => ({ ...p, liabilities: [...p.liabilities, { id: uid(), description: '', amount: 0 }] }))
            }>+ Add</button>
          </div>

          <table className="itr-form" style={{ width: '100%' }}>
            <thead>
              <tr className="itr-section-head">
                <th style={{ width: '28px' }}>#</th>
                <th>Description (lender name / loan type)</th>
                <th style={{ width: '200px', textAlign: 'right' }}>Amount (₹)</th>
                <th style={{ width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {state.liabilities.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No liabilities added.</td></tr>
              ) : state.liabilities.map((e, i) => (
                <tr key={e.id} className="itr-row">
                  <td className="itr-num">{i + 1}</td>
                  <td className="itr-label">
                    <TxtInput value={e.description} onChange={v => update(p => ({ ...p, liabilities: p.liabilities.map((x, j) => j === i ? { ...x, description: v } : x) }))} placeholder="e.g. Home loan — SBI, Personal loan — HDFC" />
                  </td>
                  <td className="itr-amount">
                    <NumInput value={e.amount} onChange={v => update(p => ({ ...p, liabilities: p.liabilities.map((x, j) => j === i ? { ...x, amount: v } : x) }))} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '0 4px' }} onClick={() => update(p => ({ ...p, liabilities: p.liabilities.filter((_, j) => j !== i) }))}>✕</button>
                  </td>
                </tr>
              ))}
              {state.liabilities.length > 0 && (
                <tr className="itr-row subtotal">
                  <td colSpan={2} className="itr-label" style={{ textAlign: 'right', fontWeight: 600 }}>Total Liabilities (Part C)</td>
                  <td className="itr-amount" style={{ fontWeight: 700, color: 'var(--error)' }}>{fmt(tl)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* ── Net Worth Summary ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
          {[
            { label: 'Part A — Immovable',  val: totalImmovable(state), color: undefined },
            { label: 'Part B — Movable',    val: totalMovable(state),   color: undefined },
            { label: 'Part C — Liabilities', val: tl,                   color: tl ? 'var(--error)' : undefined },
          ].map((item, i, arr) => (
            <div key={item.label} style={{ flex: 1, padding: '10px 14px', borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : undefined }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: item.color ?? (item.val ? 'var(--text-primary)' : 'var(--text-muted)'), fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{fmt(item.val)}</div>
            </div>
          ))}
          <div style={{ padding: '10px 14px', background: 'rgba(212,160,23,0.08)', borderLeft: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net Worth (A + B − C)</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: (ta - tl) >= 0 ? 'var(--brand-text)' : 'var(--error)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{fmt(ta - tl)}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
