'use client';
// File: renderer/app/components/layout/Sidebar.tsx

import { useAuthStore } from '@/store/authStore';
import type { AppPage } from './AppShell';

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="6" height="6" rx="1.5"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5"/>
    </svg>
  );
}

function IconClients() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5"/>
      <path d="M1 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/>
      <path d="M11 7c1.4 0 2.5 1.1 2.5 2.5"/>
      <path d="M13 14c0-1.7-.9-3.2-2.2-4"/>
    </svg>
  );
}

function IconReturns() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1z"/>
      <polyline points="9,1 9,5 13,5"/>
      <line x1="5" y1="8" x2="11" y2="8"/>
      <line x1="5" y1="11" x2="9" y2="11"/>
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8"/>
      <polyline points="5,7 8,10 11,7"/>
      <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"/>
    </svg>
  );
}

interface NavItem {
  icon: React.ReactNode;
  label: string;
  page: AppPage['name'];
  badge?: number;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Main',
    items: [
      { icon: <IconDashboard />, label: 'Dashboard',       page: 'dashboard' },
      { icon: <IconClients />,   label: 'Clients',         page: 'clients'   },
      { icon: <IconReturns />,   label: 'Returns',         page: 'returns'   },
    ],
  },
  {
    label: 'Tools',
    items: [
      { icon: <IconDownload />,  label: 'Portal Downloads', page: 'settings' },
      { icon: <IconSettings />,  label: 'Settings',         page: 'settings' },
    ],
  },
];

interface SidebarProps {
  currentPage: AppPage['name'];
  onNavigate: (page: AppPage) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { user, firmName, logout } = useAuthStore();

  const initial = (firmName || 'T').charAt(0).toUpperCase();

  return (
    <div className="sidebar">
      {/* Firm Logo / Name */}
      <div style={{ padding: '16px 14px 14px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px',
            background: 'linear-gradient(135deg, var(--brand-primary) 0%, #B8860B 100%)',
            borderRadius: '9px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '15px', fontWeight: '800', color: '#0D1117',
            flexShrink: 0, letterSpacing: '-0.5px',
            boxShadow: '0 2px 6px rgba(212,160,23,0.35)',
          }}>
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', lineHeight: 1.25 }}>
              {firmName || 'TaxFlow Pro'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.02em' }}>
              ITR Filing Software
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ padding: '6px 8px 2px' }}>
            <div style={{
              fontSize: '10px', fontWeight: '700',
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.08em', padding: '4px 6px 6px',
            }}>
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = currentPage === item.page;
              return (
                <button
                  key={item.label}
                  onClick={() => onNavigate({ name: item.page } as AppPage)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    width: '100%', padding: '7px 10px',
                    border: 'none', borderRadius: '6px',
                    background: isActive ? 'rgba(212,160,23,0.12)' : 'transparent',
                    color: isActive ? 'var(--brand-text)' : 'var(--text-secondary)',
                    fontSize: '13px', fontWeight: isActive ? 500 : 400,
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.12s',
                    marginBottom: '1px',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '24px', height: '24px', flexShrink: 0,
                    color: isActive ? 'var(--brand-primary)' : 'var(--text-muted)',
                    transition: 'color 0.12s',
                  }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span style={{
                      background: 'var(--bg-overlay)', color: 'var(--text-muted)',
                      fontSize: '10px', padding: '1px 6px', borderRadius: '10px',
                    }}>{item.badge}</span>
                  )}
                  {isActive && (
                    <span style={{
                      width: '4px', height: '4px', borderRadius: '50%',
                      background: 'var(--brand-primary)', flexShrink: 0,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* User Footer */}
      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '50%',
            background: 'var(--bg-overlay)', border: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: '600', color: 'var(--brand-text)', flexShrink: 0,
          }}>
            {user?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="truncate" style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}>
              {user?.name || 'Admin'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {user?.role?.toLowerCase() || 'admin'}
            </div>
          </div>
        </div>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', fontSize: '11px', justifyContent: 'center', padding: '5px', color: 'var(--text-muted)' }}
          onClick={logout}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
