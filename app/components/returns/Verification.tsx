'use client';

/**
 * renderer/app/components/returns/Verification.tsx
 *
 * Verification section for ITR filing:
 *   - Assessee details (name, father's name, place, date)
 *   - Capacity (self / representative)
 *   - e-Verify method selection
 *   - TRP details (if filed through Tax Return Preparer)
 *   - "File Return" action — calls returns:updateStatus to mark as FILED
 *
 * Used by ReturnShell on the Verification tab.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  Verification as VerificationType,
  VerificationCapacity,
  ITRFormType,
} from '@/shared/types/itr';

// ─── Props ────────────────────────────────────────────────────────────────────

interface VerificationProps {
  returnId: number;
  clientName: string;
  formType: ITRFormType;
  assessmentYear: string;
  readOnly?: boolean;
  onFiled: () => void;
}

// ─── Mock ─────────────────────────────────────────────────────────────────────

const MOCK_VERIFICATION: VerificationType = {
  AssesseeVerName: 'Priya Kapoor',
  FatherName: 'Ramesh Kapoor',
  PlaceVerSign: 'Mumbai',
  DateVerSign: new Date().toISOString().split('T')[0],
  Capacity: 'S',
  EverifyFlag: 'Y',
  AadhaarOTPFlag: 'Y',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Verification({
  returnId,
  clientName,
  formType,
  assessmentYear,
  readOnly = false,
  onFiled,
}: VerificationProps) {
  const [data, setData] = useState<VerificationType>({
    AssesseeVerName: clientName,
    FatherName: '',
    PlaceVerSign: '',
    DateVerSign: new Date().toISOString().split('T')[0],
    Capacity: 'S',
    EverifyFlag: 'Y',
    AadhaarOTPFlag: 'N',
    BankAccountFlag: 'N',
    DematAccountFlag: 'N',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showTRP, setShowTRP] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Load
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/returns/${returnId}`);
        const { data: ret } = await res.json();
        if (ret?.verification) {
          const v = ret.verification as VerificationType;
          setData(v);
          setShowTRP(!!v.TRPName);
        } else {
          setData((prev) => ({ ...prev, AssesseeVerName: clientName }));
        }
      } catch {
        setData((prev) => ({ ...prev, AssesseeVerName: clientName }));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [returnId, clientName]);

  const update = useCallback((patch: Partial<VerificationType>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  // Save verification details
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/returns/${returnId}/schedule/verification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Save failed'); }
      setDirty(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [returnId, data]);

  // File return
  const handleFile = useCallback(async () => {
    setFiling(true);
    setError(null);
    try {
      await fetch(`/api/returns/${returnId}/schedule/verification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const statusRes = await fetch(`/api/returns/${returnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FILED', filedAt: new Date().toISOString() }),
      });
      if (!statusRes.ok) { const j = await statusRes.json(); throw new Error(j.error ?? 'Filing failed'); }
      setShowConfirm(false);
      onFiled();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Filing failed');
      setShowConfirm(false);
    } finally {
      setFiling(false);
    }
  }, [returnId, data, onFiled]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '40px 0' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--text-secondary)' }}>Loading verification details…</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '760px' }}>

      {/* ── Section header ── */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          Verification
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          I hereby declare that all the information given in this return and the schedules thereto is correct
          and complete and is in accordance with the provisions of the Income-tax Act, 1961.
        </p>
      </div>

      {/* ── Declaration details ── */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>
            Declaration
          </h3>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Name of Assessee *</label>
              <input
                className="form-input"
                value={data.AssesseeVerName}
                onChange={(e) => update({ AssesseeVerName: e.target.value })}
                disabled={readOnly}
                placeholder="Full name as per PAN"
                maxLength={125}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Father's Name</label>
              <input
                className="form-input"
                value={data.FatherName ?? ''}
                onChange={(e) => update({ FatherName: e.target.value })}
                disabled={readOnly}
                placeholder="Required for individual assessees"
                maxLength={125}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Place of Signing *</label>
              <input
                className="form-input"
                value={data.PlaceVerSign}
                onChange={(e) => update({ PlaceVerSign: e.target.value })}
                disabled={readOnly}
                placeholder="City where return is signed"
                maxLength={50}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Signing *</label>
              <input
                className="form-input"
                type="date"
                value={data.DateVerSign}
                onChange={(e) => update({ DateVerSign: e.target.value })}
                disabled={readOnly}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Capacity *</label>
              <select
                className="form-select"
                value={data.Capacity}
                onChange={(e) => update({ Capacity: e.target.value as VerificationCapacity })}
                disabled={readOnly}
              >
                <option value="S">Self</option>
                <option value="R">Representative Assessee</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── e-Verify method ── */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            e-Verify Method
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Select how the return will be verified on the ITD e-filing portal.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <EVerifyOption
              label="Aadhaar OTP"
              hint="OTP sent to Aadhaar-linked mobile number. Fastest method."
              checked={data.AadhaarOTPFlag === 'Y'}
              onChange={(v) => update({ EverifyFlag: v ? 'Y' : 'N', AadhaarOTPFlag: v ? 'Y' : 'N' })}
              readOnly={readOnly}
            />
            <EVerifyOption
              label="EVC via Bank Account"
              hint="Electronic Verification Code sent to bank-registered mobile."
              checked={data.BankAccountFlag === 'Y'}
              onChange={(v) => update({ EverifyFlag: v ? 'Y' : 'N', BankAccountFlag: v ? 'Y' : 'N' })}
              readOnly={readOnly}
            />
            <EVerifyOption
              label="EVC via Demat Account"
              hint="Electronic Verification Code via CDSL/NSDL linked mobile."
              checked={data.DematAccountFlag === 'Y'}
              onChange={(v) => update({ EverifyFlag: v ? 'Y' : 'N', DematAccountFlag: v ? 'Y' : 'N' })}
              readOnly={readOnly}
            />
            <EVerifyOption
              label="Send signed ITR-V by post"
              hint="Download ITR-V, sign, and send to CPC Bengaluru within 30 days."
              checked={data.EverifyFlag === 'N' && data.AadhaarOTPFlag !== 'Y' && data.BankAccountFlag !== 'Y' && data.DematAccountFlag !== 'Y'}
              onChange={(v) => {
                if (v) update({ EverifyFlag: 'N', AadhaarOTPFlag: 'N', BankAccountFlag: 'N', DematAccountFlag: 'N' });
              }}
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>

      {/* ── TRP details ── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showTRP ? '16px' : 0 }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                Tax Return Preparer (TRP)
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Fill if the return is prepared by a registered TRP
              </p>
            </div>
            {!readOnly && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showTRP}
                  onChange={(e) => {
                    setShowTRP(e.target.checked);
                    if (!e.target.checked) update({ TRPName: undefined, TRPIdentification: undefined, TRPAddress: undefined });
                  }}
                />
                Filed via TRP
              </label>
            )}
          </div>

          {showTRP && (
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">TRP Name</label>
                <input
                  className="form-input"
                  value={data.TRPName ?? ''}
                  onChange={(e) => update({ TRPName: e.target.value })}
                  disabled={readOnly}
                  placeholder="Full name of TRP"
                  maxLength={125}
                />
              </div>
              <div className="form-group">
                <label className="form-label">TRP Identification No.</label>
                <input
                  className="form-input pan-field"
                  value={data.TRPIdentification ?? ''}
                  onChange={(e) => update({ TRPIdentification: e.target.value.toUpperCase() })}
                  disabled={readOnly}
                  placeholder="TRP registration number"
                  maxLength={20}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">TRP Address</label>
                <input
                  className="form-input"
                  value={data.TRPAddress ?? ''}
                  onChange={(e) => update({ TRPAddress: e.target.value })}
                  disabled={readOnly}
                  placeholder="Address of TRP"
                  maxLength={200}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Return summary ── */}
      <div className="card card-elevated" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>
            Return Summary
          </h3>
          <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
            <SummaryItem label="Form Type" value={formType} />
            <SummaryItem label="Assessment Year" value={assessmentYear} />
            <SummaryItem label="Assessee" value={data.AssesseeVerName || clientName} />
            <SummaryItem label="Capacity" value={data.Capacity === 'S' ? 'Self' : 'Representative'} />
            <SummaryItem
              label="e-Verify"
              value={
                data.AadhaarOTPFlag === 'Y' ? 'Aadhaar OTP' :
                data.BankAccountFlag === 'Y' ? 'Bank EVC' :
                data.DematAccountFlag === 'Y' ? 'Demat EVC' :
                'ITR-V by Post'
              }
            />
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="badge badge-error" style={{ marginBottom: '16px', padding: '10px 14px', display: 'block' }}>
          {error}
        </div>
      )}

      {/* ── Actions ── */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving
              ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Saving…</>
              : 'Save'}
          </button>

          <button
            className="btn btn-primary"
            onClick={() => setShowConfirm(true)}
            disabled={!data.AssesseeVerName || !data.PlaceVerSign || !data.DateVerSign}
          >
            File Return →
          </button>

          {dirty && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Unsaved changes
            </span>
          )}
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                Confirm Filing
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                You are about to mark this return as <strong>Filed</strong>:
              </p>
              <div style={{
                background: 'var(--bg-elevated)',
                borderRadius: '6px',
                padding: '14px 16px',
                marginBottom: '20px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: '1.8',
              }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Form: </span>{formType}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>AY: </span>{assessmentYear}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Assessee: </span>{data.AssesseeVerName}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Place: </span>{data.PlaceVerSign}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Date: </span>{data.DateVerSign}</div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>e-Verify: </span>
                  {data.AadhaarOTPFlag === 'Y' ? 'Aadhaar OTP' :
                   data.BankAccountFlag === 'Y' ? 'Bank EVC' :
                   data.DematAccountFlag === 'Y' ? 'Demat EVC' :
                   'ITR-V by Post'}
                </div>
              </div>

              <div style={{
                background: 'rgba(212, 160, 23, 0.08)',
                border: '1px solid rgba(212, 160, 23, 0.3)',
                borderRadius: '6px',
                padding: '12px 14px',
                fontSize: '12px',
                color: 'var(--brand-text)',
                marginBottom: '20px',
              }}>
                ⚠️ Once filed, this return will be locked and cannot be edited. To make changes, a revised return must be filed u/s 139(5).
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowConfirm(false)}
                  disabled={filing}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleFile}
                  disabled={filing}
                >
                  {filing
                    ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Filing…</>
                    : 'Confirm & File'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EVerifyOption({
  label,
  hint,
  checked,
  onChange,
  readOnly,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '12px 14px',
      background: checked ? 'rgba(212, 160, 23, 0.06)' : 'var(--bg-elevated)',
      border: `1px solid ${checked ? 'rgba(212, 160, 23, 0.4)' : 'var(--border-subtle)'}`,
      borderRadius: '6px',
      cursor: readOnly ? 'default' : 'pointer',
      transition: 'all 0.15s',
    }}>
      <input
        type="radio"
        checked={checked}
        onChange={(e) => !readOnly && onChange(e.target.checked)}
        disabled={readOnly}
        style={{ marginTop: '2px', accentColor: 'var(--brand-primary)', flexShrink: 0 }}
      />
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
          {label}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{hint}</div>
      </div>
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
