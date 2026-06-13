'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

type Mode = 'login' | 'register' | 'forgot';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Sign in timed out. Please try again.')), 15000)
      );
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        timeout,
      ]);
      if (error) setError(error.message);
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!firmName.trim()) { setError('Firm name is required'); return; }
    if (!displayName.trim()) { setError('Your name is required'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }

    setLoading(true);
    setError('');

    // Create Supabase user — firm record is created server-side on first login
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          firm_name: firmName,
          role: 'ADMIN',
        },
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Account created! Check your email to confirm, then sign in.');
      setMode('login');
    }
    setLoading(false);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Password reset link sent to your email.');
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
      backgroundImage: 'radial-gradient(ellipse at 60% 0%, rgba(212, 160, 23, 0.06) 0%, transparent 60%)',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '52px', height: '52px', background: 'var(--brand-primary)',
            borderRadius: '13px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 14px',
            fontSize: '26px', fontWeight: '800', color: '#0D1117',
          }}>₹</div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
            TaxFlow Pro
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            {mode === 'login' ? 'Sign in to your firm account' :
             mode === 'register' ? 'Create your CA firm account' :
             'Reset your password'}
          </p>
        </div>

        <div className="card animate-in">
          {success && (
            <div style={{
              background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.4)',
              borderRadius: '6px', padding: '10px 12px', fontSize: '13px',
              color: 'var(--status-success)', marginBottom: '16px',
            }}>{success}</div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '20px' }}>
                Sign In
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    className="form-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourfirm.com"
                    autoFocus
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
                    placeholder="Your password"
                    required
                  />
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Signing in…</> : 'Sign In →'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 0' }}
                  onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}>
                  Forgot password?
                </button>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 0' }}
                  onClick={() => { setMode('register'); setError(''); setSuccess(''); }}>
                  Create account →
                </button>
              </div>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '20px' }}>
                Create Account
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Firm / Practice Name *</label>
                  <input className="form-input" value={firmName}
                    onChange={(e) => setFirmName(e.target.value)} placeholder="e.g. Sharma & Associates" autoFocus required />
                </div>
                <div className="form-group">
                  <label className="form-label">Your Name *</label>
                  <input className="form-input" value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)} placeholder="CA Ravi Sharma" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="you@yourfirm.com" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input className="form-input" type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required />
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Creating…</> : 'Create Account →'}
              </button>
              <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
                onClick={() => { setMode('login'); setError(''); }}>
                ← Back to Sign In
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Reset Password
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Enter your email and we'll send a reset link.
              </p>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@yourfirm.com" autoFocus required />
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Sending…</> : 'Send Reset Link'}
              </button>
              <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
                onClick={() => { setMode('login'); setError(''); }}>
                ← Back to Sign In
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '20px' }}>
          TaxFlow Pro · ITR Filing for AY 2025-26
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)',
      borderRadius: '6px', padding: '8px 12px', fontSize: '12px',
      color: '#f85149', marginBottom: '16px',
    }}>
      {message}
    </div>
  );
}
