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
  DRAFT:        '#586069',
  IN_PROGRESS:  '#D29922',
  REVIEW:       '#F0883E',
  FILED:        '#238636',
  ACKNOWLEDGED: '#1A7F37',
  CANCELLED:    '#f85149',
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

interface DashboardProps {
  onNavigate: (page: AppPage) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadStats();
  }, [lastRefresh]);

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
        totalClients: clients.length,
        totalReturns: returns.length,
        filedReturns: returns.filter((r: { status: string }) => r.status === 'FILED' || r.status === 'ACKNOWLEDGED').length,
        pendingReturns: returns.filter((r: { status: string }) => r.status === 'DRAFT' || r.status === 'IN_PROGRESS').length,
        readyForFiling: returns.filter((r: { status: string }) => r.status === 'REVIEW').length,
        returnsByStatus: Object.entries(byStatus).map(([workflowStatus, _count]) => ({ workflowStatus, _count })),
        returnsByForm: Object.entries(byForm).map(([itrForm, _count]) => ({ itrForm, _count })),
        clientsByType: Object.entries(byType).map(([assesseeType, _count]) => ({ assesseeType, _count })),
      });
    } catch {
      setStats(MOCK_STATS);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <div className="spinner" />
          <p className="text-muted">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const s = stats ?? MOCK_STATS;
  const filingRate = s.totalReturns > 0
    ? Math.round((s.filedReturns / s.totalReturns) * 100)
    : 0;

  return (
    <div className="page-content animate-in">
      {/* Header */}
      <div className="section-header" style={{ marginBottom: '20px' }}>
        <div>
          <div className="page-title">Good morning 👋</div>
          <div className="page-subtitle">
            AY 2026-27 · {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setLastRefresh(new Date())}
            title="Refresh"
          >
            ↻ Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate({ name: 'client-new' })}
          >
            + New Client
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <StatCard
          value={s.totalClients}
          label="Total Clients"
          color="var(--status-info)"
          icon="◎"
          onClick={() => onNavigate({ name: 'clients' })}
        />
        <StatCard
          value={s.totalReturns}
          label="Total Returns"
          color="var(--text-secondary)"
          icon="📋"
        />
        <StatCard
          value={s.filedReturns}
          label="Filed"
          color="var(--status-success)"
          icon="✓"
        />
        <StatCard
          value={s.pendingReturns}
          label="Pending"
          color="var(--status-warning)"
          icon="⏳"
        />
        <StatCard
          value={s.readyForFiling}
          label="Ready to File"
          color="var(--brand-primary)"
          icon="🚀"
        />
      </div>

      {/* Main Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        {/* Returns by Status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Returns by Status</span>
            <span className="text-muted text-sm">AY 2026-27</span>
          </div>
          {(!s.returnsByStatus || s.returnsByStatus.length === 0) ? (
            <EmptyChart message="No returns yet" />
          ) : (
            <StatusBarChart data={s.returnsByStatus} total={s.totalReturns} />
          )}
        </div>

        {/* Filing Progress */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Filing Progress</span>
            <span
              style={{
                fontSize: '22px',
                fontWeight: '700',
                color: filingRate >= 80 ? 'var(--status-success)' : 'var(--brand-text)',
              }}
            >
              {filingRate}%
            </span>
          </div>
          <FilingProgressRing
            filed={s.filedReturns}
            total={s.totalReturns}
            rate={filingRate}
          />
        </div>
      </div>

      {/* Bottom Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Clients by Type */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Clients by Assessee Type</span>
          </div>
          {(!s.clientsByType || s.clientsByType.length === 0) ? (
            <EmptyChart message="No clients yet" />
          ) : (
            <AssesseeTypeList data={s.clientsByType ?? []} total={s.totalClients} />
          )}
        </div>

        {/* ITR Form wise */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Returns by ITR Form</span>
          </div>
          {(!s.returnsByForm || s.returnsByForm.length === 0) ? (
            <EmptyChart message="No returns with form selected" />
          ) : (
            <ItrFormList data={s.returnsByForm ?? []} total={s.totalReturns} />
          )}
        </div>
      </div>

      {/* Due Date Banner */}
      <DueDateBanner />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  color,
  icon,
  onClick,
}: {
  value: number;
  label: string;
  color: string;
  icon: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="stat-card"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: color,
          }}
        />
      </div>
      <div className="stat-value" style={{ color }}>
        {(value ?? 0).toLocaleString('en-IN')}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function StatusBarChart({
  data,
  total,
}: {
  data: Array<{ workflowStatus: string; _count: number }>;
  total: number;
}) {
  const sorted = [...data].sort((a, b) => b._count - a._count);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {sorted.map((item) => {
        const pct = total > 0 ? (item._count / total) * 100 : 0;
        const color = WORKFLOW_COLORS[item.workflowStatus] || '#586069';
        return (
          <div key={item.workflowStatus}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {WORKFLOW_LABELS[item.workflowStatus] || item.workflowStatus}
              </span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {item._count}
              </span>
            </div>
            <div
              style={{
                height: '6px',
                background: 'var(--bg-elevated)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: color,
                  borderRadius: '3px',
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilingProgressRing({
  filed,
  total,
  rate,
}: {
  filed: number;
  total: number;
  rate: number;
}) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (rate / 100) * circumference;
  const color = rate >= 80 ? 'var(--status-success)' : rate >= 50 ? 'var(--brand-primary)' : 'var(--status-warning)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '32px',
        padding: '8px 0',
      }}
    >
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle
          cx="75"
          cy="75"
          r={radius}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth="12"
        />
        <circle
          cx="75"
          cy="75"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 75 75)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text
          x="75"
          y="70"
          textAnchor="middle"
          fill="var(--text-primary)"
          fontSize="22"
          fontWeight="700"
          fontFamily="Inter, sans-serif"
        >
          {rate}%
        </text>
        <text
          x="75"
          y="90"
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="11"
          fontFamily="Inter, sans-serif"
        >
          filed
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <ProgressLegendItem color="var(--status-success)" label="Filed" value={filed} />
        <ProgressLegendItem
          color="var(--status-warning)"
          label="Pending"
          value={total - filed}
        />
        <ProgressLegendItem color="var(--text-muted)" label="Total" value={total} />
      </div>
    </div>
  );
}

function ProgressLegendItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '3px',
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '80px' }}>
        {label}
      </span>
      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

function AssesseeTypeList({
  data,
  total,
}: {
  data: Array<{ assesseeType: string; _count: number }>;
  total: number;
}) {
  const colors = [
    'var(--status-info)',
    'var(--brand-primary)',
    'var(--status-success)',
    'var(--status-warning)',
    '#A371F7',
    '#F0883E',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((item, idx) => {
        const pct = total > 0 ? Math.round((item._count / total) * 100) : 0;
        return (
          <div
            key={item.assesseeType}
            style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                background: colors[idx % colors.length],
                flexShrink: 0,
              }}
            />
            <span
              style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}
            >
              {ASSESSEE_LABELS[item.assesseeType] || item.assesseeType}
            </span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                minWidth: '24px',
                textAlign: 'right',
              }}
            >
              {item._count}
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                minWidth: '36px',
                textAlign: 'right',
              }}
            >
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ItrFormList({
  data,
  total,
}: {
  data: Array<{ itrForm: string; _count: number }>;
  total: number;
}) {
  const formColors: Record<string, string> = {
    ITR_1: 'var(--status-info)',
    ITR_2: 'var(--brand-primary)',
    ITR_3: '#A371F7',
    ITR_4: 'var(--status-success)',
    ITR_5: 'var(--status-warning)',
    ITR_6: '#F0883E',
    ITR_7: '#E3B341',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((item) => {
        const pct = total > 0 ? Math.round((item._count / total) * 100) : 0;
        const label = item.itrForm?.replace('_', '-') || 'Unknown';
        const color = formColors[item.itrForm] || 'var(--text-muted)';
        return (
          <div
            key={item.itrForm}
            style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <div
              style={{
                padding: '2px 6px',
                background: 'var(--bg-elevated)',
                border: `1px solid ${color}`,
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: '700',
                color,
                minWidth: '40px',
                textAlign: 'center',
              }}
            >
              {label}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: '5px',
                  background: 'var(--bg-elevated)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: '3px',
                  }}
                />
              </div>
            </div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                minWidth: '24px',
                textAlign: 'right',
              }}
            >
              {item._count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DueDateBanner() {
  const today = new Date();
  // AY 2026-27 — non-audit individual due date: 31 July 2026
  const nonAuditDue = new Date('2026-07-31');
  // Audit cases: 31 Oct 2026
  const auditDue = new Date('2026-10-31');

  const daysLeft = Math.ceil((nonAuditDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysLeft < 0;
  const isUrgent = daysLeft >= 0 && daysLeft <= 30;

  const color = isOverdue
    ? 'var(--status-error)'
    : isUrgent
    ? 'var(--status-warning)'
    : 'var(--status-info)';

  const bg = isOverdue
    ? 'rgba(248,81,73,0.08)'
    : isUrgent
    ? 'rgba(210,153,34,0.08)'
    : 'rgba(88,166,255,0.08)';

  return (
    <div
      style={{
        marginTop: '16px',
        background: bg,
        border: `1px solid ${color}40`,
        borderRadius: '8px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span style={{ fontSize: '18px' }}>{isOverdue ? '🔴' : isUrgent ? '⚠️' : 'ℹ️'}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color }}>
          {isOverdue
            ? 'ITR Due Date for AY 2026-27 (Non-Audit) has passed'
            : `ITR Due Date: 31 Jul 2026 (Non-Audit)  ·  31 Oct 2026 (Audit)`}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '12px' }}>
          {isOverdue
            ? `Overdue by ${Math.abs(daysLeft)} days — late fee u/s 234F up to ₹5,000 applicable`
            : `${daysLeft} days remaining · FY 2025-26 · AY 2026-27`}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div>Audit: {Math.ceil((auditDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))} days</div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '24px 0',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '12px',
      }}
    >
      {message}
    </div>
  );
}

// ── Mock data for dev/browser preview ────────────────────────────────────────

const MOCK_STATS: DashboardStats = {
  totalClients: 48,
  totalReturns: 42,
  filedReturns: 18,
  pendingReturns: 16,
  readyForFiling: 6,
  returnsByStatus: [
    { workflowStatus: 'FILED',              _count: 18 },
    { workflowStatus: 'DATA_ENTRY_PENDING', _count: 10 },
    { workflowStatus: 'READY_FOR_FILING',   _count: 6  },
    { workflowStatus: 'REVIEW_PENDING',     _count: 4  },
    { workflowStatus: 'NOT_STARTED',        _count: 4  },
  ],
  returnsByForm: [
    { itrForm: 'ITR_1', _count: 20 },
    { itrForm: 'ITR_2', _count: 12 },
    { itrForm: 'ITR_3', _count: 6  },
    { itrForm: 'ITR_4', _count: 4  },
  ],
  clientsByType: [
    { assesseeType: 'INDIVIDUAL', _count: 36 },
    { assesseeType: 'HUF',        _count: 5  },
    { assesseeType: 'FIRM',       _count: 4  },
    { assesseeType: 'COMPANY',    _count: 3  },
  ],
};