'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ScheduleOS, ReturnData } from '@/shared/types/itr';

// ─── Dev mock ────────────────────────────────────────────────────────────────
const isMock = false;

// ─── Local types ─────────────────────────────────────────────────────────────

interface FDEntry {
  id: string;
  bankName: string;
  interestAmount: number;
  tdsDeducted: number;
}

interface DividendEntry {
  id: string;
  companyName: string;
  amount: number;
}

interface OtherEntry {
  id: string;
  description: string;
  amount: number;
}

interface OSFormState {
  // Savings account interest u/s 80TTA eligible
  savingsInterest: number;

  // FD / RD / post office interest (not 80TTA eligible)
  fdEntries: FDEntry[];

  // Dividends (taxable in hands of shareholder post-2020)
  dividendEntries: DividendEntry[];

  // Family pension
  familyPensionReceived: number;

  // Winnings — lottery, crossword, game shows u/s 115BB (flat 30%)
  lotteryWinnings: number;

  // Other — gifts exceeding ₹50k, sub-letting, etc.
  otherEntries: OtherEntry[];

  // Deduction u/s 57 — expenses for earning other income (not applicable to lottery/dividends)
  deductionU57: number;

  // Family pension standard deduction: lower of 1/3rd or ₹15,000
  useFamilyPensionDeduction: boolean;
}

function defaultState(): OSFormState {
  return {
    savingsInterest: 0,
    fdEntries: [],
    dividendEntries: [],
    familyPensionReceived: 0,
    lotteryWinnings: 0,
    otherEntries: [],
    deductionU57: 0,
    useFamilyPensionDeduction: true,
  };
}

// ─── Computation ──────────────────────────────────────────────────────────────

const FAMILY_PENSION_DEDUCTION_CAP = 15000;

function computeFamilyPensionDeduction(received: number): number {
  return Math.min(Math.round(received / 3), FAMILY_PENSION_DEDUCTION_CAP);
}

interface OSSummary {
  savingsInterest: number;
  fdInterest: number;
  dividends: number;
  familyPensionGross: number;
  familyPensionDeduction: number;
  familyPensionNet: number;
  lotteryWinnings: number;
  otherIncome: number;
  deductionU57: number;
  totalOSIncome: number;           // lottery taxed separately at 30%
  totalOSIncomeExLottery: number;  // normal slab income
}

function computeSummary(s: OSFormState): OSSummary {
  const fdInterest = s.fdEntries.reduce((sum, f) => sum + f.interestAmount, 0);
  const dividends = s.dividendEntries.reduce((sum, d) => sum + d.amount, 0);
  const fpDeduction = s.useFamilyPensionDeduction
    ? computeFamilyPensionDeduction(s.familyPensionReceived)
    : 0;
  const fpNet = Math.max(0, s.familyPensionReceived - fpDeduction);
  const otherIncome = s.otherEntries.reduce((sum, o) => sum + o.amount, 0);

  const normalIncome =
    s.savingsInterest + fdInterest + dividends + fpNet + otherIncome;
  const deductionU57 = Math.min(s.deductionU57, normalIncome); // can't exceed income
  const totalExLottery = Math.max(0, normalIncome - deductionU57);

  return {
    savingsInterest: s.savingsInterest,
    fdInterest,
    dividends,
    familyPensionGross: s.familyPensionReceived,
    familyPensionDeduction: fpDeduction,
    familyPensionNet: fpNet,
    lotteryWinnings: s.lotteryWinnings,
    otherIncome,
    deductionU57,
    totalOSIncome: totalExLottery + s.lotteryWinnings,
    totalOSIncomeExLottery: totalExLottery,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  (n < 0 ? '−₹' : '₹') + Math.abs(n).toLocaleString('en-IN');

// ─── Reusable field components ────────────────────────────────────────────────

interface NumFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  readOnly?: boolean;
}
function NumField({ label, value, onChange, hint, readOnly }: NumFieldProps) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value));
  useEffect(() => { setRaw(value === 0 ? '' : String(value)); }, [value]);
  const commit = () => {
    const n = Number(raw.replace(/,/g, ''));
    if (!isNaN(n)) { onChange(n); setRaw(n === 0 ? '' : String(n)); }
    else setRaw(value === 0 ? '' : String(value));
  };
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className={`form-input${readOnly ? ' os-readonly' : ''}`}
        value={readOnly ? String(value) : raw}
        readOnly={readOnly}
        placeholder="0"
        onChange={(e) => !readOnly && setRaw(e.target.value)}
        onBlur={!readOnly ? commit : undefined}
      />
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );
}

// ─── FD rows ─────────────────────────────────────────────────────────────────

interface FDRowProps {
  entry: FDEntry;
  onChange: (id: string, patch: Partial<FDEntry>) => void;
  onRemove: (id: string) => void;
}
function FDRow({ entry, onChange, onRemove }: FDRowProps) {
  return (
    <div className="os-entry-row card">
      <div className="form-grid-3">
        <div className="form-group">
          <label className="form-label">Bank / Institution</label>
          <input
            type="text"
            className="form-input"
            value={entry.bankName}
            placeholder="SBI, HDFC, Post Office…"
            onChange={(e) => onChange(entry.id, { bankName: e.target.value })}
          />
        </div>
        <NumField
          label="Interest Amount"
          value={entry.interestAmount}
          onChange={(v) => onChange(entry.id, { interestAmount: v })}
          hint="As per bank statement / Form 26AS"
        />
        <NumField
          label="TDS Deducted"
          value={entry.tdsDeducted}
          onChange={(v) => onChange(entry.id, { tdsDeducted: v })}
          hint="Will auto-flow to Schedule TDS"
        />
      </div>
      <button className="btn btn-danger btn-sm os-remove-btn" onClick={() => onRemove(entry.id)}>
        Remove
      </button>
    </div>
  );
}

// ─── Dividend rows ────────────────────────────────────────────────────────────

interface DivRowProps {
  entry: DividendEntry;
  onChange: (id: string, patch: Partial<DividendEntry>) => void;
  onRemove: (id: string) => void;
}
function DivRow({ entry, onChange, onRemove }: DivRowProps) {
  return (
    <div className="os-entry-row card">
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Company / Mutual Fund</label>
          <input
            type="text"
            className="form-input"
            value={entry.companyName}
            placeholder="Infosys Ltd, HDFC Mutual Fund…"
            onChange={(e) => onChange(entry.id, { companyName: e.target.value })}
          />
        </div>
        <NumField
          label="Dividend Amount"
          value={entry.amount}
          onChange={(v) => onChange(entry.id, { amount: v })}
          hint="Gross dividend before TDS"
        />
      </div>
      <button className="btn btn-danger btn-sm os-remove-btn" onClick={() => onRemove(entry.id)}>
        Remove
      </button>
    </div>
  );
}

// ─── Other income rows ────────────────────────────────────────────────────────

interface OtherRowProps {
  entry: OtherEntry;
  onChange: (id: string, patch: Partial<OtherEntry>) => void;
  onRemove: (id: string) => void;
}
function OtherRow({ entry, onChange, onRemove }: OtherRowProps) {
  return (
    <div className="os-entry-row card">
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Nature / Description</label>
          <input
            type="text"
            className="form-input"
            value={entry.description}
            placeholder="Gift received, sub-letting income…"
            onChange={(e) => onChange(entry.id, { description: e.target.value })}
          />
        </div>
        <NumField
          label="Amount"
          value={entry.amount}
          onChange={(v) => onChange(entry.id, { amount: v })}
        />
      </div>
      <button className="btn btn-danger btn-sm os-remove-btn" onClick={() => onRemove(entry.id)}>
        Remove
      </button>
    </div>
  );
}

// ─── Section component ────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  badge?: string;
}
function Section({ title, subtitle, children, badge }: SectionProps) {
  return (
    <div className="os-section card">
      <div className="os-section-head">
        <div>
          <div className="os-section-title">{title}</div>
          {subtitle && <div className="os-section-subtitle">{subtitle}</div>}
        </div>
        {badge && <span className="os-section-badge">{badge}</span>}
      </div>
      <div className="os-section-body">{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  returnId: string;
  returnData: ReturnData;
  onSaved: (rd: ReturnData) => void;
  setDirty: (d: boolean) => void;
}

export default function ScheduleOSComponent({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<OSFormState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aisImporting, setAisImporting] = useState(false);
  const [aisImportMsg, setAisImportMsg] = useState<string | null>(null);

  // ── Hydrate ──
  useEffect(() => {
    // returnData from API has osSchedule (Prisma model) with otherSourceItemsJson
    // After save, onSaved injects scheduleOS directly for immediate round-trip
    const raw = (returnData as any);
    let s: any = raw.scheduleOS ?? null;
    if (!s && raw.osSchedule?.otherSourceItemsJson) {
      try { s = JSON.parse(raw.osSchedule.otherSourceItemsJson); } catch { s = null; }
    }
    if (!s) return;
    setState({
      savingsInterest: s.savingsInterest ?? 0,
      fdEntries: Array.isArray(s._fdEntries)
        ? s._fdEntries.map((f: any) => ({ id: crypto.randomUUID(), ...f }))
        : [],
      dividendEntries: Array.isArray(s._dividendEntries)
        ? s._dividendEntries.map((d: any) => ({ id: crypto.randomUUID(), ...d }))
        : [],
      familyPensionReceived: s.familyPension ?? 0,
      lotteryWinnings: s.lotteryWinnings ?? 0,
      otherEntries: Array.isArray(s._otherEntries)
        ? s._otherEntries.map((o: any) => ({ id: crypto.randomUUID(), ...o }))
        : [],
      deductionU57: s.deductionU57 ?? 0,
      useFamilyPensionDeduction: s.useFamilyPensionDeduction ?? true,
    });
  }, [returnId]);

  // ── Build payload ──
  const buildPayload = useCallback((st: OSFormState): ScheduleOS => {
    const sum = computeSummary(st);
    return {
      savingsInterest: sum.savingsInterest,
      fdInterest: sum.fdInterest,
      dividends: sum.dividends,
      familyPension: sum.familyPensionNet,
      lotteryWinnings: sum.lotteryWinnings,
      otherIncome: sum.otherIncome,
      deductionU57: sum.deductionU57,
      totalOSIncome: sum.totalOSIncome,
      // Round-trip fields
      _fdEntries: st.fdEntries.map(({ id: _id, ...r }) => r),
      _dividendEntries: st.dividendEntries.map(({ id: _id, ...r }) => r),
      _otherEntries: st.otherEntries.map(({ id: _id, ...r }) => r),
      useFamilyPensionDeduction: st.useFamilyPensionDeduction,
    } as unknown as ScheduleOS;
  }, []);

  // ── Save ──
  const save = useCallback(async (st: OSFormState) => {
    setSaving(true);
    setSaveErr('');
    try {
      const payload = buildPayload(st);
      const res = await fetch(`/api/returns/${returnId}/schedule/otherSources`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Save failed'); }
      setLastSaved(new Date());
      setDirty(false);
      onSaved({ ...(returnData as any), scheduleOS: payload } as any);
    } catch (e: any) {
      setSaveErr(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [returnId, returnData, buildPayload, onSaved, setDirty]);

  const scheduleAutoSave = useCallback((st: OSFormState) => {
    setDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(st), 1500);
  }, [save, setDirty]);

  const update = (patch: Partial<OSFormState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      scheduleAutoSave(next);
      return next;
    });
  };

  // FD helpers
  const addFD = () => update({ fdEntries: [...state.fdEntries, { id: crypto.randomUUID(), bankName: '', interestAmount: 0, tdsDeducted: 0 }] });
  const updateFD = (id: string, patch: Partial<FDEntry>) =>
    update({ fdEntries: state.fdEntries.map((f) => f.id === id ? { ...f, ...patch } : f) });
  const removeFD = (id: string) =>
    update({ fdEntries: state.fdEntries.filter((f) => f.id !== id) });

  // Dividend helpers
  const addDiv = () => update({ dividendEntries: [...state.dividendEntries, { id: crypto.randomUUID(), companyName: '', amount: 0 }] });
  const updateDiv = (id: string, patch: Partial<DividendEntry>) =>
    update({ dividendEntries: state.dividendEntries.map((d) => d.id === id ? { ...d, ...patch } : d) });
  const removeDiv = (id: string) =>
    update({ dividendEntries: state.dividendEntries.filter((d) => d.id !== id) });

  // Other helpers
  const addOther = () => update({ otherEntries: [...state.otherEntries, { id: crypto.randomUUID(), description: '', amount: 0 }] });
  const updateOther = (id: string, patch: Partial<OtherEntry>) =>
    update({ otherEntries: state.otherEntries.map((o) => o.id === id ? { ...o, ...patch } : o) });
  const removeOther = (id: string) =>
    update({ otherEntries: state.otherEntries.filter((o) => o.id !== id) });

  // Import dividends, FD interest, savings interest from AIS/26AS portalData
  async function importFromPortal() {
    setAisImporting(true);
    setAisImportMsg(null);
    try {
      const res = await fetch(`/api/returns/${returnId}/portal-data`);
      if (!res.ok) { setAisImportMsg('No portal data found. Import AIS/26AS from the TDS tab first.'); return; }
      const { data: portal } = await res.json();
      if (!portal) { setAisImportMsg('No AIS/26AS data found. Import it from the TDS tab first.'); return; }

      const newFDs: FDEntry[] = [];
      const newDivs: DividendEntry[] = [];
      let newSavings = state.savingsInterest;

      // SFT FD entries (Part B2 SFT-016(TD))
      if (Array.isArray(portal.sftFDEntries)) {
        for (const f of portal.sftFDEntries) {
          if (!state.fdEntries.some(e => e.bankName === f.bankName)) {
            newFDs.push({ id: crypto.randomUUID(), bankName: f.bankName, interestAmount: f.interestAmount, tdsDeducted: 0 });
          }
        }
      }
      // Savings bank interest (SFT-016(SB))
      if (portal.sftSavingsInterest > 0 && state.savingsInterest === 0) {
        newSavings = portal.sftSavingsInterest;
      }
      // SFT dividends (SFT-015)
      if (Array.isArray(portal.sftDividends)) {
        for (const d of portal.sftDividends) {
          if (!state.dividendEntries.some(e => e.companyName === d.companyName)) {
            newDivs.push({ id: crypto.randomUUID(), companyName: d.companyName, amount: d.amount });
          }
        }
      }
      // 26AS section-based: 194A = FD interest, 194/194K = dividend
      if (Array.isArray(portal.tdsEntries)) {
        for (const e of portal.tdsEntries) {
          const sec = (e.section ?? '').replace(/\s/g, '');
          if (/^194A/i.test(sec) && !state.fdEntries.some(f => f.bankName === e.name) && !newFDs.some(f => f.bankName === e.name)) {
            newFDs.push({ id: crypto.randomUUID(), bankName: e.name, interestAmount: e.incomeAmount ?? 0, tdsDeducted: e.tdsDeducted ?? 0 });
          } else if (/^194(K|LBA|LBB|LBC)?$|^194$/i.test(sec) && !state.dividendEntries.some(d => d.companyName === e.name) && !newDivs.some(d => d.companyName === e.name)) {
            newDivs.push({ id: crypto.randomUUID(), companyName: e.name, amount: e.incomeAmount ?? 0 });
          }
        }
      }

      if (newFDs.length === 0 && newDivs.length === 0 && newSavings === state.savingsInterest) {
        setAisImportMsg('No new interest or dividend data found in the imported AIS/26AS.');
        return;
      }

      const next: OSFormState = {
        ...state,
        savingsInterest: newSavings,
        fdEntries: [...state.fdEntries, ...newFDs],
        dividendEntries: [...state.dividendEntries, ...newDivs],
      };
      setState(next);
      scheduleAutoSave(next);

      const parts = [];
      if (newFDs.length) parts.push(`${newFDs.length} FD/interest entries`);
      if (newDivs.length) parts.push(`${newDivs.length} dividend entries`);
      if (newSavings !== state.savingsInterest) parts.push(`savings interest ₹${newSavings.toLocaleString('en-IN')}`);
      setAisImportMsg(`Imported: ${parts.join(', ')}.`);
    } catch (e: any) {
      setAisImportMsg(e.message ?? 'Failed to import portal data');
    } finally {
      setAisImporting(false);
    }
  }

  const summary = computeSummary(state);
  const fpDeduction = computeFamilyPensionDeduction(state.familyPensionReceived);

  return (
    <div className="schedule-os">
      {/* Top bar */}
      <div className="schedule-topbar">
        <div>
          <h2 className="schedule-title">Schedule OS — Other Sources</h2>
          <p className="schedule-subtitle">u/s 56–59 of the Income Tax Act</p>
        </div>
        <div className="schedule-topbar-right">
          {saving && <span className="save-indicator saving">Saving…</span>}
          {!saving && lastSaved && (
            <span className="save-indicator saved">
              Saved {lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {saveErr && <span className="save-indicator error">{saveErr}</span>}
          <button
            className="btn btn-secondary btn-sm"
            onClick={importFromPortal}
            disabled={aisImporting}
            title="Import FD interest, dividends and savings interest from imported AIS / 26AS data"
          >
            {aisImporting ? '⏳ Importing…' : '⬇ Import from AIS / 26AS'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => save(state)} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {aisImportMsg && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: 13,
          background: aisImportMsg.startsWith('No') || aisImportMsg.startsWith('Failed')
            ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
          color: aisImportMsg.startsWith('No') || aisImportMsg.startsWith('Failed')
            ? '#f87171' : '#4ade80',
          border: '1px solid currentColor',
        }}>
          {aisImportMsg}
        </div>
      )}

      {/* Summary stat cards */}
      <div className="os-stats">
        <div className="stat-card">
          <div className="stat-label">Interest Income</div>
          <div className="stat-value amount">{fmt(summary.savingsInterest + summary.fdInterest)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dividends</div>
          <div className="stat-value amount">{fmt(summary.dividends)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Family Pension (net)</div>
          <div className="stat-value amount">{fmt(summary.familyPensionNet)}</div>
        </div>
        {summary.lotteryWinnings > 0 && (
          <div className="stat-card warn">
            <div className="stat-label">Lottery / Winnings</div>
            <div className="stat-value amount warn-text">{fmt(summary.lotteryWinnings)}</div>
          </div>
        )}
        <div className="stat-card highlight">
          <div className="stat-label">Total OS Income</div>
          <div className="stat-value amount brand">{fmt(summary.totalOSIncome)}</div>
        </div>
      </div>

      {/* 1 — Savings interest */}
      <Section
        title="Savings Account Interest"
        subtitle="u/s 56(2) — eligible for deduction u/s 80TTA up to ₹10,000"
        badge="80TTA eligible"
      >
        <NumField
          label="Total savings interest (all banks combined)"
          value={state.savingsInterest}
          onChange={(v) => update({ savingsInterest: v })}
          hint="As per bank passbook / Form 26AS"
        />
        {state.savingsInterest > 0 && (
          <div className="os-info-note">
            ₹{Math.min(state.savingsInterest, 10000).toLocaleString('en-IN')} will be available as deduction u/s 80TTA in Schedule VI-A.
          </div>
        )}
      </Section>

      {/* 2 — FD / RD interest */}
      <Section
        title="FD / RD / Post Office Interest"
        subtitle="Not eligible for 80TTA — fully taxable at slab rate"
      >
        {state.fdEntries.length === 0 && (
          <div className="empty-state os-empty">No FD entries added yet</div>
        )}
        {state.fdEntries.map((f) => (
          <FDRow key={f.id} entry={f} onChange={updateFD} onRemove={removeFD} />
        ))}
        <button className="btn btn-secondary btn-sm" onClick={addFD}>
          + Add FD / RD Entry
        </button>
        {state.fdEntries.length > 0 && (
          <div className="os-subtotal-row">
            <span>Total FD / RD interest</span>
            <span className="amount">{fmt(summary.fdInterest)}</span>
          </div>
        )}
      </Section>

      {/* 3 — Dividends */}
      <Section
        title="Dividend Income"
        subtitle="Taxable in hands of shareholder u/s 56(2)(i) — post Finance Act 2020"
      >
        {state.dividendEntries.length === 0 && (
          <div className="empty-state os-empty">No dividend entries added yet</div>
        )}
        {state.dividendEntries.map((d) => (
          <DivRow key={d.id} entry={d} onChange={updateDiv} onRemove={removeDiv} />
        ))}
        <button className="btn btn-secondary btn-sm" onClick={addDiv}>
          + Add Dividend Entry
        </button>
        {state.dividendEntries.length > 0 && (
          <div className="os-subtotal-row">
            <span>Total dividend income</span>
            <span className="amount">{fmt(summary.dividends)}</span>
          </div>
        )}
      </Section>

      {/* 4 — Family pension */}
      <Section
        title="Family Pension"
        subtitle="Received by family member of deceased government / private employee"
      >
        <NumField
          label="Family Pension Received (gross)"
          value={state.familyPensionReceived}
          onChange={(v) => update({ familyPensionReceived: v })}
        />
        {state.familyPensionReceived > 0 && (
          <>
            <label className="toggle-label" style={{ marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={state.useFamilyPensionDeduction}
                onChange={(e) => update({ useFamilyPensionDeduction: e.target.checked })}
              />
              <span className="toggle-text">
                Apply standard deduction u/s 57(iia) — lower of 1/3rd or ₹15,000
              </span>
            </label>
            {state.useFamilyPensionDeduction && (
              <div className="os-fp-dedn-row">
                <div className="os-fp-item">
                  <span className="os-fp-label">Gross Family Pension</span>
                  <span className="amount">{fmt(state.familyPensionReceived)}</span>
                </div>
                <div className="os-fp-item">
                  <span className="os-fp-label">
                    Less: Deduction u/s 57(iia) (1/3rd = {fmt(Math.round(state.familyPensionReceived / 3))}, capped ₹15,000)
                  </span>
                  <span className="amount deduct">({fmt(fpDeduction)})</span>
                </div>
                <div className="os-fp-item total">
                  <span className="os-fp-label">Net Taxable Family Pension</span>
                  <span className="amount brand">{fmt(summary.familyPensionNet)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {/* 5 — Lottery / winnings */}
      <Section
        title="Lottery / Prize / Game Show Winnings"
        subtitle="Taxed at flat 30% u/s 115BB — no deduction allowed"
        badge="Flat 30%"
      >
        <NumField
          label="Total winnings (lottery, crossword, card game, reality show)"
          value={state.lotteryWinnings}
          onChange={(v) => update({ lotteryWinnings: v })}
        />
        {state.lotteryWinnings > 0 && (
          <div className="os-warn-note">
            Tax on ₹{state.lotteryWinnings.toLocaleString('en-IN')} will be computed at flat 30% + surcharge + cess (u/s 115BB), irrespective of slab.
          </div>
        )}
      </Section>

      {/* 6 — Other income */}
      <Section
        title="Other Income"
        subtitle="Gifts exceeding ₹50,000, sub-letting, director fees, royalty, etc."
      >
        {state.otherEntries.length === 0 && (
          <div className="empty-state os-empty">No other income entries added yet</div>
        )}
        {state.otherEntries.map((o) => (
          <OtherRow key={o.id} entry={o} onChange={updateOther} onRemove={removeOther} />
        ))}
        <button className="btn btn-secondary btn-sm" onClick={addOther}>
          + Add Other Income
        </button>
        {state.otherEntries.length > 0 && (
          <div className="os-subtotal-row">
            <span>Total other income</span>
            <span className="amount">{fmt(summary.otherIncome)}</span>
          </div>
        )}
      </Section>

      {/* 7 — Deduction u/s 57 */}
      <Section
        title="Deduction u/s 57 — Expenses"
        subtitle="Expenses incurred to earn other source income (not applicable to lottery / dividend)"
      >
        <NumField
          label="Allowable expenses u/s 57"
          value={state.deductionU57}
          onChange={(v) => update({ deductionU57: v })}
          hint="E.g. collection charges on FD, interest paid on loan taken to earn dividend"
        />
        {state.deductionU57 > 0 && summary.totalOSIncomeExLottery <= 0 && (
          <div className="os-warn-note">
            Deduction u/s 57 cannot create a loss under this head.
          </div>
        )}
      </Section>

      {/* Computation table */}
      <div className="card os-comp-wrap">
        <div className="os-comp-title">Income from Other Sources — Computation</div>
        <table className="data-table os-comp-table">
          <tbody>
            <tr>
              <td>Savings Account Interest</td>
              <td className="amount text-right">{fmt(summary.savingsInterest)}</td>
            </tr>
            <tr>
              <td>FD / RD / Post Office Interest</td>
              <td className="amount text-right">{fmt(summary.fdInterest)}</td>
            </tr>
            <tr>
              <td>Dividend Income</td>
              <td className="amount text-right">{fmt(summary.dividends)}</td>
            </tr>
            {summary.familyPensionGross > 0 && (
              <>
                <tr>
                  <td>Family Pension (gross)</td>
                  <td className="amount text-right">{fmt(summary.familyPensionGross)}</td>
                </tr>
                {summary.familyPensionDeduction > 0 && (
                  <tr>
                    <td>Less: Deduction u/s 57(iia)</td>
                    <td className="amount text-right deduct">({fmt(summary.familyPensionDeduction)})</td>
                  </tr>
                )}
              </>
            )}
            <tr>
              <td>Other Income</td>
              <td className="amount text-right">{fmt(summary.otherIncome)}</td>
            </tr>
            {summary.deductionU57 > 0 && (
              <tr>
                <td>Less: Deduction u/s 57</td>
                <td className="amount text-right deduct">({fmt(summary.deductionU57)})</td>
              </tr>
            )}
            <tr className="os-subtotal-tr">
              <td>Income from Other Sources (at slab rate)</td>
              <td className="amount text-right">{fmt(summary.totalOSIncomeExLottery)}</td>
            </tr>
            {summary.lotteryWinnings > 0 && (
              <>
                <tr>
                  <td>Lottery / Winnings u/s 115BB</td>
                  <td className="amount text-right warn-text">{fmt(summary.lotteryWinnings)}</td>
                </tr>
                <tr className="os-subtotal-tr">
                  <td>Add: Lottery income (taxed @ flat 30%)</td>
                  <td className="amount text-right warn-text">{fmt(summary.lotteryWinnings)}</td>
                </tr>
              </>
            )}
            <tr className="os-total-tr">
              <td>Total Income from Other Sources</td>
              <td className="amount text-right brand">{fmt(summary.totalOSIncome)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <style>{`
        .schedule-os {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding-bottom: 3rem;
        }

        /* Top bar */
        .schedule-topbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .schedule-title {
          font-size: 1.15rem;
          font-weight: 600;
          color: var(--brand-text, #F0C040);
          margin: 0 0 0.2rem;
        }
        .schedule-subtitle {
          font-size: 0.78rem;
          color: var(--text-muted, #8B949E);
          margin: 0;
        }
        .schedule-topbar-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .save-indicator { font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 4px; }
        .save-indicator.saving { color: var(--brand-text,#F0C040); background: rgba(212,160,23,.12); }
        .save-indicator.saved  { color: #3fb950; background: rgba(63,185,80,.10); }
        .save-indicator.error  { color: #f85149; background: rgba(248,81,73,.10); }

        /* Stats */
        .os-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }
        .stat-card.highlight { border-color: var(--brand-primary,#D4A017); }
        .stat-card.warn { border-color: #e3b341; }
        .stat-value.brand { color: var(--brand-text,#F0C040); }
        .stat-value.warn-text { color: #e3b341; }

        /* Section */
        .os-section { padding: 1.25rem; }
        .os-section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 1rem;
          gap: 0.75rem;
        }
        .os-section-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary,#E6EDF3);
        }
        .os-section-subtitle {
          font-size: 0.74rem;
          color: var(--text-muted,#8B949E);
          margin-top: 0.2rem;
        }
        .os-section-badge {
          font-size: 0.68rem;
          font-weight: 600;
          background: rgba(212,160,23,.15);
          color: var(--brand-text,#F0C040);
          border: 1px solid rgba(212,160,23,.3);
          border-radius: 4px;
          padding: 0.2rem 0.5rem;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .os-section-body {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        /* Entry rows */
        .os-entry-row {
          padding: 0.9rem;
          position: relative;
        }
        .os-remove-btn {
          margin-top: 0.5rem;
        }
        .os-empty {
          padding: 0.75rem 0;
          font-size: 0.82rem;
        }
        .os-subtotal-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: rgba(255,255,255,.03);
          border-radius: 4px;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary,#E6EDF3);
        }

        /* Notes */
        .os-info-note {
          font-size: 0.74rem;
          color: #3fb950;
          background: rgba(63,185,80,.08);
          border: 1px solid rgba(63,185,80,.2);
          border-radius: 4px;
          padding: 0.4rem 0.6rem;
        }
        .os-warn-note {
          font-size: 0.74rem;
          color: #e3b341;
          background: rgba(227,179,65,.08);
          border: 1px solid rgba(227,179,65,.2);
          border-radius: 4px;
          padding: 0.4rem 0.6rem;
        }

        /* Family pension deduction */
        .toggle-label { display: flex; align-items: flex-start; gap: 0.45rem; cursor: pointer; font-size: 0.82rem; color: var(--text-muted,#8B949E); }
        .toggle-label input[type="checkbox"] { accent-color: var(--brand-primary,#D4A017); margin-top: 2px; }
        .toggle-text { user-select: none; }
        .os-fp-dedn-row {
          display: flex;
          flex-direction: column;
          gap: 0;
          background: var(--bg-base,#0D1117);
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 6px;
          overflow: hidden;
        }
        .os-fp-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
          border-bottom: 1px solid rgba(255,255,255,.04);
          gap: 1rem;
        }
        .os-fp-item:last-child { border-bottom: none; }
        .os-fp-item.total { background: rgba(212,160,23,.06); font-weight: 700; }
        .os-fp-label { color: var(--text-primary,#E6EDF3); }
        .deduct { color: #f85149; }
        .brand { color: var(--brand-text,#F0C040); }
        .warn-text { color: #e3b341; }

        /* Computation table */
        .os-comp-wrap { padding: 1.25rem; }
        .os-comp-title { font-size: 0.9rem; font-weight: 600; color: var(--text-primary,#E6EDF3); margin-bottom: 1rem; }
        .os-comp-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .os-comp-table td { padding: 0.45rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,.04); color: var(--text-secondary,#8B949E); }
        .os-comp-table td:first-child { color: var(--text-primary,#E6EDF3); }
        .text-right { text-align: right; }
        .os-subtotal-tr td { background: rgba(255,255,255,.02); font-weight: 600; color: var(--text-primary,#E6EDF3) !important; }
        .os-total-tr td { background: rgba(212,160,23,.07); font-weight: 700; font-size: 0.9rem; border-top: 1px solid rgba(212,160,23,.25); border-bottom: none; }

        /* Hint */
        .form-hint { font-size: 0.72rem; color: var(--text-muted,#8B949E); margin-top: 0.25rem; display: block; }
        .os-readonly { opacity: .55; cursor: default; }
      `}</style>
    </div>
  );
}
