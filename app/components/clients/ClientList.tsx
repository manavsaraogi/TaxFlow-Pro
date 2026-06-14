'use client';
// File: renderer/app/components/clients/ClientList.tsx

import { useEffect, useState, useCallback } from 'react';
import type { AppPage } from '../layout/AppShell';

const ASSESSEE_LABELS: Record<string, string> = {
  INDIVIDUAL:       'Individual',
  HUF:              'HUF',
  DOMESTIC_COMPANY: 'Company',
  FOREIGN_COMPANY:  'Foreign Co.',
  FIRM:             'Firm',
  LLP:              'LLP',
  AOP:              'AOP',
  BOI:              'BOI',
  AJP:              'AJP',
  OTHER:            'Other',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:       '#586069',
  IN_PROGRESS: '#D29922',
  REVIEW:      '#F0883E',
  FILED:       '#238636',
  ACKNOWLEDGED:'#1A7F37',
  CANCELLED:   '#f85149',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT:        'Draft',
  IN_PROGRESS:  'In Progress',
  REVIEW:       'Review',
  FILED:        'Filed',
  ACKNOWLEDGED: 'Acknowledged',
  CANCELLED:    'Cancelled',
};

interface ReturnData {
  id: number;
  status: string;
  formType?: string;
  assessmentYear?: { ayLabel: string };
}

interface ClientData {
  id: number;
  pan: string;
  fullName: string;
  assesseeType: string;
  mobileNumber?: string;
  email?: string;
  city?: string;
  stateCode?: string;
  hasPortalPassword?: boolean;
  isActive: boolean;
  createdAt: string;
  returns?: ReturnData[];
}

interface ClientListProps {
  onNavigate: (page: AppPage) => void;
}

const CURRENT_AY = '2026-27';

export function ClientList({ onNavigate }: ClientListProps) {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clients');
      const { data } = await res.json();
      setClients(data ?? []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType]);

  useEffect(() => { loadClients(); }, [loadClients]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function getLatestReturn(client: ClientData) {
    return client.returns?.find((r) => r.assessmentYear?.ayLabel === CURRENT_AY)
      ?? client.returns?.[0];
  }

  return (
    <div className="animate-in" style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Client Management</div>
          <h1 className="page-title">Client Master</h1>
          <div className="page-subtitle">
            {clients.length} client{clients.length !== 1 ? 's' : ''} · AY {CURRENT_AY}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ cursor: 'pointer' }}>
            <input
              type="file" accept=".json" style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const data = JSON.parse(text);
                  const res = await fetch('/api/clients/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                  });
                  const json = await res.json();
                  const { created, updated, errors } = json.data ?? {};
                  alert(`Import complete: ${created} created, ${updated} updated, ${errors} errors`);
                  loadClients();
                } catch (err: any) {
                  alert('Import failed: ' + (err.message ?? 'Invalid JSON'));
                }
                e.target.value = '';
              }}
            />
            <span className="btn btn-secondary btn-sm">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 1v7M4 6l2.5 2.5L9 6"/><path d="M1 10.5v.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-.5"/>
              </svg>
              Import JSON
            </span>
          </label>
          <button className="btn btn-secondary btn-sm" onClick={loadClients}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4H8"/><path d="M1 11v-4h4"/>
              <path d="M10.6 5A5 5 0 0 0 2.4 5"/><path d="M2.4 8a5 5 0 0 0 8.2 0"/>
            </svg>
            Refresh
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate({ name: 'client-new' })}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/>
            </svg>
            New Client
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '380px' }}>
          <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
            width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="6" cy="6" r="4.5"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
          </svg>
          <input
            className="form-input"
            style={{ paddingLeft: '32px' }}
            placeholder="Search by name, PAN, mobile…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <select className="form-select" style={{ width: '180px' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {Object.entries(ASSESSEE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {(search || filterType) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(''); setSearch(''); setFilterType(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', gap: '12px' }}>
            <div className="spinner" />
            <span style={{ color: 'var(--text-muted)' }}>Loading clients…</span>
          </div>
        ) : clients.length === 0 ? (
          <div className="empty-state" style={{ padding: '64px' }}>
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="20" cy="16" r="8"/><path d="M4 44c0-8.8 7.2-16 16-16s16 7.2 16 16"/>
                <path d="M36 22a6 6 0 1 0 0-12"/><path d="M44 44c0-5.3-2.7-9.9-6.7-12.6"/>
              </svg>
            </div>
            <div className="empty-state-title">
              {search || filterType ? 'No clients found' : 'No clients yet'}
            </div>
            <div className="empty-state-desc">
              {search || filterType
                ? 'Try adjusting your search or filter'
                : 'Add your first client to get started'}
            </div>
            {!search && !filterType && (
              <button
                className="btn btn-primary"
                style={{ marginTop: '12px' }}
                onClick={() => onNavigate({ name: 'client-new' })}
              >
                + Add First Client
              </button>
            )}
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>PAN</th>
                <th>Name</th>
                <th style={{ width: '110px' }}>Type</th>
                <th style={{ width: '150px' }}>Contact</th>
                <th style={{ width: '150px' }}>AY {CURRENT_AY}</th>
                <th style={{ width: '80px' }}>Form</th>
                <th style={{ width: '40px' }} />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const latestReturn = getLatestReturn(client);
                return (
                  <tr
                    key={client.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavigate({ name: 'client-detail', clientId: String(client.id) })}
                  >
                    <td>
                      <span className="pan-field" style={{
                        fontSize: '12px', letterSpacing: '0.08em',
                        color: 'var(--brand-text)', background: 'rgba(212,160,23,0.08)',
                        padding: '2px 6px', borderRadius: '4px',
                      }}>
                        {client.pan}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '13px' }}>
                        {client.fullName}
                      </div>
                      {client.city && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {client.city}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {ASSESSEE_LABELS[client.assesseeType] ?? client.assesseeType}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {client.mobileNumber ?? client.email ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </div>
                    </td>
                    <td>
                      {latestReturn ? (
                        <StatusPill status={latestReturn.status} />
                      ) : (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate({ name: 'client-detail', clientId: String(client.id) });
                          }}
                        >
                          + New Return
                        </button>
                      )}
                    </td>
                    <td>
                      {latestReturn?.formType ? (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-text)' }}>
                          {latestReturn.formType}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                      )}
                    </td>
                    <td>
                      {client.hasPortalPassword && (
                        <span title="Portal password stored" style={{ color: 'var(--status-success)', display: 'flex', alignItems: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="5.5" width="7" height="6" rx="1"/><path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5"/>
                            <circle cx="6.5" cy="8.5" r=".7" fill="currentColor"/>
                          </svg>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && clients.length > 0 && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
          Showing {clients.length} client{clients.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#586069';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500,
      background: `${color}18`, border: `1px solid ${color}40`, color,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </div>
  );
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CLIENTS: ClientData[] = [
  {
    id: 1, pan: 'ABCPK1234E', fullName: 'Priya Kapoor',
    assesseeType: 'INDIVIDUAL', mobileNumber: '9876543210',
    city: 'Mumbai', hasPortalPassword: true, isActive: true, createdAt: '2025-04-01',
    returns: [{ id: 1, status: 'IN_PROGRESS', formType: 'ITR-1', assessmentYear: { ayLabel: '2025-26' } }],
  },
  {
    id: 2, pan: 'BCDRS5678F', fullName: 'Suresh Rathi',
    assesseeType: 'INDIVIDUAL', mobileNumber: '9988776655',
    city: 'Ahmedabad', hasPortalPassword: true, isActive: true, createdAt: '2025-04-02',
    returns: [{ id: 2, status: 'FILED', formType: 'ITR-1', assessmentYear: { ayLabel: '2025-26' } }],
  },
  {
    id: 3, pan: 'CDEFG3456H', fullName: 'Gupta HUF',
    assesseeType: 'HUF', city: 'Jaipur',
    hasPortalPassword: false, isActive: true, createdAt: '2025-04-03',
    returns: [],
  },
];
