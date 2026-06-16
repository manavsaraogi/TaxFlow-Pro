'use client';

/**
 * ScheduleFinancialParticulars.tsx
 * ITR-4 "Financial Particulars of the Business" — Part A-BS, No Account Case.
 * Flat single-column balance sheet, fields E11–E25, exactly as in the
 * official ITR-4 Excel utility. Mandatory: E15, E19, E20, E21, E22.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FPState {
  e11: number; // Partners/members own capital
  e12: number; // Secured loans
  e13: number; // Unsecured loans
  e14: number; // Advances
  e15: number; // Sundry creditors — mandatory
  e16: number; // Other liabilities
  e18: number; // Fixed assets
  e18a: number; // Investments
  e19: number; // Inventories — mandatory
  e20: number; // Sundry debtors — mandatory
  e21: number; // Balance with banks — mandatory
  e22: number; // Cash-in-hand — mandatory
  e23: number; // Loans and advances
  e24: number; // Other Assets
}

const EMPTY: FPState = {
  e11: 0, e12: 0, e13: 0, e14: 0, e15: 0, e16: 0,
  e18: 0, e18a: 0, e19: 0, e20: 0, e21: 0, e22: 0, e23: 0, e24: 0,
};

const MANDATORY_KEYS: (keyof FPState)[] = ['e15', 'e19', 'e20', 'e21', 'e22'];

function fmt(n: number): string {
  if (!n) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  returnId: string;
  returnData: any;
  onSaved: (rd: any) => void;
  setDirty: (d: boolean) => void;
}

export default function ScheduleFinancialParticulars({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<FPState>(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fp = (returnData as any)?.financialParticulars ?? (returnData as any)?.financialParticularsJson;
    const parsed = typeof fp === 'string' ? JSON.parse(fp) : fp;
    if (parsed) {
      setState({
        e11:  toNum(parsed.E11_ProprietorFund),
        e12:  toNum(parsed.E12_SecuredLoans),
        e13:  toNum(parsed.E13_UnsecuredLoans),
        e14:  toNum(parsed.E14_Advances),
        e15:  toNum(parsed.E15_SundryCreditors),
        e16:  toNum(parsed.E16_OtherLiabilities),
        e18:  toNum(parsed.E18_FixedAssets),
        e18a: toNum(parsed.E18a_Investments),
        e19:  toNum(parsed.E19_Inventories),
        e20:  toNum(parsed.E20_SundryDebtors),
        e21:  toNum(parsed.E21_BalanceWithBanks),
        e22:  toNum(parsed.E22_CashInHand),
        e23:  toNum(parsed.E23_LoansAndAdvances),
        e24:  toNum(parsed.E24_OtherAssets),
      });
    }
  }, [returnData]);

  // ── Computed totals ───────────────────────────────────────────────────────

  const e17 = state.e11 + state.e12 + state.e13 + state.e14 + state.e15 + state.e16;
  const e25 = state.e18 + state.e18a + state.e19 + state.e20 + state.e21 + state.e22 + state.e23 + state.e24;
  const balanced = Math.abs(e17 - e25) < 2;

  // ── Persist ────────────────────────────────────────────────────────────────

  const persist = useCallback(async (s: FPState) => {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        E11_ProprietorFund:  s.e11,
        E12_SecuredLoans:    s.e12,
        E13_UnsecuredLoans:  s.e13,
        E14_Advances:        s.e14,
        E15_SundryCreditors: s.e15,
        E16_OtherLiabilities: s.e16,
        E18_FixedAssets:     s.e18,
        E18a_Investments:    s.e18a,
        E19_Inventories:     s.e19,
        E20_SundryDebtors:   s.e20,
        E21_BalanceWithBanks: s.e21,
        E22_CashInHand:      s.e22,
        E23_LoansAndAdvances: s.e23,
        E24_OtherAssets:     s.e24,
      };
      const res = await fetch(`/api/returns/${returnId}/schedule/financialParticulars`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      onSaved({ ...returnData, financialParticulars: body });
      setDirty(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [returnId, returnData, onSaved, setDirty]);

  function update(key: keyof FPState, value: number) {
    setState(prev => {
      const next = { ...prev, [key]: value };
      setDirty(true);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => persist(next), 1500);
      return next;
    });
    setTouched(prev => ({ ...prev, [key]: true }));
  }

  function handleSave() {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setTouched(Object.fromEntries(MANDATORY_KEYS.map(k => [k, true])));
    persist(state);
  }

  const missingMandatory = MANDATORY_KEYS.filter(k => state[k] === 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '760px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Financial Particulars of the Business</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Part A-BS (No Account Case) — furnish information as on 31st March {' '}
            {(() => { const ay = (returnData as any)?.assessmentYear; const y = ay ? parseInt(String(ay).split('-')[1] ?? '', 10) : null; return y ? 2000 + y : ''; })()}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saving && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Saving…</span>}
          {saveError && <span style={{ fontSize: '12px', color: 'var(--status-error)' }}>{saveError}</span>}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>Save</button>
        </div>
      </div>

      {missingMandatory.length > 0 && (
        <div style={{ marginBottom: '12px', padding: '8px 14px', borderRadius: '6px', background: 'rgba(224,92,75,0.08)', border: '1px solid rgba(224,92,75,0.3)' }}>
          <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>
            Mandatory fields cannot be left blank/zero: {missingMandatory.map(k => k.toUpperCase()).join(', ')}
          </span>
        </div>
      )}

      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
        <Row code="E11" label="Partners/ members own capital" value={state.e11} onChange={v => update('e11', v)} />
        <Row code="E12" label="Secured loans" value={state.e12} onChange={v => update('e12', v)} />
        <Row code="E13" label="Unsecured loans" value={state.e13} onChange={v => update('e13', v)} />
        <Row code="E14" label="Advances" value={state.e14} onChange={v => update('e14', v)} />
        <Row code="E15" label="Sundry creditors" value={state.e15} onChange={v => update('e15', v)} mandatory missing={touched.e15 && state.e15 === 0} />
        <Row code="E16" label="Other liabilities" value={state.e16} onChange={v => update('e16', v)} />
        <Total code="E17" label="Total capital and liabilities (E11+E12+E13+E14+E15+E16)" value={e17} />

        <Row code="E18" label="Fixed assets" value={state.e18} onChange={v => update('e18', v)} />
        <Row code="E18(a)" label="Investments" value={state.e18a} onChange={v => update('e18a', v)} />
        <Row code="E19" label="Inventories" value={state.e19} onChange={v => update('e19', v)} mandatory missing={touched.e19 && state.e19 === 0} />
        <Row code="E20" label="Sundry debtors" value={state.e20} onChange={v => update('e20', v)} mandatory missing={touched.e20 && state.e20 === 0} />
        <Row code="E21" label="Balance with banks" value={state.e21} onChange={v => update('e21', v)} mandatory missing={touched.e21 && state.e21 === 0} />
        <Row code="E22" label="Cash-in-hand" value={state.e22} onChange={v => update('e22', v)} mandatory missing={touched.e22 && state.e22 === 0} />
        <Row code="E23" label="Loans and advances" value={state.e23} onChange={v => update('e23', v)} />
        <Row code="E24" label="Other Assets" value={state.e24} onChange={v => update('e24', v)} />
        <Total code="E25" label="Total assets (E18+E18a+E19+E20+E21+E22+E23+E24)" value={e25} />
      </div>

      <p style={{ fontSize: '11px', color: '#991B1B', marginTop: '8px' }}>
        Note: E15, E19, E20, E21, E22 are mandatory; others if available.
      </p>

      <div style={{
        marginTop: '14px', padding: '10px 14px', borderRadius: '6px',
        background: balanced ? 'rgba(22,163,74,0.08)' : 'rgba(224,92,75,0.08)',
        border: `1px solid ${balanced ? 'rgba(22,163,74,0.3)' : 'rgba(224,92,75,0.3)'}`,
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: balanced ? '#166534' : '#991B1B' }}>
          {balanced ? '✓ E17 and E25 tally' : '⚠ E17 and E25 do not tally'}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '10px' }}>
          E17: {fmt(e17)} &nbsp;|&nbsp; E25: {fmt(e25)} &nbsp;|&nbsp; Diff: {fmt(e17 - e25)}
        </span>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({
  code, label, value, onChange, mandatory, missing,
}: { code: string; label: string; value: number; onChange: (v: number) => void; mandatory?: boolean; missing?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', minHeight: '38px', padding: '0 12px', gap: '10px', background: '#fff' }}>
      <span style={{ width: '46px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{code}</span>
      <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>
        {label}
        {mandatory && <span style={{ color: '#DC2626', marginLeft: '4px' }}>*</span>}
      </span>
      <AmtInput value={value} onChange={onChange} error={missing} />
    </div>
  );
}

function Total({ code, label, value }: { code: string; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1E293B', padding: '8px 12px', minHeight: '38px', gap: '10px' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}><span style={{ fontFamily: 'var(--font-mono)', marginRight: '8px' }}>{code}</span>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 800, color: '#93C5FD', fontFamily: 'var(--font-mono)' }}>{fmt(value)}</span>
    </div>
  );
}

function AmtInput({ value, onChange, error }: { value: number; onChange: (v: number) => void; error?: boolean }) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value));
  useEffect(() => { setRaw(value === 0 ? '' : String(value)); }, [value]);
  return (
    <input
      type="number"
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={() => { const n = toNum(raw); setRaw(n === 0 ? '' : String(n)); onChange(n); }}
      placeholder="0"
      style={{
        width: '140px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px',
        padding: '5px 8px', borderRadius: '4px', background: 'var(--bg-input, #fff)',
        border: `1px solid ${error ? '#DC2626' : 'var(--border-subtle)'}`,
      }}
    />
  );
}
