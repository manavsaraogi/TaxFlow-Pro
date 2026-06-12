/**
 * renderer/store/returnStore.ts
 *
 * Zustand store for the active ITR return.
 * Holds all schedule data in memory, tracks dirty state per schedule,
 * auto-saves on change (1.5s debounce), and exposes computed income
 * summary + tax liability for the live tax bar in ReturnShell.
 *
 * Usage:
 *   const { salary, setSalary, summary, taxComp } = useReturnStore();
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ReturnData,
  ScheduleSalary,
  ScheduleHP,
  ScheduleOS,
  DeductionsChapterVIA,
  ScheduleTDS,
  ScheduleTaxPayments,
  ScheduleLTCG112A,
  SchedulePresumptiveIncome,
  Verification,
  IncomeSummary,
  ITRTaxComputation,
  ITRFormType,
  TaxRegime,
  FilingSection,
} from '../shared/types/itr';
import {
  computeIncomeSummary,
  computeTaxLiability,
  applyDeductionCaps,
  emptyReturnData,
} from '../shared/utils/itrBuilder';

// ─── Types ────────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type ScheduleKey = keyof Pick<
  ReturnData,
  | 'salary'
  | 'houseProperty'
  | 'otherSources'
  | 'deductions'
  | 'tds'
  | 'taxPayments'
  | 'ltcg112A'
  | 'presumptiveIncome'
  | 'verification'
>;

interface ReturnMeta {
  id: number;
  clientId: number;
  clientName: string;
  clientPAN: string;
  formType: ITRFormType;
  assessmentYear: string;
  regime: TaxRegime;
  status: string;
  filingSection: FilingSection;
  filedAt?: string;
  acknowledgementNumber?: string;
}

interface DirtyMap {
  salary: boolean;
  houseProperty: boolean;
  otherSources: boolean;
  deductions: boolean;
  tds: boolean;
  taxPayments: boolean;
  ltcg112A: boolean;
  presumptiveIncome: boolean;
  verification: boolean;
}

interface ReturnState {
  // ── Metadata ──
  meta: ReturnMeta | null;
  loading: boolean;
  loadError: string | null;

  // ── Schedule data ──
  salary: ScheduleSalary | null;
  houseProperty: ScheduleHP | null;
  otherSources: ScheduleOS | null;
  deductions: DeductionsChapterVIA | null;
  tds: ScheduleTDS | null;
  taxPayments: ScheduleTaxPayments | null;
  ltcg112A: ScheduleLTCG112A | null;
  presumptiveIncome: SchedulePresumptiveIncome | null;
  verification: Verification | null;

  // ── Computed ──
  summary: IncomeSummary | null;
  taxComp: ITRTaxComputation | null;

  // ── Save state ──
  dirty: DirtyMap;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: Date | null;
  saveTimerRef: ReturnType<typeof setTimeout> | null;

  // ── Actions ──
  loadReturn: (returnId: number) => Promise<void>;
  clearReturn: () => void;

  setSalary: (data: ScheduleSalary) => void;
  setHouseProperty: (data: ScheduleHP) => void;
  setOtherSources: (data: ScheduleOS) => void;
  setDeductions: (data: DeductionsChapterVIA) => void;
  setTDS: (data: ScheduleTDS) => void;
  setTaxPayments: (data: ScheduleTaxPayments) => void;
  setLTCG112A: (data: ScheduleLTCG112A) => void;
  setPresumptiveIncome: (data: SchedulePresumptiveIncome) => void;
  setVerification: (data: Verification) => void;

  saveSchedule: (key: ScheduleKey) => Promise<void>;
  saveAll: () => Promise<void>;

  recompute: () => void;
  markSaved: (key: ScheduleKey) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyDirty(): DirtyMap {
  return {
    salary: false,
    houseProperty: false,
    otherSources: false,
    deductions: false,
    tds: false,
    taxPayments: false,
    ltcg112A: false,
    presumptiveIncome: false,
    verification: false,
  };
}

function buildReturnData(state: ReturnState): ReturnData {
  const meta = state.meta;
  const base = emptyReturnData(
    meta?.formType ?? 'ITR-1',
    meta?.assessmentYear ?? '',
    meta?.regime ?? 'NEW'
  );
  return {
    ...base,
    filingSection: meta?.filingSection ?? '11',
    salary: state.salary,
    houseProperty: state.houseProperty,
    otherSources: state.otherSources,
    deductions: state.deductions,
    deductionsAllowed: state.deductions && state.summary
      ? applyDeductionCaps(state.deductions, state.summary.GrossTotalIncome)
      : null,
    tds: state.tds,
    taxPayments: state.taxPayments,
    ltcg112A: state.ltcg112A,
    presumptiveIncome: state.presumptiveIncome,
    incomeSummary: state.summary,
    taxComputation: state.taxComp,
    verification: state.verification,
  };
}

/** Derive IncomeSummary + ITRTaxComputation from current schedule state */
function recomputeFromState(state: Pick<
  ReturnState,
  'meta' | 'salary' | 'houseProperty' | 'otherSources' | 'deductions' |
  'tds' | 'taxPayments' | 'ltcg112A' | 'presumptiveIncome'
>): { summary: IncomeSummary; taxComp: ITRTaxComputation } {
  const rd = buildReturnData(state as ReturnState);
  const summary = computeIncomeSummary(rd);
  const taxComp = computeTaxLiability(summary, state.meta?.regime ?? 'NEW');
  return { summary, taxComp };
}

// ─── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_META: ReturnMeta = {
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

// ─── Store ────────────────────────────────────────────────────────────────────

export const useReturnStore = create<ReturnState>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ──
    meta: null,
    loading: false,
    loadError: null,

    salary: null,
    houseProperty: null,
    otherSources: null,
    deductions: null,
    tds: null,
    taxPayments: null,
    ltcg112A: null,
    presumptiveIncome: null,
    verification: null,

    summary: null,
    taxComp: null,

    dirty: emptyDirty(),
    saveStatus: 'idle',
    saveError: null,
    lastSavedAt: null,
    saveTimerRef: null,

    // ── Load ──────────────────────────────────────────────────────────────────

    loadReturn: async (returnId: number) => {
      set({ loading: true, loadError: null });
      try {
        if (typeof window.taxflow === 'undefined') {
          // Dev mock — simulate network delay
          await new Promise((r) => setTimeout(r, 400));
          const { summary, taxComp } = recomputeFromState({
            meta: MOCK_META,
            salary: null,
            houseProperty: null,
            otherSources: null,
            deductions: null,
            tds: null,
            taxPayments: null,
            ltcg112A: null,
            presumptiveIncome: null,
          });
          set({
            meta: MOCK_META,
            loading: false,
            summary,
            taxComp,
            dirty: emptyDirty(),
          });
          return;
        }

        const res = await window.taxflow.returns.get(returnId);
        if (!res.success || !res.data) {
          throw new Error(res.error ?? 'Failed to load return');
        }

        const r = res.data;
        const meta: ReturnMeta = {
          id: r.id,
          clientId: r.clientId,
          clientName: r.client?.fullName ?? '',
          clientPAN: r.client?.pan ?? '',
          formType: (r.formType ?? 'ITR-1') as ITRFormType,
          assessmentYear: r.assessmentYear?.ayLabel ?? '',
          regime: (r.assessmentYear?.regime ?? 'NEW') as TaxRegime,
          status: r.status,
          filingSection: (r.filingType === 'REVISED' ? '17' : '11') as FilingSection,
          filedAt: r.filedAt ?? undefined,
          acknowledgementNumber: r.acknowledgementNumber ?? undefined,
        };

        const newState = {
          meta,
          salary: (r.salarySchedule ?? null) as ScheduleSalary | null,
          houseProperty: (r.hpSchedule ?? null) as ScheduleHP | null,
          otherSources: (r.osSchedule ?? null) as ScheduleOS | null,
          deductions: (r.deductionSchedule ?? null) as DeductionsChapterVIA | null,
          tds: (r.tdsSchedule ?? null) as ScheduleTDS | null,
          taxPayments: (r.taxPaymentSchedule ?? null) as ScheduleTaxPayments | null,
          ltcg112A: (r.ltcg112ASchedule ?? null) as ScheduleLTCG112A | null,
          presumptiveIncome: (r.presumptiveSchedule ?? null) as SchedulePresumptiveIncome | null,
          verification: (r.verification ?? null) as Verification | null,
        };

        const { summary, taxComp } = recomputeFromState(newState);

        set({
          ...newState,
          summary,
          taxComp,
          loading: false,
          dirty: emptyDirty(),
        });
      } catch (e: unknown) {
        set({
          loading: false,
          loadError: e instanceof Error ? e.message : 'Failed to load return',
        });
      }
    },

    clearReturn: () => {
      set({
        meta: null,
        salary: null,
        houseProperty: null,
        otherSources: null,
        deductions: null,
        tds: null,
        taxPayments: null,
        ltcg112A: null,
        presumptiveIncome: null,
        verification: null,
        summary: null,
        taxComp: null,
        dirty: emptyDirty(),
        saveStatus: 'idle',
        saveError: null,
        loadError: null,
      });
    },

    // ── Schedule setters (mark dirty + trigger debounced recompute) ───────────

    setSalary: (data) => {
      set((s) => {
        const next = { ...s, salary: data, dirty: { ...s.dirty, salary: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('salary', get, set);
    },

    setHouseProperty: (data) => {
      set((s) => {
        const next = { ...s, houseProperty: data, dirty: { ...s.dirty, houseProperty: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('houseProperty', get, set);
    },

    setOtherSources: (data) => {
      set((s) => {
        const next = { ...s, otherSources: data, dirty: { ...s.dirty, otherSources: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('otherSources', get, set);
    },

    setDeductions: (data) => {
      set((s) => {
        const next = { ...s, deductions: data, dirty: { ...s.dirty, deductions: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('deductions', get, set);
    },

    setTDS: (data) => {
      set((s) => {
        const next = { ...s, tds: data, dirty: { ...s.dirty, tds: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('tds', get, set);
    },

    setTaxPayments: (data) => {
      set((s) => {
        const next = { ...s, taxPayments: data, dirty: { ...s.dirty, taxPayments: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('taxPayments', get, set);
    },

    setLTCG112A: (data) => {
      set((s) => {
        const next = { ...s, ltcg112A: data, dirty: { ...s.dirty, ltcg112A: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('ltcg112A', get, set);
    },

    setPresumptiveIncome: (data) => {
      set((s) => {
        const next = { ...s, presumptiveIncome: data, dirty: { ...s.dirty, presumptiveIncome: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('presumptiveIncome', get, set);
    },

    setVerification: (data) => {
      set((s) => ({ ...s, verification: data, dirty: { ...s.dirty, verification: true } }));
      scheduleSave('verification', get, set);
    },

    // ── Save ──────────────────────────────────────────────────────────────────

    saveSchedule: async (key: ScheduleKey) => {
      const state = get();
      if (!state.meta || typeof window.taxflow === 'undefined') {
        // Dev — just mark saved
        set((s) => ({
          dirty: { ...s.dirty, [key]: false },
          saveStatus: 'saved',
          lastSavedAt: new Date(),
        }));
        return;
      }

      set({ saveStatus: 'saving', saveError: null });

      try {
        const returnId = state.meta.id;

        switch (key) {
          case 'salary': {
            if (!state.salary) break;
            const res = await window.taxflow.returns.upsertSalary(returnId, state.salary);
            if (!res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
          case 'houseProperty': {
            if (!state.houseProperty) break;
            const res = await window.taxflow.returns.upsertHouseProperty?.(returnId, state.houseProperty);
            if (res && !res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
          case 'otherSources': {
            if (!state.otherSources) break;
            const res = await window.taxflow.returns.upsertOtherSources(returnId, state.otherSources);
            if (!res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
          case 'deductions': {
            if (!state.deductions) break;
            const res = await window.taxflow.returns.upsertDeductions(returnId, state.deductions);
            if (!res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
          case 'tds': {
            if (!state.tds) break;
            const res = await window.taxflow.returns.upsertTDS?.(returnId, state.tds);
            if (res && !res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
          case 'taxPayments': {
            if (!state.taxPayments) break;
            const res = await window.taxflow.returns.upsertTaxPayments?.(returnId, state.taxPayments);
            if (res && !res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
          case 'ltcg112A': {
            if (!state.ltcg112A) break;
            const res = await window.taxflow.returns.upsertLTCG112A?.(returnId, state.ltcg112A);
            if (res && !res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
          case 'presumptiveIncome': {
            if (!state.presumptiveIncome) break;
            const res = await window.taxflow.returns.upsertPresumptiveIncome?.(returnId, state.presumptiveIncome);
            if (res && !res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
          case 'verification': {
            if (!state.verification) break;
            const res = await window.taxflow.returns.upsertVerification?.(returnId, state.verification);
            if (res && !res.success) throw new Error(res.error ?? 'Save failed');
            break;
          }
        }

        set((s) => ({
          dirty: { ...s.dirty, [key]: false },
          saveStatus: 'saved',
          saveError: null,
          lastSavedAt: new Date(),
        }));

        // Reset save indicator after 2s
        setTimeout(() => {
          set((s) => (s.saveStatus === 'saved' ? { ...s, saveStatus: 'idle' } : s));
        }, 2000);

      } catch (e: unknown) {
        set({
          saveStatus: 'error',
          saveError: e instanceof Error ? e.message : 'Save failed',
        });
      }
    },

    saveAll: async () => {
      const state = get();
      const keys = Object.keys(state.dirty) as ScheduleKey[];
      const dirtyKeys = keys.filter((k) => state.dirty[k]);
      for (const key of dirtyKeys) {
        await get().saveSchedule(key);
      }
    },

    // ── Recompute (manual trigger) ────────────────────────────────────────────

    recompute: () => {
      const state = get();
      const { summary, taxComp } = recomputeFromState(state);
      set({ summary, taxComp });
    },

    markSaved: (key: ScheduleKey) => {
      set((s) => ({ dirty: { ...s.dirty, [key]: false } }));
    },
  }))
);

// ─── Debounced auto-save helper ───────────────────────────────────────────────

const saveTimers: Partial<Record<ScheduleKey, ReturnType<typeof setTimeout>>> = {};

function scheduleSave(
  key: ScheduleKey,
  get: () => ReturnState,
  set: (partial: Partial<ReturnState> | ((s: ReturnState) => Partial<ReturnState>)) => void
) {
  if (saveTimers[key]) clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => {
    get().saveSchedule(key);
  }, 1500);
}

// ─── Selectors ────────────────────────────────────────────────────────────────

/** Is any schedule dirty? */
export const selectIsAnyDirty = (s: ReturnState) =>
  Object.values(s.dirty).some(Boolean);

/** Total taxes paid (TDS + advance + self-assessment) */
export const selectTotalTaxesPaid = (s: ReturnState): number => {
  const tds = s.tds
    ? s.tds.TotalTDSOnSalaries +
      s.tds.TotalTDSOnOtherIncome +
      s.tds.TotalTDSOnRent +
      s.tds.TotalTCS
    : 0;
  const payments = s.taxPayments?.TotalTaxPaid ?? 0;
  return tds + payments;
};

/** Balance tax payable or refund due */
export const selectBalanceOrRefund = (
  s: ReturnState
): { type: 'payable' | 'refund' | 'nil'; amount: number } => {
  const taxLiability = s.taxComp?.GrossTaxLiability ?? 0;
  const paid = selectTotalTaxesPaid(s);
  const diff = taxLiability - paid;
  if (diff > 0) return { type: 'payable', amount: diff };
  if (diff < 0) return { type: 'refund', amount: Math.abs(diff) };
  return { type: 'nil', amount: 0 };
};

/** Whether the return is locked (filed/acknowledged) */
export const selectIsReadOnly = (s: ReturnState): boolean =>
  s.meta?.status === 'FILED' || s.meta?.status === 'ACKNOWLEDGED';

/** Whether salary schedule is applicable */
export const selectHasSalary = (s: ReturnState): boolean =>
  !!s.salary && s.salary.IncomeFromSalary > 0;

/** Whether HP schedule is applicable */
export const selectHasHP = (s: ReturnState): boolean =>
  !!s.houseProperty && (s.houseProperty.Properties?.length ?? 0) > 0;

/** Applicable tabs for this form type */
export const selectApplicableTabs = (s: ReturnState): string[] => {
  const formType = s.meta?.formType ?? 'ITR-1';
  const tabs = ['salary', 'other_sources', 'deductions', 'tds', 'tax_payments', 'tax_summary', 'verification'];
  if (formType !== 'ITR-4') tabs.splice(1, 0, 'house_property');
  if (formType === 'ITR-2') tabs.splice(tabs.indexOf('deductions'), 0, 'capital_gains');
  if (formType === 'ITR-4') tabs.splice(1, 0, 'presumptive_income');
  return tabs;
};

// ─── Convenience hooks ────────────────────────────────────────────────────────

export const useReturnMeta = () => useReturnStore((s) => s.meta);
export const useReturnSummary = () => useReturnStore((s) => s.summary);
export const useReturnTaxComp = () => useReturnStore((s) => s.taxComp);
export const useReturnSaveStatus = () => useReturnStore((s) => s.saveStatus);
export const useReturnDirty = () => useReturnStore((s) => s.dirty);
export const useIsReadOnly = () => useReturnStore(selectIsReadOnly);
export const useBalanceOrRefund = () => useReturnStore(selectBalanceOrRefund);
