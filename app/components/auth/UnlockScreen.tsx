'use client';
// File: renderer/app/components/auth/UnlockScreen.tsx

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';

type AuthStep = 'unlock' | 'login';

export function UnlockScreen() {
  const [step, setStep] = useState<AuthStep>('unlock');
  const [masterPassword, setMasterPassword] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setVaultUnlocked, setUser, setSetupRequired } = useAuthStore();

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!masterPassword) return;
    setLoading(true);
    setError('');

    try {
      if (typeof window.taxflow === 'undefined') {
        setVaultUnlocked(true);
        setStep('login');
        return;
      }

      const result = await window.taxflow.auth.unlock(masterPassword);
      if (!result.success) {
        setError(result.error || 'Invalid master password');
        return;
      }
      setVaultUnlocked(true);
      setStep('login');
    } catch {
      setError('Failed to unlock. Please try again.');
    } finally {
      setLoading(false);
      setMasterPassword('');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError('');

    try {
      if (typeof window.taxflow === 'undefined') {
        setUser({ id: '1', name: 'Dev Admin', role: 'ADMIN', firmId: '1', firmName: 'Dev Firm' });
        return;
      }

      const result = await window.taxflow.auth.login({ username, password });
      if (!result.success || !result.data) {
        setError(result.error || 'Invalid credentials');
        return;
      }
      setUser(result.data);
    } catch {
      setError('Login failed. Please try again.');
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
        backgroundImage: 'radial-gradient(ellipse at 60% 0%, rgba(212, 160, 23, 0.06) 0%, transparent 60%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '52px', height: '52px', background: 'var(--brand-primary)',
            borderRadius: '13px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 14px',
            fontSize: '26px', fontWeight: '800', color: '#0D1117',
          }}>
            ₹
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
            TaxFlow Pro
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            {step === 'unlock' ? 'Enter master password to unlock vault' : 'Sign in to continue'}
          </p>
        </div>

        <div className="card animate-in">
          {step === 'unlock' ? (
            <form onSubmit={handleUnlock}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div style={{
                  width: '36px', height: '36px', background: 'var(--bg-elevated)',
                  borderRadius: '8px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '18px',
                }}>
                  🔐
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Unlock Credential Vault
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Required to decrypt stored portal passwords
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Master Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  placeholder="Enter your master password"
                  autoFocus
                  required
                />
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={loading || !masterPassword}
              >
                {loading
                  ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Unlocking…</>
                  : 'Unlock →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Sign In
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Use your firm login credentials
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input
                    className="form-input font-mono"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    autoFocus
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your login password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={loading}
              >
                {loading
                  ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Signing in…</>
                  : 'Sign In →'}
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
                onClick={() => { setStep('unlock'); setError(''); }}
              >
                ← Back to vault unlock
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '20px' }}>
          TaxFlow Pro v1.0 · Offline-First · Data stored locally
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: 'rgba(248,81,73,0.1)',
      border: '1px solid rgba(248,81,73,0.4)',
      borderRadius: '6px',
      padding: '8px 12px',
      fontSize: '12px',
      color: '#f85149',
      marginBottom: '16px',
    }}>
      {message}
    </div>
  );
}
