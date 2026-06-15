'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { ReturnData, STCG111AEntry, STCGOtherEntry } from '@/shared/types/itr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LTCG112AEntry {
  id: string;
  isin: string;
  shareOrUnitName: string;
  purchaseDate: string;
  saleDate: string;
  salesValue: number;
  purchaseCost: number;
  fmvAsOn31Jan2018: number;
  expenditure: number;
  gainLoss: number;
}

interface LTCGOtherEntry {
  id: string;
  assetDesc: string;
  purchaseDate: string;
  saleDate: string;
  salesValue: number;
  purchaseCost: number;
  expenditure: number;
  gainLoss: number;
}

interface CGState {
  ltcg112A: LTCG112AEntry[];
  ltcgOther: LTCGOtherEntry[];
  stcg111A: STCG111AEntry[];
  stcgOther: STCGOtherEntry[];
}

interface AISCapitalGain {
  securityName: string;
  assetType: string;
  salesConsideration: number;
  costOfAcquisition: number;
  fmvValue: number;
  transferDate?: string;
  purchaseDate?: string;
}

const LTCG_EXEMPTION = 125_000;

function uid() {
  return Math.random().toString(36).slice(2);
}

// Normalise AIS date strings (DD/MM/YYYY or DD-MM-YYYY) to YYYY-MM-DD for <input type="date">
function toInputDate(raw?: string): string {
  if (!raw) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

function calcLTCGGain(e: LTCG112AEntry): number {
  // Grandfathering: effective cost = max(purchase cost, FMV on 31-Jan-2018)
  const effectiveCost = e.fmvAsOn31Jan2018 > 0
    ? Math.max(e.purchaseCost, e.fmvAsOn31Jan2018)
    : e.purchaseCost;
  return e.salesValue - effectiveCost - e.expenditure;
}

function calcLTCGOtherGain(e: LTCGOtherEntry): number {
  return e.salesValue - e.purchaseCost - e.expenditure;
}

function calc111AGain(e: STCG111AEntry): number {
  return e.salesValue - e.purchaseCost - e.expenditure;
}

function calcOtherGain(e: STCGOtherEntry): number {
  return e.salesValue - e.purchaseCost - e.expenditure;
}

function defaultState(): CGState {
  return { ltcg112A: [], ltcgOther: [], stcg111A: [], stcgOther: [] };
}

// Classify AIS capital gain into one of 4 buckets
// Returns holding period in months between two yyyy-mm-dd date strings
function holdingMonths(from: string, to: string): number {
  const a = new Date(from), b = new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
    + (b.getDate() >= a.getDate() ? 0 : -1);
}

function classifyAISGain(cg: AISCapitalGain): 'ltcg112A' | 'ltcgOther' | 'stcg111A' | 'stcgOther' {
  const t = (cg.assetType || '').toUpperCase();
  const n = (cg.securityName || '').toUpperCase();
  // Listed equity shares and equity-oriented MF → 112A / 111A
  const isEquity = t.includes('EQUITY') || n.includes('EQUITY SHARES') || n.includes('EQUITY MF') || n.includes('EQUITY SHARE');
  // Debt MF (post-Apr 2023 Finance Act amendment) → always stcgOther regardless of holding
  const isDebtMF = t.includes('DEBT') || (n.includes('DEBT') && n.includes('MF'));
  if (isDebtMF) return 'stcgOther';
  // Determine long/short: prefer actual dates over AIS label
  let isLong: boolean;
  const purDate = toInputDate(cg.purchaseDate);
  const salDate = toInputDate(cg.transferDate);
  if (purDate && salDate) {
    const months = holdingMonths(purDate, salDate);
    isLong = isEquity ? months > 12 : months > 24;
  } else {
    // AIS assetType may say "Long term" / "Short term" / "Long-Term Capital Gain" etc.
    const hasLong = t.includes('LONG');
    const hasShort = t.includes('SHORT');
    isLong = hasLong && !hasShort;
  }

  if (isLong && isEquity) return 'ltcg112A';
  if (!isLong && isEquity) return 'stcg111A';
  if (isLong) return 'ltcgOther';
  return 'stcgOther';
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
  const [aisGains, setAisGains] = useState<AISCapitalGain[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // Load existing CG entries from returnData
  useEffect(() => {
    const lg = (returnData as any).ltcg112A;
    const lgo = (returnData as any).ltcgOther;
    const sg = (returnData as any).stcg;
    const lgRaw: any[] = (returnData as any).ltcg112AEntries ?? [];
    const sgRaw: any[] = (returnData as any).stcgEntries ?? [];

    setState({
      ltcg112A: lg?.Entries?.length
        ? lg.Entries.map((e: any) => ({
            id: uid(), isin: e.ISIN ?? '', shareOrUnitName: e.ShareOrUnitName ?? '',
            salesValue: e.SalesValue ?? 0, purchaseCost: e.PurchaseCost ?? 0,
            fmvAsOn31Jan2018: e.FMVasOn31Jan2018 ?? 0, expenditure: e.Expenditure ?? 0, gainLoss: e.GainLoss ?? 0,
          }))
        : lgRaw.map((e: any) => ({
            id: uid(), isin: e.isin ?? '', shareOrUnitName: e.shareOrUnitName ?? '',
            salesValue: e.salesValue ?? 0, purchaseCost: e.purchaseCost ?? 0,
            fmvAsOn31Jan2018: e.fmvAsOn31Jan2018 ?? 0, expenditure: e.expenditure ?? 0, gainLoss: e.gainLoss ?? 0,
          })),
      ltcgOther: (() => {
        const raw: any[] = (() => {
          try { return JSON.parse((returnData as any).ltcgOtherJson ?? '[]'); } catch { return []; }
        })();
        if (lgo?.Entries?.length) {
          return lgo.Entries.map((e: any) => ({ id: uid(), assetDesc: e.assetDesc ?? '', salesValue: e.salesValue ?? 0, purchaseCost: e.purchaseCost ?? 0, expenditure: e.expenditure ?? 0, gainLoss: e.gainLoss ?? 0 }));
        }
        return raw.map((e: any) => ({ id: uid(), assetDesc: e.assetDesc ?? '', salesValue: e.salesValue ?? 0, purchaseCost: e.purchaseCost ?? 0, expenditure: e.expenditure ?? 0, gainLoss: e.gainLoss ?? 0 }));
      })(),
      stcg111A: sg?.Entries111A?.length
        ? sg.Entries111A.map((e: any) => ({
            id: uid(), isin: e.isin ?? '', shareOrUnitName: e.shareOrUnitName ?? '',
            salesValue: e.salesValue ?? 0, purchaseCost: e.purchaseCost ?? 0,
            expenditure: e.expenditure ?? 0, gainLoss: e.gainLoss ?? 0,
          }))
        : sgRaw.filter((e: any) => e.entryType === '111A').map((e: any) => ({
            id: uid(), isin: e.isin ?? '', shareOrUnitName: e.shareOrUnitName ?? '',
            salesValue: e.salesValue ?? 0, purchaseCost: e.purchaseCost ?? 0,
            expenditure: e.expenditure ?? 0, gainLoss: e.gainLoss ?? 0,
          })),
      stcgOther: sg?.OtherEntries?.length
        ? sg.OtherEntries.map((e: any) => ({
            id: uid(), assetDesc: e.assetDesc ?? '', salesValue: e.salesValue ?? 0,
            purchaseCost: e.purchaseCost ?? 0, expenditure: e.expenditure ?? 0, gainLoss: e.gainLoss ?? 0,
          }))
        : sgRaw.filter((e: any) => e.entryType === 'OTHER').map((e: any) => ({
            id: uid(), assetDesc: e.assetDesc ?? '', salesValue: e.salesValue ?? 0,
            purchaseCost: e.purchaseCost ?? 0, expenditure: e.expenditure ?? 0, gainLoss: e.gainLoss ?? 0,
          })),
    });
  }, [returnData]);

  // Load AIS capital gains from portal data
  useEffect(() => {
    fetch(`/api/returns/${returnId}/portal-data`)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const cgs: AISCapitalGain[] = j?.data?.sftCapitalGains ?? j?.sftCapitalGains ?? [];
        if (cgs.length) setAisGains(cgs);
      })
      .catch(() => null);
  }, [returnId]);

  const update = useCallback((fn: (prev: CGState) => CGState) => {
    setState(fn);
    setDirty(true);
  }, [setDirty]);

  // Import all AIS capital gains into the right sections
  function importFromAIS() {
    if (!aisGains.length) return;
    setImporting(true);
    setImportMsg('');

    const newLtcg112A: LTCG112AEntry[] = [];
    const newLtcgOther: LTCGOtherEntry[] = [];
    const newStcg111A: STCG111AEntry[] = [];
    const newStcgOther: STCGOtherEntry[] = [];

    for (const cg of aisGains) {
      const bucket = classifyAISGain(cg);

      const saleDate = toInputDate(cg.transferDate);
      const purchaseDate = toInputDate(cg.purchaseDate);
      if (bucket === 'ltcg112A') {
        const fmv = cg.fmvValue || 0;
        const effectiveCost = fmv > 0 ? Math.max(cg.costOfAcquisition, fmv) : cg.costOfAcquisition;
        const gain = cg.salesConsideration - effectiveCost;
        newLtcg112A.push({
          id: uid(), isin: '', shareOrUnitName: cg.securityName,
          purchaseDate, saleDate,
          salesValue: cg.salesConsideration, purchaseCost: cg.costOfAcquisition,
          fmvAsOn31Jan2018: fmv, expenditure: 0, gainLoss: gain,
        });
      } else if (bucket === 'stcg111A') {
        const gain = cg.salesConsideration - cg.costOfAcquisition;
        newStcg111A.push({
          id: uid(), isin: '', shareOrUnitName: cg.securityName,
          purchaseDate, saleDate,
          salesValue: cg.salesConsideration, purchaseCost: cg.costOfAcquisition,
          expenditure: 0, gainLoss: gain,
        });
      } else if (bucket === 'ltcgOther') {
        const gain = cg.salesConsideration - cg.costOfAcquisition;
        newLtcgOther.push({
          id: uid(), assetDesc: cg.securityName,
          purchaseDate, saleDate,
          salesValue: cg.salesConsideration, purchaseCost: cg.costOfAcquisition,
          expenditure: 0, gainLoss: gain,
        });
      } else {
        const gain = cg.salesConsideration - cg.costOfAcquisition;
        newStcgOther.push({
          id: uid(), assetDesc: cg.securityName,
          purchaseDate, saleDate,
          salesValue: cg.salesConsideration, purchaseCost: cg.costOfAcquisition,
          expenditure: 0, gainLoss: gain,
        });
      }
    }

    update(prev => ({
      ltcg112A: [...prev.ltcg112A, ...newLtcg112A],
      ltcgOther: [...prev.ltcgOther, ...newLtcgOther],
      stcg111A: [...prev.stcg111A, ...newStcg111A],
      stcgOther: [...prev.stcgOther, ...newStcgOther],
    }));

    const parts = [
      newLtcg112A.length && `${newLtcg112A.length} LTCG 112A (equity MF)`,
      newStcg111A.length && `${newStcg111A.length} STCG 111A (equity MF)`,
      newLtcgOther.length && `${newLtcgOther.length} LTCG other`,
      newStcgOther.length && `${newStcgOther.length} STCG other / debt MF`,
    ].filter(Boolean);
    setImportMsg(`✓ Imported: ${parts.join(', ')}. Review FMV & transfer expenses before saving.`);
    setImporting(false);
  }

  // Totals
  const totalLtcgGain  = state.ltcg112A.reduce((s, e) => s + e.gainLoss, 0);
  const taxableLtcg    = Math.max(0, totalLtcgGain - LTCG_EXEMPTION);
  const totalLtcgSales = state.ltcg112A.reduce((s, e) => s + e.salesValue, 0);
  const totalLtcgCost  = state.ltcg112A.reduce((s, e) => s + e.purchaseCost, 0);
  const totalLtcgOther = state.ltcgOther.reduce((s, e) => s + e.gainLoss, 0);
  const total111A      = state.stcg111A.reduce((s, e) => s + e.gainLoss, 0);
  const totalOther     = state.stcgOther.reduce((s, e) => s + e.gainLoss, 0);
  const totalStcg      = total111A + totalOther;

  async function handleSave() {
    const missing: string[] = [];
    state.ltcg112A.forEach((e, i) => {
      if (!e.purchaseDate) missing.push(`LTCG 112A row ${i + 1}: Purchase Date`);
      if (!e.saleDate) missing.push(`LTCG 112A row ${i + 1}: Sale Date`);
    });
    state.ltcgOther.forEach((e, i) => {
      if (!e.purchaseDate) missing.push(`LTCG Other row ${i + 1}: Purchase Date`);
      if (!e.saleDate) missing.push(`LTCG Other row ${i + 1}: Sale Date`);
    });
    state.stcg111A.forEach((e, i) => {
      if (!e.purchaseDate) missing.push(`STCG 111A row ${i + 1}: Purchase Date`);
      if (!e.saleDate) missing.push(`STCG 111A row ${i + 1}: Sale Date`);
    });
    state.stcgOther.forEach((e, i) => {
      if (!e.purchaseDate) missing.push(`STCG Other row ${i + 1}: Purchase Date`);
      if (!e.saleDate) missing.push(`STCG Other row ${i + 1}: Sale Date`);
    });
    if (missing.length) {
      setMsg('✗ Please fill in all dates before saving:\n• ' + missing.join('\n• '));
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const r1 = await fetch(`/api/returns/${returnId}/schedule/ltcg112A`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: state.ltcg112A.map(e => ({
            isin: e.isin, shareOrUnitName: e.shareOrUnitName,
            salesValue: e.salesValue, purchaseCost: e.purchaseCost,
            fmvAsOn31Jan2018: e.fmvAsOn31Jan2018, expenditure: e.expenditure, gainLoss: e.gainLoss,
          })),
        }),
      });
      if (!r1.ok) throw new Error('LTCG 112A save failed');

      const r1b = await fetch(`/api/returns/${returnId}/schedule/ltcgOther`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: state.ltcgOther.map(e => ({
            assetDesc: e.assetDesc, salesValue: e.salesValue,
            purchaseCost: e.purchaseCost, expenditure: e.expenditure, gainLoss: e.gainLoss,
          })),
        }),
      });
      if (!r1b.ok) throw new Error('LTCG Other save failed');

      const r2 = await fetch(`/api/returns/${returnId}/schedule/stcg`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries111A: state.stcg111A.map(e => ({
            isin: e.isin, shareOrUnitName: e.shareOrUnitName,
            salesValue: e.salesValue, purchaseCost: e.purchaseCost,
            expenditure: e.expenditure, gainLoss: e.gainLoss,
          })),
          entriesOther: state.stcgOther.map(e => ({
            assetDesc: e.assetDesc, salesValue: e.salesValue,
            purchaseCost: e.purchaseCost, expenditure: e.expenditure, gainLoss: e.gainLoss,
          })),
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

  const numInput = (value: number, onChange: (v: number) => void, highlight = false) => (
    <input
      className="form-input"
      style={{ fontSize: '12px', padding: '5px 8px', textAlign: 'right', ...(highlight ? { background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.4)' } : {}) }}
      type="number"
      min={0}
      value={value || ''}
      placeholder="0"
      onChange={e => onChange(Number(e.target.value))}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── AIS Import Banner ─────────────────────────────────────────────────── */}
      {aisGains.length > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
              📊 {aisGains.length} capital gain transactions found in AIS
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              Equity MF → LTCG 112A / STCG 111A &nbsp;·&nbsp; Debt MF / others → STCG Other &nbsp;·&nbsp; Grandfathering (FMV Jan 31 2018) applied automatically where available.
            </div>
            {importMsg && (
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 6, fontWeight: 500 }}>{importMsg}</div>
            )}
          </div>
          <button
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap', fontSize: 13 }}
            disabled={importing}
            onClick={importFromAIS}
          >
            {importing ? 'Importing…' : `⬇ Import ${aisGains.length} entries`}
          </button>
        </div>
      )}

      {/* ══ LTCG 112A ══════════════════════════════════════════════════════════ */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div className="section-title">LTCG u/s 112A — Listed Equity / Equity MF</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Listed equity / equity-oriented MF held &gt;12 months. Tax: 12.5%. Exemption: first ₹1.25L per year.
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({
              ...p,
              ltcg112A: [...p.ltcg112A, { id: uid(), isin: '', shareOrUnitName: '', purchaseDate: '', saleDate: '', salesValue: 0, purchaseCost: 0, fmvAsOn31Jan2018: 0, expenditure: 0, gainLoss: 0 }],
            }))
          }>+ Add Entry</button>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.3)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          <strong>Grandfathering Rule (Section 112A):</strong> Effective Cost = max(Actual Purchase Cost, FMV as on 31-Jan-2018).
          AIS pre-fills the FMV where available — <span style={{ color: 'rgba(212,160,23,0.9)' }}>highlighted column</span>.
          Gain = Sale Value − Effective Cost − Transfer Expenses. First ₹1,25,000 is exempt.
        </div>

        {state.ltcg112A.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No LTCG 112A entries. Use "Import from AIS" above or "+ Add Entry".</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 110px 110px 1fr 88px 88px 96px 80px 80px 36px', gap: '6px', padding: '6px 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>ISIN</span><span style={{ color: 'var(--error-light, #f87171)' }}>Purchase Date ★</span><span style={{ color: 'var(--error-light, #f87171)' }}>Sale Date ★</span><span>Name</span><span>Sale ₹</span><span>Cost ₹</span>
              <span style={{ color: 'rgba(212,160,23,0.9)' }}>FMV 31-Jan-18</span>
              <span>Exp ₹</span><span>Gain</span><span></span>
            </div>
            {state.ltcg112A.map((e, i) => {
              const effectiveCost = e.fmvAsOn31Jan2018 > 0 ? Math.max(e.purchaseCost, e.fmvAsOn31Jan2018) : e.purchaseCost;
              const grandfatheringApplied = e.fmvAsOn31Jan2018 > e.purchaseCost;
              return (
                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '110px 110px 110px 1fr 88px 88px 96px 80px 80px 36px', gap: '6px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                  <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.isin} placeholder="ISIN"
                    onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => j === i ? { ...x, isin: ev.target.value } : x) }))} />
                  <input className="form-input" type="date" style={{ fontSize: '12px', padding: '5px 6px', borderColor: !e.purchaseDate ? 'var(--error)' : undefined }} value={e.purchaseDate}
                    onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => j === i ? { ...x, purchaseDate: ev.target.value } : x) }))} />
                  <input className="form-input" type="date" style={{ fontSize: '12px', padding: '5px 6px', borderColor: !e.saleDate ? 'var(--error)' : undefined }} value={e.saleDate}
                    onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => j === i ? { ...x, saleDate: ev.target.value } : x) }))} />
                  <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.shareOrUnitName} placeholder="Company / Fund name"
                    onChange={ev => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => j === i ? { ...x, shareOrUnitName: ev.target.value } : x) }))} />
                  {numInput(e.salesValue, v => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, salesValue: v }; return { ...u, gainLoss: calcLTCGGain(u) }; }) })))}
                  {numInput(e.purchaseCost, v => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, purchaseCost: v }; return { ...u, gainLoss: calcLTCGGain(u) }; }) })))}
                  <div title="FMV as on 31-Jan-2018 (for grandfathering). If FMV > Purchase Cost, FMV is used as effective cost.">
                    {numInput(e.fmvAsOn31Jan2018, v => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, fmvAsOn31Jan2018: v }; return { ...u, gainLoss: calcLTCGGain(u) }; }) })), true)}
                    {grandfatheringApplied && (
                      <div style={{ fontSize: 10, color: 'rgba(212,160,23,0.9)', marginTop: 2 }}>★ FMV used</div>
                    )}
                  </div>
                  {numInput(e.expenditure, v => update(p => ({ ...p, ltcg112A: p.ltcg112A.map((x, j) => { if (j !== i) return x; const u = { ...x, expenditure: v }; return { ...u, gainLoss: calcLTCGGain(u) }; }) })))}
                  <div style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right', color: e.gainLoss >= 0 ? 'var(--success)' : 'var(--error)', padding: '5px 0' }}>
                    ₹{e.gainLoss.toLocaleString('en-IN')}
                    {grandfatheringApplied && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>eff.cost ₹{effectiveCost.toLocaleString('en-IN')}</div>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '4px', minWidth: 0 }}
                    onClick={() => update(p => ({ ...p, ltcg112A: p.ltcg112A.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Gain: <strong style={{ color: 'var(--text-primary)' }}>₹{totalLtcgGain.toLocaleString('en-IN')}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Exemption: <strong>₹{LTCG_EXEMPTION.toLocaleString('en-IN')}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Taxable LTCG 112A: <strong style={{ color: 'var(--brand-text)' }}>₹{taxableLtcg.toLocaleString('en-IN')}</strong></span>
            </div>
          </>
        )}
      </section>

      {/* ══ LTCG — Other Assets ════════════════════════════════════════════════ */}
      <section className="schedule-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div className="section-title">LTCG — Other Assets u/s 112 (12.5%)</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Gold, property, unlisted shares, pre-Apr-2023 debt MF held &gt;36 months, etc. Tax: 12.5% without indexation (post 23-Jul-2024 budget).
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({
              ...p,
              ltcgOther: [...p.ltcgOther, { id: uid(), assetDesc: '', purchaseDate: '', saleDate: '', salesValue: 0, purchaseCost: 0, expenditure: 0, gainLoss: 0 }],
            }))
          }>+ Add Entry</button>
        </div>

        {state.ltcgOther.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No LTCG other entries. Import from AIS or click "+ Add Entry".</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 110px 1fr 100px 100px 90px 90px 36px', gap: '8px', padding: '6px 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span style={{ color: 'var(--error-light, #f87171)' }}>Purchase Date ★</span><span style={{ color: 'var(--error-light, #f87171)' }}>Sale Date ★</span><span>Asset Description</span><span>Sale ₹</span><span>Cost ₹</span><span>Expenses ₹</span><span>Gain / Loss</span><span></span>
            </div>
            {state.ltcgOther.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '110px 110px 1fr 100px 100px 90px 90px 36px', gap: '8px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <input className="form-input" type="date" style={{ fontSize: '12px', padding: '5px 6px', borderColor: !e.purchaseDate ? 'var(--error)' : undefined }} value={e.purchaseDate}
                  onChange={ev => update(p => ({ ...p, ltcgOther: p.ltcgOther.map((x, j) => j === i ? { ...x, purchaseDate: ev.target.value } : x) }))} />
                <input className="form-input" type="date" style={{ fontSize: '12px', padding: '5px 6px', borderColor: !e.saleDate ? 'var(--error)' : undefined }} value={e.saleDate}
                  onChange={ev => update(p => ({ ...p, ltcgOther: p.ltcgOther.map((x, j) => j === i ? { ...x, saleDate: ev.target.value } : x) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.assetDesc} placeholder="e.g. Gold bonds, Property, Debt MF (pre-2023)"
                  onChange={ev => update(p => ({ ...p, ltcgOther: p.ltcgOther.map((x, j) => j === i ? { ...x, assetDesc: ev.target.value } : x) }))} />
                {numInput(e.salesValue, v => update(p => ({ ...p, ltcgOther: p.ltcgOther.map((x, j) => { if (j !== i) return x; const u = { ...x, salesValue: v }; return { ...u, gainLoss: calcLTCGOtherGain(u) }; }) })))}
                {numInput(e.purchaseCost, v => update(p => ({ ...p, ltcgOther: p.ltcgOther.map((x, j) => { if (j !== i) return x; const u = { ...x, purchaseCost: v }; return { ...u, gainLoss: calcLTCGOtherGain(u) }; }) })))}
                {numInput(e.expenditure, v => update(p => ({ ...p, ltcgOther: p.ltcgOther.map((x, j) => { if (j !== i) return x; const u = { ...x, expenditure: v }; return { ...u, gainLoss: calcLTCGOtherGain(u) }; }) })))}
                <div style={{ fontSize: '13px', fontWeight: 600, textAlign: 'right', color: e.gainLoss >= 0 ? 'var(--success)' : 'var(--error)', padding: '5px 0' }}>
                  ₹{e.gainLoss.toLocaleString('en-IN')}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '4px', minWidth: 0 }}
                  onClick={() => update(p => ({ ...p, ltcgOther: p.ltcgOther.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total LTCG Other: <strong style={{ color: 'var(--brand-text)' }}>₹{totalLtcgOther.toLocaleString('en-IN')}</strong></span>
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
              Listed equity shares / equity-oriented MF held ≤12 months (STT paid). Tax: 20%.
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({
              ...p,
              stcg111A: [...p.stcg111A, { id: uid(), isin: '', shareOrUnitName: '', purchaseDate: '', saleDate: '', salesValue: 0, purchaseCost: 0, expenditure: 0, gainLoss: 0 }],
            }))
          }>+ Add Entry</button>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Gain = Sale Value − Purchase Cost − Transfer Expenses. Tax: 20% (Budget 2024). STT-paid transactions on recognised exchanges.
        </div>

        {state.stcg111A.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No STCG 111A entries. Import from AIS or click "+ Add Entry".</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 110px 110px 1fr 88px 88px 80px 80px 36px', gap: '6px', padding: '6px 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>ISIN</span><span style={{ color: 'var(--error-light, #f87171)' }}>Purchase Date ★</span><span style={{ color: 'var(--error-light, #f87171)' }}>Sale Date ★</span><span>Name</span><span>Sale ₹</span><span>Cost ₹</span><span>Exp ₹</span><span>Gain</span><span></span>
            </div>
            {state.stcg111A.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '110px 110px 110px 1fr 88px 88px 80px 80px 36px', gap: '6px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.isin} placeholder="ISIN"
                  onChange={ev => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => j === i ? { ...x, isin: ev.target.value } : x) }))} />
                <input className="form-input" type="date" style={{ fontSize: '12px', padding: '5px 6px', borderColor: !e.purchaseDate ? 'var(--error)' : undefined }} value={e.purchaseDate ?? ''}
                  onChange={ev => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => j === i ? { ...x, purchaseDate: ev.target.value } : x) }))} />
                <input className="form-input" type="date" style={{ fontSize: '12px', padding: '5px 6px', borderColor: !e.saleDate ? 'var(--error)' : undefined }} value={e.saleDate ?? ''}
                  onChange={ev => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => j === i ? { ...x, saleDate: ev.target.value } : x) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.shareOrUnitName} placeholder="Company / Fund name"
                  onChange={ev => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => j === i ? { ...x, shareOrUnitName: ev.target.value } : x) }))} />
                {numInput(e.salesValue, v => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => { if (j !== i) return x; const u = { ...x, salesValue: v }; return { ...u, gainLoss: calc111AGain(u) }; }) })))}
                {numInput(e.purchaseCost, v => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => { if (j !== i) return x; const u = { ...x, purchaseCost: v }; return { ...u, gainLoss: calc111AGain(u) }; }) })))}
                {numInput(e.expenditure, v => update(p => ({ ...p, stcg111A: p.stcg111A.map((x, j) => { if (j !== i) return x; const u = { ...x, expenditure: v }; return { ...u, gainLoss: calc111AGain(u) }; }) })))}
                <div style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right', color: e.gainLoss >= 0 ? 'var(--success)' : 'var(--error)', padding: '5px 0' }}>
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
            <div className="section-title">STCG — Other Assets & Debt MF (Slab Rate)</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Debt MF (Finance Act 2023 — all holding periods), short-term gold, property, unlisted shares, jewellery, etc. Added to total income at slab rate.
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() =>
            update(p => ({
              ...p,
              stcgOther: [...p.stcgOther, { id: uid(), assetDesc: '', purchaseDate: '', saleDate: '', salesValue: 0, purchaseCost: 0, expenditure: 0, gainLoss: 0 }],
            }))
          }>+ Add Entry</button>
        </div>

        {state.stcgOther.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>No STCG other entries. Import from AIS or click "+ Add Entry".</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 110px 1fr 100px 100px 90px 90px 36px', gap: '8px', padding: '6px 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span style={{ color: 'var(--error-light, #f87171)' }}>Purchase Date ★</span><span style={{ color: 'var(--error-light, #f87171)' }}>Sale Date ★</span><span>Asset Description</span><span>Sale ₹</span><span>Cost ₹</span><span>Expenses ₹</span><span>Gain / Loss</span><span></span>
            </div>
            {state.stcgOther.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '110px 110px 1fr 100px 100px 90px 90px 36px', gap: '8px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <input className="form-input" type="date" style={{ fontSize: '12px', padding: '5px 6px', borderColor: !e.purchaseDate ? 'var(--error)' : undefined }} value={e.purchaseDate ?? ''}
                  onChange={ev => update(p => ({ ...p, stcgOther: p.stcgOther.map((x, j) => j === i ? { ...x, purchaseDate: ev.target.value } : x) }))} />
                <input className="form-input" type="date" style={{ fontSize: '12px', padding: '5px 6px', borderColor: !e.saleDate ? 'var(--error)' : undefined }} value={e.saleDate ?? ''}
                  onChange={ev => update(p => ({ ...p, stcgOther: p.stcgOther.map((x, j) => j === i ? { ...x, saleDate: ev.target.value } : x) }))} />
                <input className="form-input" style={{ fontSize: '12px', padding: '5px 8px' }} value={e.assetDesc} placeholder="e.g. Debt MF — ICICI Liquid Fund, Gold jewellery"
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '14px' }}>
          {[
            ['LTCG 112A (12.5%)', taxableLtcg],
            ['LTCG Other (12.5%)', totalLtcgOther],
            ['STCG 111A (20%)', total111A],
            ['STCG Other (slab)', totalOther],
            ['Total CG Income', taxableLtcg + totalLtcgOther + totalStcg],
          ].map(([label, val]) => (
            <div key={label as string}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--brand-text)', marginTop: '4px' }}>
                ₹{(val as number).toLocaleString('en-IN')}
              </div>
            </div>
          ))}
        </div>
        {msg && (
          <div style={{ fontSize: 12, color: msg === 'Saved' ? 'var(--success)' : 'var(--error)', marginBottom: 10 }}>{msg}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
