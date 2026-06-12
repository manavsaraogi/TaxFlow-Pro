'use client';
// File: renderer/app/components/layout/Topbar.tsx

import type { AppPage } from './AppShell';

const PAGE_TITLES: Record<AppPage['name'], { title: string; subtitle?: string }> = {
  dashboard:     { title: 'Dashboard',       subtitle: 'Overview of all returns and clients' },
  clients:       { title: 'Client Master',   subtitle: 'Manage your client database' },
  'client-detail': { title: 'Client Detail', subtitle: 'View and manage client information' },
  'client-new':  { title: 'New Client',      subtitle: 'Add a new client to the master' },
  'client-edit': { title: 'Edit Client',     subtitle: 'Update client information' },
  returns:       { title: 'Returns',         subtitle: 'Manage income tax returns' },
  settings:      { title: 'Settings',        subtitle: 'Application configuration' },
};

interface TopbarProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
}

export function Topbar({ currentPage, onNavigate }: TopbarProps) {
  const info = PAGE_TITLES[currentPage.name] ?? { title: 'TaxFlow Pro' };

  // Build breadcrumb
  const crumbs = buildCrumbs(currentPage);

  return (
    <div className="topbar">
      {/* Breadcrumb + Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {crumbs.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '1px',
            }}
          >
            {crumbs.map((crumb, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {idx > 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>›</span>
                )}
                {crumb.page ? (
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '0',
                    }}
                    onClick={() => crumb.page && onNavigate(crumb.page)}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
        <div
          style={{
            fontSize: '15px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {info.title}
        </div>
      </div>

      {/* Right side actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <AYBadge />
        <VaultStatusBadge />
      </div>
    </div>
  );
}

function AYBadge() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        background: 'var(--brand-subtle)',
        border: '1px solid var(--brand-primary)',
        borderRadius: '20px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '600',
        color: 'var(--brand-text)',
      }}
    >
      <span style={{ opacity: 0.7 }}>AY</span>
      2024-25
    </div>
  );
}

function VaultStatusBadge() {
  // In a real app, read from authStore
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        background: 'var(--status-success-bg)',
        border: '1px solid var(--status-success)',
        borderRadius: '20px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: '500',
        color: 'var(--status-success)',
      }}
    >
      <span
        style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: 'var(--status-success)',
          flexShrink: 0,
        }}
      />
      Vault Unlocked
    </div>
  );
}

interface Crumb {
  label: string;
  page?: AppPage;
}

function buildCrumbs(page: AppPage): Crumb[] {
  switch (page.name) {
    case 'dashboard':
      return [{ label: 'Dashboard' }];
    case 'clients':
      return [{ label: 'Dashboard', page: { name: 'dashboard' } }, { label: 'Clients' }];
    case 'client-detail':
      return [
        { label: 'Dashboard', page: { name: 'dashboard' } },
        { label: 'Clients', page: { name: 'clients' } },
        { label: 'Client Detail' },
      ];
    case 'client-new':
      return [
        { label: 'Dashboard', page: { name: 'dashboard' } },
        { label: 'Clients', page: { name: 'clients' } },
        { label: 'New Client' },
      ];
    case 'client-edit':
      return [
        { label: 'Dashboard', page: { name: 'dashboard' } },
        { label: 'Clients', page: { name: 'clients' } },
        { label: 'Edit Client' },
      ];
    default:
      return [{ label: PAGE_TITLES[page.name]?.title || page.name }];
  }
}