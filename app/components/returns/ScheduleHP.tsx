'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ScheduleHP, ReturnData } from '@/shared/types/itr';

// ─── Dev mock ────────────────────────────────────────────────────────────────
const isMock = false;

// ─── Local types ─────────────────────────────────────────────────────────────

type PropertyType = 'self_occupied' | 'let_out' | 'deemed_let_out';

interface CoOwner {
  id: string;
  name: string;
  pan: string;
  sharePercent: number;
}

interface PropertyEntry {
  id: string;
  propertyType: PropertyType;
  address: string;
  // Let-out / deemed let-out fields
  annualRentReceived: number;
  municipalTaxesPaid: number;
  // Loan interest
  interestOnLoan: number;           // actual interest paid
  preConstructionInterest: number;  // 1/5th of pre-construction interest
  // Co-ownership
  coOwned: boolean;
  coOwners: CoOwner[];
  ownerSharePercent: number;        // assessee's share
}

function emptyProperty(): PropertyEntry {
  return {
    id: crypto.randomUUID(),
    propertyType: 'self_occupied',
    address: '',
    annualRentReceived: 0,
    municipalTaxesPaid: 0,
    interestOnLoan: 0,
    preConstructionInterest: 0,
    coOwned: false,
    coOwners: [],
    ownerSharePercent: 100,
  };
}

function emptyCoOwner(): CoOwner {
  return { id: crypto.randomUUID(), name: '', pan: '', sharePercent: 0 };
}

// ─── HP computation logic ─────────────────────────────────────────────────────
// Interest cap: self-occupied → ₹2,00,000; let-out → uncapped (but set-off
// against other heads capped at ₹2,00,000 u/s 71)
const SO_INTEREST_CAP = 200000;

interface HPResult {
  grossAnnualValue: number;
  municipalTaxDeduction: number;
  netAnnualValue: number;
  standardDeduction30: number;    // 30% of NAV
  interestAllowable: number;
  incomeFromHP: number;           // can be negative (loss)
}

function computeHP(p: PropertyEntry): HPResult {
  if (p.propertyType === 'self_occupied') {
    const interestAllowable = Math.min(
      p.interestOnLoan + p.preConstructionInterest,
      SO_INTEREST_CAP
    );
    return {
      grossAnnualValue: 0,
      municipalTaxDeduction: 0,
      netAnnualValue: 0,
      standardDeduction30: 0,
      interestAllowable,
      incomeFromHP: -interestAllowable,
    };
  }

  // Let-out / Deemed let-out
  const gav = p.annualRentReceived;
  const muniTax = Math.min(p.municipalTaxesPaid, gav); // can't exceed GAV
  const nav = Math.max(0, gav - muniTax);
  const std30 = Math.round(nav * 0.3);
  const interest = p.interestOnLoan + p.preConstructionInterest;
  const incomeFromHP = nav - std30 - interest;

  return {
    grossAnnualValue: gav,
    municipalTaxDeduction: muniTax,
    netAnnualValue: nav,
    standardDeduction30: std30,
    interestAllowable: interest,
    incomeFromHP,
  };
}

function applyCoOwnerShare(result: HPResult, sharePercent: number): HPResult {
  const f = sharePercent / 100;
  return {
    grossAnnualValue: Math.round(result.grossAnnualValue * f),
    municipalTaxDeduction: Math.round(result.municipalTaxDeduction * f),
    netAnnualValue: Math.round(result.netAnnualValue * f),
    standardDeduction30: Math.round(result.standardDeduction30 * f),
    interestAllowable: Math.round(result.interestAllowable * f),
    incomeFromHP: Math.round(result.incomeFromHP * f),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  (n < 0 ? '−₹' : '₹') + Math.abs(n).toLocaleString('en-IN');

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// ─── Numeric field ────────────────────────────────────────────────────────────
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
        className={`form-input${readOnly ? ' hp-readonly' : ''}`}
        value={readOnly ? fmt(value).replace(/[−₹]/g, (c) => c === '₹' ? '' : c) : raw}
        readOnly={readOnly}
        placeholder="0"
        onChange={(e) => !readOnly && setRaw(e.target.value)}
        onBlur={!readOnly ? commit : undefined}
      />
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );
}

// ─── Computation box ──────────────────────────────────────────────────────────
function ComputationBox({ p, result }: { p: PropertyEntry; result: HPResult }) {
  const isSO = p.propertyType === 'self_occupied';
  return (
    <div className="hp-computation-box">
      <div className="hp-comp-title">Computation</div>
      <table className="hp-comp-table">
        <tbody>
          {!isSO && (
            <>
              <tr>
                <td>Gross Annual Value (GAV)</td>
                <td className="amount tr">{fmt(result.grossAnnualValue)}</td>
              </tr>
              <tr>
                <td>Less: Municipal Taxes Paid</td>
                <td className="amount tr deduct">({fmt(result.municipalTaxDeduction)})</td>
              </tr>
              <tr className="subtotal-row">
                <td>Net Annual Value (NAV)</td>
                <td className="amount tr">{fmt(result.netAnnualValue)}</td>
              </tr>
              <tr>
                <td>Less: 30% of NAV u/s 24(a)</td>
                <td className="amount tr deduct">({fmt(result.standardDeduction30)})</td>
              </tr>
            </>
          )}
          {isSO && (
            <tr>
              <td>GAV (Self-Occupied)</td>
              <td className="amount tr">₹0</td>
            </tr>
          )}
          <tr>
            <td>Less: Interest on Loan u/s 24(b){isSO && ` (capped ₹2,00,000)`}</td>
            <td className="amount tr deduct">({fmt(result.interestAllowable)})</td>
          </tr>
          <tr className={`total-row ${result.incomeFromHP < 0 ? 'loss' : 'profit'}`}>
            <td>{result.incomeFromHP < 0 ? 'Loss from House Property' : 'Income from House Property'}</td>
            <td className={`amount tr ${result.incomeFromHP < 0 ? 'negative' : 'positive'}`}>
              {fmt(result.incomeFromHP)}
            </td>
          </tr>
        </tbody>
      </table>
      {result.incomeFromHP < 0 && p.propertyType !== 'self_occupied' && (
        <div className="hp-loss-note">
          Loss set-off against other heads limited to ₹2,00,000 u/s 71(3A)
        </div>
      )}
    </div>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────
interface PropertyCardProps {
  prop: PropertyEntry;
  index: number;
  total: number;
  soCount: number;
  onChange: (id: string, patch: Partial<PropertyEntry>) => void;
  onRemove: (id: string) => void;
}

function PropertyCard({ prop, index, total, soCount, onChange, onRemove }: PropertyCardProps) {
  const [expanded, setExpanded] = useState(true);
  const set = (patch: Partial<PropertyEntry>) => onChange(prop.id, patch);

  const rawResult = computeHP(prop);
  const result = prop.coOwned
    ? applyCoOwnerShare(rawResult, prop.ownerSharePercent)
    : rawResult;

  const isLetOut = prop.propertyType === 'let_out' || prop.propertyType === 'deemed_let_out';

  // SO limit enforcement
  const soDisabled = prop.propertyType !== 'self_occupied' && soCount >= 1;

  const addCoOwner = () => set({ coOwners: [...prop.coOwners, emptyCoOwner()] });
  const updateCoOwner = (cid: string, patch: Partial<CoOwner>) =>
    set({ coOwners: prop.coOwners.map((c) => c.id === cid ? { ...c, ...patch } : c) });
  const removeCoOwner = (cid: string) =>
    set({ coOwners: prop.coOwners.filter((c) => c.id !== cid) });

  return (
    <div className="hp-card card-elevated animate-in">
      {/* Header */}
      <div className="hp-card-header" onClick={() => setExpanded((x) => !x)}>
        <div className="hp-card-title">
          <span className="hp-index-badge">{index + 1}</span>
          <span className="hp-addr-preview">
            {prop.address || 'New Property'}
          </span>
          <span className={`badge-${prop.propertyType === 'self_occupied' ? 'info' : prop.propertyType === 'let_out' ? 'success' : 'warning'} hp-type-badge`}>
            {prop.propertyType === 'self_occupied' ? 'Self-Occ.' : prop.propertyType === 'let_out' ? 'Let Out' : 'Deemed LO'}
          </span>
        </div>
        <div className="hp-card-actions">
          {total > 1 && (
            <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); onRemove(prop.id); }}>
              Remove
            </button>
          )}
          <span className="collapse-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="hp-card-body">
          {/* Property type */}
          <div className="hp-subhead">Property Type</div>
          <div className="radio-group">
            {(['self_occupied', 'let_out', 'deemed_let_out'] as PropertyType[]).map((t) => {
              const disabled = t === 'self_occupied' && soCount >= 1 && prop.propertyType !== 'self_occupied';
              return (
                <label key={t} className={`radio-label${disabled ? ' disabled' : ''}`}>
                  <input
                    type="radio"
                    name={`ptype-${prop.id}`}
                    value={t}
                    checked={prop.propertyType === t}
                    disabled={disabled}
                    onChange={() => set({ propertyType: t })}
                  />
                  <span className="radio-text">
                    {t === 'self_occupied' ? 'Self-Occupied' : t === 'let_out' ? 'Let Out' : 'Deemed Let Out'}
                  </span>
                </label>
              );
            })}
          </div>
          {soCount >= 1 && prop.propertyType !== 'self_occupied' && (
            <div className="hp-so-note">Only one self-occupied property allowed per ITR</div>
          )}

          {/* Address */}
          <div className="form-group">
            <label className="form-label">Property Address</label>
            <textarea
              className="form-input hp-address"
              rows={2}
              value={prop.address}
              placeholder="Flat / Plot No., Building, Street, City, PIN"
              onChange={(e) => set({ address: e.target.value })}
            />
          </div>

          {/* Let-out fields */}
          {isLetOut && (
            <>
              <div className="hp-subhead">Rental Income</div>
              <div className="form-grid-2">
                <NumField
                  label="Annual Rent Received / Receivable"
                  value={prop.annualRentReceived}
                  onChange={(v) => set({ annualRentReceived: v })}
                  hint="Full year rent as per rent agreement"
                />
                <NumField
                  label="Municipal Taxes Paid"
                  value={prop.municipalTaxesPaid}
                  onChange={(v) => set({ municipalTaxesPaid: v })}
                  hint="Paid during the year by owner"
                />
              </div>
            </>
          )}

          {/* Loan interest */}
          <div className="hp-subhead">Interest on Housing Loan u/s 24(b)</div>
          <div className="form-grid-2">
            <NumField
              label="Interest Paid During Year"
              value={prop.interestOnLoan}
              onChange={(v) => set({ interestOnLoan: v })}
              hint="From lender certificate"
            />
            <NumField
              label="Pre-Construction Interest (1/5th)"
              value={prop.preConstructionInterest}
              onChange={(v) => set({ preConstructionInterest: v })}
              hint="1/5th of pre-EMI interest (5 equal instalments)"
            />
          </div>
          {prop.propertyType === 'self_occupied' && (
            <div className="hp-cap-note">
              Self-occupied interest capped at ₹2,00,000 u/s 24(b)
            </div>
          )}

          {/* Co-ownership */}
          <div className="hp-subhead">Co-Ownership</div>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={prop.coOwned}
              onChange={(e) => set({ coOwned: e.target.checked })}
            />
            <span className="toggle-text">This property is co-owned</span>
          </label>

          {prop.coOwned && (
            <div className="co-owner-section">
              <NumField
                label="Your Share (%)"
                value={prop.ownerSharePercent}
                onChange={(v) => set({ ownerSharePercent: Math.min(100, Math.max(0, v)) })}
                hint="Income/loss will be computed proportionally"
              />

              {prop.coOwners.map((co, ci) => (
                <div key={co.id} className="co-owner-row card">
                  <div className="co-owner-row-header">
                    <span className="co-owner-label">Co-Owner {ci + 1}</span>
                    <button className="btn btn-danger btn-sm" onClick={() => removeCoOwner(co.id)}>✕</button>
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input
                        type="text"
                        className="form-input"
                        value={co.name}
                        onChange={(e) => updateCoOwner(co.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">PAN</label>
                      <input
                        type="text"
                        className="form-input pan-field"
                        value={co.pan}
                        maxLength={10}
                        placeholder="AAAAA9999A"
                        onChange={(e) => {
                          const v = e.target.value.toUpperCase();
                          updateCoOwner(co.id, { pan: v });
                        }}
                      />
                      {co.pan.length === 10 && !panRegex.test(co.pan) && (
                        <span className="form-error">Invalid PAN</span>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Share (%)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-input"
                        value={co.sharePercent || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!isNaN(n)) updateCoOwner(co.id, { sharePercent: n });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button className="btn btn-secondary btn-sm" onClick={addCoOwner}>
                + Add Co-Owner
              </button>

              {/* Share validation */}
              {(() => {
                const totalShare = prop.ownerSharePercent + prop.coOwners.reduce((s, c) => s + c.sharePercent, 0);
                return totalShare !== 100 && totalShare > 0 ? (
                  <div className="hp-share-warn">
                    Shares total {totalShare}% — must equal 100%
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Computation */}
          <ComputationBox p={prop} result={result} />
        </div>
      )}
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

export default function ScheduleHPComponent({ returnId, returnData, onSaved, setDirty }: Props) {
  const [properties, setProperties] = useState<PropertyEntry[]>([emptyProperty()]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate
  useEffect(() => {
    const s = returnData.scheduleHP as any;
    if (!s || !Array.isArray(s.properties) || s.properties.length === 0) return;
    setProperties(
      s.properties.map((p: any) => ({ id: crypto.randomUUID(), ...p }))
    );
  }, [returnId]);

  // Build payload
  const buildPayload = useCallback((props: PropertyEntry[]): ScheduleHP => {
    const entries = props.map((p) => {
      const raw = computeHP(p);
      const r = p.coOwned ? applyCoOwnerShare(raw, p.ownerSharePercent) : raw;
      return {
        propertyType: p.propertyType,
        address: p.address,
        grossAnnualValue: r.grossAnnualValue,
        municipalTaxes: r.municipalTaxDeduction,
        netAnnualValue: r.netAnnualValue,
        standardDeduction: r.standardDeduction30,
        interestOnLoan: r.interestAllowable,
        incomeFromHP: r.incomeFromHP,
        coOwned: p.coOwned,
        ownerSharePercent: p.ownerSharePercent,
      };
    });

    const totalIncome = entries.reduce((s, e) => s + e.incomeFromHP, 0);

    return {
      properties: entries,
      totalIncomeFromHP: totalIncome,
      // Extra for UI round-trip
      _raw: props.map(({ id: _id, ...rest }) => rest),
    } as unknown as ScheduleHP;
  }, []);

  // Save
  const save = useCallback(async (props: PropertyEntry[]) => {
    setSaving(true);
    setSaveErr('');
    try {
      const payload = buildPayload(props);
      // HP uses upsertSalary channel equivalent — if a dedicated channel exists use it
      // otherwise piggyback on the generic update path
      const res = await fetch(`/api/returns/${returnId}/schedule/houseProperty`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Save failed'); }
      setLastSaved(new Date());
      setDirty(false);
      onSaved({ ...returnData, scheduleHP: payload });
    } catch (e: any) {
      setSaveErr(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [returnId, returnData, buildPayload, onSaved, setDirty]);

  const scheduleAutoSave = useCallback((props: PropertyEntry[]) => {
    setDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(props), 1500);
  }, [save, setDirty]);

  const updateProp = (id: string, patch: Partial<PropertyEntry>) => {
    setProperties((prev) => {
      const next = prev.map((p) => p.id === id ? { ...p, ...patch } : p);
      scheduleAutoSave(next);
      return next;
    });
  };

  const addProperty = () => {
    setProperties((prev) => {
      const next = [...prev, emptyProperty()];
      scheduleAutoSave(next);
      return next;
    });
  };

  const removeProperty = (id: string) => {
    setProperties((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((p) => p.id !== id);
      scheduleAutoSave(next);
      return next;
    });
  };

  // Derived totals
  const soCount = properties.filter((p) => p.propertyType === 'self_occupied').length;
  const totalHP = properties.reduce((sum, p) => {
    const raw = computeHP(p);
    const r = p.coOwned ? applyCoOwnerShare(raw, p.ownerSharePercent) : raw;
    return sum + r.incomeFromHP;
  }, 0);
  const totalLoss = Math.min(0, totalHP);
  const cappedLoss = Math.max(totalLoss, -200000);

  return (
    <div className="schedule-hp">
      {/* Top bar */}
      <div className="schedule-topbar">
        <div>
          <h2 className="schedule-title">Schedule HP — House Property</h2>
          <p className="schedule-subtitle">u/s 22–27 of the Income Tax Act</p>
        </div>
        <div className="schedule-topbar-right">
          {saving && <span className="save-indicator saving">Saving…</span>}
          {!saving && lastSaved && (
            <span className="save-indicator saved">
              Saved {lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {saveErr && <span className="save-indicator error">{saveErr}</span>}
          <button className="btn btn-primary btn-sm" onClick={() => save(properties)} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="hp-stats">
        <div className="stat-card">
          <div className="stat-label">Properties</div>
          <div className="stat-value">{properties.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Self-Occupied</div>
          <div className="stat-value">{soCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Let Out / Deemed LO</div>
          <div className="stat-value">{properties.length - soCount}</div>
        </div>
        <div className={`stat-card highlight ${totalHP < 0 ? 'loss' : ''}`}>
          <div className="stat-label">{totalHP < 0 ? 'Loss from HP' : 'Income from HP'}</div>
          <div className={`stat-value amount ${totalHP < 0 ? 'negative' : 'brand'}`}>
            {fmt(totalHP)}
          </div>
        </div>
      </div>

      {/* Loss set-off note */}
      {totalHP < 0 && (
        <div className="hp-setoff-banner">
          <span className="hp-setoff-icon">ℹ</span>
          <span>
            HP loss of {fmt(Math.abs(totalHP))} can be set off against other heads up to{' '}
            <strong>₹2,00,000</strong> u/s 71(3A). Balance {fmt(Math.abs(totalHP) - 200000 > 0 ? Math.abs(totalHP) - 200000 : 0)} carried forward for 8 years.
          </span>
        </div>
      )}

      {/* Property cards */}
      <div className="hp-list">
        {properties.map((p, idx) => (
          <PropertyCard
            key={p.id}
            prop={p}
            index={idx}
            total={properties.length}
            soCount={soCount}
            onChange={updateProp}
            onRemove={removeProperty}
          />
        ))}
      </div>

      <button className="btn btn-secondary add-prop-btn" onClick={addProperty}>
        + Add Property
      </button>

      {/* Aggregate table */}
      {properties.length > 1 && (
        <div className="card hp-agg-wrap">
          <div className="hp-agg-title">Aggregate — Income from House Property</div>
          <table className="data-table hp-agg-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Address</th>
                <th>Type</th>
                <th className="text-right">Income / (Loss)</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p, i) => {
                const raw = computeHP(p);
                const r = p.coOwned ? applyCoOwnerShare(raw, p.ownerSharePercent) : raw;
                return (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td>{p.address || '—'}</td>
                    <td>
                      <span className={`badge-${p.propertyType === 'self_occupied' ? 'info' : p.propertyType === 'let_out' ? 'success' : 'warning'}`}>
                        {p.propertyType === 'self_occupied' ? 'SO' : p.propertyType === 'let_out' ? 'LO' : 'DLO'}
                      </span>
                    </td>
                    <td className={`amount text-right ${r.incomeFromHP < 0 ? 'negative' : ''}`}>
                      {fmt(r.incomeFromHP)}
                    </td>
                  </tr>
                );
              })}
              <tr className="agg-total-row">
                <td colSpan={3}>Total Income from House Property</td>
                <td className={`amount text-right ${totalHP < 0 ? 'negative' : 'brand'}`}>
                  {fmt(totalHP)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .schedule-hp {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding-bottom: 3rem;
        }
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
        .hp-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }
        .stat-card.highlight { border-color: var(--brand-primary,#D4A017); }
        .stat-card.highlight.loss { border-color: #f85149; }
        .stat-value.brand { color: var(--brand-text,#F0C040); }
        .stat-value.negative { color: #f85149; }

        /* Set-off banner */
        .hp-setoff-banner {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          background: rgba(248,81,73,.08);
          border: 1px solid rgba(248,81,73,.25);
          border-radius: 6px;
          padding: 0.75rem 1rem;
          font-size: 0.8rem;
          color: var(--text-primary,#E6EDF3);
          line-height: 1.5;
        }
        .hp-setoff-icon { color: #f85149; flex-shrink: 0; font-size: 0.9rem; }

        /* Cards */
        .hp-list { display: flex; flex-direction: column; gap: 1rem; }
        .hp-card { border-radius: 8px; overflow: hidden; }
        .hp-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1.1rem;
          cursor: pointer;
          background: var(--bg-elevated,#1E2530);
          user-select: none;
        }
        .hp-card-header:hover { background: rgba(255,255,255,.03); }
        .hp-card-title {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .hp-index-badge {
          width: 24px; height: 24px; border-radius: 50%;
          background: var(--brand-primary,#D4A017); color: #000;
          font-size: 0.72rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .hp-addr-preview { font-size: 0.88rem; font-weight: 500; color: var(--text-primary,#E6EDF3); }
        .hp-type-badge { font-size: 0.7rem; }
        .hp-card-actions { display: flex; align-items: center; gap: 0.5rem; }
        .collapse-chevron { font-size: 0.7rem; color: var(--text-muted,#8B949E); padding: 0 0.2rem; }

        .hp-card-body {
          padding: 1.1rem;
          border-top: 1px solid rgba(255,255,255,.06);
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .hp-subhead {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--brand-primary,#D4A017);
          padding-bottom: 0.3rem;
          border-bottom: 1px solid rgba(212,160,23,.15);
        }

        .radio-group { display: flex; gap: 1.25rem; flex-wrap: wrap; margin-top: 0.35rem; }
        .radio-label { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.82rem; color: var(--text-primary,#E6EDF3); }
        .radio-label.disabled { opacity: 0.4; cursor: not-allowed; }
        .radio-label input[type="radio"] { accent-color: var(--brand-primary,#D4A017); }

        .hp-address { resize: vertical; min-height: 52px; }
        .hp-so-note, .hp-cap-note {
          font-size: 0.74rem; color: #e3b341;
          background: rgba(227,179,65,.08);
          border: 1px solid rgba(227,179,65,.2);
          border-radius: 4px;
          padding: 0.4rem 0.6rem;
        }

        /* Co-ownership */
        .toggle-label { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; font-size: 0.82rem; color: var(--text-muted,#8B949E); }
        .toggle-label input[type="checkbox"] { accent-color: var(--brand-primary,#D4A017); }
        .toggle-text { user-select: none; }
        .co-owner-section { display: flex; flex-direction: column; gap: 0.75rem; }
        .co-owner-row { padding: 0.85rem; }
        .co-owner-row-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
        .co-owner-label { font-size: 0.8rem; font-weight: 600; color: var(--text-primary,#E6EDF3); }
        .hp-share-warn { font-size: 0.74rem; color: #f85149; background: rgba(248,81,73,.08); border: 1px solid rgba(248,81,73,.2); border-radius: 4px; padding: 0.4rem 0.6rem; }

        /* Computation box */
        .hp-computation-box {
          background: var(--bg-base,#0D1117);
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 6px;
          padding: 1rem;
          margin-top: 0.25rem;
        }
        .hp-comp-title { font-size: 0.75rem; font-weight: 600; color: var(--brand-primary,#D4A017); margin-bottom: 0.6rem; text-transform: uppercase; letter-spacing: .06em; }
        .hp-comp-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .hp-comp-table td { padding: 0.42rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,.04); color: var(--text-secondary,#8B949E); }
        .hp-comp-table td:first-child { color: var(--text-primary,#E6EDF3); }
        .hp-comp-table .tr { text-align: right; }
        .hp-comp-table .deduct { color: #f85149; }
        .subtotal-row td { background: rgba(255,255,255,.02); font-weight: 600; color: var(--text-primary,#E6EDF3) !important; }
        .total-row td { font-weight: 700; font-size: 0.86rem; border-top: 1px solid rgba(255,255,255,.1); border-bottom: none; }
        .total-row.profit td { background: rgba(63,185,80,.06); }
        .total-row.loss td { background: rgba(248,81,73,.06); }
        .hp-comp-table .negative { color: #f85149 !important; }
        .hp-comp-table .positive { color: #3fb950 !important; }
        .hp-loss-note { font-size: 0.72rem; color: var(--text-muted,#8B949E); margin-top: 0.5rem; }

        /* Add btn */
        .add-prop-btn { align-self: flex-start; }

        /* Hints, readonly */
        .form-hint { font-size: 0.72rem; color: var(--text-muted,#8B949E); margin-top: 0.25rem; display: block; }
        .hp-readonly { opacity: .55; cursor: default; }
        .text-right { text-align: right; }

        /* Aggregate table */
        .hp-agg-wrap { padding: 1.25rem; }
        .hp-agg-title { font-size: 0.9rem; font-weight: 600; color: var(--text-primary,#E6EDF3); margin-bottom: 1rem; }
        .hp-agg-table { width: 100%; }
        .agg-total-row td { font-weight: 700; border-top: 1px solid rgba(255,255,255,.1); background: rgba(212,160,23,.06); }
        .agg-total-row .negative { color: #f85149; }
        .agg-total-row .brand { color: var(--brand-text,#F0C040); }
      `}</style>
    </div>
  );
}
