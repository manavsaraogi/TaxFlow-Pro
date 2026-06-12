'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type {
  ScheduleSalary,
  ReturnData,
} from '../../../shared/types/itr';

// ─── Mock helpers (dev fallback) ────────────────────────────────────────────

const isMock = typeof window === 'undefined' || typeof (window as any).taxflow === 'undefined';

function mockUpsertSalary(returnId: string, data: ScheduleSalary): Promise<void> {
  return new Promise((res) => setTimeout(() => { console.log('[mock] upsertSalary', returnId, data); res(); }, 400));
}

// ─── Sub-types ────────────────────────────────────────────────────────────────

interface EmployerEntry {
  id: string;                    // local UUID for list key
  employerName: string;
  tan: string;
  employerCategory: 'govt' | 'psu' | 'others' | 'pensioners';
  grossSalary: number;
  allowancesExemptU10: number;   // HRA, LTA, etc. exempt u/s 10
  hraReceived: number;
  hraExempt: number;             // computed or manual
  perquisites: number;           // value of perquisites u/s 17(2)
  profitInLieuOfSalary: number;  // u/s 17(3)
  retirementBenefits: number;    // gratuity, VRS, leave encashment
}

function emptyEmployer(): EmployerEntry {
  return {
    id: crypto.randomUUID(),
    employerName: '',
    tan: '',
    employerCategory: 'others',
    grossSalary: 0,
    allowancesExemptU10: 0,
    hraReceived: 0,
    hraExempt: 0,
    perquisites: 0,
    profitInLieuOfSalary: 0,
    retirementBenefits: 0,
  };
}

// Deduction u/s 16
interface Section16 {
  standardDeduction: number;      // fixed ₹75,000 for AY 2026-27
  entertainmentAllowance: number; // govt employees only
  professionalTax: number;        // max ₹2,500
}

// HRA computation inputs (optional manual override)
interface HraInputs {
  isMetroCity: boolean;
  basicSalary: number;
  dearnessAllowance: number;
  rentPaid: number;
}

// Full form state
interface SalaryFormState {
  employers: EmployerEntry[];
  section16: Section16;
  hraInputs: HraInputs;
  useComputedHra: boolean;  // false = manual entry
}

function defaultState(): SalaryFormState {
  return {
    employers: [emptyEmployer()],
    section16: {
      standardDeduction: 75000,  // AY 2026-27: ₹75,000
      entertainmentAllowance: 0,
      professionalTax: 0,
    },
    hraInputs: {
      isMetroCity: false,
      basicSalary: 0,
      dearnessAllowance: 0,
      rentPaid: 0,
    },
    useComputedHra: true,
  };
}

// ─── HRA computation logic (Income Tax Act u/s 10(13A)) ──────────────────────

function computeHraExemption(inputs: HraInputs, hraReceived: number): number {
  const { isMetroCity, basicSalary, dearnessAllowance, rentPaid } = inputs;
  const da = dearnessAllowance;
  const basic = basicSalary + da;
  if (basic <= 0 || hraReceived <= 0 || rentPaid <= 0) return 0;

  const a = hraReceived;
  const b = rentPaid - 0.1 * basic;
  const c = isMetroCity ? 0.5 * basic : 0.4 * basic;

  return Math.max(0, Math.min(a, Math.max(0, b), c));
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

function totalGrossSalary(employers: EmployerEntry[]): number {
  return employers.reduce((s, e) => s + e.grossSalary, 0);
}

function totalExemptions(employers: EmployerEntry[], useComputed: boolean, hraInputs: HraInputs): number {
  return employers.reduce((s, e) => {
    const hra = useComputed
      ? computeHraExemption(hraInputs, e.hraReceived)
      : e.hraExempt;
    return s + e.allowancesExemptU10 + hra;
  }, 0);
}

function totalPerquisites(employers: EmployerEntry[]): number {
  return employers.reduce((s, e) => s + e.perquisites + e.profitInLieuOfSalary + e.retirementBenefits, 0);
}

function computeNetSalary(state: SalaryFormState): number {
  const gross = totalGrossSalary(state.employers);
  const exempt = totalExemptions(state.employers, state.useComputedHra, state.hraInputs);
  const perqs = totalPerquisites(state.employers);
  const netBeforeDedn = gross - exempt + perqs;
  const dedn16 =
    state.section16.standardDeduction +
    state.section16.entertainmentAllowance +
    Math.min(state.section16.professionalTax, 2500);
  return Math.max(0, netBeforeDedn - dedn16);
}

// ─── Currency formatter ───────────────────────────────────────────────────────

const fmt = (n: number) =>
  n === 0 ? '₹0' : '₹' + n.toLocaleString('en-IN');

// ─── Sub-components ───────────────────────────────────────────────────────────

interface NumFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  readOnly?: boolean;
  max?: number;
}

function NumField({ label, value, onChange, hint, readOnly, max }: NumFieldProps) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    setRaw(value === 0 ? '' : String(value));
  }, [value]);

  const handleBlur = () => {
    const parsed = Number(raw.replace(/,/g, ''));
    if (!isNaN(parsed)) {
      const clamped = max !== undefined ? Math.min(parsed, max) : parsed;
      onChange(clamped);
      setRaw(clamped === 0 ? '' : String(clamped));
    } else {
      setRaw(value === 0 ? '' : String(value));
    }
  };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className={`form-input${readOnly ? ' readonly-field' : ''}`}
        value={readOnly ? fmt(value).replace('₹', '') : raw}
        readOnly={readOnly}
        placeholder="0"
        onChange={(e) => !readOnly && setRaw(e.target.value)}
        onBlur={!readOnly ? handleBlur : undefined}
      />
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );
}

interface TanFieldProps {
  value: string;
  onChange: (v: string) => void;
}
function TanField({ value, onChange }: TanFieldProps) {
  const [err, setErr] = useState('');
  const validate = (v: string) => {
    const ok = /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(v.toUpperCase());
    setErr(v.length > 0 && !ok ? 'TAN must be 10 chars: AAAA99999A' : '');
    return ok;
  };
  return (
    <div className="form-group">
      <label className="form-label">Employer TAN</label>
      <input
        type="text"
        className="form-input pan-field"
        value={value}
        maxLength={10}
        placeholder="AAAA99999A"
        onChange={(e) => { const v = e.target.value.toUpperCase(); onChange(v); validate(v); }}
      />
      {err && <span className="form-error">{err}</span>}
    </div>
  );
}

// ─── Employer Card ────────────────────────────────────────────────────────────

interface EmployerCardProps {
  emp: EmployerEntry;
  index: number;
  total: number;
  useComputed: boolean;
  hraInputs: HraInputs;
  onChange: (id: string, patch: Partial<EmployerEntry>) => void;
  onRemove: (id: string) => void;
}

function EmployerCard({ emp, index, total, useComputed, hraInputs, onChange, onRemove }: EmployerCardProps) {
  const [expanded, setExpanded] = useState(true);
  const computedHra = computeHraExemption(hraInputs, emp.hraReceived);

  const set = (patch: Partial<EmployerEntry>) => onChange(emp.id, patch);

  return (
    <div className="employer-card card-elevated animate-in">
      {/* ── Card header ── */}
      <div className="employer-card-header" onClick={() => setExpanded((x) => !x)}>
        <div className="employer-card-title">
          <span className="emp-index-badge">{index + 1}</span>
          <span className="emp-name-preview">
            {emp.employerName || 'Unnamed Employer'}
          </span>
          {emp.grossSalary > 0 && (
            <span className="amount emp-gross-preview">{fmt(emp.grossSalary)}</span>
          )}
        </div>
        <div className="employer-card-actions">
          {total > 1 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={(e) => { e.stopPropagation(); onRemove(emp.id); }}
            >
              Remove
            </button>
          )}
          <span className="collapse-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="employer-card-body">
          {/* Basic details */}
          <div className="section-subhead">Employer Details</div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Employer Name</label>
              <input
                type="text"
                className="form-input"
                value={emp.employerName}
                placeholder="ABC Pvt Ltd"
                onChange={(e) => set({ employerName: e.target.value })}
              />
            </div>
            <TanField value={emp.tan} onChange={(v) => set({ tan: v })} />
          </div>

          <div className="form-group">
            <label className="form-label">Employer Category</label>
            <div className="radio-group">
              {(['govt', 'psu', 'pensioners', 'others'] as const).map((cat) => (
                <label key={cat} className="radio-label">
                  <input
                    type="radio"
                    name={`empcat-${emp.id}`}
                    value={cat}
                    checked={emp.employerCategory === cat}
                    onChange={() => set({ employerCategory: cat })}
                  />
                  <span className="radio-text">
                    {cat === 'govt' ? 'Govt.' : cat === 'psu' ? 'PSU' : cat === 'pensioners' ? 'Pensioners' : 'Others'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Salary breakup */}
          <div className="section-subhead">Salary Breakup</div>
          <div className="form-grid-2">
            <NumField
              label="Gross Salary u/s 17(1)"
              value={emp.grossSalary}
              onChange={(v) => set({ grossSalary: v })}
              hint="As per Form 16 Part B"
            />
            <NumField
              label="Perquisites u/s 17(2)"
              value={emp.perquisites}
              onChange={(v) => set({ perquisites: v })}
              hint="Taxable perquisites from Form 12BA"
            />
            <NumField
              label="Profit in Lieu of Salary u/s 17(3)"
              value={emp.profitInLieuOfSalary}
              onChange={(v) => set({ profitInLieuOfSalary: v })}
            />
            <NumField
              label="Retirement Benefits"
              value={emp.retirementBenefits}
              onChange={(v) => set({ retirementBenefits: v })}
              hint="Gratuity, VRS, leave encashment"
            />
          </div>

          {/* Exemptions */}
          <div className="section-subhead">Exemptions u/s 10</div>
          <div className="form-grid-2">
            <NumField
              label="Allowances Exempt u/s 10 (LTA, uniform, etc.)"
              value={emp.allowancesExemptU10}
              onChange={(v) => set({ allowancesExemptU10: v })}
            />
            <NumField
              label="HRA Received"
              value={emp.hraReceived}
              onChange={(v) => set({ hraReceived: v })}
            />
          </div>

          {/* HRA exempt — computed or manual */}
          {useComputed ? (
            <div className="hra-computed-row">
              <div className="hra-computed-label">HRA Exempt (computed)</div>
              <div className="amount hra-computed-value">{fmt(computedHra)}</div>
              <div className="form-hint hra-computed-hint">
                Min of: HRA received, Rent paid − 10% basic, {hraInputs.isMetroCity ? '50%' : '40%'} of basic+DA
              </div>
            </div>
          ) : (
            <NumField
              label="HRA Exempt (manual)"
              value={emp.hraExempt}
              onChange={(v) => set({ hraExempt: v })}
              hint="Override auto-computation"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  returnId: string;
  returnData: ReturnData;
  onSaved: (rd: ReturnData) => void; // parent updates live totals
  setDirty: (d: boolean) => void;
}

export default function ScheduleSalaryComponent({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<SalaryFormState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate from returnData on mount ──
  useEffect(() => {
    if (!returnData) return;
    const s = returnData.scheduleSalary;
    if (!s) return;

    // Map ScheduleSalary (itr.ts) → local form state
    // We store raw employer arrays; adapt field names as needed
    const employers: EmployerEntry[] = Array.isArray((s as any).employers)
      ? (s as any).employers.map((e: any) => ({ id: crypto.randomUUID(), ...e }))
      : [emptyEmployer()];

    setState({
      employers: employers.length ? employers : [emptyEmployer()],
      section16: (s as any).section16 ?? defaultState().section16,
      hraInputs: (s as any).hraInputs ?? defaultState().hraInputs,
      useComputedHra: (s as any).useComputedHra ?? true,
    });
  }, [returnId]);

  // ── Build ScheduleSalary payload ──
  const buildPayload = useCallback((st: SalaryFormState): ScheduleSalary => {
    const grossSalary = totalGrossSalary(st.employers);
    const hraExempt = st.employers.reduce((sum, e) => {
      return sum + (st.useComputedHra
        ? computeHraExemption(st.hraInputs, e.hraReceived)
        : e.hraExempt);
    }, 0);
    const allowancesExempt = st.employers.reduce((s, e) => s + e.allowancesExemptU10, 0);
    const perquisites = st.employers.reduce((s, e) => s + e.perquisites, 0);
    const profitInLieu = st.employers.reduce((s, e) => s + e.profitInLieuOfSalary, 0);
    const retirement = st.employers.reduce((s, e) => s + e.retirementBenefits, 0);

    const netSalary = computeNetSalary(st);

    return {
      grossSalary,
      allowancesExempt10: allowancesExempt + hraExempt,
      netSalary,
      perquisites,
      profitInLieuOfSalary: profitInLieu + retirement,
      standardDeduction: st.section16.standardDeduction,
      entertainmentAllowance: st.section16.entertainmentAllowance,
      professionalTax: Math.min(st.section16.professionalTax, 2500),
      incomeFromSalary: netSalary,
      // Extra fields stored for UI round-trip
      employers: st.employers.map(({ id: _id, ...rest }) => rest),
      section16: st.section16,
      hraInputs: st.hraInputs,
      useComputedHra: st.useComputedHra,
    } as unknown as ScheduleSalary;
  }, []);

  // ── Save ──
  const save = useCallback(async (st: SalaryFormState) => {
    setSaving(true);
    setSaveErr('');
    try {
      const payload = buildPayload(st);
      if (isMock) {
        await mockUpsertSalary(returnId, payload);
      } else {
        await (window as any).taxflow.returns.upsertSalary(returnId, payload);
      }
      setLastSaved(new Date());
      setDirty(false);
      // Propagate updated returnData to parent for live recompute
      onSaved({ ...returnData, scheduleSalary: payload });
    } catch (e: any) {
      setSaveErr(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [returnId, returnData, buildPayload, onSaved, setDirty]);

  // ── Debounced auto-save ──
  const scheduleAutoSave = useCallback((st: SalaryFormState) => {
    setDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(st), 1500);
  }, [save, setDirty]);

  const update = (patch: Partial<SalaryFormState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      scheduleAutoSave(next);
      return next;
    });
  };

  const updateEmployer = (id: string, patch: Partial<EmployerEntry>) => {
    setState((prev) => {
      const next = {
        ...prev,
        employers: prev.employers.map((e) => e.id === id ? { ...e, ...patch } : e),
      };
      scheduleAutoSave(next);
      return next;
    });
  };

  const addEmployer = () => {
    setState((prev) => {
      const next = { ...prev, employers: [...prev.employers, emptyEmployer()] };
      scheduleAutoSave(next);
      return next;
    });
  };

  const removeEmployer = (id: string) => {
    setState((prev) => {
      if (prev.employers.length <= 1) return prev;
      const next = { ...prev, employers: prev.employers.filter((e) => e.id !== id) };
      scheduleAutoSave(next);
      return next;
    });
  };

  // ── Derived totals for summary bar ──
  const netSalary = computeNetSalary(state);
  const grossTotal = totalGrossSalary(state.employers);
  const exemptTotal = totalExemptions(state.employers, state.useComputedHra, state.hraInputs);
  const dedn16Total = state.section16.standardDeduction
    + state.section16.entertainmentAllowance
    + Math.min(state.section16.professionalTax, 2500);

  return (
    <div className="schedule-salary">
      {/* ── Top bar ── */}
      <div className="schedule-topbar">
        <div>
          <h2 className="schedule-title">Schedule S — Salary Income</h2>
          <p className="schedule-subtitle">u/s 15, 16 &amp; 17 of the Income Tax Act</p>
        </div>
        <div className="schedule-topbar-right">
          {saving && <span className="save-indicator saving">Saving…</span>}
          {!saving && lastSaved && (
            <span className="save-indicator saved">
              Saved {lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {saveErr && <span className="save-indicator error">{saveErr}</span>}
          <button className="btn btn-primary btn-sm" onClick={() => save(state)} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Summary stat cards ── */}
      <div className="salary-stats">
        <div className="stat-card">
          <div className="stat-label">Gross Salary</div>
          <div className="stat-value amount">{fmt(grossTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Exemptions u/s 10</div>
          <div className="stat-value amount">{fmt(exemptTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Deduction u/s 16</div>
          <div className="stat-value amount">{fmt(dedn16Total)}</div>
        </div>
        <div className="stat-card highlight">
          <div className="stat-label">Income from Salary</div>
          <div className="stat-value amount brand">{fmt(netSalary)}</div>
        </div>
      </div>

      {/* ── HRA computation toggle + inputs ── */}
      <div className="card hra-panel">
        <div className="hra-panel-header">
          <div className="hra-panel-title">HRA Exemption u/s 10(13A)</div>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={state.useComputedHra}
              onChange={(e) => update({ useComputedHra: e.target.checked })}
            />
            <span className="toggle-text">Auto-compute</span>
          </label>
        </div>

        {state.useComputedHra && (
          <div className="form-grid-3">
            <NumField
              label="Basic Salary (annual)"
              value={state.hraInputs.basicSalary}
              onChange={(v) => update({ hraInputs: { ...state.hraInputs, basicSalary: v } })}
            />
            <NumField
              label="Dearness Allowance (annual)"
              value={state.hraInputs.dearnessAllowance}
              onChange={(v) => update({ hraInputs: { ...state.hraInputs, dearnessAllowance: v } })}
            />
            <NumField
              label="Rent Paid (annual)"
              value={state.hraInputs.rentPaid}
              onChange={(v) => update({ hraInputs: { ...state.hraInputs, rentPaid: v } })}
            />
            <div className="form-group metro-toggle">
              <label className="form-label">City Type</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    checked={state.hraInputs.isMetroCity}
                    onChange={() => update({ hraInputs: { ...state.hraInputs, isMetroCity: true } })}
                  />
                  <span className="radio-text">Metro (50%)</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    checked={!state.hraInputs.isMetroCity}
                    onChange={() => update({ hraInputs: { ...state.hraInputs, isMetroCity: false } })}
                  />
                  <span className="radio-text">Non-Metro (40%)</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Employer cards ── */}
      <div className="employer-list">
        {state.employers.map((emp, idx) => (
          <EmployerCard
            key={emp.id}
            emp={emp}
            index={idx}
            total={state.employers.length}
            useComputed={state.useComputedHra}
            hraInputs={state.hraInputs}
            onChange={updateEmployer}
            onRemove={removeEmployer}
          />
        ))}
      </div>

      <button className="btn btn-secondary add-employer-btn" onClick={addEmployer}>
        + Add Employer
      </button>

      {/* ── Section 16 deductions ── */}
      <div className="card section16-panel">
        <div className="section16-title">Deductions under Section 16</div>
        <div className="form-grid-3">
          <NumField
            label="Standard Deduction u/s 16(ia)"
            value={state.section16.standardDeduction}
            readOnly
            hint="Fixed ₹50,000 for AY 2026-27"
            onChange={() => {}}
          />
          <NumField
            label="Entertainment Allowance u/s 16(ii)"
            value={state.section16.entertainmentAllowance}
            onChange={(v) => update({ section16: { ...state.section16, entertainmentAllowance: v } })}
            hint="Government employees only"
          />
          <NumField
            label="Professional Tax u/s 16(iii)"
            value={state.section16.professionalTax}
            onChange={(v) => update({ section16: { ...state.section16, professionalTax: v } })}
            max={2500}
            hint="Max ₹2,500"
          />
        </div>
      </div>

      {/* ── Computation summary table ── */}
      <div className="card computation-table-wrap">
        <div className="section16-title">Income from Salary — Computation</div>
        <table className="data-table computation-table">
          <tbody>
            <tr>
              <td>Gross Salary u/s 17(1)</td>
              <td className="amount text-right">{fmt(grossTotal)}</td>
            </tr>
            <tr>
              <td>Add: Perquisites u/s 17(2)</td>
              <td className="amount text-right">{fmt(totalPerquisites(state.employers))}</td>
            </tr>
            <tr className="row-subtotal">
              <td>Total Salary (before exemptions)</td>
              <td className="amount text-right">{fmt(grossTotal + totalPerquisites(state.employers))}</td>
            </tr>
            <tr>
              <td>Less: Exemptions u/s 10</td>
              <td className="amount text-right deduction">({fmt(exemptTotal)})</td>
            </tr>
            <tr className="row-subtotal">
              <td>Net Salary (before Sec. 16)</td>
              <td className="amount text-right">{fmt(Math.max(0, grossTotal + totalPerquisites(state.employers) - exemptTotal))}</td>
            </tr>
            <tr>
              <td>Less: Standard Deduction u/s 16(ia)</td>
              <td className="amount text-right deduction">({fmt(state.section16.standardDeduction)})</td>
            </tr>
            {state.section16.entertainmentAllowance > 0 && (
              <tr>
                <td>Less: Entertainment Allowance u/s 16(ii)</td>
                <td className="amount text-right deduction">({fmt(state.section16.entertainmentAllowance)})</td>
              </tr>
            )}
            {state.section16.professionalTax > 0 && (
              <tr>
                <td>Less: Professional Tax u/s 16(iii)</td>
                <td className="amount text-right deduction">({fmt(Math.min(state.section16.professionalTax, 2500))})</td>
              </tr>
            )}
            <tr className="row-total">
              <td>Income from Salary (Chargeable to Tax)</td>
              <td className="amount text-right brand">{fmt(netSalary)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Scoped CSS ── */}
      <style>{`
        .schedule-salary {
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
        .save-indicator {
          font-size: 0.75rem;
          padding: 0.25rem 0.6rem;
          border-radius: 4px;
        }
        .save-indicator.saving { color: var(--brand-text, #F0C040); background: rgba(212,160,23,0.12); }
        .save-indicator.saved  { color: #3fb950; background: rgba(63,185,80,0.10); }
        .save-indicator.error  { color: #f85149; background: rgba(248,81,73,0.10); }

        /* Stats */
        .salary-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 1rem;
        }
        .stat-card.highlight {
          border-color: var(--brand-primary, #D4A017);
        }
        .stat-value.brand {
          color: var(--brand-text, #F0C040);
        }

        /* HRA panel */
        .hra-panel { padding: 1.25rem; }
        .hra-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .hra-panel-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary, #E6EDF3);
        }
        .toggle-label {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          cursor: pointer;
          font-size: 0.8rem;
          color: var(--text-muted, #8B949E);
        }
        .toggle-label input[type="checkbox"] {
          accent-color: var(--brand-primary, #D4A017);
          width: 14px;
          height: 14px;
        }
        .toggle-text { user-select: none; }

        /* HRA computed row */
        .hra-computed-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: rgba(212,160,23,0.07);
          border: 1px solid rgba(212,160,23,0.2);
          border-radius: 6px;
          padding: 0.75rem 1rem;
          flex-wrap: wrap;
        }
        .hra-computed-label {
          font-size: 0.82rem;
          color: var(--text-muted, #8B949E);
        }
        .hra-computed-value {
          font-size: 1rem;
          font-weight: 700;
          color: var(--brand-text, #F0C040);
        }
        .hra-computed-hint {
          font-size: 0.72rem;
          color: var(--text-muted, #8B949E);
          flex-basis: 100%;
          margin-top: 0.25rem;
        }

        /* Employer list */
        .employer-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .employer-card {
          border-radius: 8px;
          overflow: hidden;
        }
        .employer-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1.1rem;
          cursor: pointer;
          background: var(--bg-elevated, #1E2530);
          user-select: none;
        }
        .employer-card-header:hover { background: rgba(255,255,255,0.03); }
        .employer-card-title {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .emp-index-badge {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--brand-primary, #D4A017);
          color: #000;
          font-size: 0.72rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .emp-name-preview {
          font-size: 0.88rem;
          font-weight: 500;
          color: var(--text-primary, #E6EDF3);
        }
        .emp-gross-preview {
          font-size: 0.8rem;
          color: var(--text-muted, #8B949E);
        }
        .employer-card-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .collapse-chevron {
          font-size: 0.7rem;
          color: var(--text-muted, #8B949E);
          padding: 0 0.2rem;
        }
        .employer-card-body {
          padding: 1.1rem;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .section-subhead {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--brand-primary, #D4A017);
          padding-bottom: 0.3rem;
          border-bottom: 1px solid rgba(212,160,23,0.15);
        }

        /* Radio group */
        .radio-group {
          display: flex;
          gap: 1.25rem;
          flex-wrap: wrap;
          margin-top: 0.35rem;
        }
        .radio-label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          cursor: pointer;
          font-size: 0.82rem;
          color: var(--text-primary, #E6EDF3);
        }
        .radio-label input[type="radio"] {
          accent-color: var(--brand-primary, #D4A017);
        }

        /* Add employer btn */
        .add-employer-btn {
          align-self: flex-start;
        }

        /* Section 16 */
        .section16-panel {
          padding: 1.25rem;
        }
        .section16-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary, #E6EDF3);
          margin-bottom: 1rem;
        }
        .readonly-field {
          opacity: 0.55;
          cursor: default;
        }

        /* Form hint */
        .form-hint {
          font-size: 0.72rem;
          color: var(--text-muted, #8B949E);
          margin-top: 0.25rem;
          display: block;
        }

        /* Computation table */
        .computation-table-wrap {
          padding: 1.25rem;
        }
        .computation-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }
        .computation-table td {
          padding: 0.5rem 0.6rem;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          color: var(--text-secondary, #8B949E);
        }
        .computation-table td:first-child { color: var(--text-primary, #E6EDF3); }
        .computation-table .text-right { text-align: right; }
        .computation-table .deduction { color: #f85149; }
        .computation-table .row-subtotal td {
          background: rgba(255,255,255,0.02);
          font-weight: 600;
          color: var(--text-primary, #E6EDF3);
        }
        .computation-table .row-total td {
          background: rgba(212,160,23,0.07);
          font-weight: 700;
          font-size: 0.9rem;
          border-bottom: none;
          border-top: 1px solid rgba(212,160,23,0.25);
        }
        .computation-table .row-total .brand {
          color: var(--brand-text, #F0C040);
        }
      `}</style>
    </div>
  );
}
