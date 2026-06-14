'use client';
// File: renderer/app/components/layout/AppShell.tsx

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Dashboard } from '../dashboard/Dashboard';
import { ClientList } from '../clients/ClientList';
import { ClientDetail } from '../clients/ClientDetail';
import ClientForm from '../clients/ClientForm';
import ReturnShell from '../returns/ReturnShell';

export type AppPage =
  | { name: 'dashboard' }
  | { name: 'clients' }
  | { name: 'client-detail'; clientId: string }
  | { name: 'client-new' }
  | { name: 'client-edit'; clientId: string }
  | { name: 'return-detail'; returnId: string; clientId?: string }
  | { name: 'returns'; clientId?: string }
  | { name: 'settings' };

export function AppShell() {
  const [page, setPage] = useState<AppPage>({ name: 'dashboard' });
  // Focus mode: auto-hide sidebars when viewing a return
  const [focusMode, setFocusMode] = useState(false);

  // Auto-enter focus mode when navigating to a return
  useEffect(() => {
    setFocusMode(page.name === 'return-detail');
  }, [page.name]);

  // Escape key exits focus mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && focusMode) setFocusMode(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  function navigate(p: AppPage) {
    setPage(p);
  }

  function renderPage() {
    switch (page.name) {
      case 'dashboard':
        return <Dashboard onNavigate={navigate} />;

      case 'clients':
        return <ClientList onNavigate={navigate} />;

      case 'client-detail':
        return <ClientDetail clientId={page.clientId} onNavigate={navigate} />;

      case 'client-new':
        return (
          <ClientForm
            onSuccess={(clientId: number) =>
              navigate({ name: 'client-detail', clientId: String(clientId) })
            }
            onCancel={() => navigate({ name: 'clients' })}
          />
        );

      case 'client-edit':
        return (
          <ClientForm
            clientId={Number(page.clientId)}
            onSuccess={(clientId: number) =>
              navigate({ name: 'client-detail', clientId: String(clientId) })
            }
            onCancel={() =>
              navigate({ name: 'client-detail', clientId: page.clientId })
            }
          />
        );

      case 'return-detail':
        return (
          <ReturnShell
            returnId={Number(page.returnId)}
            clientId={Number(page.clientId ?? 0)}
            onBack={() =>
              page.clientId
                ? navigate({ name: 'client-detail', clientId: page.clientId })
                : navigate({ name: 'clients' })
            }
            onNavigate={navigate}
            focusMode={focusMode}
            onToggleFocusMode={() => setFocusMode(f => !f)}
          />
        );

      default:
        return (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            This section is coming soon.
          </div>
        );
    }
  }

  return (
    <div className={`app-shell${focusMode ? ' app-shell--focus' : ''}`}>
      {!focusMode && <Sidebar currentPage={page.name} onNavigate={navigate} />}
      <div className="main-area">
        {page.name !== 'return-detail' && !focusMode && <Topbar currentPage={page} onNavigate={navigate} />}
        {renderPage()}
      </div>
    </div>
  );
}
