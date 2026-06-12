'use client';
// File: renderer/app/components/auth/SetupWizard.tsx

import { useState } from 'react';
import { useAuthStore } from '../../../store/authStore';

type Step = 'welcome' | 'firm' | 'admin' | 'security' | 'done';

interface SetupData {
  firmName: string;
  firmAddress: string;
  adminUsername: string;
  adminDisplayName: string;
  masterPassword: string;
  confirmPassword: string;
}

export function SetupWizard() {
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSetupRequired, setUser, setVaultUnlocked } = useAuthStore();

  const [data, setData] = useState<SetupData>({
    firmName: '',
    firmAddress: '',
    adminUsername: 'admin',
    adminDisplayName: '',
    masterPassword: '',
    confirmPassword: '',
  });

  function update(field: keyof SetupData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    setError('');
  }

  async function handleFinish() {
    if (data.masterPassword !== data.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (data.masterPassword.length < 8) {
      setError('Master password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const result = await window.taxflow.auth.setup({
        firmName: data.firmName,
        firmAddress: data.firmAddress || undefined,
        adminUsername: data.adminUsername,
        adminDisplayName: data.adminDisplayName,
        masterPassword: data.masterPassword,
      });

      if (!result.success) {
        setError(result.error || 'Setup failed');
        return;
      }

      setStep('done');
      setTimeout(() => {
        setVaultUnlocked(true);
        setSetupRequired(false);
        setUser({
          id: 'admin',
          name: data.adminDisplayName,
          username: data.adminUsername,
          role: 'ADMIN',
          firmName: data.firmName,
        });
      }, 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              background: 'var(--brand-primary)',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '28px',
              fontWeight: '800',
              color: '#0D1117',
            }}
          >
            ₹
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
            TaxFlow Pro
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Professional Income Tax Return Filing Software
          </p>
        </div>

        <StepIndicator current={step} />

        <div className="card" style={{ marginTop: '24px' }}>
          {step === 'welcome' && <WelcomeStep onNext={() => setStep('firm')} />}
          {step === 'firm' && (
            <FirmStep
              data={data}
              onChange={update}
              onNext={() => {
                if (!data.firmName.trim()) { setError('Firm name is required'); return; }
                setError('');
                setStep('admin');
              }}
              onBack={() => setStep('welcome')}
              error={error}
            />
          )}
          {step === 'admin' && (
            <AdminStep
              data={data}
              onChange={update}
              onNext={() => {
                if (!data.adminDisplayName.trim()) { setError('Admin name is required'); return; }
                if (!data.adminUsername.trim()) { setError('Username is required'); return; }
                if (!/^[a-zA-Z0-9_]{3,20}$/.test(data.adminUsername)) {
                  setError('Username must be 3–20 characters, letters/numbers/underscore only');
                  return;
                }
                setError('');
                setStep('security');
              }}
              onBack={() => setStep('firm')}
              error={error}
            />
          )}
          {step === 'security' && (
            <SecurityStep
              data={data}
              onChange={update}
              onFinish={handleFinish}
              onBack={() => setStep('admin')}
              loading={loading}
              error={error}
            />
          )}
          {step === 'done' && <DoneStep firmName={data.firmName} />}
        </div>
      </div>
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'firm', label: 'Firm' },
    { key: 'admin', label: 'Admin' },
    { key: 'security', label: 'Security' },
    { key: 'done', label: 'Done' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {steps.map((s, idx) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: idx < currentIdx ? 'var(--color-success)' : idx === currentIdx ? 'var(--brand-primary)' : 'var(--bg-elevated)',
              border: `2px solid ${idx < currentIdx ? 'var(--color-success)' : idx === currentIdx ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: '600',
              color: idx <= currentIdx ? (idx === currentIdx ? '#0D1117' : 'white') : 'var(--text-muted)',
            }}>
              {idx < currentIdx ? '✓' : idx + 1}
            </div>
            <span style={{ fontSize: '10px', color: idx === currentIdx ? 'var(--brand-text)' : 'var(--text-muted)', fontWeight: idx === currentIdx ? 600 : 400 }}>
              {s.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div style={{
              width: '40px', height: '2px',
              background: idx < currentIdx ? 'var(--color-success)' : 'var(--border-subtle)',
              margin: '0 4px', marginBottom: '16px',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>
        Welcome to TaxFlow Pro
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '24px' }}>
        Set up your CA firm in a few quick steps. All data is stored locally and encrypted.
      </p>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px', textAlign: 'left', marginBottom: '24px' }}>
        {[
          'Offline-first — no internet required',
          'AES-256-GCM encrypted credential vault',
          'ITR-1, ITR-2, ITR-4 filing for AY 2025-26',
          'Full audit trail for every action',
          'Multi-client management with search and filters',
        ].map((f) => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--color-success)', fontSize: '16px' }}>✓</span>
            {f}
          </div>
        ))}
      </div>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={onNext}>
        Begin Setup →
      </button>
    </div>
  );
}

// ─── Firm ─────────────────────────────────────────────────────────────────────

function FirmStep({ data, onChange, onNext, onBack, error }: {
  data: SetupData;
  onChange: (f: keyof SetupData, v: string) => void;
  onNext: () => void;
  onBack: () => void;
  error: string;
}) {
  return (
    <div>
      <h2 style={{ fontSize: '17px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>
        Firm Details
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '20px' }}>
        Enter your CA firm's basic information
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="form-group">
          <label className="form-label">Firm / Practice Name *</label>
          <input
            className="form-input"
            value={data.firmName}
            onChange={(e) => onChange('firmName', e.target.value)}
            placeholder="e.g. Sharma & Associates"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Address (optional)</label>
          <input
            className="form-input"
            value={data.firmAddress}
            onChange={(e) => onChange('firmAddress', e.target.value)}
            placeholder="Office address"
          />
        </div>
      </div>
      {error && <p className="form-error" style={{ marginTop: '8px' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}

// ─── Admin ────────────────────────────────────────────────────────────────────

function AdminStep({ data, onChange, onNext, onBack, error }: {
  data: SetupData;
  onChange: (f: keyof SetupData, v: string) => void;
  onNext: () => void;
  onBack: () => void;
  error: string;
}) {
  return (
    <div>
      <h2 style={{ fontSize: '17px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>
        Administrator Account
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '20px' }}>
        This will be the primary login for TaxFlow Pro
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="form-group">
          <label className="form-label">Full Name *</label>
          <input
            className="form-input"
            value={data.adminDisplayName}
            onChange={(e) => onChange('adminDisplayName', e.target.value)}
            placeholder="CA Ravi Sharma"
            autoFocus
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
            Shown in reports and verification section
          </span>
        </div>
        <div className="form-group">
          <label className="form-label">Login Username *</label>
          <input
            className="form-input font-mono"
            value={data.adminUsername}
            onChange={(e) => onChange('adminUsername', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="admin"
            maxLength={20}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
            3–20 chars, letters/numbers/underscore. Used to log in.
          </span>
        </div>
      </div>
      {error && <p className="form-error" style={{ marginTop: '8px' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────────

function SecurityStep({ data, onChange, onFinish, onBack, loading, error }: {
  data: SetupData;
  onChange: (f: keyof SetupData, v: string) => void;
  onFinish: () => void;
  onBack: () => void;
  loading: boolean;
  error: string;
}) {
  return (
    <div>
      <h2 style={{ fontSize: '17px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>
        Master Password
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
        This password encrypts your credential vault. Keep it safe — it cannot be recovered.
      </p>
      <div style={{
        background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.3)',
        borderRadius: '6px', padding: '10px 12px', fontSize: '12px',
        color: 'var(--brand-text)', marginBottom: '16px',
      }}>
        ⚠️ If you forget this password, client portal credentials cannot be recovered.
        Store it in a password manager.
      </div>

      {/* Login password note */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: '6px', padding: '10px 12px', fontSize: '12px',
        color: 'var(--text-secondary)', marginBottom: '16px',
      }}>
        💡 This master password also serves as your login password for username <strong style={{ fontFamily: 'var(--font-mono)' }}>{data.adminUsername}</strong>.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="form-group">
          <label className="form-label">Master Password *</label>
          <input
            className="form-input"
            type="password"
            value={data.masterPassword}
            onChange={(e) => onChange('masterPassword', e.target.value)}
            placeholder="Minimum 8 characters"
            autoFocus
          />
          <PasswordStrength password={data.masterPassword} />
        </div>
        <div className="form-group">
          <label className="form-label">Confirm Password *</label>
          <input
            className={`form-input${data.confirmPassword && data.confirmPassword !== data.masterPassword ? ' error' : ''}`}
            type="password"
            value={data.confirmPassword}
            onChange={(e) => onChange('confirmPassword', e.target.value)}
            placeholder="Repeat master password"
          />
          {data.confirmPassword && data.confirmPassword !== data.masterPassword && (
            <span className="form-error">Passwords do not match</span>
          )}
        </div>
      </div>

      {error && <p className="form-error" style={{ marginTop: '8px' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
        <button className="btn btn-secondary" onClick={onBack} disabled={loading}>← Back</button>
        <button className="btn btn-primary" onClick={onFinish} disabled={loading}>
          {loading
            ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Setting up…</>
            : 'Complete Setup ✓'}
        </button>
      </div>
    </div>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneStep({ firmName }: { firmName: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{
        width: '60px', height: '60px', background: 'rgba(35,134,54,0.15)',
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px', fontSize: '28px',
      }}>
        ✓
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
        Setup Complete!
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
        {firmName} is now configured. Opening TaxFlow Pro…
      </p>
      <div className="spinner" style={{ margin: '20px auto 0' }} />
    </div>
  );
}

// ─── Password strength ────────────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const labels = ['', 'Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', '#f85149', '#d29922', '#d29922', 'var(--color-success)', '#1a7f37'];

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '6px' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{
          height: '3px', flex: 1, borderRadius: '2px',
          background: i <= score ? colors[score] : 'var(--border-subtle)',
        }} />
      ))}
      <span style={{ fontSize: '10px', color: colors[score], marginLeft: '4px', minWidth: '60px' }}>
        {labels[score]}
      </span>
    </div>
  );
}
