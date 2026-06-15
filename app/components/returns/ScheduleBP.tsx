'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ReturnData } from '@/shared/types/itr';
import { FieldMessage } from './ValidationContext';
import { BUSINESS_CODES_44AD, PROFESSION_CODES_44ADA, type NatureCode } from '@/app/lib/itrCodes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Business44ADEntry {
  id: string;
  tradeName: string;
  natureCode: string;
  turnoverCash: number;
  turnoverDigital: number;
  presumptiveIncome: number;
  gstin: string;
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
  ownedOrHired: 'OWN' | 'HRD';
  dateOfPurchase: string;
  isHeavy: boolean;
  ownedMonths: number;
  grossWeight: number;
  presumptiveIncome: number;
}

interface GSTEntry {
  id: string;
  gstin: string;
  grossReceiptsAsPerGST: number;
}

interface Form10IEA {
  optOut: boolean;
  ackNo: string;
  dateOfFiling: string;
}

interface BPState {
  business44AD: Business44ADEntry[];
  profession44ADA: Profession44ADAEntry[];
  goodsCarriage44AE: GoodsCarriage44AEEntry[];
  gstEntries: GSTEntry[];
  form10IEA: Form10IEA;
}

function uid() { return Math.random().toString(36).slice(2); }

function defaultState(): BPState {
  return {
    business44AD: [],
    profession44ADA: [],
    goodsCarriage44AE: [],
    gstEntries: [],
    form10IEA: { optOut: false, ackNo: '', dateOfFiling: '' },
  };
}

function computeBiz44ADIncome(e: Business44ADEntry): number {
  return Math.round(e.turnoverCash * 0.08 + e.turnoverDigital * 0.06);
}

function totalPresumptive(state: BPState): number {
  return (
    state.business44AD.reduce((s, e) => s + e.presumptiveIncome, 0) +
    state.profession44ADA.reduce((s, e) => s + e.presumptiveIncome, 0) +
    state.goodsCarriage44AE.reduce((s, e) => s + e.presumptiveIncome, 0)
  );
}

function bizTurnover(e: Business44ADEntry): number {
  return e.turnoverCash + e.turnoverDigital;
}

function fmt(n: number) {
  if (!n && n !== 0) return '—';
  return '₹' + n.toLocaleString('en-IN');
}

// ─── Searchable Code Dropdown ─────────────────────────────────────────────────

interface CodeSelectProps {
  value: string;
  onChange: (code: string, description: string) => void;
  codes: NatureCode[];
  placeholder?: string;
}

function CodeSelect({ value, onChange, codes, placeholder = 'Select nature code…' }: CodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = codes.find(c => c.code === value);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim()
    ? codes.filter(c =>
        c.code.includes(query) ||
        c.description.toLowerCase().includes(query.toLowerCase()) ||
        c.group.toLowerCase().includes(query.toLowerCase())
      )
    : codes;

  // Group the filtered results
  const groups: Record<string, NatureCode[]> = {};
  for (const c of filtered) {
    (groups[c.group] ??= []).push(c);
  }

  function select(c: NatureCode) {
    onChange(c.code, c.description);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 10px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '5px',
          cursor: 'pointer',
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: '13px',
          textAlign: 'left',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
      >
        {selected ? (
          <>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700,
              background: 'rgba(212,160,23,0.15)', color: 'var(--brand-text)',
              padding: '1px 5px', borderRadius: '3px', flexShrink: 0,
            }}>{selected.code}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.description}
            </span>
          </>
        ) : (
          <span>{placeholder}</span>
        )}
        <svg style={{ marginLeft: 'auto', flexShrink: 0, opacity: 0.4 }} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 999,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          maxHeight: '280px', display: 'flex', flexDirection: 'column',
          minWidth: '320px',
        }}>
          {/* Search */}
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="5.5" cy="5.5" r="4" /><line x1="9" y1="9" x2="12" y2="12" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search code or description…"
                style={{
                  width: '100%', padding: '6px 8px 6px 28px',
                  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
                  borderRadius: '4px', color: 'var(--text-primary)', fontSize: '12px',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Results */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                No matching codes
              </div>
            ) : Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div style={{
                  padding: '5px 10px 3px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                  color: 'var(--text-muted)', textTransform: 'uppercase',
                  background: 'var(--bg-surface)',
                }}>
                  {group}
                </div>
                {items.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => select(c)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '7px 10px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      color: c.code === value ? 'var(--brand-text)' : 'var(--text-primary)',
                      fontSize: '12px',
                      backgroundColor: c.code === value ? 'rgba(212,160,23,0.08)' : 'transparent',
                    } as any}
                    onMouseEnter={e => { if (c.code !== value) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = c.code === value ? 'rgba(212,160,23,0.08)' : 'transparent'; }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                      background: 'rgba(212,160,23,0.12)', color: 'var(--brand-text)',
                      padding: '1px 5px', borderRadius: '3px', flexShrink: 0, minWidth: '38px',
                      textAlign: 'center',
                    }}>{c.code}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.description}
                    </span>
                    {c.code === value && (
                      <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--brand-text)" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ badge, title, hint, onAdd, addLabel = '+ Add Entry' }: {
  badge: string; title: string; hint: string; onAdd: () => void; addLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700,
        background: 'rgba(212,160,23,0.15)', color: 'var(--brand-text)',
        padding: '2px 7px', borderRadius: '4px', letterSpacing: '0.04em',
      }}>{badge}</span>
      <div>
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{hint}</span>
      </div>
      <button className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }} onClick={onAdd}>
        {addLabel}
      </button>
    </div>
  );
}

// ─── Amount input ─────────────────────────────────────────────────────────────

function AmtInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) {
  return (
    <div>
      {label && <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--text-muted)' }}>₹</span>
        <input
          type="number"
          value={value || ''}
          min={0}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            width: '100%', padding: '7px 8px 7px 20px',
            background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
            borderRadius: '5px', color: 'var(--text-primary)',
            fontSize: '13px', fontFamily: 'var(--font-mono)',
            outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--brand-primary)'}
          onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
        />
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
      {children}
    </div>
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

  // Hydrate from returnData — handles both:
  //   - in-session format set by onSaved (presumptiveIncome with parsed arrays)
  //   - raw API format (presumptiveSchedule with JSON strings from DB)
  useEffect(() => {
    const pi = (returnData as any).presumptiveIncome
            ?? (returnData as any).presumptiveSchedule;
    if (!pi) return;

    const parseArr = (v: unknown): any[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
      return [];
    };
    const parseObj = (v: unknown, def: object): object => {
      if (!v) return def;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return def; } }
      return v as object;
    };

    setState({
      business44AD:      parseArr(pi.Business44AD      ?? pi.business44ADJson),
      profession44ADA:   parseArr(pi.Profession44ADA   ?? pi.profession44ADAJson),
      goodsCarriage44AE: parseArr(pi.GoodsCarriage44AE ?? pi.goodsCarriage44AEJson),
      gstEntries:        parseArr(pi.GSTEntries        ?? pi.gstEntriesJson),
      form10IEA: parseObj(
        pi.Form10IEA ?? pi.form10IEAJson,
        { optOut: false, ackNo: '', dateOfFiling: '' }
      ) as Form10IEA,
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
        gstEntriesJson:        JSON.stringify(s.gstEntries),
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

  // Helpers to update an entry by index
  function updateBiz(i: number, patch: Partial<Business44ADEntry>) {
    update(p => ({ ...p, business44AD: p.business44AD.map((x, j) => j === i ? { ...x, ...patch } : x) }));
  }
  function updateProf(i: number, patch: Partial<Profession44ADAEntry>) {
    update(p => ({ ...p, profession44ADA: p.profession44ADA.map((x, j) => j === i ? { ...x, ...patch } : x) }));
  }
  function updateGC(i: number, patch: Partial<GoodsCarriage44AEEntry>) {
    update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.map((x, j) => j === i ? { ...x, ...patch } : x) }));
  }

  const totalPI = totalPresumptive(state);
  const biz44  = state.business44AD.reduce((s, e) => s + e.presumptiveIncome, 0);
  const prof44 = state.profession44ADA.reduce((s, e) => s + e.presumptiveIncome, 0);
  const gc44   = state.goodsCarriage44AE.reduce((s, e) => s + e.presumptiveIncome, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700,
          background: 'var(--brand-primary)', color: '#000', padding: '2px 6px', borderRadius: '3px',
        }}>BP</span>
        <div>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
            Business &amp; Profession
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            Presumptive income u/s 44AD / 44ADA / 44AE
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveMsg && (
            <span style={{ fontSize: '11px', color: saveMsg === 'Saved' ? 'var(--status-success)' : 'var(--status-error)' }}>
              {saveMsg}
            </span>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* ── 44AD: Business ── */}
        <section>
          <SectionHeader
            badge="44AD"
            title="Business Income"
            hint="Turnover ≤ ₹3 Cr · 8% cash / 6% digital receipts"
            onAdd={() => update(p => ({
              ...p,
              business44AD: [...p.business44AD, {
                id: uid(), tradeName: '', natureCode: '', turnoverCash: 0, turnoverDigital: 0, presumptiveIncome: 0, gstin: '',
              }],
            }))}
          />

          {state.business44AD.length === 0 ? (
            <div style={{
              padding: '24px', textAlign: 'center', border: '1px dashed var(--border-subtle)',
              borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px',
            }}>
              No business entries yet. Click <strong>+ Add Entry</strong> to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {state.business44AD.map((e, i) => {
                const computed = computeBiz44ADIncome(e);
                const total = bizTurnover(e);
                return (
                  <div key={e.id} style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px',
                  }}>
                    {/* Row 1: name, nature, GSTIN */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <FieldLabel>Trade / Business Name</FieldLabel>
                        <input className="form-input" value={e.tradeName} placeholder="e.g. Sharma Traders"
                          onChange={ev => updateBiz(i, { tradeName: ev.target.value })} />
                        <FieldMessage field={`bp.44ad.${i}.tradeName`} />
                      </div>
                      <div>
                        <FieldLabel>Nature of Business</FieldLabel>
                        <CodeSelect value={e.natureCode} codes={BUSINESS_CODES_44AD}
                          onChange={(code) => updateBiz(i, { natureCode: code })} />
                        <FieldMessage field={`bp.44ad.${i}.natureCode`} />
                      </div>
                      <div>
                        <FieldLabel>GSTIN (if registered)</FieldLabel>
                        <input className="form-input" value={e.gstin} placeholder="e.g. 29ABCDE1234F1Z5"
                          style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
                          onChange={ev => updateBiz(i, { gstin: ev.target.value.toUpperCase() })} />
                      </div>
                    </div>
                    {/* Row 2: cash turnover, digital turnover, presumptive income */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                      <div>
                        <FieldLabel>Cash Receipts — 8%</FieldLabel>
                        <AmtInput value={e.turnoverCash} onChange={v => {
                          const pi = Math.round(v * 0.08 + e.turnoverDigital * 0.06);
                          updateBiz(i, { turnoverCash: v, presumptiveIncome: pi });
                        }} />
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                          {e.turnoverCash > 0 ? `8% = ${fmt(Math.round(e.turnoverCash * 0.08))}` : 'Receipts by cash/cheque'}
                        </div>
                        <FieldMessage field={`bp.44ad.${i}.turnoverCash`} />
                      </div>
                      <div>
                        <FieldLabel>Digital Receipts — 6%</FieldLabel>
                        <AmtInput value={e.turnoverDigital} onChange={v => {
                          const pi = Math.round(e.turnoverCash * 0.08 + v * 0.06);
                          updateBiz(i, { turnoverDigital: v, presumptiveIncome: pi });
                        }} />
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                          {e.turnoverDigital > 0 ? `6% = ${fmt(Math.round(e.turnoverDigital * 0.06))}` : 'Bank / digital receipts'}
                        </div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <FieldLabel>Presumptive Income</FieldLabel>
                          {total > 0 && e.presumptiveIncome !== computed && (
                            <button type="button" onClick={() => updateBiz(i, { presumptiveIncome: computed })}
                              style={{ fontSize: '9px', background: 'none', border: 'none', color: 'var(--brand-text)', cursor: 'pointer', padding: 0 }}>
                              ↺ {fmt(computed)}
                            </button>
                          )}
                        </div>
                        <AmtInput value={e.presumptiveIncome} onChange={v => updateBiz(i, { presumptiveIncome: v })} />
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                          {total > 0 ? `Total turnover ${fmt(total)} · auto = ${fmt(computed)}` : 'Enter turnover above'}
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-error)', padding: '4px 8px' }}
                        onClick={() => update(p => ({ ...p, business44AD: p.business44AD.filter((_, j) => j !== i) }))}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              {state.business44AD.length > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', padding: '8px 12px',
                  background: 'rgba(212,160,23,0.05)', borderRadius: '6px',
                  border: '1px solid rgba(212,160,23,0.15)',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total 44AD Income&nbsp;</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand-text)', fontFamily: 'var(--font-mono)' }}>{fmt(biz44)}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 44ADA: Profession ── */}
        <section>
          <SectionHeader
            badge="44ADA"
            title="Professional Income"
            hint="Gross receipts ≤ ₹75 L · 50% presumptive"
            onAdd={() => update(p => ({
              ...p,
              profession44ADA: [...p.profession44ADA, {
                id: uid(), professionName: '', professionCode: '', grossReceipts: 0, presumptiveIncome: 0,
              }],
            }))}
          />

          {state.profession44ADA.length === 0 ? (
            <div style={{
              padding: '24px', textAlign: 'center', border: '1px dashed var(--border-subtle)',
              borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px',
            }}>
              No profession entries yet. Click <strong>+ Add Entry</strong> to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {state.profession44ADA.map((e, i) => {
                const computed = Math.round(e.grossReceipts * 0.5);
                return (
                  <div key={e.id} style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '14px 16px',
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'end',
                  }}>
                    {/* Profession name */}
                    <div>
                      <FieldLabel>Description / Name</FieldLabel>
                      <input
                        className="form-input"
                        value={e.professionName}
                        placeholder="e.g. Medical Practice"
                        onChange={ev => updateProf(i, { professionName: ev.target.value })}
                      />
                    </div>

                    {/* Profession code dropdown */}
                    <div>
                      <FieldLabel>Nature of Profession</FieldLabel>
                      <CodeSelect
                        value={e.professionCode}
                        codes={PROFESSION_CODES_44ADA}
                        onChange={(code) => updateProf(i, { professionCode: code })}
                        placeholder="Select profession code…"
                      />
                    </div>

                    {/* Gross receipts */}
                    <div>
                      <FieldLabel>Gross Receipts</FieldLabel>
                      <AmtInput
                        value={e.grossReceipts}
                        onChange={gr => updateProf(i, { grossReceipts: gr, presumptiveIncome: Math.round(gr * 0.5) })}
                      />
                    </div>

                    {/* Presumptive income */}
                    <div style={{ minWidth: '160px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <FieldLabel>Presumptive (50%)</FieldLabel>
                        {e.grossReceipts > 0 && e.presumptiveIncome !== computed && (
                          <button
                            type="button"
                            onClick={() => updateProf(i, { presumptiveIncome: computed })}
                            style={{ fontSize: '9px', background: 'none', border: 'none', color: 'var(--brand-text)', cursor: 'pointer', padding: 0 }}
                          >
                            ↺ {fmt(computed)}
                          </button>
                        )}
                      </div>
                      <AmtInput
                        value={e.presumptiveIncome}
                        onChange={v => updateProf(i, { presumptiveIncome: v })}
                      />
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {e.grossReceipts > 0 ? `50% × ${fmt(e.grossReceipts)} = ${fmt(computed)}` : 'Enter receipts to auto-compute'}
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--status-error)', padding: '2px 6px', marginTop: '4px', alignSelf: 'flex-end', display: 'block' }}
                        onClick={() => update(p => ({ ...p, profession44ADA: p.profession44ADA.filter((_, j) => j !== i) }))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              {state.profession44ADA.length > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', padding: '8px 12px',
                  background: 'rgba(212,160,23,0.05)', borderRadius: '6px',
                  border: '1px solid rgba(212,160,23,0.15)',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total 44ADA Income&nbsp;</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand-text)', fontFamily: 'var(--font-mono)' }}>{fmt(prof44)}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 44AE: Goods Carriage ── */}
        <section>
          <SectionHeader
            badge="44AE"
            title="Goods Carriage"
            hint="Heavy (≥12T): ₹1,000/T/month · Others: ₹7,500/vehicle/month"
            onAdd={() => update(p => ({
              ...p,
              goodsCarriage44AE: [...p.goodsCarriage44AE, {
                id: uid(), vehicleRegNo: '', ownedOrHired: 'OWN' as const, dateOfPurchase: '', isHeavy: false, ownedMonths: 12, grossWeight: 0, presumptiveIncome: 0,
              }],
            }))}
          />

          {state.goodsCarriage44AE.length === 0 ? (
            <div style={{
              padding: '24px', textAlign: 'center', border: '1px dashed var(--border-subtle)',
              borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px',
            }}>
              No vehicles added. Click <strong>+ Add Entry</strong> to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {state.goodsCarriage44AE.map((e, i) => {
                const computed = e.isHeavy
                  ? e.ownedMonths * 1000 * (e.grossWeight || 16)
                  : e.ownedMonths * 7500;
                return (
                  <div key={e.id} style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px',
                  }}>
                    {/* Row 1: Reg No, Owned/Hired, Date of Purchase, Heavy type */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 150px 160px', gap: '12px', alignItems: 'end' }}>
                      <div>
                        <FieldLabel>Vehicle Reg. No.</FieldLabel>
                        <input className="form-input" value={e.vehicleRegNo} placeholder="e.g. MH12AB1234"
                          onChange={ev => updateGC(i, { vehicleRegNo: ev.target.value.toUpperCase() })}
                          style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }} />
                      </div>
                      <div>
                        <FieldLabel>Owned / Hired</FieldLabel>
                        <select className="form-input" value={e.ownedOrHired}
                          onChange={ev => updateGC(i, { ownedOrHired: ev.target.value as 'OWN' | 'HRD' })}
                          style={{ fontSize: '13px' }}>
                          <option value="OWN">Owned</option>
                          <option value="HRD">Hired</option>
                        </select>
                      </div>
                      <div>
                        <FieldLabel>Date of Purchase ★</FieldLabel>
                        <input type="date" className="form-input" value={e.dateOfPurchase}
                          style={{ borderColor: !e.dateOfPurchase ? 'var(--error)' : undefined }}
                          onChange={ev => updateGC(i, { dateOfPurchase: ev.target.value })} />
                      </div>
                      <div>
                        <FieldLabel>Vehicle Type</FieldLabel>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer',
                          padding: '7px 10px', background: 'var(--bg-base)',
                          border: '1px solid var(--border-subtle)', borderRadius: '5px', fontSize: '12px' }}>
                          <input type="checkbox" checked={e.isHeavy} style={{ accentColor: 'var(--brand-primary)' }}
                            onChange={ev => {
                              const isHeavy = ev.target.checked;
                              const pi = isHeavy ? e.ownedMonths * 1000 * (e.grossWeight || 16) : e.ownedMonths * 7500;
                              updateGC(i, { isHeavy, presumptiveIncome: pi });
                            }} />
                          <span>{e.isHeavy ? 'Heavy (≥12T) — ₹1,000/T/mo' : 'Light/Medium — ₹7,500/mo'}</span>
                        </label>
                      </div>
                    </div>
                    {/* Row 2: Weight, Months, Income */}
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 160px 1fr auto', gap: '12px', alignItems: 'end' }}>
                      <div style={{ opacity: e.isHeavy ? 1 : 0.4, pointerEvents: e.isHeavy ? 'auto' : 'none' }}>
                        <FieldLabel>Gross Weight (tonnes)</FieldLabel>
                        <input type="number" min={12} className="form-input" value={e.grossWeight || ''}
                          placeholder="e.g. 18" style={{ fontFamily: 'var(--font-mono)' }}
                          onChange={ev => {
                            const grossWeight = Number(ev.target.value);
                            const pi = e.isHeavy ? e.ownedMonths * 1000 * grossWeight : e.ownedMonths * 7500;
                            updateGC(i, { grossWeight, presumptiveIncome: pi });
                          }} />
                      </div>
                      <div>
                        <FieldLabel>Months in Use</FieldLabel>
                        <input type="number" min={1} max={12} className="form-input" value={e.ownedMonths || ''}
                          style={{ fontFamily: 'var(--font-mono)' }}
                          onChange={ev => {
                            const months = Math.min(12, Math.max(1, Number(ev.target.value)));
                            const pi = e.isHeavy ? months * 1000 * (e.grossWeight || 16) : months * 7500;
                            updateGC(i, { ownedMonths: months, presumptiveIncome: pi });
                          }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <FieldLabel>Presumptive Income</FieldLabel>
                          {e.presumptiveIncome !== computed && (
                            <button type="button" onClick={() => updateGC(i, { presumptiveIncome: computed })}
                              style={{ fontSize: '9px', background: 'none', border: 'none', color: 'var(--brand-text)', cursor: 'pointer', padding: 0 }}>
                              ↺ {fmt(computed)}
                            </button>
                          )}
                        </div>
                        <AmtInput value={e.presumptiveIncome} onChange={v => updateGC(i, { presumptiveIncome: v })} />
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                          {e.isHeavy
                            ? `${e.ownedMonths} mo × ₹1,000 × ${e.grossWeight || '?'}T = ${fmt(computed)}`
                            : `${e.ownedMonths} mo × ₹7,500 = ${fmt(computed)}`}
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-error)', padding: '4px 8px' }}
                        onClick={() => update(p => ({ ...p, goodsCarriage44AE: p.goodsCarriage44AE.filter((_, j) => j !== i) }))}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              {state.goodsCarriage44AE.length > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', padding: '8px 12px',
                  background: 'rgba(212,160,23,0.05)', borderRadius: '6px',
                  border: '1px solid rgba(212,160,23,0.15)',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total 44AE Income&nbsp;</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand-text)', fontFamily: 'var(--font-mono)' }}>{fmt(gc44)}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Total BP Income strip ── */}
        {totalPI > 0 && (
          <div style={{
            display: 'flex', gap: 0,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: '8px', overflow: 'hidden',
          }}>
            {[
              { label: '44AD Business', val: biz44 },
              { label: '44ADA Profession', val: prof44 },
              { label: '44AE Goods Carriage', val: gc44 },
            ].map((item, i, arr) => (
              <div key={item.label} style={{
                flex: 1, padding: '10px 14px',
                borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : undefined,
              }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: item.val ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '2px' }}>
                  {item.val ? fmt(item.val) : '—'}
                </div>
              </div>
            ))}
            <div style={{ padding: '10px 16px', background: 'rgba(212,160,23,0.08)', borderLeft: '1px solid rgba(212,160,23,0.2)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total BP Income</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--brand-text)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{fmt(totalPI)}</div>
            </div>
          </div>
        )}

        {/* ── Schedule GST ── */}
        <section>
          <SectionHeader
            badge="GST"
            title="GST Registration"
            hint="Mandatory for GST-registered businesses — GSTIN + gross receipts as per GST returns"
            onAdd={() => update(p => ({
              ...p,
              gstEntries: [...p.gstEntries, { id: uid(), gstin: '', grossReceiptsAsPerGST: 0 }],
            }))}
          />
          {state.gstEntries.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', border: '1px dashed var(--border-subtle)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Not GST registered? Leave this blank. Otherwise click <strong>+ Add Entry</strong> for each GSTIN.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {state.gstEntries.map((g, i) => (
                <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px 14px' }}>
                  <div>
                    <FieldLabel>GSTIN ★</FieldLabel>
                    <input className="form-input" value={g.gstin} placeholder="e.g. 29ABCDE1234F1Z5"
                      style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                        borderColor: !g.gstin ? 'var(--error)' : undefined }}
                      onChange={ev => update(p => ({ ...p, gstEntries: p.gstEntries.map((x, j) => j === i ? { ...x, gstin: ev.target.value.toUpperCase() } : x) }))} />
                  </div>
                  <AmtInput label="Gross Receipts as per GST ★"
                    value={g.grossReceiptsAsPerGST}
                    onChange={v => update(p => ({ ...p, gstEntries: p.gstEntries.map((x, j) => j === i ? { ...x, grossReceiptsAsPerGST: v } : x) }))} />
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-error)', padding: '4px 8px' }}
                    onClick={() => update(p => ({ ...p, gstEntries: p.gstEntries.filter((_, j) => j !== i) }))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Form 10-IEA ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700,
              background: 'rgba(212,160,23,0.15)', color: 'var(--brand-text)',
              padding: '2px 7px', borderRadius: '4px',
            }}>10-IEA</span>
            <div>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>Regime Declaration</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                Opt out of new tax regime u/s 115BAC(1A)
              </span>
            </div>
            {totalPI > 0 && (
              regime === 'OLD'
                ? <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: 700, background: 'rgba(212,160,23,0.2)', color: 'var(--brand-text)', padding: '2px 7px', borderRadius: '3px' }}>
                    APPLICABLE — Old Regime
                  </span>
                : <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: 700, background: 'var(--bg-elevated)', color: 'var(--text-muted)', padding: '2px 7px', borderRadius: '3px', border: '1px solid var(--border-subtle)' }}>
                    NOT REQUIRED — New Regime
                  </span>
            )}
          </div>

          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: '8px', padding: '16px',
            opacity: regime !== 'OLD' ? 0.5 : 1,
            pointerEvents: regime !== 'OLD' ? 'none' : undefined,
          }}>
            {regime !== 'OLD' ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                Form 10-IEA is only applicable when the <strong>Old Tax Regime</strong> is selected. Switch the regime in the return header to enable this section.
              </p>
            ) : (
              <>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={state.form10IEA.optOut}
                    onChange={ev => update(p => ({ ...p, form10IEA: { ...p.form10IEA, optOut: ev.target.checked } }))}
                    style={{ marginTop: '2px', accentColor: 'var(--brand-primary)' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    I have filed Form 10-IEA to opt out of section 115BAC (new tax regime) and choose the old regime for this assessment year.
                  </span>
                </label>

                {state.form10IEA.optOut && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div>
                      <FieldLabel>Acknowledgement Number</FieldLabel>
                      <input
                        className="form-input"
                        value={state.form10IEA.ackNo}
                        placeholder="e.g. 12345678901234"
                        onChange={e => update(p => ({ ...p, form10IEA: { ...p.form10IEA, ackNo: e.target.value } }))}
                      />
                      <FieldMessage field="bp.10iea.ackNo" />
                    </div>
                    <div>
                      <FieldLabel>Date of Filing</FieldLabel>
                      <input
                        className="form-input"
                        type="date"
                        value={state.form10IEA.dateOfFiling}
                        onChange={e => update(p => ({ ...p, form10IEA: { ...p.form10IEA, dateOfFiling: e.target.value } }))}
                      />
                      <FieldMessage field="bp.10iea.dateOfFiling" />
                    </div>
                  </div>
                )}

                {!state.form10IEA.optOut && (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '12px 0 0', lineHeight: 1.5 }}>
                    Individuals with business income cannot switch regimes each year. Form 10-IEA locks in your choice. Check the box above if you want to be taxed under the old regime this year.
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
