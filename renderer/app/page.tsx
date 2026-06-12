'use client';
// File: renderer/app/page.tsx
// Root entry - checks setup state and routes appropriately

import { useEffect, useState } from 'react';
import { SetupWizard } from './components/auth/SetupWizard';
import { UnlockScreen } from './components/auth/UnlockScreen';
import { AppShell } from './components/layout/AppShell';
import { useAuthStore } from '../store/authStore';

export default function RootPage() {
  const { isSetupRequired, isLoggedIn, setSetupRequired } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSetup() {
      try {
        // In browser dev, mock the check
        if (typeof window.taxflow === 'undefined') {
          setSetupRequired(false);
          setLoading(false);
          return;
        }
        const required = await window.taxflow.auth.isSetupRequired();
        setSetupRequired(required);
      } catch {
        setSetupRequired(false);
      } finally {
        setLoading(false);
      }
    }
    checkSetup();
  }, [setSetupRequired]);

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base)',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <TaxLogo size={32} />
          <span
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            TaxFlow Pro
          </span>
        </div>
        <div className="spinner" />
      </div>
    );
  }

  if (isSetupRequired) return <SetupWizard />;
  if (!isLoggedIn) return <UnlockScreen />;
  return <AppShell />;
}

function TaxLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#D4A017" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="#0D1117"
        fontSize="16"
        fontWeight="800"
        fontFamily="Inter, sans-serif"
      >
        ₹
      </text>
    </svg>
  );
}
