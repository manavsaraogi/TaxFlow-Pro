'use client';
// File: renderer/app/components/layout/AppShell.tsx

import { useState } from 'react';
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
    <div className="app-shell">
      <Sidebar currentPage={page.name} onNavigate={navigate} />
      <div className="main-area">
        {page.name !== 'return-detail' && <Topbar currentPage={page} onNavigate={navigate} />}
        {renderPage()}
      </div>
    </div>
  );
}
