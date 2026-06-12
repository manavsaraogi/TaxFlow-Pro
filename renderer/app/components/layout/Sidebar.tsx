'use client';
// File: renderer/app/components/layout/Sidebar.tsx

import { useAuthStore } from '../../../store/authStore';
import type { AppPage } from './AppShell';

interface NavItem {
  icon: string;
  label: string;
  page: AppPage['name'];
  badge?: number;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Main',
    items: [
      { icon: '⊞', label: 'Dashboard', page: 'dashboard' },
      { icon: '◎', label: 'Clients', page: 'clients' },
      { icon: '📋', label: 'Returns', page: 'returns' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { icon: '⬇', label: 'Portal Downloads', page: 'settings' },
      { icon: '⚙', label: 'Settings', page: 'settings' },
    ],
  },
];

interface SidebarProps {
  currentPage: AppPage['name'];
  onNavigate: (page: AppPage) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { user, firmName, logout } = useAuthStore();

  return (
    <div className="sidebar">
      {/* Firm Logo / Name */}
      <div
        style={{
          padding: '18px 14px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              background: 'var(--brand-primary)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: '800',
              color: '#0D1117',
              flexShrink: 0,
            }}
          >
            ₹
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className="truncate"
              style={{
                fontSize: '13px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                lineHeight: 1.2,
              }}
            >
              {firmName}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
              TaxFlow Pro
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="nav-section">
            <div className="nav-section-label">{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.label}
                className={`nav-item ${currentPage === item.page ? 'active' : ''}`}
                onClick={() => onNavigate({ name: item.page } as AppPage)}
              >
                <span style={{ fontSize: '15px', lineHeight: 1 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* User Footer */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '8px',
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: '600',
              color: 'var(--brand-text)',
              flexShrink: 0,
            }}
          >
            {user?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="truncate"
              style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}
            >
              {user?.name || 'Admin'}
            </div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                textTransform: 'capitalize',
              }}
            >
              {user?.role?.toLowerCase() || 'admin'}
            </div>
          </div>
        </div>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', fontSize: '12px', justifyContent: 'center', padding: '5px' }}
          onClick={logout}
        >
          🔒 Lock & Sign Out
        </button>
      </div>
    </div>
  );
}