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
  | 'assets_liabilities'
  | 'tds'
  | 'tax_payments'
  | 'tax_summary'
  | 'verification';

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
}

// ─── Constants ───────────────────────────────────────────────────────────────

// All heads of income always shown — ITR type auto-detected from filled data
const ALL_TABS: Tab[] = [
  { id: 'salary',              label: 'Salary',               shortLabel: 'S',    icon: 'S'   },
  { id: 'house_property',      label: 'House Property',        shortLabel: 'HP',   icon: 'HP'  },
  { id: 'business_profession', label: 'Business / Profession', shortLabel: 'BP',   icon: 'BP'  },
  { id: 'capital_gains',       label: 'Capital Gains',         shortLabel: 'CG',   icon: 'CG'  },
  { id: 'other_sources',       label: 'Other Sources',         shortLabel: 'OS',   icon: 'OS'  },
  { id: 'deductions',          label: 'Deductions (VI-A)',      shortLabel: 'VIA',  icon: 'VIA' },
  { id: 'assets_liabilities',  label: 'Assets & Liabilities',  shortLabel: 'AL',   icon: 'AL'  },
  { id: 'tds',                 label: 'TDS / TCS',             shortLabel: 'TDS',  icon: 'TDS' },
  { id: 'tax_payments',        label: 'Tax Payments',          shortLabel: 'ADV',  icon: 'ADV' },
  { id: 'tax_summary',         label: 'Tax Summary',           shortLabel: 'SUM',  icon: 'SUM' },
  { id: 'verification',        label: 'Verification',          shortLabel: 'VER',  icon: 'VER' },
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
  const [detectedForm, setDetectedForm] = useState<{ formType: ITRFormType; reason: string } | null>(null);
  const [switchingForm, setSwitchingForm] = useState(false);

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
      <div style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 20px',
        flexShrink: 0,
      }}>
        {/* Single compact row: back + client + badges + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Back link */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            style={{ padding: '3px 8px', fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}
          >
            ← {returnMeta.clientName}
          </button>

          <span style={{ color: 'var(--border-default)', fontSize: '14px', flexShrink: 0 }}>/</span>

          {/* Title + badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              Income Tax Return
            </span>
            <span className={formTypeBadgeClass(returnMeta.formType)} style={{ fontSize: '11px' }}>
              {returnMeta.formType}
            </span>
            <span className={statusBadgeClass(returnMeta.status)} style={{ fontSize: '11px' }}>
              {statusLabel(returnMeta.status)}
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
              {returnMeta.regime === 'NEW' ? 'New Regime' : 'Old Regime'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {returnMeta.clientPAN}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              AY {returnMeta.assessmentYear}
            </span>
            {returnMeta.filedAt && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Filed {new Date(returnMeta.filedAt).toLocaleDateString('en-IN')}
              </span>
            )}
            {returnMeta.acknowledgementNumber && (
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: '3px' }}>
                ACK: {returnMeta.acknowledgementNumber}
              </span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {saveState === 'saving' && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Saving…</span>
            )}
            {saveState === 'saved' && (
              <span style={{ fontSize: '11px', color: 'var(--status-success)' }}>✓ Saved</span>
            )}
            {saveState === 'error' && (
              <span style={{ fontSize: '11px', color: 'var(--status-error)' }}>Save failed</span>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadITR}
              disabled={downloadingJson}
            >
              {downloadingJson ? 'Generating…' : 'Download ITR JSON'}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPortalModal(true)}
            >
              Upload to Portal
            </button>
            {!isFiledOrAcknowledged && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setActiveTab('verification')}
              >
                Proceed to File →
              </button>
            )}
          </div>
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

      {/* ── Vertical sidebar + content ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Sidebar */}
        <nav style={{
          width: '196px',
          flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          overflowY: 'auto',
          padding: '12px 0',
        }}>
          <div style={{ padding: '0 12px 8px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Schedules
          </div>
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            // AL: required when GTI > 50L
            const gti = summary?.GrossTotalIncome ?? 0;
            const alRequired = tab.id === 'assets_liabilities' && gti > 5000000;
            // 10-IEA: applicable when BP has entries and old regime
            const bpHasIncome = (() => {
              const pi = (returnData as any)?.presumptiveIncome;
              return pi && ((pi.Business44AD?.length ?? 0) + (pi.Profession44ADA?.length ?? 0) + (pi.GoodsCarriage44AE?.length ?? 0)) > 0;
            })();
            const bpIEAApplicable = tab.id === 'business_profession' && bpHasIncome && returnMeta?.regime === 'OLD';
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '7px 12px',
                  border: 'none',
                  borderLeft: isActive ? '2px solid var(--brand-primary)' : '2px solid transparent',
                  background: isActive ? 'rgba(212,160,23,0.08)' : 'transparent',
                  color: isActive ? 'var(--brand-text)' : 'var(--text-secondary)',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.1s',
                  lineHeight: '1',
                }}
                onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; } }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; } }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  width: '30px',
                  textAlign: 'center',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  flexShrink: 0,
                  background: isActive ? 'var(--brand-primary)' : 'var(--bg-elevated)',
                  color: isActive ? '#000' : 'var(--text-muted)',
                  border: '1px solid ' + (isActive ? 'transparent' : 'var(--border-subtle)'),
                }}>
                  {tab.icon}
                </span>
                <span style={{ flex: 1 }}>{tab.label}</span>
                {alRequired && (
                  <span style={{ fontSize: '9px', fontWeight: 700, background: 'var(--error, #e05c4b)', color: '#fff', padding: '1px 5px', borderRadius: '3px', letterSpacing: '0.03em', flexShrink: 0 }}>REQ</span>
                )}
                {bpIEAApplicable && (
                  <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(212,160,23,0.25)', color: 'var(--brand-text)', padding: '1px 5px', borderRadius: '3px', letterSpacing: '0.03em', flexShrink: 0 }}>IEA</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {isFiledOrAcknowledged && (
            <div
              className="badge badge-success"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', padding: '8px 14px', fontSize: '13px' }}
            >
              This return has been filed. Fields are read-only.
            </div>
          )}

          {/* ── Auto ITR type detection banner ── */}
          {detectedForm && !isFiledOrAcknowledged && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
              padding: '12px 16px', marginBottom: '18px',
              background: 'rgba(212,160,23,0.10)', border: '1px solid var(--brand-primary)',
              borderRadius: '8px', fontSize: '13px',
            }}>
              <div style={{ flex: 1 }}>
                <strong style={{ color: 'var(--brand-text)' }}>ITR type mismatch detected</strong>
                <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{detectedForm.reason}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSwitchFormType(detectedForm.formType)}
                  disabled={switchingForm}
                >
                  {switchingForm ? 'Switching…' : `Switch to ${detectedForm.formType}`}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDetectedForm(null)}>Dismiss</button>
              </div>
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
