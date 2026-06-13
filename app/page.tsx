'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { createClient } from '@/lib/supabase';
import { LoginPage } from './components/auth/LoginPage';
import { AppShell } from './components/layout/AppShell';

export default function RootPage() {
  const { isLoggedIn, loading } = useAuthStore();

  useEffect(() => {
    const supabase = createClient();

    // onAuthStateChange fires on every page load (INITIAL_SESSION) and on sign-in/out.
    // It is the single source of truth — do not call refreshUser() separately.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user) {
        useAuthStore.setState({ user: null, isLoggedIn: false, loading: false });
        return;
      }

      const u = session.user;
      const meta = u.user_metadata ?? {};

      // Optimistically set user from session so UI unblocks immediately
      useAuthStore.setState({
        user: {
          id: u.id,
          email: u.email ?? '',
          name: meta.display_name ?? u.email ?? '',
          role: meta.role ?? 'ADMIN',
          firmId: meta.firm_id ?? 0,
          firmName: meta.firm_name ?? 'TaxFlow Pro',
        },
        isLoggedIn: true,
        loading: false,
      });

      // On actual sign-in (not page refresh), provision the firm
      if (event === 'SIGNED_IN') {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 8000);
          const res = await fetch('/api/firm', { method: 'POST', signal: controller.signal });
          clearTimeout(t);
          if (res.ok) {
            const { data } = await res.json();
            if (data) {
              useAuthStore.setState((s) => ({
                user: s.user ? { ...s.user, firmId: data.firmId, firmName: data.firmName } : s.user,
                firmName: data.firmName,
              }));
            }
          }
        } catch {
          // firm provisioning timed out — DB lookup will handle it per-request
        }
      }
    });

    // Safety fallback — if onAuthStateChange never fires (e.g. no session), unblock UI
    const fallback = setTimeout(() => {
      useAuthStore.setState((s) => s.loading ? { loading: false } : s);
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallback);
    };
  }, []);

  if (loading) return <LoadingScreen />;
  if (!isLoggedIn) return <LoginPage />;
  return <AppShell />;
}

function LoadingScreen() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <svg width={32} height={32} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#D4A017" />
          <text x="16" y="22" textAnchor="middle" fill="#0D1117" fontSize="16" fontWeight="800" fontFamily="Inter, sans-serif">₹</text>
        </svg>
        <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>TaxFlow Pro</span>
      </div>
      <div className="spinner" />
    </div>
  );
}
