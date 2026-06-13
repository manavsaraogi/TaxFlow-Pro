/**
 * ScheduleDeductions.tsx
 * Directory: renderer/app/components/returns/ScheduleDeductions.tsx
 *
 * Chapter VI-A Deductions — 80C, 80D, 80DD, 80E, 80EE, 80EEA, 80EEB,
 * 80G, 80GGA, 80GGC, 80TTA, 80U
 *
 * Rules:
 *  - Old regime only (show banner + disable form if regime === 'new')
 *  - Live cap enforcement via applyDeductionCaps on every change
 *  - 80TTA pre-filled from ScheduleOS.savingsInterest (read-only, capped ₹10,000)
 *  - Auto-save: dirty flag + 1.5 s debounce
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DeductionsChapterVIA,
  ReturnData,
  TaxRegime,
  DEDUCTION_CAPS,
} from '@/shared/types/itr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoneeEntry {
  id: string;
  name: string;
  pan: string;
  address: string;
  percentage: 50 | 100;
  withLimit: boolean;
  amount: number;
}

interface DeductionsState {
  // 80C bucket
  lifeInsurancePremium: number;
  ppf: number;
  elss: number;
  tuitionFees: number;
  homeLoanPrincipal: number;
  nsc: number;
  nscInterest: number;
  sukanyaSamriddhiYojana: number;
  seniorCitizenSavingsScheme: number;
  stampDutyRegistration: number;
  other80C: number;

  // 80CCC / 80CCD
  pensionFund80CCC: number;
  nps80CCD1: number;        // employee NPS — within 80C bucket cap
  nps80CCD1B: number;       // additional ₹50,000 over 80C
  nps80CCD2: number;        // employer NPS — no cap

  // 80D
  healthInsuranceSelf: number;
  preventiveHealthCheckupSelf: number;   // max ₹5,000 within 80D self
  selfSeniorCitizen: boolean;
  healthInsuranceParents: number;
  preventiveHealthCheckupParents: number;
  parentsSeniorCitizen: boolean;

  // 80DD
  disabilityDependent: number;
  disabilityDependentSevere: boolean;

  // 80E
  educationLoanInterest: number;

  // 80EE
  homeLoanInterest80EE: number;

  // 80EEA
  homeLoanInterest80EEA: number;

  // 80EEB
  evLoanInterest80EEB: number;

  // 80G
  donations80G: DoneeEntry[];

  // 80GGA
  donations80GGA: number;

  // 80GGC
  politicalPartyDonation: number;

  // 80TTA (prefilled from ScheduleOS)
  savingsInterest80TTA: number;

  // 80U
  selfDisability: number;
  selfDisabilitySevere: boolean;
}

interface Props {
  returnId: string;
  returnData: ReturnData;
  onSaved?: () => void;
  setDirty?: (dirty: boolean) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_80C_CAP = 150_000;
const SECTION_80CCD1B_CAP = 50_000;
const SECTION_80D_SELF_NORMAL = 25_000;
const SECTION_80D_SELF_SENIOR = 50_000;
const SECTION_80D_PARENTS_NORMAL = 25_000;
const SECTION_80D_PARENTS_SENIOR = 50_000;
const SECTION_80D_PREVENTIVE_CAP = 5_000;
const SECTION_80DD_NORMAL = 75_000;
const SECTION_80DD_SEVERE = 125_000;
const SECTION_80EE_CAP = 50_000;
const SECTION_80EEA_CAP = 150_000;
const SECTION_80EEB_CAP = 150_000;
const SECTION_80TTA_CAP = 10_000;
const SECTION_80U_NORMAL = 75_000;
const SECTION_80U_SEVERE = 125_000;

const EMPTY_STATE: DeductionsState = {
  lifeInsurancePremium: 0,
  ppf: 0,
  elss: 0,
  tuitionFees: 0,
  homeLoanPrincipal: 0,
  nsc: 0,
  nscInterest: 0,
  sukanyaSamriddhiYojana: 0,
  seniorCitizenSavingsScheme: 0,
  stampDutyRegistration: 0,
  other80C: 0,
  pensionFund80CCC: 0,
  nps80CCD1: 0,
  nps80CCD1B: 0,
  nps80CCD2: 0,
  healthInsuranceSelf: 0,
  preventiveHealthCheckupSelf: 0,
  selfSeniorCitizen: false,
  healthInsuranceParents: 0,
  preventiveHealthCheckupParents: 0,
  parentsSeniorCitizen: false,
  disabilityDependent: 0,
  disabilityDependentSevere: false,
  educationLoanInterest: 0,
  homeLoanInterest80EE: 0,
  homeLoanInterest80EEA: 0,
  evLoanInterest80EEB: 0,
  donations80G: [],
  donations80GGA: 0,
  politicalPartyDonation: 0,
  savingsInterest80TTA: 0,
  selfDisability: 0,
  selfDisabilitySevere: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n === 0 ? '—' : '₹' + n.toLocaleString('en-IN');

const cap = (val: number, max: number) => Math.min(val, max);

function newDonee(): DoneeEntry {
  return {
    id: crypto.randomUUID(),
    name: '',
    pan: '',
    address: '',
    percentage: 50,
    withLimit: true,
    amount: 0,
  };
}

// ─── Mock IPC fallback ────────────────────────────────────────────────────────

const ipc = {
  upsertDeductions: async (returnId: string, data: unknown) => {
    const res = await fetch(`/api/returns/${returnId}/schedule/deductions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Save failed'); }
    return { ok: true };
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ section, title, note }: { section: string; title: string; note?: string }) {
  return (
    <div className="section-header" style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--brand-primary)', fontWeight: 700, letterSpacing: 1, background: 'var(--bg-elevated)', padding: '2px 7px', borderRadius: 4 }}>
        {section}
      </span>
      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15 }}>{title}</span>
      {note && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{note}</span>}
    </div>
  );
}

function AmountField({
  label,
  value,
  onChange,
  cap: capValue,
  note,
  readOnly,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  cap?: number;
  note?: string;
  readOnly?: boolean;
}) {
  const over = capValue !== undefined && value > capValue;
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type="number"
        min={0}
        className={`form-input amount${over ? ' form-error' : ''}`}
        value={value || ''}
        readOnly={readOnly}
        style={readOnly ? { opacity: 0.65, cursor: 'not-allowed' } : undefined}
        onChange={(e) => onChange?.(Math.max(0, Number(e.target.value)))}
        placeholder="0"
      />
      {capValue !== undefined && (
        <span style={{ fontSize: 11, color: over ? '#f87171' : 'var(--text-muted)', marginTop: 3, display: 'block' }}>
          Cap: {fmt(capValue)}{over ? ' — excess will be ignored' : ''}
        </span>
      )}
      {note && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>{note}</span>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduleDeductions({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<DeductionsState>(EMPTY_STATE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const regime: TaxRegime = (returnData as any)?.regime ?? 'OLD';
  const isNewRegime = regime?.toLowerCase() === 'new';

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const db = (returnData as any)?.deductionSchedule;
    if (db) {
      setState((prev) => ({
        ...prev,
        // Map DB aggregate section values back to UI fields
        lifeInsurancePremium: db.section80C ?? prev.lifeInsurancePremium,
        pensionFund80CCC: db.section80CCC ?? prev.pensionFund80CCC,
        nps80CCD1: db.section80CCDEmployeeOrSE ?? prev.nps80CCD1,
        nps80CCD1B: db.section80CCD1B ?? prev.nps80CCD1B,
        nps80CCD2: db.section80CCDEmployer ?? prev.nps80CCD2,
        healthInsuranceSelf: db.section80D ?? prev.healthInsuranceSelf,
        disabilityDependent: db.section80DD ?? prev.disabilityDependent,
        educationLoanInterest: db.section80E ?? prev.educationLoanInterest,
        homeLoanInterest80EE: db.section80EE ?? prev.homeLoanInterest80EE,
        homeLoanInterest80EEA: db.section80EEA ?? prev.homeLoanInterest80EEA,
        evLoanInterest80EEB: db.section80EEB ?? prev.evLoanInterest80EEB,
        savingsInterest80TTA: db.section80TTA ?? prev.savingsInterest80TTA,
        selfDisability: db.section80U ?? prev.selfDisability,
        donations80GGA: db.section80GGA ?? prev.donations80GGA,
        politicalPartyDonation: db.section80GGC ?? prev.politicalPartyDonation,
      }));
    }
    // Pre-fill 80TTA from ScheduleOS savings interest if not in deductions DB
    const savingsInterest: number = (returnData as any)?.osSchedule?.savingsInterest ?? 0;
    if (!db?.section80TTA && savingsInterest > 0) {
      setState((prev) => ({ ...prev, savingsInterest80TTA: cap(savingsInterest, SECTION_80TTA_CAP) }));
    }
    setLoaded(true);
  }, [returnId, returnData]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  const persist = useCallback(
    (data: DeductionsState) => {
      setDirty?.(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        setSaveError(null);
        try {
          await ipc.upsertDeductions(returnId, data);
          setDirty?.(false);
          onSaved?.();
        } catch (e: any) {
          setSaveError(e?.message ?? 'Save failed');
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [returnId, onSaved, setDirty]
  );

  const update = useCallback(
    (patch: Partial<DeductionsState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // ── Derived caps ─────────────────────────────────────────────────────────────
  const raw80C =
    state.lifeInsurancePremium +
    state.ppf +
    state.elss +
    state.tuitionFees +
    state.homeLoanPrincipal +
    state.nsc +
    state.nscInterest +
    state.sukanyaSamriddhiYojana +
    state.seniorCitizenSavingsScheme +
    state.stampDutyRegistration +
    state.other80C +
    state.pensionFund80CCC +
    state.nps80CCD1;

  const allowed80C = cap(raw80C, SECTION_80C_CAP);
  const allowed80CCD1B = cap(state.nps80CCD1B, SECTION_80CCD1B_CAP);
  const allowed80CCD2 = state.nps80CCD2; // no cap for employer contribution

  const selfCap = state.selfSeniorCitizen ? SECTION_80D_SELF_SENIOR : SECTION_80D_SELF_NORMAL;
  const parentsCap = state.parentsSeniorCitizen ? SECTION_80D_PARENTS_SENIOR : SECTION_80D_PARENTS_NORMAL;
  const preventiveSelf = cap(state.preventiveHealthCheckupSelf, SECTION_80D_PREVENTIVE_CAP);
  const preventiveParents = cap(state.preventiveHealthCheckupParents, SECTION_80D_PREVENTIVE_CAP);
  const allowed80DSelf = cap(state.healthInsuranceSelf + preventiveSelf, selfCap);
  const allowed80DParents = cap(state.healthInsuranceParents + preventiveParents, parentsCap);
  const allowed80D = allowed80DSelf + allowed80DParents;

  const allowed80DD = state.disabilityDependentSevere ? SECTION_80DD_SEVERE : SECTION_80DD_NORMAL;
  const allowed80E = state.educationLoanInterest; // uncapped
  const allowed80EE = cap(state.homeLoanInterest80EE, SECTION_80EE_CAP);
  const allowed80EEA = cap(state.homeLoanInterest80EEA, SECTION_80EEA_CAP);
  const allowed80EEB = cap(state.evLoanInterest80EEB, SECTION_80EEB_CAP);

  // 80G computation
  const allowed80G = state.donations80G.reduce((sum, d) => {
    const eligible = d.withLimit
      ? cap(d.amount, ((returnData as any)?.totalIncome ?? 0) * 0.1 || d.amount) // 10% of GTI limit
      : d.amount;
    return sum + Math.floor((eligible * d.percentage) / 100);
  }, 0);

  const allowed80GGA = state.donations80GGA;
  const allowed80GGC = state.politicalPartyDonation;
  const allowed80TTA = state.savingsInterest80TTA;
  const allowed80U = state.selfDisabilitySevere ? SECTION_80U_SEVERE : (state.selfDisability > 0 ? SECTION_80U_NORMAL : 0);

  const totalDeductions =
    allowed80C +
    allowed80CCD1B +
    allowed80CCD2 +
    allowed80D +
    (state.disabilityDependent > 0 ? allowed80DD : 0) +
    allowed80E +
    allowed80EE +
    allowed80EEA +
    allowed80EEB +
    allowed80G +
    allowed80GGA +
    allowed80GGC +
    allowed80TTA +
    allowed80U;

  // ── Donee helpers ────────────────────────────────────────────────────────────
  const addDonee = () => update({ donations80G: [...state.donations80G, newDonee()] });
  const removeDonee = (id: string) =>
    update({ donations80G: state.donations80G.filter((d) => d.id !== id) });
  const updateDonee = (id: string, patch: Partial<DoneeEntry>) =>
    update({
      donations80G: state.donations80G.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });

  if (!loaded) {
    return (
      <div className="card animate-in" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading deductions…
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── New Regime Banner ─────────────────────────────────────────────────── */}
      {isNewRegime && (
        <div
          style={{
            background: 'rgba(212,160,23,0.12)',
            border: '1px solid var(--brand-primary)',
            borderRadius: 8,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <strong style={{ color: 'var(--brand-text)' }}>New Tax Regime Selected</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Chapter VI-A deductions (80C, 80D, etc.) are <strong>not available</strong> under the new
              regime. Switch to Old Regime in Return Settings to claim these deductions.
            </p>
          </div>
        </div>
      )}

      <fieldset disabled={isNewRegime} style={{ border: 'none', padding: 0, margin: 0, opacity: isNewRegime ? 0.45 : 1 }}>
        {/* ── 80C ─────────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 0 }}>
          <SectionHeader
            section="80C / 80CCC / 80CCD(1)"
            title="Life Insurance, PF, ELSS &amp; Related"
            note={`Aggregate cap: ₹1,50,000`}
          />
          <div className="form-grid-3">
            <AmountField label="Life Insurance Premium" value={state.lifeInsurancePremium} onChange={(v) => update({ lifeInsurancePremium: v })} />
            <AmountField label="PPF Contribution" value={state.ppf} onChange={(v) => update({ ppf: v })} />
            <AmountField label="ELSS / Mutual Fund (80C)" value={state.elss} onChange={(v) => update({ elss: v })} />
            <AmountField label="Tuition Fees (max 2 children)" value={state.tuitionFees} onChange={(v) => update({ tuitionFees: v })} />
            <AmountField label="Home Loan Principal Repayment" value={state.homeLoanPrincipal} onChange={(v) => update({ homeLoanPrincipal: v })} />
            <AmountField label="NSC (Face Value)" value={state.nsc} onChange={(v) => update({ nsc: v })} />
            <AmountField label="NSC Accrued Interest (reinvested)" value={state.nscInterest} onChange={(v) => update({ nscInterest: v })} />
            <AmountField label="Sukanya Samriddhi Yojana" value={state.sukanyaSamriddhiYojana} onChange={(v) => update({ sukanyaSamriddhiYojana: v })} />
            <AmountField label="Senior Citizen Savings Scheme" value={state.seniorCitizenSavingsScheme} onChange={(v) => update({ seniorCitizenSavingsScheme: v })} />
            <AmountField label="Stamp Duty / Registration (house)" value={state.stampDutyRegistration} onChange={(v) => update({ stampDutyRegistration: v })} />
            <AmountField label="Pension Fund u/s 80CCC" value={state.pensionFund80CCC} onChange={(v) => update({ pensionFund80CCC: v })} />
            <AmountField label="NPS Employee Contribution (80CCD(1))" value={state.nps80CCD1} onChange={(v) => update({ nps80CCD1: v })} note="Included within ₹1,50,000 cap" />
            <AmountField label="Other 80C Investments" value={state.other80C} onChange={(v) => update({ other80C: v })} />
          </div>

          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Gross 80C Pool: <span className="amount">{fmt(raw80C)}</span>
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: raw80C > SECTION_80C_CAP ? 'var(--brand-primary)' : 'var(--success)' }}>
              Allowed u/s 80C/CCC/CCD(1): <span className="amount">{fmt(allowed80C)}</span>
            </span>
          </div>
        </div>

        {/* ── 80CCD(1B) & 80CCD(2) ─────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80CCD(1B) / 80CCD(2)" title="Additional NPS Deduction" note="Over &amp; above 80C cap" />
          <div className="form-grid-2">
            <AmountField
              label="Additional NPS (own contribution) u/s 80CCD(1B)"
              value={state.nps80CCD1B}
              onChange={(v) => update({ nps80CCD1B: v })}
              cap={SECTION_80CCD1B_CAP}
              note="Max ₹50,000 — separate from ₹1,50,000 limit"
            />
            <AmountField
              label="Employer NPS Contribution u/s 80CCD(2)"
              value={state.nps80CCD2}
              onChange={(v) => update({ nps80CCD2: v })}
              note="Max 10% of salary (Govt: 14%) — no absolute cap"
            />
          </div>
        </div>

        {/* ── 80D ──────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80D" title="Health Insurance Premium" />

          {/* Self & Family */}
          <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Self, Spouse &amp; Children
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <input
              type="checkbox"
              id="selfSenior"
              checked={state.selfSeniorCitizen}
              onChange={(e) => update({ selfSeniorCitizen: e.target.checked })}
            />
            <label htmlFor="selfSenior" style={{ fontSize: 13 }}>
              Self is Senior Citizen (60+) — cap increases to ₹50,000
            </label>
          </div>
          <div className="form-grid-2">
            <AmountField
              label="Health Insurance Premium (self/family)"
              value={state.healthInsuranceSelf}
              onChange={(v) => update({ healthInsuranceSelf: v })}
              cap={selfCap}
            />
            <AmountField
              label="Preventive Health Check-up (self/family)"
              value={state.preventiveHealthCheckupSelf}
              onChange={(v) => update({ preventiveHealthCheckupSelf: v })}
              cap={SECTION_80D_PREVENTIVE_CAP}
              note="Sub-limit ₹5,000 within 80D self cap"
            />
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 16, color: 'var(--text-muted)' }}>
            Allowed (self): <span className="amount" style={{ color: 'var(--brand-text)', fontWeight: 700 }}>{fmt(allowed80DSelf)}</span> / {fmt(selfCap)}
          </div>

          {/* Parents */}
          <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Parents</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <input
              type="checkbox"
              id="parentsSenior"
              checked={state.parentsSeniorCitizen}
              onChange={(e) => update({ parentsSeniorCitizen: e.target.checked })}
            />
            <label htmlFor="parentsSenior" style={{ fontSize: 13 }}>
              Parents are Senior Citizens (60+) — cap increases to ₹50,000
            </label>
          </div>
          <div className="form-grid-2">
            <AmountField
              label="Health Insurance Premium (parents)"
              value={state.healthInsuranceParents}
              onChange={(v) => update({ healthInsuranceParents: v })}
              cap={parentsCap}
            />
            <AmountField
              label="Preventive Health Check-up (parents)"
              value={state.preventiveHealthCheckupParents}
              onChange={(v) => update({ preventiveHealthCheckupParents: v })}
              cap={SECTION_80D_PREVENTIVE_CAP}
              note="Sub-limit ₹5,000 within 80D parents cap"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Parents allowed: {fmt(allowed80DParents)} / {fmt(parentsCap)}</span>
            <span style={{ fontWeight: 700, color: 'var(--brand-text)' }}>Total 80D: <span className="amount">{fmt(allowed80D)}</span></span>
          </div>
        </div>

        {/* ── 80DD ─────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80DD" title="Disability of Dependent" note={`Fixed deduction — ₹75,000 / ₹1,25,000 (severe)`} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <input
              type="checkbox"
              id="has80DD"
              checked={state.disabilityDependent > 0}
              onChange={(e) => update({ disabilityDependent: e.target.checked ? 1 : 0 })}
            />
            <label htmlFor="has80DD" style={{ fontSize: 13 }}>Claim deduction for disabled dependent</label>
          </div>
          {state.disabilityDependent > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="severe80DD"
                checked={state.disabilityDependentSevere}
                onChange={(e) => update({ disabilityDependentSevere: e.target.checked })}
              />
              <label htmlFor="severe80DD" style={{ fontSize: 13 }}>
                Severe disability (80%+) — deduction: <strong>₹1,25,000</strong>
              </label>
              {!state.disabilityDependentSevere && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>Normal: ₹75,000</span>
              )}
            </div>
          )}
          {state.disabilityDependent > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--brand-text)', fontWeight: 700 }}>
              Deduction u/s 80DD: {fmt(allowed80DD)}
            </div>
          )}
        </div>

        {/* ── 80E ──────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80E" title="Education Loan Interest" note="Uncapped — only interest, not principal" />
          <div className="form-grid-2">
            <AmountField
              label="Interest on Education Loan"
              value={state.educationLoanInterest}
              onChange={(v) => update({ educationLoanInterest: v })}
              note="For self, spouse, children or student for whom you are legal guardian. No monetary limit; allowed for 8 years."
            />
          </div>
        </div>

        {/* ── 80EE ─────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80EE" title="Home Loan Interest — First-time Buyer (pre-2017)" note="Cap ₹50,000" />
          <div className="form-grid-2">
            <AmountField
              label="Additional Interest on Home Loan u/s 80EE"
              value={state.homeLoanInterest80EE}
              onChange={(v) => update({ homeLoanInterest80EE: v })}
              cap={SECTION_80EE_CAP}
              note="Loan sanctioned between 1 Apr 2016 – 31 Mar 2017; stamp duty value ≤ ₹50 lakh"
            />
          </div>
        </div>

        {/* ── 80EEA ────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80EEA" title="Home Loan Interest — Affordable Housing (2019-22)" note="Cap ₹1,50,000" />
          <div className="form-grid-2">
            <AmountField
              label="Additional Interest on Home Loan u/s 80EEA"
              value={state.homeLoanInterest80EEA}
              onChange={(v) => update({ homeLoanInterest80EEA: v })}
              cap={SECTION_80EEA_CAP}
              note="Loan sanctioned between 1 Apr 2019 – 31 Mar 2022; stamp duty value ≤ ₹45 lakh"
            />
          </div>
        </div>

        {/* ── 80EEB ────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80EEB" title="EV Loan Interest" note="Cap ₹1,50,000" />
          <div className="form-grid-2">
            <AmountField
              label="Interest on Loan for Electric Vehicle"
              value={state.evLoanInterest80EEB}
              onChange={(v) => update({ evLoanInterest80EEB: v })}
              cap={SECTION_80EEB_CAP}
              note="Loan sanctioned between 1 Apr 2019 – 31 Mar 2023"
            />
          </div>
        </div>

        {/* ── 80G ──────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80G" title="Donations to Charitable Institutions" />
          {state.donations80G.length === 0 && (
            <div className="empty-state" style={{ padding: '24px 0', marginBottom: 12 }}>
              <p>No donation entries yet.</p>
            </div>
          )}
          {state.donations80G.map((d, idx) => (
            <div
              key={d.id}
              className="card-elevated"
              style={{ marginBottom: 14, padding: 16, position: 'relative' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Donation #{idx + 1}</span>
                <button className="btn btn-sm btn-secondary" onClick={() => removeDonee(d.id)} style={{ color: '#f87171' }}>
                  Remove
                </button>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Donee Name</label>
                  <input className="form-input" value={d.name} onChange={(e) => updateDonee(d.id, { name: e.target.value })} placeholder="Name of institution" />
                </div>
                <div className="form-group">
                  <label className="form-label">Donee PAN</label>
                  <input className="form-input pan-field" value={d.pan} maxLength={10} onChange={(e) => updateDonee(d.id, { pan: e.target.value.toUpperCase() })} placeholder="AAAAA0000A" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Donee Address</label>
                <input className="form-input" value={d.address} onChange={(e) => updateDonee(d.id, { address: e.target.value })} placeholder="Address" />
              </div>
              <div className="form-grid-3">
                <AmountField label="Donation Amount" value={d.amount} onChange={(v) => updateDonee(d.id, { amount: v })} />
                <div className="form-group">
                  <label className="form-label">Deduction %</label>
                  <select
                    className="form-input"
                    value={d.percentage}
                    onChange={(e) => updateDonee(d.id, { percentage: Number(e.target.value) as 50 | 100 })}
                  >
                    <option value={50}>50%</option>
                    <option value={100}>100%</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Qualifying Limit</label>
                  <select
                    className="form-input"
                    value={d.withLimit ? 'limit' : 'nolimit'}
                    onChange={(e) => updateDonee(d.id, { withLimit: e.target.value === 'limit' })}
                  >
                    <option value="limit">With 10% GTI limit</option>
                    <option value="nolimit">Without limit</option>
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--brand-text)', textAlign: 'right' }}>
                Eligible deduction: {fmt(Math.floor((d.amount * d.percentage) / 100))}
              </div>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={addDonee} style={{ marginTop: 4 }}>
            + Add Donation
          </button>
          {state.donations80G.length > 0 && (
            <div style={{ marginTop: 12, textAlign: 'right', fontWeight: 700, color: 'var(--brand-text)' }}>
              Total 80G Deduction: <span className="amount">{fmt(allowed80G)}</span>
            </div>
          )}
        </div>

        {/* ── 80GGA ────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80GGA" title="Donations for Scientific Research / Rural Development" note="Uncapped — not available if business income exists" />
          <div className="form-grid-2">
            <AmountField
              label="Donation Amount u/s 80GGA"
              value={state.donations80GGA}
              onChange={(v) => update({ donations80GGA: v })}
            />
          </div>
        </div>

        {/* ── 80GGC ────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80GGC" title="Donation to Political Party" note="Uncapped — cash donations not eligible" />
          <div className="form-grid-2">
            <AmountField
              label="Donation to Registered Political Party"
              value={state.politicalPartyDonation}
              onChange={(v) => update({ politicalPartyDonation: v })}
              note="Cheque / digital mode only. Cash donations not deductible."
            />
          </div>
        </div>

        {/* ── 80TTA ────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80TTA" title="Savings Account Interest" note="Cap ₹10,000 — auto-filled from Schedule OS" />
          <div className="form-grid-2">
            <AmountField
              label="Savings Interest Eligible u/s 80TTA"
              value={state.savingsInterest80TTA}
              readOnly
              cap={SECTION_80TTA_CAP}
              note="Pre-filled from Schedule OS › Savings Interest. Edit there if incorrect."
            />
          </div>
        </div>

        {/* ── 80U ──────────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <SectionHeader section="80U" title="Self Disability" note="Fixed deduction — ₹75,000 / ₹1,25,000 (severe)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <input
              type="checkbox"
              id="has80U"
              checked={state.selfDisability > 0}
              onChange={(e) => update({ selfDisability: e.target.checked ? 1 : 0, selfDisabilitySevere: false })}
            />
            <label htmlFor="has80U" style={{ fontSize: 13 }}>I have a disability (40%+ as per medical certificate)</label>
          </div>
          {state.selfDisability > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="severe80U"
                checked={state.selfDisabilitySevere}
                onChange={(e) => update({ selfDisabilitySevere: e.target.checked })}
              />
              <label htmlFor="severe80U" style={{ fontSize: 13 }}>
                Severe disability (80%+) — deduction: <strong>₹1,25,000</strong>
              </label>
              {!state.selfDisabilitySevere && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>Normal (40%+): ₹75,000</span>
              )}
            </div>
          )}
          {state.selfDisability > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--brand-text)', fontWeight: 700 }}>
              Deduction u/s 80U: {fmt(allowed80U)}
            </div>
          )}
        </div>

        {/* ── Summary Table ─────────────────────────────────────────────────── */}
        <div className="card stat-card" style={{ marginTop: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--brand-text)' }}>
            Chapter VI-A — Deduction Summary
          </h3>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Section</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Allowed</th>
              </tr>
            </thead>
            <tbody>
              {[
                { s: '80C / 80CCC / 80CCD(1)', d: 'LI, PPF, ELSS, NPS etc.', v: allowed80C },
                { s: '80CCD(1B)', d: 'Additional NPS (own)', v: allowed80CCD1B },
                { s: '80CCD(2)', d: 'Employer NPS contribution', v: allowed80CCD2 },
                { s: '80D', d: 'Health insurance premium', v: allowed80D },
                { s: '80DD', d: 'Disabled dependent', v: state.disabilityDependent > 0 ? allowed80DD : 0 },
                { s: '80E', d: 'Education loan interest', v: allowed80E },
                { s: '80EE', d: 'Home loan interest (pre-2017)', v: allowed80EE },
                { s: '80EEA', d: 'Affordable housing loan interest', v: allowed80EEA },
                { s: '80EEB', d: 'EV loan interest', v: allowed80EEB },
                { s: '80G', d: 'Charitable donations', v: allowed80G },
                { s: '80GGA', d: 'Scientific / rural development', v: allowed80GGA },
                { s: '80GGC', d: 'Political party donation', v: allowed80GGC },
                { s: '80TTA', d: 'Savings interest', v: allowed80TTA },
                { s: '80U', d: 'Self disability', v: allowed80U },
              ]
                .filter((r) => r.v > 0)
                .map((r) => (
                  <tr key={r.s}>
                    <td>
                      <span className="badge-primary" style={{ fontSize: 11, padding: '2px 6px' }}>{r.s}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{r.d}</td>
                    <td className="amount" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.v)}</td>
                  </tr>
                ))}
              <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                <td colSpan={2} style={{ fontWeight: 700, fontSize: 14, paddingTop: 10 }}>
                  Total Deductions u/s Chapter VI-A
                </td>
                <td className="amount" style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: 'var(--brand-text)', paddingTop: 10 }}>
                  {fmt(totalDeductions)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>

      {/* ── Save status ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-muted)', minHeight: 22 }}>
        {saving && <span>💾 Saving…</span>}
        {saveError && <span style={{ color: '#f87171' }}>⚠ {saveError}</span>}
      </div>
    </div>
  );
}
