'use client';
/**
 * renderer/app/components/clients/ClientForm.tsx
 *
 * Client create/edit form aligned with ITR schema fields.
 * Fields match what itrBuilder.ts and authHandlers need:
 *   PAN, fullName, assesseeType, dateOfBirth, residentialStatus,
 *   mobileNumber, email, address, city, stateCode, pinCode,
 *   aadhaarNumber, portalUsername, portalPassword
 */

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssesseeType =
  | 'INDIVIDUAL' | 'HUF' | 'DOMESTIC_COMPANY' | 'FOREIGN_COMPANY'
  | 'FIRM' | 'LLP' | 'AOP' | 'BOI' | 'AJP' | 'OTHER';

type ResidentialStatus = 'RES' | 'NRI' | 'RNR';
type TaxRegime = 'NEW' | 'OLD';

type EmployerCategory = 'CGOV' | 'SGOV' | 'PSU' | 'PE' | 'PESG' | 'PEPS' | 'PEO' | 'OTH' | 'NA';

interface ClientFormData {
  pan: string;
  fullName: string;
  assesseeType: AssesseeType;
  dateOfBirth: string;
  residentialStatus: ResidentialStatus;
  employerCategory: EmployerCategory;
  mobileNumber: string;
  email: string;
  address: string;
  city: string;
  stateCode: string;
  pinCode: string;
  aadhaarNumber: string;
  portalUsername: string;
  portalPassword: string;
}

interface ClientFormProps {
  clientId?: number | null;
  onSuccess: (clientId: number) => void;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSESSEE_TYPES: { value: AssesseeType; label: string }[] = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'HUF', label: 'HUF (Hindu Undivided Family)' },
  { value: 'FIRM', label: 'Firm (Partnership)' },
  { value: 'LLP', label: 'LLP (Limited Liability Partnership)' },
  { value: 'DOMESTIC_COMPANY', label: 'Company — Domestic' },
  { value: 'FOREIGN_COMPANY', label: 'Company — Foreign' },
  { value: 'AOP', label: 'AOP (Association of Persons)' },
  { value: 'BOI', label: 'BOI (Body of Individuals)' },
  { value: 'AJP', label: 'AJP (Artificial Juridical Person)' },
  { value: 'OTHER', label: 'Other' },
];

const RESIDENTIAL_STATUSES: { value: ResidentialStatus; label: string }[] = [
  { value: 'RES', label: 'Resident' },
  { value: 'NRI', label: 'Non-Resident (NRI)' },
  { value: 'RNR', label: 'Resident but Not Ordinarily Resident (RNOR)' },
];

// ITD state codes
const STATE_CODES: { value: string; label: string }[] = [
  { value: '01', label: 'Andaman & Nicobar Islands' },
  { value: '02', label: 'Andhra Pradesh' },
  { value: '03', label: 'Arunachal Pradesh' },
  { value: '04', label: 'Assam' },
  { value: '05', label: 'Bihar' },
  { value: '06', label: 'Chandigarh' },
  { value: '07', label: 'Chhattisgarh' },
  { value: '08', label: 'Dadra & Nagar Haveli and Daman & Diu' },
  { value: '09', label: 'Delhi' },
  { value: '10', label: 'Goa' },
  { value: '11', label: 'Gujarat' },
  { value: '12', label: 'Haryana' },
  { value: '13', label: 'Himachal Pradesh' },
  { value: '14', label: 'Jammu & Kashmir' },
  { value: '15', label: 'Jharkhand' },
  { value: '16', label: 'Karnataka' },
  { value: '17', label: 'Kerala' },
  { value: '18', label: 'Ladakh' },
  { value: '19', label: 'Lakshadweep' },
  { value: '20', label: 'Madhya Pradesh' },
  { value: '21', label: 'Maharashtra' },
  { value: '22', label: 'Manipur' },
  { value: '23', label: 'Meghalaya' },
  { value: '24', label: 'Mizoram' },
  { value: '25', label: 'Nagaland' },
  { value: '26', label: 'Odisha' },
  { value: '27', label: 'Puducherry' },
  { value: '28', label: 'Punjab' },
  { value: '29', label: 'Rajasthan' },
  { value: '30', label: 'Sikkim' },
  { value: '31', label: 'Tamil Nadu' },
  { value: '32', label: 'Telangana' },
  { value: '33', label: 'Tripura' },
  { value: '34', label: 'Uttar Pradesh' },
  { value: '35', label: 'Uttarakhand' },
  { value: '36', label: 'West Bengal' },
  { value: '99', label: 'Foreign / Outside India' },
];

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const AADHAAR_REGEX = /^\d{12}$/;
const PINCODE_REGEX = /^\d{6}$/;

const EMPLOYER_CATEGORIES: { value: EmployerCategory; label: string }[] = [
  { value: 'OTH',  label: 'Others (Private Sector)' },
  { value: 'CGOV', label: 'Central Government' },
  { value: 'SGOV', label: 'State Government' },
  { value: 'PSU',  label: 'Public Sector Undertaking (PSU)' },
  { value: 'PE',   label: 'Pensioner — Central Govt.' },
  { value: 'PESG', label: 'Pensioner — State Govt.' },
  { value: 'PEPS', label: 'Pensioner — PSU' },
  { value: 'PEO',  label: 'Pensioner — Others' },
  { value: 'NA',   label: 'Not Applicable (Business/Profession/No Salary)' },
];

const EMPTY_FORM: ClientFormData = {
  pan: '',
  fullName: '',
  assesseeType: 'INDIVIDUAL',
  dateOfBirth: '',
  residentialStatus: 'RES',
  employerCategory: 'OTH',
  mobileNumber: '',
  email: '',
  address: '',
  city: '',
  stateCode: '11',
  pinCode: '',
  aadhaarNumber: '',
  portalUsername: '',
  portalPassword: '',
};

// ─── Validators ───────────────────────────────────────────────────────────────

function validateForm(data: ClientFormData, isEdit: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.pan) errors.pan = 'PAN is required';
  else if (!PAN_REGEX.test(data.pan)) errors.pan = 'Invalid PAN. Format: AAAAA0000A';
  if (!data.fullName.trim()) errors.fullName = 'Full name is required';
  if (!data.dateOfBirth) errors.dateOfBirth = 'Date of birth / incorporation is required';
  if (data.mobileNumber && !MOBILE_REGEX.test(data.mobileNumber))
    errors.mobileNumber = 'Enter a valid 10-digit mobile number';
  if (data.aadhaarNumber && !AADHAAR_REGEX.test(data.aadhaarNumber))
    errors.aadhaarNumber = 'Aadhaar must be 12 digits';
  if (data.pinCode && !PINCODE_REGEX.test(data.pinCode))
    errors.pinCode = 'Pin code must be 6 digits';
  if (!data.address.trim()) errors.address = 'Address is required';
  if (!data.city.trim()) errors.city = 'City is required';
  if (!isEdit && !data.portalPassword)
    errors.portalPassword = 'Portal password is required for new clients';
  return errors;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientForm({ clientId, onSuccess, onCancel }: ClientFormProps) {
  const isEdit = Boolean(clientId);
  const isMock = false; // web app — always use fetch API

  const [form, setForm] = useState<ClientFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEdit);
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load existing client in edit mode
  useEffect(() => {
    if (!isEdit) return;
    async function load() {
      setFetchLoading(true);
      try {
        let data: any;
        const res = await fetch(`/api/clients/${clientId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load client');
        data = json.data;
        setForm({
          pan: data.pan ?? '',
          fullName: data.fullName ?? data.name ?? '',
          assesseeType: data.assesseeType ?? 'INDIVIDUAL',
          dateOfBirth: (data.dateOfBirth ?? data.dateOfBirthOrIncorporation ?? '').split('T')[0],
          residentialStatus: data.residentialStatus ?? 'RES',
          employerCategory: data.employerCategory ?? 'OTH',
          mobileNumber: data.mobileNumber ?? data.mobile ?? '',
          email: data.email ?? '',
          address: data.address ?? data.addressLine1 ?? '',
          city: data.city ?? '',
          stateCode: data.stateCode ?? data.state ?? '11',
          pinCode: data.pinCode ? String(data.pinCode) : '',
          aadhaarNumber: data.aadhaarNumber ?? '',
          portalUsername: data.portalUsername ?? '',
          portalPassword: '',
        });
      } catch (e: any) {
        setFeedback({ type: 'error', message: e.message });
      } finally {
        setFetchLoading(false);
      }
    }
    load();
  }, [clientId, isEdit, isMock]);

  const handleChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'pan') {
        updated.pan = value.toUpperCase();
        if (!isEdit && prev.portalUsername === prev.pan) {
          updated.portalUsername = updated.pan;
        }
      }
      return updated;
    });
    if (errors[name]) setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
  }, [errors, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const validationErrors = validateForm(form, isEdit);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const firstKey = Object.keys(validationErrors)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setLoading(true);
    try {
      let result: any;

      const payload = {
        pan: form.pan.toUpperCase(),
        assesseeType: form.assesseeType,
        fullName: form.fullName,
        dateOfBirth: form.dateOfBirth || undefined,
        residentialStatus: form.residentialStatus,
        employerCategory: form.employerCategory,
        mobileNumber: form.mobileNumber || undefined,
        email: form.email || undefined,
        address: form.address,
        city: form.city,
        stateCode: form.stateCode,
        pinCode: form.pinCode ? parseInt(form.pinCode) : undefined,
        aadhaarNumber: form.aadhaarNumber || undefined,
        portalUsername: form.portalUsername || form.pan.toUpperCase(),
        portalPassword: form.portalPassword || undefined,
      };

      if (isEdit) {
        const res = await fetch(`/api/clients/${clientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        if (!res.ok) throw new Error(json.error || 'Operation failed');
        result = { success: true, data: { id: clientId } };
      } else {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        if (!res.ok) throw new Error(json.error || 'Operation failed');
        result = { success: true, data: json.data };
      }

      if (!result.success) throw new Error(result.error || 'Operation failed');

      setFeedback({ type: 'success', message: isEdit ? 'Client updated.' : 'Client created successfully.' });
      setTimeout(() => onSuccess(result.data?.id ?? clientId ?? 0), 800);
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message ?? 'An error occurred' });
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '0.75rem' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--text-muted)' }}>Loading client data…</span>
      </div>
    );
  }

  const dobLabel = ['INDIVIDUAL', 'HUF'].includes(form.assesseeType) ? 'Date of Birth' : 'Date of Incorporation';

  return (
    <div
      className="animate-in"
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '1.5rem',
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 80px)',
        paddingBottom: '2rem',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isEdit ? 'Edit Client' : 'New Client'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Fields marked * are required. Client data is used to generate ITR JSON.
          </p>
        </div>
        {!isEdit && (
          <label style={{ cursor: 'pointer' }}>
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  const c = Array.isArray(parsed) ? parsed[0] : parsed;
                  if (!c?.pan) { alert('JSON must contain a "pan" field'); return; }
                  setForm((prev) => ({
                    ...prev,
                    pan: (c.pan ?? prev.pan).toUpperCase(),
                    fullName: String(c.fullName || c.name || [c.firstName, c.middleName, c.lastName || c.surName].filter(Boolean).join(' ') || prev.fullName),
                    assesseeType: c.assesseeType ?? prev.assesseeType,
                    dateOfBirth: ((c.dateOfBirth ?? c.dob ?? '') as string).split('T')[0] || prev.dateOfBirth,
                    residentialStatus: c.residentialStatus ?? prev.residentialStatus,
                    mobileNumber: c.mobileNumber ?? c.mobile ?? prev.mobileNumber,
                    email: c.email ?? prev.email,
                    address: c.address ?? prev.address,
                    city: c.city ?? prev.city,
                    stateCode: c.stateCode ?? c.state ?? prev.stateCode,
                    pinCode: String(c.pinCode ?? c.pincode ?? prev.pinCode),
                    aadhaarNumber: c.aadhaarNumber ?? c.aadhaar ?? prev.aadhaarNumber,
                    portalUsername: c.portalUsername ?? c.pan?.toUpperCase() ?? prev.portalUsername,
                    portalPassword: c.portalPassword ?? c.password ?? prev.portalPassword,
                  }));
                } catch {
                  alert('Invalid JSON file');
                }
                e.target.value = '';
              }}
            />
            <span className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}>
              📂 Import from JSON
            </span>
          </label>
        )}
      </div>

      {feedback && (
        <div
          style={{
            padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 6, fontSize: '0.875rem',
            background: feedback.type === 'success' ? 'rgba(35,134,54,0.12)' : 'rgba(248,81,73,0.12)',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(35,134,54,0.4)' : 'rgba(248,81,73,0.4)'}`,
            color: feedback.type === 'success' ? '#3fb950' : '#f85149',
          }}
        >
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Identity ── */}
        <Section title="Identity" subtitle="As per Income Tax records — used in ITR PersonalInfo" />
        <div className="form-grid form-grid-2" style={{ marginBottom: '1.25rem' }}>

          <div className="form-group" id="field-pan">
            <label className="form-label">PAN *</label>
            <input
              name="pan"
              className={`form-input pan-field${errors.pan ? ' error' : ''}`}
              placeholder="AAAAA0000A"
              value={form.pan}
              onChange={handleChange}
              maxLength={10}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.pan && <span className="form-error">{errors.pan}</span>}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
              5 letters · 4 digits · 1 letter (auto-uppercased)
            </span>
          </div>

          <div className="form-group" id="field-fullName">
            <label className="form-label">Full Name / Entity Name *</label>
            <input
              name="fullName"
              className={`form-input${errors.fullName ? ' error' : ''}`}
              placeholder="As per PAN card"
              value={form.fullName}
              onChange={handleChange}
            />
            {errors.fullName && <span className="form-error">{errors.fullName}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Assessee Type *</label>
            <select name="assesseeType" className="form-select" value={form.assesseeType} onChange={handleChange}>
              {ASSESSEE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
              Determines ITR form type: ITR-1/2 for Individual, ITR-4 for Presumptive
            </span>
          </div>

          <div className="form-group" id="field-dateOfBirth">
            <label className="form-label">{dobLabel} *</label>
            <input
              name="dateOfBirth"
              type="date"
              className={`form-input${errors.dateOfBirth ? ' error' : ''}`}
              value={form.dateOfBirth}
              onChange={handleChange}
              max={new Date().toISOString().split('T')[0]}
            />
            {errors.dateOfBirth && <span className="form-error">{errors.dateOfBirth}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Residential Status</label>
            <select name="residentialStatus" className="form-select" value={form.residentialStatus} onChange={handleChange}>
              {RESIDENTIAL_STATUSES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
              Used in ITR FilingStatus → ResidentialStatus
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Employer Category</label>
            <select name="employerCategory" className="form-select" value={form.employerCategory} onChange={handleChange}>
              {EMPLOYER_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
              ITR PersonalInfo → EmployerCategory (CGOV/SGOV/PSU/OTH/NA)
            </span>
          </div>

          <div className="form-group" id="field-aadhaarNumber">
            <label className="form-label">Aadhaar Number</label>
            <input
              name="aadhaarNumber"
              className={`form-input font-mono${errors.aadhaarNumber ? ' error' : ''}`}
              placeholder="12-digit Aadhaar"
              value={form.aadhaarNumber}
              onChange={handleChange}
              maxLength={12}
            />
            {errors.aadhaarNumber && <span className="form-error">{errors.aadhaarNumber}</span>}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
              Used in Verification section of ITR
            </span>
          </div>

        </div>

        {/* ── Contact ── */}
        <Section title="Contact Details" subtitle="Used in ITR PersonalInfo → Address" />
        <div className="form-grid form-grid-2" style={{ marginBottom: '1.25rem' }}>
          <div className="form-group" id="field-mobileNumber">
            <label className="form-label">Mobile Number</label>
            <input
              name="mobileNumber"
              type="tel"
              className={`form-input${errors.mobileNumber ? ' error' : ''}`}
              placeholder="10-digit mobile"
              value={form.mobileNumber}
              onChange={handleChange}
              maxLength={10}
            />
            {errors.mobileNumber && <span className="form-error">{errors.mobileNumber}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              name="email"
              type="email"
              className="form-input"
              placeholder="client@email.com"
              value={form.email}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* ── Address ── */}
        <Section title="Address" subtitle="Maps to ITR PersonalInfo → Address → RoadOrStreet, City, StateCode, PinCode" />
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="form-group" id="field-address" style={{ marginBottom: '0.75rem' }}>
            <label className="form-label">Address *</label>
            <input
              name="address"
              className={`form-input${errors.address ? ' error' : ''}`}
              placeholder="Flat / House No., Street, Area"
              value={form.address}
              onChange={handleChange}
              maxLength={200}
            />
            {errors.address && <span className="form-error">{errors.address}</span>}
          </div>
          <div className="form-grid form-grid-3">
            <div className="form-group" id="field-city">
              <label className="form-label">City *</label>
              <input
                name="city"
                className={`form-input${errors.city ? ' error' : ''}`}
                placeholder="City"
                value={form.city}
                onChange={handleChange}
                maxLength={50}
              />
              {errors.city && <span className="form-error">{errors.city}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">State (ITD Code) *</label>
              <select name="stateCode" className="form-select" value={form.stateCode} onChange={handleChange}>
                {STATE_CODES.map((s) => (
                  <option key={s.value} value={s.value}>{s.value} — {s.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" id="field-pinCode">
              <label className="form-label">Pin Code</label>
              <input
                name="pinCode"
                className={`form-input font-mono${errors.pinCode ? ' error' : ''}`}
                placeholder="6-digit pin"
                value={form.pinCode}
                onChange={handleChange}
                maxLength={6}
              />
              {errors.pinCode && <span className="form-error">{errors.pinCode}</span>}
            </div>
          </div>
        </div>

        {/* ── Portal Credentials ── */}
        <Section
          title="Income Tax Portal Credentials"
          subtitle="Stored encrypted in vault (AES-256-GCM). Used for e-filing portal login."
        />
        <div className="card-elevated" style={{ padding: '1rem', borderRadius: 8, marginBottom: '1.5rem', border: '1px solid var(--border-subtle)' }}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Portal Username</label>
              <input
                name="portalUsername"
                className="form-input font-mono"
                placeholder="Defaults to PAN"
                value={form.portalUsername}
                onChange={handleChange}
                autoComplete="off"
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
                Usually the client's PAN. Used to log into incometax.gov.in
              </span>
            </div>
            <div className="form-group" id="field-portalPassword">
              <label className="form-label">Portal Password {!isEdit && '*'}</label>
              <div style={{ position: 'relative' }}>
                <input
                  name="portalPassword"
                  type={showPassword ? 'text' : 'password'}
                  className={`form-input font-mono${errors.portalPassword ? ' error' : ''}`}
                  placeholder={isEdit ? 'Leave blank to keep existing' : 'Enter portal password'}
                  value={form.portalPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: '0.5rem', top: '50%',
                    transform: 'translateY(-50%)', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.portalPassword && <span className="form-error">{errors.portalPassword}</span>}
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div style={{
          display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
          paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)',

        }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: 130 }}>
            {loading
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> {isEdit ? 'Saving…' : 'Creating…'}</>
              : isEdit ? 'Save Changes' : 'Create Client'}
          </button>
        </div>

      </form>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function Section({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: '0.75rem', marginTop: '0.5rem' }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--brand-primary)',
        borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem',
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
