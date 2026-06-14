'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type {
  ScheduleSalary,
  ReturnData,
} from '@/shared/types/itr';
import { FieldMessage } from './ValidationContext';

// ─── Sub-types ────────────────────────────────────────────────────────────────

interface EmployerEntry {
  id: string;
  employerName: string;
  tan: string;
  employerCategory: 'govt' | 'psu' | 'others' | 'pensioners';
  grossSalary: number;
  allowancesExemptU10: number;
  hraReceived: number;
  hraExempt: number;
  perquisites: number;
  profitInLieuOfSalary: number;
  retirementBenefits: number;
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

function reverseMapEmployerCategory(nat: string): EmployerEntry['employerCategory'] {
  if (nat === 'CGOV' || nat === 'SGOV') return 'govt';
  if (nat === 'PSU') return 'psu';
  if (nat === 'PE' || nat === 'PESG' || nat === 'PEPS' || nat === 'PEO') return 'pensioners';
  return 'others';
}

interface Section16 {
  standardDeduction: number;
  entertainmentAllowance: number;
  professionalTax: number;
}

interface HraInputs {
  isMetroCity: boolean;
  basicSalary: number;
  dearnessAllowance: number;
  rentPaid: number;
}

interface SalaryFormState {
  employers: EmployerEntry[];
  section16: Section16;
  hraInputs: HraInputs;
  useComputedHra: boolean;
}

function defaultState(): SalaryFormState {
  return {
    employers: [emptyEmployer()],
    section16: {
      standardDeduction: 75000,
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

// ─── HRA computation ──────────────────────────────────────────────────────────

function computeHraExemption(inputs: HraInputs, hraReceived: number): number {
  const { isMetroCity, basicSalary, dearnessAllowance, rentPaid } = inputs;
  const basic = basicSalary + dearnessAllowance;
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
    const hra = useComputed ? computeHraExemption(hraInputs, e.hraReceived) : e.hraExempt;
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
  const dedn16 =
    state.section16.standardDeduction +
    state.section16.entertainmentAllowance +
    Math.min(state.section16.professionalTax, 2500);
  return Math.max(0, gross - exempt + perqs - dedn16);
}

const fmt = (n: number) => (n === 0 ? '₹0' : '₹' + n.toLocaleString('en-IN'));

// ─── Inline amount input ──────────────────────────────────────────────────────

function AmtInput({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value));
  useEffect(() => { setRaw(value === 0 ? '' : String(value)); }, [value]);

  if (readOnly) {
    return (
      <div className="itr-amount-display">
        {value === 0 ? <span className="itr-amount-zero">—</span> : fmt(value)}
      </div>
    );
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className="itr-amount-input"
      value={raw}
      placeholder="0"
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        const n = Number(raw.replace(/,/g, ''));
        const v = isNaN(n) ? 0 : n;
        onChange?.(v);
        setRaw(v === 0 ? '' : String(v));
      }}
    />
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      className="itr-text-input"
      value={value}
      placeholder={placeholder ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  returnId: string;
  returnData: ReturnData;
  onSaved: (rd: ReturnData) => void;
  setDirty: (d: boolean) => void;
}

export default function ScheduleSalaryComponent({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<SalaryFormState>(defaultState);
  const [activeEmpId, setActiveEmpId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate from returnData ──
  useEffect(() => {
    if (!returnData) return;
    const s = (returnData as any).salarySchedule ?? (returnData as any).scheduleSalary;
    if (!s) return;

    let hraInputs = defaultState().hraInputs;
    let section16 = defaultState().section16;
    let useComputedHra = true;
    try {
      if (s.hraDetailsJson) hraInputs = JSON.parse(s.hraDetailsJson);
      if (s.allowancesJson) {
        const aj = JSON.parse(s.allowancesJson);
        if (aj.section16) section16 = aj.section16;
        if (aj.useComputedHra !== undefined) useComputedHra = aj.useComputedHra;
      }
    } catch { /* defaults */ }

    const dbEmployers: any[] = Array.isArray(s.employers) ? s.employers : [];
    const employers: EmployerEntry[] = dbEmployers.length
      ? dbEmployers.map((e: any) => ({
          id: crypto.randomUUID(),
          employerName: e.nameOfEmployer ?? '',
          tan: e.tanOfEmployer ?? '',
          employerCategory: reverseMapEmployerCategory(e.natureOfEmployment),
          grossSalary: e.grossSalary ?? 0,
          allowancesExemptU10: 0,
          hraReceived: 0,
          hraExempt: 0,
          perquisites: e.valueOfPerquisites ?? 0,
          profitInLieuOfSalary: e.profitsinLieuOfSalary ?? 0,
          retirementBenefits: 0,
        }))
      : [emptyEmployer()];

    const newState: SalaryFormState = {
      employers: employers.length ? employers : [emptyEmployer()],
      section16,
      hraInputs,
      useComputedHra,
    };
    setState(newState);
    setActiveEmpId(newState.employers[0].id);
  }, [returnId]);

  // Set active when first employer added
  useEffect(() => {
    if (!activeEmpId && state.employers.length) {
      setActiveEmpId(state.employers[0].id);
    }
  }, [state.employers, activeEmpId]);

  // ── Build payload ──
  const buildPayload = useCallback((st: SalaryFormState): ScheduleSalary => {
    const grossSalary = totalGrossSalary(st.employers);
    const hraExempt = st.employers.reduce((sum, e) =>
      sum + (st.useComputedHra ? computeHraExemption(st.hraInputs, e.hraReceived) : e.hraExempt), 0);
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
      employers: st.employers.map(({ id: _id, ...rest }) => rest),
      section16: st.section16,
      hraInputs: st.hraInputs,
      useComputedHra: st.useComputedHra,
    } as unknown as ScheduleSalary;
  }, []);

  const save = useCallback(async (st: SalaryFormState) => {
    setSaving(true);
    setSaveErr('');
    try {
      const payload = buildPayload(st);
      const res = await fetch(`/api/returns/${returnId}/schedule/salary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Save failed'); }
      setLastSaved(new Date());
      setDirty(false);
      onSaved({ ...(returnData as any), scheduleSalary: payload } as any);
    } catch (e: any) {
      setSaveErr(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [returnId, returnData, buildPayload, onSaved, setDirty]);

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

  const updateEmp = (id: string, patch: Partial<EmployerEntry>) => {
    setState((prev) => {
      const next = { ...prev, employers: prev.employers.map((e) => e.id === id ? { ...e, ...patch } : e) };
      scheduleAutoSave(next);
      return next;
    });
  };

  const addEmployer = () => {
    const emp = emptyEmployer();
    setState((prev) => {
      const next = { ...prev, employers: [...prev.employers, emp] };
      scheduleAutoSave(next);
      return next;
    });
    setActiveEmpId(emp.id);
  };

  const removeEmployer = (id: string) => {
    setState((prev) => {
      if (prev.employers.length <= 1) return prev;
      const next = { ...prev, employers: prev.employers.filter((e) => e.id !== id) };
      scheduleAutoSave(next);
      if (activeEmpId === id) setActiveEmpId(next.employers[0].id);
      return next;
    });
  };

  const emp = state.employers.find((e) => e.id === activeEmpId) ?? state.employers[0];
  const empIdx = state.employers.findIndex((e) => e.id === (emp?.id ?? ''));
  if (!emp) return null;

  const computedHra = computeHraExemption(state.hraInputs, emp.hraReceived);
  const hraExempt = state.useComputedHra ? computedHra : emp.hraExempt;
  const totalExempt = emp.allowancesExemptU10 + hraExempt;
  const grossBeforeExempt = emp.grossSalary + emp.perquisites + emp.profitInLieuOfSalary + emp.retirementBenefits;
  const netBeforeDedn = Math.max(0, grossBeforeExempt - totalExempt);
  const dedn16Total = state.section16.standardDeduction + state.section16.entertainmentAllowance + Math.min(state.section16.professionalTax, 2500);
  const netSalaryAll = computeNetSalary(state);

  const empCatLabel = { govt: 'Govt.', psu: 'PSU', pensioners: 'Pensioners', others: 'Others' };

  return (
    <div className="itr-form">
      {/* Schedule header */}
      <div className="itr-schedule-header">
        <span className="schedule-code">S</span>
        <span className="schedule-title">Schedule S — Income from Salary</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>u/s 15, 16 &amp; 17</span>
      </div>

      {/* Entity tabs — one per employer */}
      <div className="itr-entity-tabs">
        {state.employers.map((e, i) => (
          <button
            key={e.id}
            className={`itr-entity-tab${activeEmpId === e.id ? ' active' : ''}`}
            onClick={() => setActiveEmpId(e.id)}
          >
            {e.employerName || `Employer ${i + 1}`}
          </button>
        ))}
        <button className="itr-entity-tab add-tab" onClick={addEmployer}>+ Add</button>
      </div>

      {/* Employer details sub-section */}
      <div className="itr-section-head">Employer Details</div>

      <div className="itr-row">
        <div className="itr-num"></div>
        <div className="itr-label">Employer Name</div>
        <div className="itr-amount" style={{ flex: 2 }}>
          <TextInput
            value={emp.employerName}
            onChange={(v) => updateEmp(emp.id, { employerName: v })}
            placeholder="ABC Pvt Ltd"
          />
          <FieldMessage field={`employer.${empIdx}.name`} />
        </div>
      </div>

      <div className="itr-row">
        <div className="itr-num"></div>
        <div className="itr-label">Employer TAN</div>
        <div className="itr-amount">
          <input
            type="text"
            className="itr-text-input"
            value={emp.tan}
            maxLength={10}
            placeholder="AAAA99999A"
            onChange={(e) => updateEmp(emp.id, { tan: e.target.value.toUpperCase() })}
          />
          <FieldMessage field={`employer.${empIdx}.tan`} />
        </div>
      </div>

      <div className="itr-row">
        <div className="itr-num"></div>
        <div className="itr-label">Employer Category</div>
        <div className="itr-amount">
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {([
              { value: 'govt',       label: 'Govt. (Central / State)', hint: 'CGOV / SGOV' },
              { value: 'psu',        label: 'PSU',                     hint: 'Public Sector' },
              { value: 'pensioners', label: 'Pensioners',              hint: 'Includes ex-employees' },
              { value: 'others',     label: 'Others',                   hint: 'Private sector' },
            ] as const).map(({ value: cat, label, hint }) => (
              <button
                key={cat}
                type="button"
                title={hint}
                onClick={() => updateEmp(emp.id, { employerCategory: cat })}
                style={{
                  padding: '5px 12px', fontSize: '0.78rem', borderRadius: '6px',
                  border: '1.5px solid',
                  borderColor: emp.employerCategory === cat ? 'var(--brand-primary)' : 'var(--border-color)',
                  background: emp.employerCategory === cat ? 'var(--brand-primary)' : 'var(--bg-surface)',
                  color: emp.employerCategory === cat ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer', fontWeight: emp.employerCategory === cat ? 700 : 400,
                  transition: 'all 0.12s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
            {emp.employerCategory === 'govt' ? 'Maps to CGOV/SGOV in ITR' :
             emp.employerCategory === 'psu' ? 'Maps to PSU in ITR' :
             emp.employerCategory === 'pensioners' ? 'Maps to PE/PESG/PEPS/PEO in ITR' :
             'Maps to OTH in ITR'}
          </span>
        </div>
      </div>

      {state.employers.length > 1 && (
        <div className="itr-row">
          <div className="itr-num"></div>
          <div className="itr-label" style={{ color: 'var(--text-muted)' }}>Remove this employer</div>
          <div className="itr-amount">
            <button
              className="btn btn-danger btn-sm"
              onClick={() => removeEmployer(emp.id)}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Schedule S rows */}
      <div className="itr-section-head">Schedule S — Income from Salary</div>

      <div className="itr-row">
        <div className="itr-num">1</div>
        <div className="itr-label">Salary as per sec. 17(1)</div>
        <div className="itr-amount">
          <AmtInput value={emp.grossSalary} onChange={(v) => updateEmp(emp.id, { grossSalary: v })} />
        </div>
      </div>

      <div className="itr-row">
        <div className="itr-num">2</div>
        <div className="itr-label">Value of perquisites u/s 17(2)</div>
        <div className="itr-amount">
          <AmtInput value={emp.perquisites} onChange={(v) => updateEmp(emp.id, { perquisites: v })} />
        </div>
      </div>

      <div className="itr-row">
        <div className="itr-num">3</div>
        <div className="itr-label">Profits in lieu of salary u/s 17(3)</div>
        <div className="itr-amount">
          <AmtInput value={emp.profitInLieuOfSalary} onChange={(v) => updateEmp(emp.id, { profitInLieuOfSalary: v })} />
        </div>
      </div>

      <div className="itr-row">
        <div className="itr-num">3a</div>
        <div className="itr-label">Retirement benefits (gratuity, VRS, leave encashment)</div>
        <div className="itr-amount">
          <AmtInput value={emp.retirementBenefits} onChange={(v) => updateEmp(emp.id, { retirementBenefits: v })} />
        </div>
      </div>

      <div className="itr-row subtotal">
        <div className="itr-num">4</div>
        <div className="itr-label">Total (1 + 2 + 3 + 3a)</div>
        <div className="itr-amount">
          <AmtInput value={grossBeforeExempt} readOnly />
        </div>
      </div>

      {/* Exemptions u/s 10 */}
      <div className="itr-section-head">Exemptions u/s 10</div>

      <div className="itr-row">
        <div className="itr-num">5a</div>
        <div className="itr-label">HRA received from employer</div>
        <div className="itr-amount">
          <AmtInput value={emp.hraReceived} onChange={(v) => updateEmp(emp.id, { hraReceived: v })} />
        </div>
      </div>

      {state.useComputedHra ? (
        <div className="itr-row computed">
          <div className="itr-num">5b</div>
          <div className="itr-label">
            HRA exempt u/s 10(13A) — auto-computed
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
              (Min of: HRA received, Rent−10% basic, {state.hraInputs.isMetroCity ? '50%' : '40%'} basic+DA)
            </span>
          </div>
          <div className="itr-amount">
            <AmtInput value={computedHra} readOnly />
          </div>
        </div>
      ) : (
        <div className="itr-row">
          <div className="itr-num">5b</div>
          <div className="itr-label">HRA exempt u/s 10(13A) — manual</div>
          <div className="itr-amount">
            <AmtInput value={emp.hraExempt} onChange={(v) => updateEmp(emp.id, { hraExempt: v })} />
          </div>
        </div>
      )}

      <div className="itr-row">
        <div className="itr-num">5c</div>
        <div className="itr-label">Other allowances exempt u/s 10 (LTA, uniform, etc.)</div>
        <div className="itr-amount">
          <AmtInput value={emp.allowancesExemptU10} onChange={(v) => updateEmp(emp.id, { allowancesExemptU10: v })} />
        </div>
      </div>

      <div className="itr-row subtotal">
        <div className="itr-num">5</div>
        <div className="itr-label">Total allowances exempt u/s 10 (5b + 5c)</div>
        <div className="itr-amount">
          <AmtInput value={totalExempt} readOnly />
        </div>
      </div>

      <div className="itr-row subtotal">
        <div className="itr-num">6</div>
        <div className="itr-label">Net salary (4 − 5)</div>
        <div className="itr-amount">
          <AmtInput value={netBeforeDedn} readOnly />
        </div>
      </div>

      {/* HRA computation inputs when auto-compute is on */}
      {state.useComputedHra && (
        <>
          <div className="itr-section-head" style={{ fontSize: '0.75rem' }}>
            HRA Auto-Computation Inputs
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontWeight: 400, fontSize: '0.75rem' }}>
              <input
                type="checkbox"
                checked={state.useComputedHra}
                onChange={(e) => update({ useComputedHra: e.target.checked })}
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              Auto-compute HRA
            </label>
          </div>

          <div className="itr-row">
            <div className="itr-num"></div>
            <div className="itr-label">Basic Salary (annual)</div>
            <div className="itr-amount">
              <AmtInput value={state.hraInputs.basicSalary} onChange={(v) => update({ hraInputs: { ...state.hraInputs, basicSalary: v } })} />
            </div>
          </div>
          <div className="itr-row">
            <div className="itr-num"></div>
            <div className="itr-label">Dearness Allowance (annual)</div>
            <div className="itr-amount">
              <AmtInput value={state.hraInputs.dearnessAllowance} onChange={(v) => update({ hraInputs: { ...state.hraInputs, dearnessAllowance: v } })} />
            </div>
          </div>
          <div className="itr-row">
            <div className="itr-num"></div>
            <div className="itr-label">Annual Rent Paid</div>
            <div className="itr-amount">
              <AmtInput value={state.hraInputs.rentPaid} onChange={(v) => update({ hraInputs: { ...state.hraInputs, rentPaid: v } })} />
            </div>
          </div>
          <div className="itr-row">
            <div className="itr-num"></div>
            <div className="itr-label">City Type</div>
            <div className="itr-amount">
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {[
                  { label: 'Metro City (50%)', value: true, hint: 'Delhi, Mumbai, Chennai, Kolkata' },
                  { label: 'Non-Metro (40%)',  value: false, hint: 'All other cities' },
                ].map(({ label, value, hint }) => (
                  <button
                    key={String(value)} type="button" title={hint}
                    onClick={() => update({ hraInputs: { ...state.hraInputs, isMetroCity: value } })}
                    style={{
                      padding: '5px 12px', fontSize: '0.78rem', borderRadius: '6px',
                      border: '1.5px solid',
                      borderColor: state.hraInputs.isMetroCity === value ? 'var(--brand-primary)' : 'var(--border-color)',
                      background: state.hraInputs.isMetroCity === value ? 'var(--brand-primary)' : 'var(--bg-surface)',
                      color: state.hraInputs.isMetroCity === value ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer', fontWeight: state.hraInputs.isMetroCity === value ? 700 : 400,
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {!state.useComputedHra && (
        <div className="itr-row">
          <div className="itr-num"></div>
          <div className="itr-label">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}>
              <input
                type="checkbox"
                checked={state.useComputedHra}
                onChange={(e) => update({ useComputedHra: e.target.checked })}
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              Enable auto HRA computation
            </label>
          </div>
          <div className="itr-amount"></div>
        </div>
      )}

      {/* Deductions u/s 16 */}
      <div className="itr-section-head">Deductions u/s 16</div>

      <div className="itr-row computed">
        <div className="itr-num">16(ia)</div>
        <div className="itr-label">Standard deduction u/s 16(ia)</div>
        <div className="itr-amount">
          <AmtInput value={state.section16.standardDeduction} readOnly />
        </div>
      </div>

      <div className="itr-row">
        <div className="itr-num">16(ii)</div>
        <div className="itr-label">Entertainment allowance u/s 16(ii) <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(Govt. employees only)</span></div>
        <div className="itr-amount">
          <AmtInput value={state.section16.entertainmentAllowance} onChange={(v) => update({ section16: { ...state.section16, entertainmentAllowance: v } })} />
        </div>
      </div>

      <div className="itr-row">
        <div className="itr-num">16(iii)</div>
        <div className="itr-label">Professional tax u/s 16(iii) <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(max ₹2,500)</span></div>
        <div className="itr-amount">
          <AmtInput value={state.section16.professionalTax} onChange={(v) => update({ section16: { ...state.section16, professionalTax: v } })} />
        </div>
      </div>

      <div className="itr-row subtotal">
        <div className="itr-num"></div>
        <div className="itr-label">Total deductions u/s 16</div>
        <div className="itr-amount">
          <AmtInput value={dedn16Total} readOnly />
        </div>
      </div>

      {/* Total income from salary — all employers combined */}
      <div className="itr-row total">
        <div className="itr-num">B</div>
        <div className="itr-label">Income chargeable under "Salaries" (all employers)</div>
        <div className="itr-amount">
          <AmtInput value={netSalaryAll} readOnly />
        </div>
      </div>

      {/* Action bar */}
      <div className="itr-action-bar">
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {saving && 'Saving…'}
          {!saving && lastSaved && `Saved ${lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
          {saveErr && <span style={{ color: '#f85149' }}>{saveErr}</span>}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => save(state)} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <style>{`
        .itr-amount-display {
          font-size: 0.85rem;
          font-variant-numeric: tabular-nums;
          color: var(--text-secondary, #C9D1D9);
          text-align: right;
          padding: 0.3rem 0.5rem;
        }
        .itr-amount-zero { color: var(--text-muted, #8B949E); }
        .itr-amount-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-subtle, #30363D);
          color: var(--text-primary, #E6EDF3);
          font-size: 0.85rem;
          font-variant-numeric: tabular-nums;
          text-align: right;
          padding: 0.3rem 0.5rem;
          outline: none;
        }
        .itr-amount-input:focus {
          border-bottom-color: var(--brand-primary, #D4A017);
          background: rgba(212,160,23,0.05);
        }
        .itr-text-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-subtle, #30363D);
          color: var(--text-primary, #E6EDF3);
          font-size: 0.83rem;
          padding: 0.3rem 0.5rem;
          outline: none;
        }
        .itr-text-input:focus { border-bottom-color: var(--brand-primary, #D4A017); }
        .add-tab {
          color: var(--brand-text, #F0C040) !important;
          border-color: transparent !important;
          background: transparent !important;
        }
        .add-tab:hover { background: rgba(212,160,23,0.08) !important; }
      `}</style>
    </div>
  );
}
