/**
 * ScheduleTaxPayments.tsx
 * Directory: renderer/app/components/returns/ScheduleTaxPayments.tsx
 *
 * Advance Tax & Self-Assessment Tax Challan Entry
 *
 * Rules:
 *  - Advance tax due dates: Jun 15, Sep 15, Dec 15, Mar 15
 *  - BSR code: 7-digit numeric
 *  - Challan serial: 5-digit numeric
 *  - Date of deposit required
 *  - Separate sections: Advance Tax vs Self-Assessment Tax
 *  - Running totals per section + grand total
 *  - Auto-save: dirty flag + 1.5 s debounce
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReturnData } from '@/shared/types/itr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChallanEntry {
  id: string;
  bsrCode: string;           // 7-digit BSR code of bank branch
  challanSerial: string;     // 5-digit challan serial no.
  dateOfDeposit: string;     // ISO date string YYYY-MM-DD
  taxAmount: number;
  surcharge: number;
  educationCess: number;
  interestPaid: number;
  penaltyPaid: number;
  totalAmount: number;       // auto-computed
}

interface TaxPaymentsState {
  advanceTax: ChallanEntry[];
  selfAssessmentTax: ChallanEntry[];
}

interface Props {
  returnId: string;
  returnData: ReturnData;
  onSaved?: () => void;
  setDirty?: (dirty: boolean) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ADVANCE_TAX_DATES = [
  { label: '1st Instalment (≤15%)', due: 'Jun 15' },
  { label: '2nd Instalment (≤45%)', due: 'Sep 15' },
  { label: '3rd Instalment (≤75%)', due: 'Dec 15' },
  { label: '4th Instalment (100%)', due: 'Mar 15' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => (n === 0 ? '—' : '₹' + n.toLocaleString('en-IN'));
const uuid = () => crypto.randomUUID();
const isValidBSR = (s: string) => /^\d{7}$/.test(s.trim());
const isValidSerial = (s: string) => /^\d{5}$/.test(s.trim());

function computeTotal(c: ChallanEntry): number {
  return c.taxAmount + c.surcharge + c.educationCess + c.interestPaid + c.penaltyPaid;
}

function newChallan(): ChallanEntry {
  return {
    id: uuid(),
    bsrCode: '',
    challanSerial: '',
    dateOfDeposit: '',
    taxAmount: 0,
    surcharge: 0,
    educationCess: 0,
    interestPaid: 0,
    penaltyPaid: 0,
    totalAmount: 0,
  };
}

const EMPTY_STATE: TaxPaymentsState = {
  advanceTax: [],
  selfAssessmentTax: [],
};

// ─── Mock IPC ─────────────────────────────────────────────────────────────────

const ipc = {
  getTaxPayments: async (returnId: string) => {
    const res = await fetch(`/api/returns/${returnId}`);
    const j = await res.json();
    return j.data?.taxPayments ?? null;
  },
  upsertTaxPayments: async (returnId: string, data: unknown) => {
    const res = await fetch(`/api/returns/${returnId}/schedule/taxPayments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Save failed'); }
    return { ok: true };
  },
};

// ─── Challan Row ──────────────────────────────────────────────────────────────

function ChallanRow({
  challan,
  index,
  label,
  onUpdate,
  onRemove,
}: {
  challan: ChallanEntry;
  index: number;
  label: string;
  onUpdate: (id: string, patch: Partial<ChallanEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const total = computeTotal(challan);

  function field(key: keyof ChallanEntry, value: number) {
    const patch: Partial<ChallanEntry> = { [key]: Math.max(0, value) };
    // recompute preview total
    const updated = { ...challan, ...patch };
    patch.totalAmount = computeTotal(updated);
    onUpdate(challan.id, patch);
  }

  return (
    <div className="card-elevated" style={{ marginBottom: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label} #{index + 1}</span>
        <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }} onClick={() => onRemove(challan.id)}>
          Remove
        </button>
      </div>

      {/* Row 1: BSR + Serial + Date */}
      <div className="form-grid-3" style={{ marginBottom: 0 }}>
        <div className="form-group">
          <label className="form-label">BSR Code (7 digits)</label>
          <input
            className={`form-input pan-field${challan.bsrCode && !isValidBSR(challan.bsrCode) ? ' form-error' : ''}`}
            value={challan.bsrCode}
            maxLength={7}
            placeholder="0000000"
            onChange={(e) => onUpdate(challan.id, { bsrCode: e.target.value.replace(/\D/g, '').slice(0, 7) })}
          />
          {challan.bsrCode && !isValidBSR(challan.bsrCode) && (
            <span className="form-error" style={{ fontSize: 11, marginTop: 2, display: 'block' }}>Must be 7 digits</span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Challan Serial No. (5 digits)</label>
          <input
            className={`form-input pan-field${challan.challanSerial && !isValidSerial(challan.challanSerial) ? ' form-error' : ''}`}
            value={challan.challanSerial}
            maxLength={5}
            placeholder="00000"
            onChange={(e) => onUpdate(challan.id, { challanSerial: e.target.value.replace(/\D/g, '').slice(0, 5) })}
          />
          {challan.challanSerial && !isValidSerial(challan.challanSerial) && (
            <span className="form-error" style={{ fontSize: 11, marginTop: 2, display: 'block' }}>Must be 5 digits</span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Date of Deposit</label>
          <input
            type="date"
            className="form-input"
            value={challan.dateOfDeposit}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => onUpdate(challan.id, { dateOfDeposit: e.target.value })}
          />
        </div>
      </div>

      {/* Row 2: Amounts */}
      <div className="form-grid-3" style={{ marginTop: 12 }}>
        <div className="form-group">
          <label className="form-label">Tax Amount (₹)</label>
          <input type="number" min={0} className="form-input amount" value={challan.taxAmount || ''} placeholder="0"
            onChange={(e) => field('taxAmount', Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">Surcharge (₹)</label>
          <input type="number" min={0} className="form-input amount" value={challan.surcharge || ''} placeholder="0"
            onChange={(e) => field('surcharge', Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">Education Cess (₹)</label>
          <input type="number" min={0} className="form-input amount" value={challan.educationCess || ''} placeholder="0"
            onChange={(e) => field('educationCess', Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">Interest Paid (₹)</label>
          <input type="number" min={0} className="form-input amount" value={challan.interestPaid || ''} placeholder="0"
            onChange={(e) => field('interestPaid', Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">Penalty (₹)</label>
          <input type="number" min={0} className="form-input amount" value={challan.penaltyPaid || ''} placeholder="0"
            onChange={(e) => field('penaltyPaid', Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ color: 'var(--brand-text)' }}>Total Challan Amount (₹)</label>
          <div className="form-input amount" style={{ background: 'var(--bg-elevated)', cursor: 'default', color: 'var(--brand-text)', fontWeight: 700 }}>
            {total > 0 ? '₹' + total.toLocaleString('en-IN') : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduleTaxPayments({ returnId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<TaxPaymentsState>(EMPTY_STATE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = await ipc.getTaxPayments(returnId);
        if (saved) setState(saved as TaxPaymentsState);
      } catch (e) {
        console.error('ScheduleTaxPayments load error', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [returnId]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  const persist = useCallback(
    (data: TaxPaymentsState) => {
      setDirty?.(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        setSaveError(null);
        try {
          await ipc.upsertTaxPayments(returnId, data);
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
    (patch: Partial<TaxPaymentsState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // Generic update for a challan in either list
  function updateChallan(listKey: 'advanceTax' | 'selfAssessmentTax', id: string, patch: Partial<ChallanEntry>) {
    update({
      [listKey]: state[listKey].map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }

  function removeChallan(listKey: 'advanceTax' | 'selfAssessmentTax', id: string) {
    update({ [listKey]: state[listKey].filter((c) => c.id !== id) });
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalAT = state.advanceTax.reduce((s, c) => s + computeTotal(c), 0);
  const totalSAT = state.selfAssessmentTax.reduce((s, c) => s + computeTotal(c), 0);
  const grandTotal = totalAT + totalSAT;

  if (!loaded) {
    return (
      <div className="card animate-in" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading tax payments…
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Advance Tax Due Date Reference ────────────────────────────────────── */}
      <div className="card-elevated" style={{ padding: 16, display: 'flex', gap: 0, flexDirection: 'column' }}>
        <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--brand-text)' }}>
          📅 Advance Tax Instalments — FY 2025-26
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {ADVANCE_TAX_DATES.map((d) => (
            <div key={d.due} style={{ background: 'var(--bg-base)', borderRadius: 6, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)', marginTop: 2 }}>{d.due}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
          Interest u/s 234B (for shortfall) and 234C (for deferment of instalments) will be computed in Tax Summary.
        </p>
      </div>

      {/* ── Advance Tax ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
          <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', letterSpacing: 1 }}>
            ADV TAX
          </span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Advance Tax Paid</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>Challan 280 — Minor Head 100</span>
        </div>

        {state.advanceTax.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>
            No advance tax challans. Add if you paid advance tax during the financial year.
          </div>
        )}

        {state.advanceTax.map((c, idx) => (
          <ChallanRow
            key={c.id}
            challan={c}
            index={idx}
            label="Advance Tax Challan"
            onUpdate={(id, patch) => updateChallan('advanceTax', id, patch)}
            onRemove={(id) => removeChallan('advanceTax', id)}
          />
        ))}

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => update({ advanceTax: [...state.advanceTax, newChallan()] })}
        >
          + Add Advance Tax Challan
        </button>

        {state.advanceTax.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--brand-text)' }}>
              Total Advance Tax Paid: <span className="amount">{fmt(totalAT)}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Self-Assessment Tax ───────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
          <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', letterSpacing: 1 }}>
            SAT
          </span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Self-Assessment Tax Paid</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>Challan 280 — Minor Head 300</span>
        </div>

        <div style={{ background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--text-muted)' }}>
          Self-assessment tax is paid after the end of the financial year before filing the return. It covers any tax dues over and above advance tax and TDS.
        </div>

        {state.selfAssessmentTax.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>
            No self-assessment tax challans. Add if you paid tax before filing this return.
          </div>
        )}

        {state.selfAssessmentTax.map((c, idx) => (
          <ChallanRow
            key={c.id}
            challan={c}
            index={idx}
            label="Self-Assessment Challan"
            onUpdate={(id, patch) => updateChallan('selfAssessmentTax', id, patch)}
            onRemove={(id) => removeChallan('selfAssessmentTax', id)}
          />
        ))}

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => update({ selfAssessmentTax: [...state.selfAssessmentTax, newChallan()] })}
        >
          + Add Self-Assessment Tax Challan
        </button>

        {state.selfAssessmentTax.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--brand-text)' }}>
              Total SAT Paid: <span className="amount">{fmt(totalSAT)}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Grand Summary ─────────────────────────────────────────────────────── */}
      <div className="card stat-card">
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--brand-text)' }}>
          Tax Payments Summary
        </h3>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Challans</th>
              <th style={{ textAlign: 'right' }}>Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Advance Tax</td>
              <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{state.advanceTax.length} challan(s)</td>
              <td className="amount" style={{ textAlign: 'right' }}>{fmt(totalAT)}</td>
            </tr>
            <tr>
              <td>Self-Assessment Tax</td>
              <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{state.selfAssessmentTax.length} challan(s)</td>
              <td className="amount" style={{ textAlign: 'right' }}>{fmt(totalSAT)}</td>
            </tr>
            <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
              <td colSpan={2} style={{ fontWeight: 700, fontSize: 14, paddingTop: 10 }}>Total Tax Pre-Paid</td>
              <td className="amount" style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: 'var(--brand-text)', paddingTop: 10 }}>
                {fmt(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', minHeight: 20 }}>
        {saving && '💾 Saving…'}
        {saveError && <span style={{ color: '#f87171' }}>⚠ {saveError}</span>}
      </div>
    </div>
  );
}
