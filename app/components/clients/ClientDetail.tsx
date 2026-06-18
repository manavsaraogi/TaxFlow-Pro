'use client';
// File: renderer/app/components/clients/ClientDetail.tsx

import { useEffect, useState } from 'react';
import type { AppPage } from '../layout/AppShell';

const ASSESSEE_LABELS: Record<string, string> = {
  INDIVIDUAL: 'Individual', HUF: 'HUF',
  DOMESTIC_COMPANY: 'Company', FOREIGN_COMPANY: 'Foreign Co.',
  FIRM: 'Firm', LLP: 'LLP', AOP: 'AOP', BOI: 'BOI', AJP: 'AJP', OTHER: 'Other',
};

const RESIDENTIAL_LABELS: Record<string, string> = {
  RES: 'Resident', NRI: 'Non-Resident (NRI)', RNR: 'Resident but Not Ordinarily Resident',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#586069', IN_PROGRESS: '#D29922', REVIEW: '#F0883E',
  FILED: '#238636', ACKNOWLEDGED: '#1A7F37', CANCELLED: '#f85149',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', IN_PROGRESS: 'In Progress', REVIEW: 'Review',
  FILED: 'Filed', ACKNOWLEDGED: 'Acknowledged', CANCELLED: 'Cancelled',
};

interface BankAccount {
  id: number;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountType: string;
  isPrimary: boolean;
}

interface ReturnData {
  id: number;
  status: string;
  formType?: string;
  regime: string;
  grossTotalIncome?: number;
  grossTaxLiability?: number;
  refundDue?: number;
  balTaxPayable?: number;
  filedAt?: string;
  acknowledgementNumber?: string;
  createdAt: string;
  assessmentYear?: { ayLabel: string };
}

interface ClientData {
  id: number;
  pan: string;
  fullName: string;
  assesseeType: string;
  dateOfBirth?: string;
  mobileNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  stateCode?: string;
  pinCode?: number;
  aadhaarNumber?: string;
  residentialStatus: string;
  portalUsername?: string;
  hasPortalPassword?: boolean;
  isActive: boolean;
  createdAt: string;
  bankAccounts?: BankAccount[];
  returns?: ReturnData[];
}

type ActiveTab = 'overview' | 'returns' | 'bank' | 'documents';

interface ClientDetailProps {
  clientId: string;
  onNavigate: (page: AppPage) => void;
}

const TAB_LABELS: Record<ActiveTab, string> = {
  overview: '📋 Overview',
  returns: '📄 Returns',
  bank: '🏦 Bank Accounts',
  documents: '📁 Documents',
};

export function ClientDetail({ clientId, onNavigate }: ClientDetailProps) {
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [showNewReturnModal, setShowNewReturnModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadClient(); }, [clientId]);

  async function loadClient() {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      const { data } = await res.json();
      if (data) setClient(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteReturn() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await fetch(`/api/returns/${deleteConfirm.id}`, { method: 'DELETE' });
      setClient(prev => prev ? { ...prev, returns: prev.returns?.filter(r => r.id !== deleteConfirm.id) } : prev);
      setDeleteConfirm(null);
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--text-muted)' }}>Loading client…</span>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">Client not found</div>
        <button className="btn btn-secondary" onClick={() => onNavigate({ name: 'clients' })}>
          ← Back to Clients
        </button>
      </div>
    );
  }

  const currentAYReturn = client.returns?.[0];

  return (
    <div className="animate-in" style={{ height: '100%', overflowY: 'auto', padding: '24px' }}>

      {/* ── Header card ── */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '12px',
              background: 'rgba(212,160,23,0.1)', border: '1px solid var(--brand-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', fontWeight: 700, color: 'var(--brand-text)', flexShrink: 0,
            }}>
              {client.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {client.fullName}
                </h1>
                <span className="badge badge-neutral">
                  {ASSESSEE_LABELS[client.assesseeType] ?? client.assesseeType}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span className="pan-field" style={{
                  fontSize: '13px', color: 'var(--brand-text)',
                  background: 'rgba(212,160,23,0.08)', padding: '2px 8px',
                  borderRadius: '4px', letterSpacing: '0.1em',
                }}>
                  {client.pan}
                </span>
                {client.mobileNumber && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📱 {client.mobileNumber}</span>}
                {client.email && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>✉ {client.email}</span>}
                {client.city && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📍 {client.city}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate({ name: 'client-edit', clientId: String(client.id) })}
            >
              ✎ Edit
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewReturnModal(true)}>
              + New Return
            </button>
          </div>
        </div>

        {/* Current AY strip */}
        {currentAYReturn && (
          <div style={{
            marginTop: '16px', paddingTop: '14px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              AY {currentAYReturn.assessmentYear?.ayLabel}
            </span>
            <StatusPill status={currentAYReturn.status} />
            {currentAYReturn.formType && (
              <span style={{
                fontSize: '11px', fontWeight: 700, color: 'var(--brand-text)',
                background: 'rgba(212,160,23,0.08)', padding: '2px 8px', borderRadius: '4px',
              }}>
                {currentAYReturn.formType}
              </span>
            )}
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto', fontSize: '12px' }}
              onClick={() => onNavigate({
                name: 'return-detail',
                returnId: String(currentAYReturn.id),
                clientId: String(client.id),
              })}
            >
              Open Return →
            </button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '20px', overflowX: 'auto',
      }}>
        {(Object.keys(TAB_LABELS) as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 18px', fontSize: '13px', whiteSpace: 'nowrap',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--brand-text)' : 'var(--text-muted)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--brand-primary)' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {TAB_LABELS[tab]}
            {tab === 'returns' && (client.returns?.length ?? 0) > 0 && (
              <span style={{
                marginLeft: '6px', background: 'var(--bg-elevated)',
                color: 'var(--text-muted)', fontSize: '10px', padding: '1px 5px', borderRadius: '10px',
              }}>
                {client.returns!.length}
              </span>
            )}
            {tab === 'bank' && (client.bankAccounts?.length ?? 0) > 0 && (
              <span style={{
                marginLeft: '6px', background: 'var(--bg-elevated)',
                color: 'var(--text-muted)', fontSize: '10px', padding: '1px 5px', borderRadius: '10px',
              }}>
                {client.bankAccounts!.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'overview' && <OverviewTab client={client} />}
      {activeTab === 'returns' && (
        <ReturnsTab
          client={client}
          onNewReturn={() => setShowNewReturnModal(true)}
          onOpenReturn={(returnId) => onNavigate({
            name: 'return-detail',
            returnId: String(returnId),
            clientId: String(client.id),
          })}
          onDeleteReturn={(id, label) => setDeleteConfirm({ id, label })}
        />
      )}
      {activeTab === 'bank' && (
        <BankTab client={client} onAddBank={() => setShowBankModal(true)} onRefresh={loadClient} />
      )}
      {activeTab === 'documents' && <DocumentsTab clientId={client.id} returns={client.returns} />}

      {/* ── Modals ── */}
      {showNewReturnModal && (
        <NewReturnModal
          client={client}
          onClose={() => setShowNewReturnModal(false)}
          onCreated={(returnId) => {
            setShowNewReturnModal(false);
            onNavigate({
              name: 'return-detail',
              returnId: String(returnId),
              clientId: String(client.id),
            });
          }}
        />
      )}
      {showBankModal && (
        <AddBankModal
          clientId={client.id}
          onClose={() => setShowBankModal(false)}
          onAdded={() => { setShowBankModal(false); loadClient(); }}
        />
      )}

      {/* ── Delete return confirm ── */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Delete Return?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.6' }}>
              This will permanently delete <strong>{deleteConfirm.label}</strong> and all its data
              (salary, TDS, capital gains, etc.). This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--color-error, #f85149)', borderColor: 'var(--color-error, #f85149)' }}
                onClick={handleDeleteReturn}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ client }: { client: ClientData }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      <div className="card">
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Identity</h3>
        <InfoRows rows={[
          { label: 'Full Name', value: client.fullName },
          { label: 'PAN', value: client.pan, mono: true },
          { label: 'Assessee Type', value: ASSESSEE_LABELS[client.assesseeType] ?? client.assesseeType },
          { label: 'Date of Birth', value: client.dateOfBirth ? new Date(client.dateOfBirth).toLocaleDateString('en-IN') : '—' },
          { label: 'Residential Status', value: RESIDENTIAL_LABELS[client.residentialStatus] ?? client.residentialStatus },
          { label: 'Aadhaar', value: client.aadhaarNumber ?? '—', mono: true },
        ]} />
      </div>

      <div className="card">
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Contact & Address</h3>
        <InfoRows rows={[
          { label: 'Mobile', value: client.mobileNumber ?? '—' },
          { label: 'Email', value: client.email ?? '—' },
          { label: 'Address', value: client.address ?? '—' },
          { label: 'City', value: client.city ?? '—' },
          { label: 'State Code', value: client.stateCode ?? '—', mono: true },
          { label: 'Pin Code', value: client.pinCode ? String(client.pinCode) : '—', mono: true },
        ]} />
      </div>

      <div className="card">
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Portal</h3>
        <InfoRows rows={[{ label: 'Username', value: client.portalUsername ?? client.pan, mono: true }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Password</span>
          {client.hasPortalPassword
            ? <span className="badge badge-success">🔐 Stored</span>
            : <span className="badge badge-neutral">Not stored</span>}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Filing History</h3>
        {(client.returns?.length ?? 0) === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No returns yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {client.returns!.map((ret) => (
              <div key={ret.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: '6px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  AY {ret.assessmentYear?.ayLabel}
                </span>
                <StatusPill status={ret.status} />
                {ret.formType && (
                  <span style={{ fontSize: '11px', color: 'var(--brand-text)', fontWeight: 700 }}>{ret.formType}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRows({ rows }: { rows: { label: string; value: string; mono?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, flexShrink: 0 }}>
            {r.label}
          </span>
          <span style={{
            fontSize: '13px', color: r.value === '—' ? 'var(--text-muted)' : 'var(--text-primary)',
            fontFamily: r.mono ? 'var(--font-mono)' : 'inherit', textAlign: 'right', wordBreak: 'break-all',
          }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Returns Tab ───────────────────────────────────────────────────────────────

function ReturnsTab({ client, onNewReturn, onOpenReturn, onDeleteReturn }: {
  client: ClientData;
  onNewReturn: () => void;
  onOpenReturn: (returnId: number) => void;
  onDeleteReturn: (id: number, label: string) => void;
}) {
  const returns = client.returns ?? [];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary btn-sm" onClick={onNewReturn}>+ New Return</button>
      </div>
      {returns.length === 0 ? (
        <div className="empty-state card" style={{ padding: '48px' }}>
          <div className="empty-state-icon">📄</div>
          <div className="empty-state-title">No returns yet</div>
          <div className="empty-state-desc">Create a return to start filing</div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: '12px' }} onClick={onNewReturn}>
            + Create Return
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {returns.map((ret) => {
            const color = STATUS_COLORS[ret.status] ?? '#586069';
            return (
              <div
                key={ret.id}
                className="card"
                style={{ borderLeft: `3px solid ${color}`, cursor: 'pointer' }}
                onClick={() => onOpenReturn(ret.id)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        AY {ret.assessmentYear?.ayLabel}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {ret.regime === 'NEW' ? 'New Regime' : 'Old Regime'}
                      </div>
                    </div>
                    <StatusPill status={ret.status} />
                    {ret.formType && (
                      <span style={{
                        padding: '3px 8px', background: 'rgba(212,160,23,0.08)',
                        border: '1px solid var(--brand-primary)', borderRadius: '4px',
                        fontSize: '11px', fontWeight: 700, color: 'var(--brand-text)',
                      }}>
                        {ret.formType}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {(ret.grossTotalIncome ?? 0) > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>GTI</div>
                        <div className="amount" style={{ fontSize: '13px', fontWeight: 600 }}>
                          ₹{ret.grossTotalIncome!.toLocaleString('en-IN')}
                        </div>
                      </div>
                    )}
                    {ret.filedAt && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Filed</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-success)' }}>
                          {new Date(ret.filedAt).toLocaleDateString('en-IN')}
                        </div>
                      </div>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); onOpenReturn(ret.id); }}
                    >
                      Open →
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--color-error, #f85149)', padding: '4px 8px' }}
                      title="Delete this return"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteReturn(ret.id, `AY ${ret.assessmentYear?.ayLabel ?? ret.id} ${ret.formType ?? ''}`);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Bank Tab ──────────────────────────────────────────────────────────────────

function BankTab({ client, onAddBank, onRefresh }: { client: ClientData; onAddBank: () => void; onRefresh: () => void }) {
  const accounts = client.bankAccounts ?? [];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary btn-sm" onClick={onAddBank}>+ Add Bank Account</button>
      </div>
      {accounts.length === 0 ? (
        <div className="empty-state card" style={{ padding: '48px' }}>
          <div className="empty-state-icon">🏦</div>
          <div className="empty-state-title">No bank accounts</div>
          <div className="empty-state-desc">Add a bank account for refund credit</div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: '12px' }} onClick={onAddBank}>+ Add Account</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {accounts.map((acc) => (
            <div key={acc.id} className="card" style={{
              borderLeft: acc.isPrimary ? '3px solid var(--brand-primary)' : '3px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{acc.bankName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{acc.accountType}</div>
                </div>
                {acc.isPrimary && <span className="badge badge-warning">Primary</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Account No.</span>
                  <span className="font-mono" style={{ fontSize: '12px' }}>{acc.accountNumber}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>IFSC</span>
                  <span className="font-mono" style={{ fontSize: '12px' }}>{acc.ifscCode}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Documents Tab (AIS / TIS / 26AS import) ───────────────────────────────────

function DocumentsTab({ clientId, returns }: { clientId: number; returns?: ReturnData[] }) {
  const [importType, setImportType] = useState<'AIS' | 'TIS' | '26AS'>('26AS');
  const [returnId, setReturnId] = useState<string>('');
  const [result, setResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch(`/api/clients/${clientId}/import-tax-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, returnId: returnId ? Number(returnId) : undefined, data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Import failed');
      setResult(JSON.stringify(json.data.summary, null, 2));
    } catch (err: any) {
      setResult('Error: ' + (err.message ?? 'Import failed'));
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card">
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>
          Import Tax Data — AIS / TIS / 26AS
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Download JSON from the Income Tax portal → AIS / 26AS section, then upload here. TDS entries, challans and income summaries will be auto-filled into the selected return.
        </p>
        <div style={{
          marginBottom: '16px', padding: '10px 12px', borderRadius: '6px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.7',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>How to download from incometax.gov.in</div>
          <div><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>26AS:</span> e-File → Income Tax Returns → View Form 26AS → Download → JSON</div>
          <div><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>AIS:</span> Services → AIS → Download → JSON</div>
          <div><span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>TIS:</span> Services → AIS → Download → JSON (same location as AIS)</div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {(['26AS', 'AIS', 'TIS'] as const).map((t) => (
            <button
              key={t} type="button"
              onClick={() => setImportType(t)}
              style={{
                padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                border: `2px solid ${importType === t ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                background: importType === t ? 'rgba(212,160,23,0.08)' : 'var(--bg-elevated)',
                color: importType === t ? 'var(--brand-text)' : 'var(--text-secondary)',
                fontWeight: importType === t ? 600 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {returns && returns.length > 0 && (
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Link to Return (optional)</label>
            <select className="form-select" value={returnId} onChange={(e) => setReturnId(e.target.value)}>
              <option value="">— Summary only, no DB import —</option>
              {returns.map((r) => (
                <option key={r.id} value={r.id}>
                  AY {r.assessmentYear?.ayLabel} · {r.formType} · {r.status}
                </option>
              ))}
            </select>
          </div>
        )}

        <label style={{ cursor: 'pointer', display: 'inline-block' }}>
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileImport} disabled={importing} />
          <span className="btn btn-primary" style={{ opacity: importing ? 0.6 : 1 }}>
            {importing ? '⏳ Importing…' : `📂 Upload ${importType} JSON`}
          </span>
        </label>

        {result && (
          <div style={{
            marginTop: '16px', background: 'var(--bg-elevated)', borderRadius: '6px',
            padding: '12px', fontSize: '12px', fontFamily: 'var(--font-mono)',
            color: result.startsWith('Error') ? 'var(--status-error)' : 'var(--text-primary)',
            whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto',
          }}>
            {result.startsWith('Error') ? result : `Import successful:\n${result}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ── New Return Modal ──────────────────────────────────────────────────────────

// ── ITR form suggestion helper ────────────────────────────────────────────────

function suggestFormType(client: ClientData): { formType: string; reason: string } {
  if (client.assesseeType === 'FIRM') return { formType: 'ITR-5', reason: 'Firm / LLP' };
  if (client.assesseeType === 'AOP') return { formType: 'ITR-5', reason: 'AOP / Trust / BOI' };
  if (client.assesseeType === 'BOI') return { formType: 'ITR-5', reason: 'AOP / Trust / BOI' };
  if (client.assesseeType === 'HUF') return { formType: 'ITR-2', reason: 'HUF assessee' };
  if (client.assesseeType === 'DOMESTIC_COMPANY') return { formType: 'ITR-6', reason: 'Domestic Company' };
  if (client.assesseeType === 'FOREIGN_COMPANY') return { formType: 'ITR-6', reason: 'Foreign Company' };
  const rs = (client as any).residentialStatus as string | undefined;
  if (rs === 'NRI' || rs === 'RNR') return { formType: 'ITR-2', reason: 'Non-resident / RNOR' };
  return { formType: 'ITR-1', reason: 'Salary + up to 1 house property + other sources' };
}

function NewReturnModal({ client, onClose, onCreated }: {
  client: ClientData;
  onClose: () => void;
  onCreated: (returnId: number) => void;
}) {
  // AY 2026-27 is always shown as primary option (FY 2025-26)
  const defaultAY = '2026-27';
  const ayOptions = ['2026-27', '2025-26', '2024-25'];

  const { formType: autoFormType, reason: autoFormReason } = suggestFormType(client);

  const [ayLabel, setAyLabel] = useState(defaultAY);
  const [formType, setFormType] = useState(autoFormType);
  const [regime, setRegime] = useState('NEW');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          assessmentYear: ayLabel,
          formType,
          regime,
          filingType: 'ORIGINAL',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onCreated(json.data.id);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create return');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>New Return</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Client</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{client.fullName}</div>
          <div className="pan-field" style={{ fontSize: '12px', color: 'var(--brand-text)' }}>{client.pan}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          <div className="form-group">
            <label className="form-label">Assessment Year</label>
            <select className="form-select" value={ayLabel} onChange={(e) => setAyLabel(e.target.value)}>
              {ayOptions.map((ay) => (
                <option key={ay} value={ay}>AY {ay}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              ITR Form
              {formType === autoFormType && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>
                  (auto-selected)
                </span>
              )}
            </label>
            <select className="form-select" value={formType} onChange={(e) => setFormType(e.target.value)}>
              {['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6', 'ITR-7'].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tax Regime</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['NEW', 'OLD'].map((r) => (
                <button
                  key={r} type="button" onClick={() => setRegime(r)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer',
                    border: `2px solid ${regime === r ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                    background: regime === r ? 'rgba(212,160,23,0.08)' : 'var(--bg-elevated)',
                    color: regime === r ? 'var(--brand-text)' : 'var(--text-secondary)',
                    fontWeight: regime === r ? 600 : 400, fontSize: '13px',
                  }}
                >
                  {r === 'NEW' ? '🆕 New Regime' : '🏛 Old Regime'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#f85149', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : 'Create Return →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Bank Modal ────────────────────────────────────────────────────────────

function AddBankModal({ clientId, onClose, onAdded }: { clientId: number; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ bankName: '', accountNumber: '', ifscCode: '', accountType: 'SAVINGS', isPrimary: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd() {
    if (!form.bankName || !form.accountNumber || !form.ifscCode) {
      setError('Bank name, account number and IFSC are required'); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ifsc: form.ifscCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      onAdded();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Add Bank Account</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          <div className="form-group">
            <label className="form-label">Bank Name *</label>
            <input className="form-input" value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="e.g. HDFC Bank" />
          </div>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Account Number *</label>
              <input className="form-input font-mono" value={form.accountNumber} onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">IFSC Code *</label>
              <input className="form-input font-mono" value={form.ifscCode} onChange={(e) => setForm((p) => ({ ...p, ifscCode: e.target.value.toUpperCase() }))} maxLength={11} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Account Type</label>
            <select className="form-select" value={form.accountType} onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value }))}>
              <option value="SAVINGS">Savings</option>
              <option value="CURRENT">Current</option>
              <option value="NRE">NRE</option>
              <option value="NRO">NRO</option>
              <option value="OD">Overdraft</option>
              <option value="CC">Cash Credit</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
            Set as primary account (used for refund credit)
          </label>
        </div>
        {error && <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#f85149', marginBottom: '16px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'Adding…' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── StatusPill ────────────────────────────────────────────────────────────────

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

// ── Mock ──────────────────────────────────────────────────────────────────────

const MOCK_CLIENT: ClientData = {
  id: 1, pan: 'ABCPK1234E', fullName: 'Priya Kapoor',
  assesseeType: 'INDIVIDUAL', dateOfBirth: '1988-04-15',
  mobileNumber: '9876543210', email: 'priya@email.com',
  address: '12, Sunrise Apartments, Andheri West',
  city: 'Mumbai', stateCode: '19', pinCode: 400058,
  aadhaarNumber: '234567890123', residentialStatus: 'RES',
  portalUsername: 'ABCPK1234E', hasPortalPassword: true,
  isActive: true, createdAt: '2025-04-01',
  bankAccounts: [
    { id: 1, bankName: 'HDFC Bank', accountNumber: '00112233445566', ifscCode: 'HDFC0001234', accountType: 'SAVINGS', isPrimary: true },
  ],
  returns: [
    { id: 1, status: 'IN_PROGRESS', formType: 'ITR-1', regime: 'NEW', grossTotalIncome: 850000, createdAt: '2025-04-10', assessmentYear: { ayLabel: '2025-26' } },
  ],
};
