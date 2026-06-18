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

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ITRFormType, TaxRegime, IncomeSummary, ITRTaxComputation } from '@/shared/types/itr';
import { computeIncomeSummary, computeTaxLiability, detectFormTypeFromReturnData } from '@/shared/utils/itrBuilder';
import { validateReturn, tabErrorCount, type ValidationResult } from '@/shared/utils/returnValidation';
import { ValidationProvider } from './ValidationContext';

// ─── Lazy schedule imports (each is a heavy form) ────────────────────────────
import ScheduleSalary from './ScheduleSalary';
import ScheduleHP from './ScheduleHP';
import ScheduleOS from './ScheduleOS';
import ScheduleDeductions from './ScheduleDeductions';
import ScheduleTDS from './ScheduleTDS';
import ScheduleTaxPayments from './ScheduleTaxPayments';
import ScheduleBP from './ScheduleBP';
import ScheduleCG from './ScheduleCG';
import ScheduleAL from './ScheduleAL';
import ScheduleFinancialParticulars from './ScheduleFinancialParticulars';
import ITR5General from './ITR5General';
import ITR5BalanceSheet from './ITR5BalanceSheet';
import ITR5PL from './ITR5PL';
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
  | 'financial_particulars'
  | 'capital_gains'
  | 'house_property'
  | 'other_sources'
  | 'deductions'
  | 'assets_liabilities'
  | 'tds'
  | 'tax_payments'
  | 'tax_summary'
  | 'verification'
  | 'itr5_general'
  | 'itr5_balance_sheet'
  | 'itr5_pl';

interface Tab {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: string;
}

interface ReturnShellProps {
  returnId: number;
  clientId: number;
  onBack: () => void;
  onNavigate: (page: import('@/app/components/layout/AppShell').AppPage) => void;
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// All heads of income always shown — ITR type auto-detected from filled data
const ALL_TABS: Tab[] = [
  { id: 'salary',                label: 'Salary',               shortLabel: 'S',    icon: 'S'   },
  { id: 'house_property',        label: 'House Property',        shortLabel: 'HP',   icon: 'HP'  },
  { id: 'business_profession',   label: 'Business / Profession', shortLabel: 'BP',   icon: 'BP'  },
  { id: 'financial_particulars', label: 'Financial Particulars', shortLabel: 'FP',   icon: 'FP'  },
  { id: 'itr5_general',          label: 'ITR-5 General',         shortLabel: 'GEN',  icon: 'GEN' },
  { id: 'itr5_balance_sheet',    label: 'Balance Sheet',         shortLabel: 'BS',   icon: 'BS'  },
  { id: 'itr5_pl',               label: 'P&L / Income',          shortLabel: 'PL',   icon: 'PL'  },
  { id: 'capital_gains',         label: 'Capital Gains',         shortLabel: 'CG',   icon: 'CG'  },
  { id: 'other_sources',         label: 'Other Sources',         shortLabel: 'OS',   icon: 'OS'  },
  { id: 'deductions',            label: 'Deductions (VI-A)',      shortLabel: 'VIA',  icon: 'VIA' },
  { id: 'assets_liabilities',    label: 'Assets & Liabilities',  shortLabel: 'AL',   icon: 'AL'  },
  { id: 'tds',                   label: 'TDS / TCS',             shortLabel: 'TDS',  icon: 'TDS' },
  { id: 'tax_payments',          label: 'Tax Payments',          shortLabel: 'ADV',  icon: 'ADV' },
  { id: 'tax_summary',           label: 'Tax Summary',           shortLabel: 'SUM',  icon: 'SUM' },
  { id: 'verification',          label: 'Verification',          shortLabel: 'VER',  icon: 'VER' },
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

export default function ReturnShell({ returnId, clientId, onBack, onNavigate, focusMode, onToggleFocusMode }: ReturnShellProps) {
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
  const [detectedForm, setDetectedForm] = useState<{ formType: ITRFormType; reason: string } | null>(null);
  const [switchingForm, setSwitchingForm] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);

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
        const initialSummary = computeIncomeSummary(data);
        setSummary(initialSummary);
        setTaxComp(computeTaxLiability(initialSummary, meta.regime));
        // Auto-detect form type on load
        const detected = detectFormTypeFromReturnData(data);
        if (detected.formType !== meta.formType) setDetectedForm(detected);
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
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    }, 1500);
  }, [returnMeta]);

  // Run ITR auto-detection whenever returnData changes
  const runDetection = useCallback((rd: any) => {
    if (!returnMeta) return;
    const detected = detectFormTypeFromReturnData(rd);
    if (detected.formType !== returnMeta.formType) {
      setDetectedForm(detected);
    } else {
      setDetectedForm(null);
    }
  }, [returnMeta]);

  // Re-run validation whenever returnData or summary changes
  useEffect(() => {
    if (!returnData || !returnMeta) return;
    setValidation(validateReturn(returnData, summary, returnMeta));
  }, [returnData, summary, returnMeta]);

  // Switch form type on the server and update local state
  const handleSwitchFormType = useCallback(async (toType: ITRFormType) => {
    if (!returnMeta) return;
    setSwitchingForm(true);
    try {
      const res = await fetch(`/api/returns/${returnMeta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formType: toType }),
      });
      if (!res.ok) throw new Error('Switch failed');
      setReturnMeta(prev => prev ? { ...prev, formType: toType } : prev);
      setDetectedForm(null);
    } catch {
      // ignore — user can retry
    } finally {
      setSwitchingForm(false);
    }
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

  // All heads always visible — ITR type is auto-detected from filled data
  const visibleTabs = ALL_TABS;

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
      <div style={{ background: '#fff', borderBottom: '2px solid #D1D9E6', flexShrink: 0, boxShadow: '0 2px 6px rgba(15,23,42,0.05)' }}>

        {/* Row 1: Navigation + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', borderBottom: '1px solid #E8EDF5' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2L4 7l5 5"/>
            </svg>
            {returnMeta.clientName}
          </button>

          <span style={{ color: 'var(--border-emphasis)', fontSize: '16px', fontWeight: 300, flexShrink: 0 }}>›</span>

          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            Income Tax Return
          </span>

          {/* Save state */}
          {saveState === 'saving' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }} />
              Saving…
            </div>
          )}
          {saveState === 'saved' && (
            <span style={{ fontSize: '11px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>
              Saved
            </span>
          )}
          {saveState === 'error' && (
            <span style={{ fontSize: '11px', color: 'var(--status-error)' }}>Save failed</span>
          )}

          {/* Focus mode toggle */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={onToggleFocusMode}
            title={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode — hide sidebar'}
            style={{ padding: '4px 7px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            {focusMode ? (
              // Exit fullscreen icon
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 1H1v4M9 1h4v4M5 13H1V9M9 13h4V9"/>
              </svg>
            ) : (
              // Enter fullscreen icon
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/>
              </svg>
            )}
          </button>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (validation && validation.errorCount > 0) {
                  setShowValidationModal(true);
                } else {
                  handleDownloadITR();
                }
              }}
              disabled={downloadingJson}
              style={{ position: 'relative' }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 1v7M4 6l2.5 2.5L9 6"/>
                <path d="M1 10.5v.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-.5"/>
              </svg>
              {downloadingJson ? 'Generating…' : 'Download JSON'}
              {validation && validation.errorCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-5px', right: '-5px',
                  background: '#e05c4b', color: '#fff',
                  fontSize: '9px', fontWeight: 700, lineHeight: 1,
                  padding: '2px 4px', borderRadius: '8px', minWidth: '14px', textAlign: 'center',
                }}>{validation.errorCount}</span>
              )}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPortalModal(true)}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 8V1M4 3.5L6.5 1 9 3.5"/>
                <path d="M1 10.5v.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-.5"/>
              </svg>
              Upload to Portal
            </button>
            {!isFiledOrAcknowledged && (
              <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('verification')}>
                File Return →
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Client + return info strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', background: '#0F172A', padding: '0 20px' }}>
          {/* Form type */}
          <div style={{ padding: '7px 16px 7px 0', borderRight: '1px solid rgba(255,255,255,0.1)', marginRight: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#93C5FD', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', background: 'rgba(59,130,246,0.2)', padding: '3px 10px', borderRadius: '5px' }}>
              {returnMeta.formType}
            </span>
          </div>

          {/* Client name + PAN */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '16px', marginRight: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{returnMeta.clientName}</span>
            <span style={{ fontSize: '12px', color: '#A0B0C8', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{returnMeta.clientPAN}</span>
          </div>

          {/* AY */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '16px', marginRight: '16px' }}>
            <span style={{ fontSize: '10px', color: '#7A8FA8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AY</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{returnMeta.assessmentYear}</span>
          </div>

          {/* Status + Regime */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px',
              background: returnMeta.status === 'FILED' ? '#166534' : returnMeta.status === 'IN_PROGRESS' ? '#92400E' : '#374151',
              color: '#fff',
            }}>
              {statusLabel(returnMeta.status)}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 10px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: '#C5D0DC' }}>
              {returnMeta.regime === 'NEW' ? 'New Regime' : 'Old Regime'}
            </span>
          </div>

          {/* Form switch alert */}
          {detectedForm && !isFiledOrAcknowledged && (
            <button
              style={{ marginLeft: '12px', fontSize: '11px', fontWeight: 600, color: '#FBBF24', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', padding: '3px 10px', borderRadius: '12px', cursor: 'pointer' }}
              onClick={() => handleSwitchFormType(detectedForm.formType)}
            >
              {switchingForm ? 'Switching…' : `⚠ Switch to ${detectedForm.formType}`}
            </button>
          )}

          {returnMeta.acknowledgementNumber && (
            <span style={{ marginLeft: '12px', fontSize: '11px', color: '#A0B0C8', fontFamily: 'var(--font-mono)' }}>
              ACK: {returnMeta.acknowledgementNumber}
            </span>
          )}
        </div>
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

      {/* ── Validation Modal ── */}
      {showValidationModal && validation && (
        <div className="modal-overlay" onClick={() => setShowValidationModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Validation Errors</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  {validation.errorCount} error{validation.errorCount !== 1 ? 's' : ''} must be fixed before generating the ITR JSON
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowValidationModal(false)}>✕</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {validation.tabs.filter(t => t.errors.length > 0).map(t => (
                <div key={t.tabId} style={{ border: '1px solid rgba(224,92,75,0.3)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(224,92,75,0.08)', cursor: 'pointer' }}
                    onClick={() => { setActiveTab(t.tabId as TabId); setShowValidationModal(false); }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--error, #e05c4b)', fontWeight: 700 }}>{t.errors.length} error{t.errors.length !== 1 ? 's' : ''}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Go to tab →</span>
                    </div>
                  </div>
                  <ul style={{ margin: 0, padding: '8px 12px 8px 28px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {t.errors.map((e, i) => (
                      <li key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{e.message}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', marginTop: '14px', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowValidationModal(false)}>Close</button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setShowValidationModal(false); handleDownloadITR(); }}
              >
                Generate Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vertical sidebar + content ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Schedule sidebar — Computax-style grouped nav */}
        <nav style={{
          width: '212px',
          flexShrink: 0,
          borderRight: '1px solid #0F172A',
          background: '#1E293B',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Section: Income Heads */}
          <div style={{ padding: '10px 14px 4px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase' }}>
            Income Heads
          </div>
          {(['salary','house_property','business_profession','financial_particulars','capital_gains','other_sources'] as const).map(tabId => {
            const isITR4 = returnMeta?.formType === 'ITR-4';
            const isITR5 = returnMeta?.formType === 'ITR-5';
            if (tabId === 'financial_particulars' && isITR5) return null;
            return (
              <ScheduleNavItem
                key={tabId}
                tab={ALL_TABS.find(t => t.id === tabId)!}
                isActive={activeTab === tabId}
                onClick={() => setActiveTab(tabId)}
                badge={validation ? tabErrorCount(validation, tabId as any) : 0}
                tag={
                  tabId === 'financial_particulars' && isITR4 ? 'REQ'
                  : tabId === 'business_profession' && (() => {
                    const pi = (returnData as any)?.presumptiveIncome;
                    return pi && ((pi.Business44AD?.length ?? 0) + (pi.Profession44ADA?.length ?? 0)) > 0 && returnMeta?.regime === 'OLD';
                  })() ? 'IEA' : undefined
                }
                tagColor={tabId === 'financial_particulars' ? '#DC2626' : undefined}
              />
            );
          })}

          {/* ITR-5 specific tabs */}
          {returnMeta?.formType === 'ITR-5' && (
            <>
              <div style={{ padding: '10px 14px 4px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', marginTop: '4px' }}>
                ITR-5 Schedules
              </div>
              {(['itr5_general','itr5_balance_sheet','itr5_pl'] as const).map(tabId => (
                <ScheduleNavItem
                  key={tabId}
                  tab={ALL_TABS.find(t => t.id === tabId)!}
                  isActive={activeTab === tabId}
                  onClick={() => setActiveTab(tabId)}
                  badge={0}
                />
              ))}
            </>
          )}

          {/* Section: Deductions & Credits */}
          <div style={{ padding: '10px 14px 4px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', marginTop: '4px' }}>
            Deductions & Credits
          </div>
          {(['deductions','assets_liabilities','tds','tax_payments'] as const).map(tabId => (
            <ScheduleNavItem
              key={tabId}
              tab={ALL_TABS.find(t => t.id === tabId)!}
              isActive={activeTab === tabId}
              onClick={() => setActiveTab(tabId)}
              badge={validation ? tabErrorCount(validation, tabId as any) : 0}
              tag={tabId === 'assets_liabilities' && (summary?.GrossTotalIncome ?? 0) > 5000000 ? 'REQ' : undefined}
              tagColor={tabId === 'assets_liabilities' ? '#DC2626' : undefined}
            />
          ))}

          {/* Section: Summary & Filing */}
          <div style={{ padding: '10px 14px 4px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', marginTop: '4px' }}>
            Summary & Filing
          </div>
          {(['tax_summary','verification'] as const).map(tabId => (
            <ScheduleNavItem
              key={tabId}
              tab={ALL_TABS.find(t => t.id === tabId)!}
              isActive={activeTab === tabId}
              onClick={() => setActiveTab(tabId)}
              badge={validation ? tabErrorCount(validation, tabId as any) : 0}
            />
          ))}

          <div style={{ flex: 1 }} />
        </nav>

        {/* Content panel */}
        <ValidationProvider value={{ fieldErrors: validation?.fieldErrors ?? {}, fieldWarnings: validation?.fieldWarnings ?? {} }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px', background: '#F0F4FA' }}>
          {isFiledOrAcknowledged && (
            <div
              className="badge badge-success"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', padding: '8px 14px', fontSize: '13px' }}
            >
              This return has been filed. Fields are read-only.
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
                runDetection(rd);
              }}
              setDirty={setDirty}
            />
          )}

          {activeTab === 'business_profession' && (
            <ScheduleBP
              returnId={String(returnMeta.id)}
              returnData={returnData ?? {} as any}
              regime={returnMeta.regime}
              onSaved={(rd: any) => {
                setReturnData(rd);
                const newSummary = computeIncomeSummary(rd);
                setSummary(newSummary);
                setTaxComp(computeTaxLiability(newSummary, rd.regime ?? returnMeta?.regime ?? 'NEW'));
                onScheduleChange(newSummary);
                runDetection(rd);
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
                runDetection(rd);
              }}
              setDirty={setDirty}
            />
          )}

          {activeTab === 'financial_particulars' && (
            <ScheduleFinancialParticulars
              returnId={String(returnMeta.id)}
              returnData={returnData ?? {} as any}
              onSaved={(rd: any) => {
                setReturnData(rd);
              }}
              setDirty={setDirty}
            />
          )}

          {activeTab === 'itr5_general' && (
            <div className="p-6">
              <ITR5General
                returnId={returnMeta.id}
                initialData={(returnData as any)?.itr5General}
                onSaved={() => setDirty(false)}
              />
            </div>
          )}

          {activeTab === 'itr5_balance_sheet' && (
            <div className="p-6 overflow-auto">
              <ITR5BalanceSheet
                returnId={returnMeta.id}
                initialData={(returnData as any)?.itr5BalanceSheet}
                onSaved={() => setDirty(false)}
              />
            </div>
          )}

          {activeTab === 'itr5_pl' && (
            <div className="p-6 overflow-auto">
              <ITR5PL
                returnId={returnMeta.id}
                maintainsRegularBooks={(returnData as any)?.itr5General?.maintainsRegularBooks ?? false}
                initialData={(returnData as any)?.itr5PL}
                onSaved={() => setDirty(false)}
              />
            </div>
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
                runDetection(rd);
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
                runDetection(rd);
              }}
              setDirty={setDirty}
            />
          )}

          {activeTab === 'assets_liabilities' && (
            <ScheduleAL
              returnId={String(returnMeta.id)}
              returnData={returnData ?? {} as any}
              grossTotalIncome={summary?.GrossTotalIncome ?? 0}
              onSaved={(rd: any) => {
                setReturnData(rd);
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
        </ValidationProvider>
      </div>

      {/* ── Income Summary Footer ── */}
      {summary && (
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'stretch',
          height: '48px',
          overflow: 'hidden',
        }}>
          <SummaryCell label="Gross Total Income"  value={summary.GrossTotalIncome} />
          <SummaryDivider />
          <SummaryCell label="Deductions (VI-A)"   value={summary.TotalDeductions} positive />
          <SummaryDivider />
          <SummaryCell label="Total Taxable Income" value={summary.TotalIncome} highlight />
          <SummaryDivider />
          {taxComp && <SummaryCell label="Tax Payable"          value={taxComp.TotalTaxPayable} />}
          {taxComp && <SummaryDivider />}
          {taxComp && <SummaryCell label="TDS / Taxes Paid"     value={taxComp.TotalTaxesPaid} positive />}
          {taxComp && <SummaryDivider />}
          {taxComp && (
            <SummaryCell
              label={taxComp.BalTaxPayable >= 0 ? 'Balance Tax Payable' : 'Refund Due'}
              value={taxComp.BalTaxPayable}
              highlight
              negative={taxComp.BalTaxPayable < 0}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Schedule Nav Item ────────────────────────────────────────────────────────

function ScheduleNavItem({
  tab, isActive, onClick, badge = 0, tag, tagColor,
}: {
  tab: Tab; isActive: boolean; onClick: () => void;
  badge?: number; tag?: string; tagColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        width: '100%', padding: '8px 14px 8px 12px',
        border: 'none',
        borderLeft: isActive ? '3px solid #3B82F6' : '3px solid transparent',
        background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      {/* Schedule code badge */}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 800,
        width: '32px', textAlign: 'center', padding: '2px 0', borderRadius: '4px', flexShrink: 0,
        background: isActive ? '#1E3A8A' : '#334155',
        color: isActive ? '#93C5FD' : '#94A3B8',
        border: `1px solid ${isActive ? '#1E40AF' : '#475569'}`,
        letterSpacing: '0.01em',
      }}>
        {tab.icon}
      </span>

      <span style={{
        flex: 1, fontSize: '13px', lineHeight: 1.3,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#E2E8F0' : '#94A3B8',
      }}>
        {tab.label}
      </span>

      {/* Error badge */}
      {badge > 0 && (
        <span style={{ fontSize: '10px', fontWeight: 700, background: '#DC2626', color: '#fff', padding: '1px 5px', borderRadius: '10px', minWidth: '18px', textAlign: 'center', flexShrink: 0 }}>
          {badge}
        </span>
      )}
      {/* Applicability tag (REQ / IEA) */}
      {tag && badge === 0 && (
        <span style={{ fontSize: '9px', fontWeight: 700, background: tagColor ?? '#92400E', color: '#fff', padding: '1px 5px', borderRadius: '3px', letterSpacing: '0.04em', flexShrink: 0 }}>
          {tag}
        </span>
      )}
    </button>
  );
}

// ─── Summary footer helpers ────────────────────────────────────────────────────

function SummaryDivider() {
  return <div style={{ width: '1px', background: 'var(--border-subtle)', flexShrink: 0, alignSelf: 'stretch', margin: '8px 0' }} />;
}

function SummaryCell({
  label, value, highlight = false, positive = false, negative = false,
}: {
  label: string; value: number; highlight?: boolean; positive?: boolean; negative?: boolean;
}) {
  const valColor = negative
    ? 'var(--status-success)'
    : positive
    ? 'var(--status-success)'
    : highlight
    ? 'var(--brand-text)'
    : 'var(--text-primary)';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 16px', minWidth: 0,
    }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', letterSpacing: '0.02em', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{
        fontSize: '13px', fontWeight: highlight ? 700 : 600,
        color: valColor, fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      }}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}
