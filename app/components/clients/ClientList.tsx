'use client';
// File: renderer/app/components/clients/ClientList.tsx

import React, { useEffect, useState, useCallback } from 'react';
import type { AppPage } from '../layout/AppShell';

/** Returns the current applicable Assessment Year, e.g. "2026-27".
 *  AY starts April 1 each year: if month >= April, AY first year = current year;
 *  otherwise AY first year = prior year. */
function currentApplicableAY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const ayStart = month >= 4 ? year : year - 1;
  return `${ayStart}-${String(ayStart + 1).slice(-2)}`;
}

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

// ─── Portal Import Modal ──────────────────────────────────────────────────────

type ImportStep = 'form' | 'running' | 'preview' | 'done';

interface PortalImportState {
  open: boolean;
  step: ImportStep;
  pan: string;
  password: string;
  assessmentYear: string;
  formType: string;
  log: string[];
  error: string | null;
  result: any | null; // from /api/clients/from-prefill
}

function PortalImportModal({ state, setState, onDone, onNavigate }: {
  state: PortalImportState;
  setState: React.Dispatch<React.SetStateAction<PortalImportState>>;
  onDone: () => void;
  onNavigate: (page: AppPage) => void;
}) {
  const set = (patch: Partial<PortalImportState>) => setState(s => ({ ...s, ...patch }));
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  async function findAgent(): Promise<string | null> {
    for (const url of ['http://localhost:3001', ...(typeof localStorage !== 'undefined' ? [localStorage.getItem('taxflow_agent_url')].filter(Boolean) as string[] : [])]) {
      try { const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) }); if (r.ok) return url; } catch {}
    }
    return null;
  }

  async function startFetch() {
    set({ step: 'running', log: ['Checking local agent…'], error: null });

    const agentUrl = await findAgent();
    if (!agentUrl) {
      set({ error: 'Local portal agent is not running. Start it with: cd local-portal-agent && node index.js', step: 'form' });
      return;
    }

    set({ log: ['Agent found. Opening income tax portal…'] });

    try {
      const startRes = await fetch(`${agentUrl}/fetch-prefill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan: state.pan, password: state.password, assessmentYear: state.assessmentYear, formType: state.formType, force: true }),
      });
      if (!startRes.ok) {
        const j = await startRes.json().catch(() => ({}));
        set({ error: j.error ?? 'Agent failed to start', step: 'form' });
        return;
      }
    } catch (e: any) {
      set({ error: 'Could not reach agent: ' + e.message, step: 'form' });
      return;
    }

    // Poll for completion
    pollRef.current = setInterval(async () => {
      try {
        const s = await fetch(`${agentUrl}/status-prefill`).then(r => r.json());
        if (s.log?.length) set({ log: s.log });

        if (s.status === 'done') {
          clearInterval(pollRef.current!);
          const prefill = s.result?.prefill;
          if (!prefill) {
            set({ error: 'Portal did not return prefill data. The portal may require OTP or captcha — please try again.', step: 'form' });
            return;
          }
          // Send to our API to create client + return
          const apiRes = await fetch('/api/clients/from-prefill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefill, password: state.password }),
          });
          const apiJson = await apiRes.json();
          if (!apiRes.ok) {
            set({ error: apiJson.error ?? 'Failed to create client', step: 'form' });
            return;
          }
          set({ step: 'preview', result: apiJson.data });
        } else if (s.status === 'error') {
          clearInterval(pollRef.current!);
          set({ error: s.error ?? 'Portal fetch failed', step: 'form' });
        }
      } catch {}
    }, 2000);
  }

  React.useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  if (!state.open) return null;

  return (
    <div className="modal-overlay" onClick={() => { if (state.step !== 'running') set({ open: false }); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '90vw' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Import from IT Portal
            </h3>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              Auto-login → download prefilled ITR data → create client
            </div>
          </div>
          {state.step !== 'running' && (
            <button className="btn btn-ghost btn-sm" onClick={() => set({ open: false })}>✕</button>
          )}
        </div>

        {/* Step: Form */}
        {state.step === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {state.error && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#991b1b' }}>
                {state.error}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">PAN (Portal Login ID)</label>
              <input className="form-input" value={state.pan} onChange={e => set({ pan: e.target.value.toUpperCase() })}
                placeholder="AAAPS1234A" maxLength={10} style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Portal Password</label>
              <input className="form-input" type="password" value={state.password}
                onChange={e => set({ password: e.target.value })} placeholder="IT portal password" />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                Password is used only for this session — not stored unless you save it in client settings.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Assessment Year</label>
                <select className="form-input" value={state.assessmentYear} onChange={e => set({ assessmentYear: e.target.value })}>
                  {(() => {
                    const cur = currentApplicableAY();
                    const curStart = parseInt(cur.split('-')[0]);
                    // Show current AY + 3 previous years
                    return Array.from({ length: 4 }, (_, i) => {
                      const s = curStart - i;
                      return `${s}-${String(s + 1).slice(-2)}`;
                    });
                  })().map(ay => (
                    <option key={ay} value={ay}>{ay}{ay === currentApplicableAY() ? ' (current)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">ITR Form Type</label>
                <select className="form-input" value={state.formType} onChange={e => set({ formType: e.target.value })}>
                  {['ITR-1', 'ITR-2', 'ITR-4'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={() => set({ open: false })}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!state.pan || !state.password}
                onClick={startFetch}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                  <path d="M6.5 1v7M4 6l2.5 2.5L9 6"/><path d="M1 10.5v.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-.5"/>
                </svg>
                Fetch & Create Client
              </button>
            </div>
          </div>
        )}

        {/* Step: Running */}
        {state.step === 'running' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div className="spinner" />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Browser automation in progress…</span>
            </div>
            <div style={{
              background: 'var(--bg-page)', border: '1px solid var(--border-subtle)',
              borderRadius: 6, padding: '10px 14px', fontFamily: 'var(--font-mono)',
              fontSize: 11, color: 'var(--text-secondary)', maxHeight: 220, overflowY: 'auto',
              lineHeight: 1.7,
            }}>
              {state.log.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('✓') ? 'var(--status-success)' : line.startsWith('Error') ? 'var(--status-error)' : undefined }}>
                  {line}
                </div>
              ))}
              {state.log.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Starting…</span>}
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              A browser window has opened. Complete any OTP/captcha if prompted. This may take 30–60 seconds.
            </div>
          </div>
        )}

        {/* Step: Preview / Done */}
        {(state.step === 'preview' || state.step === 'done') && state.result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--status-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="9"/><path d="M6 10l3 3 5-5"/>
              </svg>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                {state.result.isNew ? 'Client created!' : 'Client updated!'}
              </span>
            </div>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                {state.result.clientName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {state.result.pan}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                AY {state.result.ayLabel} · Return ID #{state.result.returnId}
              </div>
              {Object.entries(state.result.imported ?? {}).filter(([, v]) => (v as number) > 0).length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(state.result.imported).filter(([, v]) => (v as number) > 0).map(([k, v]) => (
                    <span key={k} style={{
                      background: 'var(--brand-primary)15', color: 'var(--brand-text)',
                      border: '1px solid var(--brand-primary)40',
                      borderRadius: 5, fontSize: 11, padding: '2px 8px',
                    }}>
                      {k}: {v as number}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { set({ open: false }); onDone(); }}>
                Close
              </button>
              <button className="btn btn-primary" onClick={() => {
                set({ open: false });
                onDone();
                onNavigate({ name: 'return-detail', returnId: String(state.result.returnId), clientId: String(state.result.clientId) });
              }}>
                Open Return →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main list component ──────────────────────────────────────────────────────

export function ClientList({ onNavigate }: ClientListProps) {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [importState, setImportState] = useState<PortalImportState>({
    open: false, step: 'form', pan: '', password: '', assessmentYear: currentApplicableAY(), formType: 'ITR-1',
    log: [], error: null, result: null,
  });

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
    <>
    <PortalImportModal
      state={importState}
      setState={setImportState}
      onDone={loadClients}
      onNavigate={onNavigate}
    />
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
          <button
            className="btn btn-secondary"
            onClick={() => setImportState(s => ({ ...s, open: true, step: 'form', error: null, log: [], result: null }))}
            title="Login to IT portal, fetch prefilled data, and auto-create this client"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="11" height="8" rx="1.5"/>
              <path d="M4 4V3a2.5 2.5 0 0 1 5 0v1"/>
              <line x1="6.5" y1="7" x2="6.5" y2="9"/>
            </svg>
            Import from Portal
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
    </>
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
