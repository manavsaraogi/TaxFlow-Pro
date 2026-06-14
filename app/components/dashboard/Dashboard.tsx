'use client';
// File: renderer/app/components/dashboard/Dashboard.tsx

import { useEffect, useState } from 'react';
import type { AppPage } from '../layout/AppShell';

interface DashboardStats {
  totalClients: number;
  totalReturns: number;
  filedReturns: number;
  pendingReturns: number;
  readyForFiling: number;
  returnsByStatus: Array<{ workflowStatus: string; _count: number }>;
  returnsByForm: Array<{ itrForm: string; _count: number }>;
  clientsByType: Array<{ assesseeType: string; _count: number }>;
}

const WORKFLOW_LABELS: Record<string, string> = {
  DRAFT:          'Draft',
  IN_PROGRESS:    'In Progress',
  REVIEW:         'Under Review',
  FILED:          'Filed',
  ACKNOWLEDGED:   'Acknowledged',
  CANCELLED:      'Cancelled',
};

const WORKFLOW_COLORS: Record<string, string> = {
  DRAFT:        '#4B5563',
  IN_PROGRESS:  '#D29922',
  REVIEW:       '#F0883E',
  FILED:        '#10B981',
  ACKNOWLEDGED: '#059669',
  CANCELLED:    '#EF4444',
};

const ASSESSEE_LABELS: Record<string, string> = {
  INDIVIDUAL:                 'Individual',
  HUF:                        'HUF',
  COMPANY:                    'Company',
  FIRM:                       'Firm',
  LLP:                        'LLP',
  AOP:                        'AOP',
  BOI:                        'BOI',
  TRUST:                      'Trust',
  SOCIETY:                    'Society',
  LOCAL_AUTHORITY:            'Local Authority',
  ARTIFICIAL_JURIDICAL_PERSON:'AJP',
  OTHER:                      'Other',
};

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IcoClients() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="6" r="3"/>
      <path d="M1 16c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
      <path d="M13 8a2.5 2.5 0 1 0 0-5"/>
      <path d="M17 16c0-2-.9-3.7-2.2-4.8"/>
    </svg>
  );
}

function IcoReturns() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L10 2z"/>
      <polyline points="10,2 10,6 14,6"/>
      <line x1="6" y1="9" x2="12" y2="9"/>
      <line x1="6" y1="12" x2="10" y2="12"/>
    </svg>
  );
}

function IcoFiled() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16z"/>
      <polyline points="5.5 9 7.5 11 12.5 6.5"/>
    </svg>
  );
}

function IcoPending() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="8"/>
      <polyline points="9 5 9 9 12 11"/>
    </svg>
  );
}

function IcoReady() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="9,2 11.1,7 16.5,7.6 12.5,11.4 13.7,16.7 9,13.9 4.3,16.7 5.5,11.4 1.5,7.6 6.9,7"/>
    </svg>
  );
}

function IcoRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2v4H9"/>
      <path d="M1 12v-4h4"/>
      <path d="M11.6 5A6 6 0 0 0 2.4 5"/>
      <path d="M2.4 9a6 6 0 0 0 9.2 0"/>
    </svg>
  );
}

function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="7" y1="1" x2="7" y2="13"/>
      <line x1="1" y1="7" x2="13" y2="7"/>
    </svg>
  );
}

interface DashboardProps {
  onNavigate: (page: AppPage) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => { loadStats(); }, [lastRefresh]);

  async function loadStats() {
    setLoading(true);
    try {
      const [clientsRes, returnsRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/returns'),
      ]);
      const { data: clients = [] } = await clientsRes.json();
      const { data: returns = [] } = await returnsRes.json();

      const byStatus: Record<string, number> = {};
      const byForm: Record<string, number> = {};
      for (const r of returns) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        byForm[r.formType] = (byForm[r.formType] ?? 0) + 1;
      }
      const byType: Record<string, number> = {};
      for (const c of clients) {
        byType[c.assesseeType] = (byType[c.assesseeType] ?? 0) + 1;
      }

      setStats({
        totalClients:   clients.length,
        totalReturns:   returns.length,
        filedReturns:   returns.filter((r: { status: string }) => r.status === 'FILED' || r.status === 'ACKNOWLEDGED').length,
        pendingReturns: returns.filter((r: { status: string }) => r.status === 'DRAFT' || r.status === 'IN_PROGRESS').length,
        readyForFiling: returns.filter((r: { status: string }) => r.status === 'REVIEW').length,
        returnsByStatus: Object.entries(byStatus).map(([workflowStatus, _count]) => ({ workflowStatus, _count })),
        returnsByForm:   Object.entries(byForm).map(([itrForm, _count]) => ({ itrForm, _count })),
        clientsByType:   Object.entries(byType).map(([assesseeType, _count]) => ({ assesseeType, _count })),
      });
    } catch {
      setStats(MOCK_STATS);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading dashboard…</span>
      </div>
    );
  }

  const s = stats ?? MOCK_STATS;
  const filingRate = s.totalReturns > 0 ? Math.round((s.filedReturns / s.totalReturns) * 100) : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page-content animate-in">

      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">AY 2026-27 · FY 2025-26</div>
          <h1 className="page-title">{greeting}</h1>
          <div className="page-subtitle">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setLastRefresh(new Date())}>
            <IcoRefresh /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate({ name: 'client-new' })}>
            <IcoPlus /> New Client
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard
          value={s.totalClients}
          label="Total Clients"
          accent="#3B82F6"
          icon={<IcoClients />}
          iconBg="rgba(59,130,246,0.12)"
          iconColor="#3B82F6"
          onClick={() => onNavigate({ name: 'clients' })}
        />
        <StatCard
          value={s.totalReturns}
          label="Total Returns"
          accent="#8B5CF6"
          icon={<IcoReturns />}
          iconBg="rgba(139,92,246,0.12)"
          iconColor="#8B5CF6"
        />
        <StatCard
          value={s.filedReturns}
          label="Filed"
          accent="#10B981"
          icon={<IcoFiled />}
          iconBg="rgba(16,185,129,0.12)"
          iconColor="#10B981"
        />
        <StatCard
          value={s.pendingReturns}
          label="Pending"
          accent="#F59E0B"
          icon={<IcoPending />}
          iconBg="rgba(245,158,11,0.12)"
          iconColor="#F59E0B"
        />
        <StatCard
          value={s.readyForFiling}
          label="Ready to File"
          accent="#D4A017"
          icon={<IcoReady />}
          iconBg="rgba(212,160,23,0.12)"
          iconColor="#D4A017"
        />
      </div>

      {/* ── Main Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Returns by Status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Returns by Status</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              AY 2026-27
            </span>
          </div>
          {(!s.returnsByStatus || s.returnsByStatus.length === 0)
            ? <EmptyChart message="No returns yet" />
            : <StatusBarChart data={s.returnsByStatus} total={s.totalReturns} />
          }
        </div>

        {/* Filing Progress */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Filing Progress</span>
            <span style={{
              fontSize: '20px', fontWeight: '700', lineHeight: 1,
              color: filingRate >= 80 ? '#10B981' : 'var(--brand-text)',
            }}>
              {filingRate}%
            </span>
          </div>
          <FilingProgressRing filed={s.filedReturns} total={s.totalReturns} rate={filingRate} />
        </div>
      </div>

      {/* ── Bottom Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Clients by Assessee Type</span>
          </div>
          {(!s.clientsByType || s.clientsByType.length === 0)
            ? <EmptyChart message="No clients yet" />
            : <AssesseeTypeList data={s.clientsByType} total={s.totalClients} />
          }
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Returns by ITR Form</span>
          </div>
          {(!s.returnsByForm || s.returnsByForm.length === 0)
            ? <EmptyChart message="No returns yet" />
            : <ItrFormList data={s.returnsByForm} total={s.totalReturns} />
          }
        </div>
      </div>

      {/* ── Due Date Banner ── */}
      <DueDateBanner />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  value, label, accent, icon, iconBg, iconColor, onClick,
}: {
  value: number; label: string; accent: string;
  icon: React.ReactNode; iconBg: string; iconColor: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="stat-card"
      style={{ cursor: onClick ? 'pointer' : 'default', '--stat-accent': accent } as React.CSSProperties}
      onClick={onClick}
    >
      <div style={{
        width: '36px', height: '36px', borderRadius: '9px',
        background: iconBg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '8px',
      }}>
        {icon}
      </div>
      <div className="stat-value">{(value ?? 0).toLocaleString('en-IN')}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function StatusBarChart({ data, total }: { data: Array<{ workflowStatus: string; _count: number }>; total: number }) {
  const sorted = [...data].sort((a, b) => b._count - a._count);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {sorted.map((item) => {
        const pct = total > 0 ? (item._count / total) * 100 : 0;
        const color = WORKFLOW_COLORS[item.workflowStatus] || '#4B5563';
        return (
          <div key={item.workflowStatus}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {WORKFLOW_LABELS[item.workflowStatus] || item.workflowStatus}
              </span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {item._count}
              </span>
            </div>
            <div style={{ height: '5px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilingProgressRing({ filed, total, rate }: { filed: number; total: number; rate: number }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 80 ? '#10B981' : rate >= 50 ? 'var(--brand-primary)' : '#F59E0B';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '28px', padding: '4px 0' }}>
      <svg width="144" height="144" viewBox="0 0 144 144">
        <circle cx="72" cy="72" r={radius} fill="none" stroke="var(--bg-elevated)" strokeWidth="10"/>
        <circle cx="72" cy="72" r={radius} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 72 72)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text x="72" y="68" textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="700" fontFamily="Inter,sans-serif">{rate}%</text>
        <text x="72" y="86" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="Inter,sans-serif">completed</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <LegendItem color="#10B981" label="Filed"   value={filed} />
        <LegendItem color="#F59E0B" label="Pending" value={total - filed} />
        <LegendItem color="var(--border-emphasis)" label="Total" value={total} />
      </div>
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '56px' }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function AssesseeTypeList({ data, total }: { data: Array<{ assesseeType: string; _count: number }>; total: number }) {
  const palette = ['#3B82F6', '#D4A017', '#10B981', '#F59E0B', '#8B5CF6', '#F0883E'];
  const sorted = [...data].sort((a, b) => b._count - a._count);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {sorted.map((item, idx) => {
        const pct = total > 0 ? Math.round((item._count / total) * 100) : 0;
        const color = palette[idx % palette.length];
        return (
          <div key={item.assesseeType}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>
                {ASSESSEE_LABELS[item.assesseeType] || item.assesseeType}
              </span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '20px', textAlign: 'right' }}>{item._count}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'right' }}>{pct}%</span>
            </div>
            <div style={{ height: '3px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItrFormList({ data, total }: { data: Array<{ itrForm: string; _count: number }>; total: number }) {
  const formColors: Record<string, string> = {
    'ITR-1': '#3B82F6', 'ITR-2': '#8B5CF6', 'ITR-3': '#F59E0B',
    'ITR-4': '#10B981', 'ITR-5': '#F0883E', 'ITR-6': '#EF4444', 'ITR-7': '#D4A017',
    ITR_1: '#3B82F6', ITR_2: '#8B5CF6', ITR_3: '#F59E0B',
    ITR_4: '#10B981', ITR_5: '#F0883E', ITR_6: '#EF4444', ITR_7: '#D4A017',
  };
  const sorted = [...data].sort((a, b) => b._count - a._count);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {sorted.map((item) => {
        const pct = total > 0 ? Math.round((item._count / total) * 100) : 0;
        const label = item.itrForm?.replace('_', '-') || 'Unknown';
        const color = formColors[item.itrForm] || '#4B5563';
        return (
          <div key={item.itrForm} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              padding: '2px 8px', background: `${color}18`,
              border: `1px solid ${color}60`, borderRadius: '5px',
              fontSize: '11px', fontWeight: '700', color,
              minWidth: '44px', textAlign: 'center', flexShrink: 0,
            }}>
              {label}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ height: '5px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
              </div>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '20px', textAlign: 'right' }}>{item._count}</span>
          </div>
        );
      })}
    </div>
  );
}

function DueDateBanner() {
  const today = new Date();
  const nonAuditDue = new Date('2026-07-31');
  const auditDue    = new Date('2026-10-31');
  const daysLeft    = Math.ceil((nonAuditDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const auditDays   = Math.ceil((auditDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue   = daysLeft < 0;
  const isUrgent    = daysLeft >= 0 && daysLeft <= 30;

  const color = isOverdue ? '#EF4444' : isUrgent ? '#F59E0B' : '#3B82F6';
  const bg    = isOverdue ? 'rgba(239,68,68,0.07)' : isUrgent ? 'rgba(245,158,11,0.07)' : 'rgba(59,130,246,0.07)';

  return (
    <div style={{
      background: bg,
      border: `1px solid ${color}30`,
      borderLeft: `3px solid ${color}`,
      borderRadius: '8px',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color, marginBottom: '2px' }}>
          {isOverdue ? 'ITR Due Date Passed — Late Fee Applicable' : 'Upcoming ITR Due Dates · AY 2026-27'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {isOverdue
            ? `Non-audit deadline passed ${Math.abs(daysLeft)} days ago — late fee u/s 234F up to ₹5,000`
            : `Non-Audit: 31 Jul 2026 (${daysLeft} days)  ·  Audit: 31 Oct 2026 (${auditDays} days)`
          }
        </div>
      </div>
      {!isOverdue && (
        <div style={{
          background: `${color}15`, border: `1px solid ${color}40`,
          borderRadius: '8px', padding: '8px 16px', textAlign: 'center', flexShrink: 0,
        }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{daysLeft}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>days left</div>
        </div>
      )}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
      {message}
    </div>
  );
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_STATS: DashboardStats = {
  totalClients:   48,
  totalReturns:   42,
  filedReturns:   18,
  pendingReturns: 16,
  readyForFiling: 6,
  returnsByStatus: [
    { workflowStatus: 'FILED',       _count: 18 },
    { workflowStatus: 'IN_PROGRESS', _count: 10 },
    { workflowStatus: 'REVIEW',      _count: 6  },
    { workflowStatus: 'DRAFT',       _count: 4  },
    { workflowStatus: 'CANCELLED',   _count: 4  },
  ],
  returnsByForm: [
    { itrForm: 'ITR-1', _count: 20 },
    { itrForm: 'ITR-2', _count: 12 },
    { itrForm: 'ITR-3', _count: 6  },
    { itrForm: 'ITR-4', _count: 4  },
  ],
  clientsByType: [
    { assesseeType: 'INDIVIDUAL', _count: 36 },
    { assesseeType: 'HUF',        _count: 5  },
    { assesseeType: 'FIRM',       _count: 4  },
    { assesseeType: 'COMPANY',    _count: 3  },
  ],
};
