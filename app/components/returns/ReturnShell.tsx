'use client';

/**
 * renderer/app/components/returns/ReturnShell.tsx
 *
 * Tab container for a single ITR return.
 * Renders all schedule tabs in order, shows form type badge,
 * filing status, auto-save indicator, and live tax summary bar.
 *
 * Props:
 *   returnId   — DB return ID
 *   clientId   — parent client ID
 *   onBack     — navigate back to client detail
 *   onNavigate — global navigation handler
 */

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import type { ITRFormType, TaxRegime, IncomeSummary, ITRTaxComputation } from '@/shared/types/itr';
import { computeIncomeSummary, computeTaxLiability } from '@/shared/utils/itrBuilder';

// ─── Lazy schedule imports (each is a heavy form) ────────────────────────────
import ScheduleSalary from './ScheduleSalary';
import ScheduleHP from './ScheduleHP';
import ScheduleOS from './ScheduleOS';
import ScheduleDeductions from './ScheduleDeductions';
import ScheduleTDS from './ScheduleTDS';
import ScheduleTaxPayments from './ScheduleTaxPayments';
import ScheduleBP from './ScheduleBP';
import ScheduleCG from './ScheduleCG';
import TaxSummary from './TaxSummary';
import Verification from './Verification';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReturnMeta {
  id: number;
  clientId: number;
  clientName: string;
  clientPAN: string;
  formType: ITRFormType;
  assessmentYear: string;
  regime: TaxRegime;
  status: string;
  filingSection: string;
  filedAt?: string;
  acknowledgementNumber?: string;
}

type TabId =
  | 'salary'
  | 'business_profession'
  | 'capital_gains'
  | 'house_property'
  | 'other_sources'
  | 'deductions'
  | 'tds'
  | 'tax_payments'
  | 'tax_summary'
  | 'verification';

interface Tab {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: string;
  applicableForms: ITRFormType[];
}

interface ReturnShellProps {
  returnId: number;
  clientId: number;
  onBack: () => void;
  onNavigate: (page: import('@/app/components/layout/AppShell').AppPage) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_TABS: Tab[] = [
  {
    id: 'salary',
    label: 'Salary',
    shortLabel: 'Salary',
    icon: '💼',
    applicableForms: ['ITR-1', 'ITR-2', 'ITR-4'],
  },
  {
    id: 'business_profession',
    label: 'Business / Profession',
    shortLabel: 'BP',
    icon: '🏭',
    applicableForms: ['ITR-4'],
  },
  {
    id: 'house_property',
    label: 'House Property',
    shortLabel: 'HP',
    icon: '🏠',
    applicableForms: ['ITR-1', 'ITR-2', 'ITR-4'],
  },
  {
    id: 'capital_gains',
    label: 'Capital Gains',
    shortLabel: 'CG',
    icon: '📉',
    applicableForms: ['ITR-2'],
  },
  {
    id: 'other_sources',
    label: 'Other Sources',
    shortLabel: 'OS',
    icon: '📈',
    applicableForms: ['ITR-1', 'ITR-2', 'ITR-4'],
  },
  {
    id: 'deductions',
    label: 'Deductions',
    shortLabel: 'VI-A',
    icon: '🧾',
    applicableForms: ['ITR-1', 'ITR-2', 'ITR-4'],
  },
  {
    id: 'tds',
    label: 'TDS / TCS',
    shortLabel: 'TDS',
    icon: '📋',
    applicableForms: ['ITR-1', 'ITR-2', 'ITR-4'],
  },
  {
    id: 'tax_payments',
    label: 'Tax Payments',
    shortLabel: 'Challan',
    icon: '🏦',
    applicableForms: ['ITR-1', 'ITR-2', 'ITR-4'],
  },
  {
    id: 'tax_summary',
    label: 'Tax Summary',
    shortLabel: 'Summary',
    icon: '📊',
    applicableForms: ['ITR-1', 'ITR-2', 'ITR-4'],
  },
  {
    id: 'verification',
    label: 'Verification',
    shortLabel: 'Verify',
    icon: '✅',
    applicableForms: ['ITR-1', 'ITR-2', 'ITR-4'],
  },
];

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_RETURN: ReturnMeta = {
  id: 1,
  clientId: 1,
  clientName: 'Priya Kapoor',
  clientPAN: 'ABCPK1234E',
  formType: 'ITR-1',
  assessmentYear: '2025-26',
  regime: 'NEW',
  status: 'IN_PROGRESS',
  filingSection: '11',
};

const MOCK_SUMMARY: IncomeSummary = {
  IncomeFromSalary: 850000,
  IncomeFromHP: -150000,
  IncomeFromOtherSources: 25000,
  GrossTotalIncome: 725000,
  TotalDeductions: 150000,
  TotalIncome: 575000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formTypeBadgeClass(formType: ITRFormType): string {
  switch (formType) {
    case 'ITR-1': return 'badge badge-success';
    case 'ITR-2': return 'badge badge-info';
    case 'ITR-4': return 'badge badge-warning';
    default: return 'badge badge-neutral';
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'FILED': return 'badge badge-success';
    case 'ACKNOWLEDGED': return 'badge badge-success';
    case 'IN_PROGRESS': return 'badge badge-warning';
    case 'DRAFT': return 'badge badge-neutral';
    case 'CANCELLED': return 'badge badge-error';
    default: return 'badge badge-neutral';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'FILED': return 'Filed';
    case 'ACKNOWLEDGED': return 'Acknowledged';
    case 'IN_PROGRESS': return 'In Progress';
    case 'DRAFT': return 'Draft';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReturnShell({ returnId, clientId, onBack, onNavigate }: ReturnShellProps) {
  const [returnMeta, setReturnMeta] = useState<ReturnMeta | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('salary');
  const [summary, setSummary] = useState<IncomeSummary | null>(null);
  const [taxComp, setTaxComp] = useState<ITRTaxComputation | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [returnData, setReturnData] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);

  // Load return metadata
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/returns/${returnId}`);
        if (!res.ok) throw new Error('Failed to load return');
        const { data } = await res.json();
        const meta: ReturnMeta = {
          id: data.id,
          clientId: data.clientId,
          clientName: data.client?.fullName ?? '',
          clientPAN: data.client?.pan ?? '',
          formType: data.formType as ITRFormType,
          assessmentYear: data.assessmentYear?.ayLabel ?? '',
          regime: (data.assessmentYear?.regime ?? 'NEW') as TaxRegime,
          status: data.status,
          filingSection: data.filingType === 'REVISED' ? '17' : '11',
          filedAt: data.filedAt,
          acknowledgementNumber: data.acknowledgementNumber,
        };
        setReturnMeta(meta);
        setReturnData(data);
        // Seed the live tax bar immediately from loaded data
        const initialSummary = computeIncomeSummary(data);
        setSummary(initialSummary);
        setTaxComp(computeTaxLiability(initialSummary, meta.regime));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load return');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [returnId]);

  // Called by child schedule components when data changes
  const onScheduleChange = useCallback((newSummary: IncomeSummary) => {
    setSummary(newSummary);
    if (returnMeta) {
      setTaxComp(computeTaxLiability(newSummary, returnMeta.regime));
    }
    // Trigger auto-save indicator
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    }, 1500);
  }, [returnMeta]);

  // Download ITR JSON
  const handleDownloadITR = useCallback(async () => {
    if (!returnMeta) return;
    setDownloadingJson(true);
    try {
      const res = await fetch(`/api/returns/${returnId}/generate-itr`);
      if (!res.ok) throw new Error('Failed to generate ITR JSON');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `ITR-${returnMeta.formType}-${returnMeta.clientPAN}-AY${returnMeta.assessmentYear}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore — user can retry
    } finally {
      setDownloadingJson(false);
    }
  }, [returnMeta, returnId]);

  // Tabs applicable to this form type
  const visibleTabs = returnMeta
    ? ALL_TABS.filter((t) => t.applicableForms.includes(returnMeta.formType))
    : ALL_TABS;

  const isFiledOrAcknowledged =
    returnMeta?.status === 'FILED' || returnMeta?.status === 'ACKNOWLEDGED';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--text-secondary)' }}>Loading return…</span>
      </div>
    );
  }

  if (error || !returnMeta) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-title">Failed to load return</div>
        <div className="empty-state-desc">{error}</div>
        <button className="btn btn-secondary" onClick={onBack}>← Back to Client</button>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '16px 24px',
        flexShrink: 0,
      }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            style={{ padding: '4px 8px', fontSize: '13px' }}
          >
            ← {returnMeta.clientName}
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>/</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            AY {returnMeta.assessmentYear}
          </span>
        </div>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Income Tax Return
            </h1>
            <span className={formTypeBadgeClass(returnMeta.formType)}>
              {returnMeta.formType}
            </span>
            <span className={statusBadgeClass(returnMeta.status)}>
              {statusLabel(returnMeta.status)}
            </span>
            <span className="badge badge-neutral">
              {returnMeta.regime === 'NEW' ? 'New Regime' : 'Old Regime'}
            </span>
          </div>

          {/* Actions + save indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {saveState === 'saving' && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="spinner" style={{ width: '12px', height: '12px' }} />
                Saving…
              </span>
            )}
            {saveState === 'saved' && (
              <span style={{ fontSize: '12px', color: 'var(--color-success)' }}>✓ Saved</span>
            )}
            {saveState === 'error' && (
              <span style={{ fontSize: '12px', color: 'var(--color-error)' }}>⚠ Save failed</span>
            )}

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadITR}
              disabled={downloadingJson}
              title="Download ITR JSON for upload to IT Portal"
            >
              {downloadingJson ? '⏳ Generating…' : '⬇ Download ITR JSON'}
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPortalModal(true)}
              title="Instructions to upload to Income Tax Portal"
            >
              ↑ Upload to Portal
            </button>

            {!isFiledOrAcknowledged && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveTab('verification')}
              >
                Proceed to File →
              </button>
            )}

            {returnMeta.acknowledgementNumber && (
              <span
                className="font-mono"
                style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '4px 8px', borderRadius: '4px' }}
              >
                ACK: {returnMeta.acknowledgementNumber}
              </span>
            )}
          </div>
        </div>

        {/* Client info strip */}
        <div style={{ display: 'flex', gap: '24px', marginTop: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>PAN: </span>
            <span className="pan-field">{returnMeta.clientPAN}</span>
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>AY: </span>
            {returnMeta.assessmentYear}
          </span>
          {returnMeta.filedAt && (
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Filed: </span>
              {new Date(returnMeta.filedAt).toLocaleDateString('en-IN')}
            </span>
          )}
        </div>
      </div>


      {/* ── Tab bar ── */}
      <div
        className="tab-list"
        style={{
          padding: '0 24px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          background: 'var(--bg-surface)',
        }}
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-item${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ whiteSpace: 'nowrap' }}
            title={tab.label}
          >
            <span style={{ marginRight: '6px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Portal upload modal ── */}
      {showPortalModal && (
        <div className="modal-overlay" onClick={() => setShowPortalModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Upload to IT Portal</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPortalModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
              To upload your ITR JSON to the Income Tax portal:
            </p>
            <ol style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '2', paddingLeft: '20px', marginBottom: '20px' }}>
              <li>Download the JSON using the <strong>Download ITR JSON</strong> button above.</li>
              <li>Go to <strong>incometax.gov.in</strong> → e-File → Income Tax Returns → Upload XML/JSON.</li>
              <li>Select the downloaded file and submit.</li>
            </ol>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowPortalModal(false)}>Close</button>
              <a
                href="https://eportal.incometax.gov.in/iec/foservices/#/e-file/er-efile-main"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Open IT Portal →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        {isFiledOrAcknowledged && (
          <div
            className="badge badge-success"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', padding: '8px 14px', fontSize: '13px' }}
          >
            🔒 This return has been filed. Fields are read-only.
          </div>
        )}

        {activeTab === 'salary' && (
          <ScheduleSalary
            returnId={String(returnMeta.id)}
            returnData={returnData ?? {} as any}
            onSaved={(rd: any) => {
              setReturnData(rd);
              const newSummary = computeIncomeSummary(rd);
              setSummary(newSummary);
              setTaxComp(computeTaxLiability(newSummary, rd.regime ?? returnMeta?.regime ?? 'NEW'));
              onScheduleChange(newSummary);
            }}
            setDirty={setDirty}
          />
        )}

        {activeTab === 'business_profession' && (
          <ScheduleBP
            returnId={String(returnMeta.id)}
            returnData={returnData ?? {} as any}
            onSaved={(rd: any) => {
              setReturnData(rd);
              const newSummary = computeIncomeSummary(rd);
              setSummary(newSummary);
              setTaxComp(computeTaxLiability(newSummary, rd.regime ?? returnMeta?.regime ?? 'NEW'));
              onScheduleChange(newSummary);
            }}
            setDirty={setDirty}
          />
        )}

        {activeTab === 'house_property' && (
          <ScheduleHP
            returnId={String(returnMeta.id)}
            returnData={returnData ?? {} as any}
            onSaved={(rd: any) => {
              setReturnData(rd);
              const newSummary = computeIncomeSummary(rd);
              setSummary(newSummary);
              setTaxComp(computeTaxLiability(newSummary, rd.regime ?? returnMeta?.regime ?? 'NEW'));
              onScheduleChange(newSummary);
            }}
            setDirty={setDirty}
          />
        )}

        {activeTab === 'capital_gains' && (
          <ScheduleCG
            returnId={String(returnMeta.id)}
            returnData={returnData ?? {} as any}
            onSaved={(rd: any) => {
              setReturnData(rd);
              const newSummary = computeIncomeSummary(rd);
              setSummary(newSummary);
              setTaxComp(computeTaxLiability(newSummary, rd.regime ?? returnMeta?.regime ?? 'NEW'));
              onScheduleChange(newSummary);
            }}
            setDirty={setDirty}
          />
        )}

        {activeTab === 'other_sources' && (
          <ScheduleOS
            returnId={String(returnMeta.id)}
            returnData={returnData ?? {} as any}
            onSaved={(rd: any) => {
              setReturnData(rd);
              const newSummary = computeIncomeSummary(rd);
              setSummary(newSummary);
              setTaxComp(computeTaxLiability(newSummary, rd.regime ?? returnMeta?.regime ?? 'NEW'));
              onScheduleChange(newSummary);
            }}
            setDirty={setDirty}
          />
        )}

        {activeTab === 'deductions' && (
          <ScheduleDeductions
            returnId={String(returnMeta.id)}
            returnData={returnData ?? {} as any}
            onSaved={() => {}}
            setDirty={setDirty}
          />
        )}

        {activeTab === 'tds' && (
          <ScheduleTDS
            returnId={String(returnMeta.id)}
            clientId={clientId}
            returnData={returnData ?? {} as any}
            onSaved={() => {}}
            setDirty={setDirty}
          />
        )}

        {activeTab === 'tax_payments' && (
          <ScheduleTaxPayments
            returnId={String(returnMeta.id)}
            returnData={returnData ?? {} as any}
            onSaved={() => {}}
            setDirty={setDirty}
          />
        )}

        {activeTab === 'tax_summary' && (
          <TaxSummary
            returnId={String(returnMeta.id)}
            returnData={returnData ?? {} as any}
          />
        )}

        {activeTab === 'verification' && (
          <Verification
            returnId={returnMeta.id}
            clientName={returnMeta.clientName}
            formType={returnMeta.formType}
            assessmentYear={returnMeta.assessmentYear}
            readOnly={isFiledOrAcknowledged}
            onFiled={() => {
              setReturnMeta((prev) => prev ? { ...prev, status: 'FILED' } : prev);
              onBack();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Tax bar item ─────────────────────────────────────────────────────────────

function TaxBarItem({
  label,
  value,
  highlight = false,
  positive = false,
  negative = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  const color = positive
    ? 'var(--color-success)'
    : negative
    ? 'var(--color-error)'
    : highlight
    ? 'var(--brand-text)'
    : 'var(--text-primary)';

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div
        className="amount"
        style={{
          fontSize: '14px',
          fontWeight: highlight ? 700 : 600,
          color,
        }}
      >
        {formatCurrency(value)}
      </div>
    </div>
  );
}
