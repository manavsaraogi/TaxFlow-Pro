'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { createClient } from '@/lib/supabase';
import { LoginPage } from './components/auth/LoginPage';
import { AppShell } from './components/layout/AppShell';

export default function RootPage() {
  const { isLoggedIn, loading, user, refreshUser, setUser } = useAuthStore();

  useEffect(() => {
    // Safety timeout — if refreshUser hangs for any reason, unblock the UI
    const timeout = setTimeout(() => {
      useAuthStore.setState({ loading: false });
    }, 5000);

    refreshUser().finally(() => clearTimeout(timeout));

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      await refreshUser();

      // Provision firm record on first sign-in
      if (event === 'SIGNED_IN') {
        const res = await fetch('/api/firm', { method: 'POST' });
        if (res.ok) {
          const { data } = await res.json();
          // Force-refresh the session so the new firm_id propagates into the JWT/cookie
          await supabase.auth.refreshSession();
          if (data) {
            // Re-read user to pick up updated metadata
            const { data: { user: refreshed } } = await supabase.auth.getUser();
            const meta = refreshed?.user_metadata ?? {};
            setUser({
              id: refreshed?.id ?? '',
              email: refreshed?.email ?? '',
              name: meta.display_name ?? refreshed?.email ?? '',
              role: meta.role ?? 'ADMIN',
              firmId: data.firmId,
              firmName: data.firmName,
            });
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshUser, setUser]);

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
