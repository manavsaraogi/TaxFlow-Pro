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
  ScheduleSTCG,
  SchedulePresumptiveIncome,
  Verification,
  IncomeSummary,
  ITRTaxComputation,
  ITRFormType,
  TaxRegime,
  FilingSection,
} from '@/shared/types/itr';
import {
  computeIncomeSummary,
  computeTaxLiability,
  applyDeductionCaps,
} from '@/shared/utils/itrBuilder';

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
  | 'stcg'
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
  stcg: boolean;
  presumptiveIncome: boolean;
  verification: boolean;
}

interface ReturnState {
  meta: ReturnMeta | null;
  loading: boolean;
  loadError: string | null;

  salary: ScheduleSalary | null;
  houseProperty: ScheduleHP | null;
  otherSources: ScheduleOS | null;
  deductions: DeductionsChapterVIA | null;
  tds: ScheduleTDS | null;
  taxPayments: ScheduleTaxPayments | null;
  ltcg112A: ScheduleLTCG112A | null;
  stcg: ScheduleSTCG | null;
  presumptiveIncome: SchedulePresumptiveIncome | null;
  verification: Verification | null;

  summary: IncomeSummary | null;
  taxComp: ITRTaxComputation | null;

  dirty: DirtyMap;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: Date | null;
  saveTimerRef: ReturnType<typeof setTimeout> | null;

  loadReturn: (returnId: number) => Promise<void>;
  clearReturn: () => void;

  setSalary: (data: ScheduleSalary) => void;
  setHouseProperty: (data: ScheduleHP) => void;
  setOtherSources: (data: ScheduleOS) => void;
  setDeductions: (data: DeductionsChapterVIA) => void;
  setTDS: (data: ScheduleTDS) => void;
  setTaxPayments: (data: ScheduleTaxPayments) => void;
  setLTCG112A: (data: ScheduleLTCG112A) => void;
  setSTCG: (data: ScheduleSTCG) => void;
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
    stcg: false,
    presumptiveIncome: false,
    verification: false,
  };
}

function buildReturnData(state: ReturnState): ReturnData {
  const meta = state.meta;
  return {
    formType: meta?.formType ?? 'ITR-1',
    assessmentYear: meta?.assessmentYear ?? '',
    regime: meta?.regime ?? 'NEW',
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
    stcg: state.stcg,
    presumptiveIncome: state.presumptiveIncome,
    financialParticulars: null,
    incomeSummary: state.summary,
    taxComputation: state.taxComp,
    verification: state.verification,
  };
}

function recomputeFromState(state: Pick<
  ReturnState,
  'meta' | 'salary' | 'houseProperty' | 'otherSources' | 'deductions' |
  'tds' | 'taxPayments' | 'ltcg112A' | 'stcg' | 'presumptiveIncome'
>): { summary: IncomeSummary; taxComp: ITRTaxComputation } {
  const rd = buildReturnData(state as ReturnState);
  const summary = computeIncomeSummary(rd);
  const taxComp = computeTaxLiability(summary, state.meta?.regime ?? 'NEW');
  return { summary, taxComp };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useReturnStore = create<ReturnState>()(
  subscribeWithSelector((set, get) => ({
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
    stcg: null,
    presumptiveIncome: null,
    verification: null,

    summary: null,
    taxComp: null,

    dirty: emptyDirty(),
    saveStatus: 'idle',
    saveError: null,
    lastSavedAt: null,
    saveTimerRef: null,

    loadReturn: async (returnId) => {
      set({ loading: true, loadError: null });
      try {
        const res = await fetch(`/api/returns/${returnId}`);
        if (!res.ok) throw new Error('Failed to load return');
        const { data: r } = await res.json();

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
          houseProperty: (r.hpSchedule?.[0] ?? null) as ScheduleHP | null,
          otherSources: (r.osSchedule ?? null) as ScheduleOS | null,
          deductions: (r.deductionSchedule ?? null) as DeductionsChapterVIA | null,
          tds: r.tdsEntries?.length ? (r.tdsEntries as unknown as ScheduleTDS) : null,
          taxPayments: r.taxPayments?.length ? (r.taxPayments as unknown as ScheduleTaxPayments) : null,
          ltcg112A: r.ltcg112AEntries?.length ? (r.ltcg112AEntries as unknown as ScheduleLTCG112A) : null,
          stcg: r.stcgEntries?.length ? (r.stcgEntries as unknown as ScheduleSTCG) : null,
          presumptiveIncome: (r.presumptiveSchedule ?? null) as SchedulePresumptiveIncome | null,
          verification: (r.verification ?? null) as Verification | null,
        };

        const { summary, taxComp } = recomputeFromState(newState);

        set({ ...newState, summary, taxComp, loading: false, dirty: emptyDirty() });
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
        stcg: null,
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

    setSTCG: (data) => {
      set((s) => {
        const next = { ...s, stcg: data, dirty: { ...s.dirty, stcg: true } };
        const { summary, taxComp } = recomputeFromState(next);
        return { ...next, summary, taxComp };
      });
      scheduleSave('stcg', get, set);
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

    saveSchedule: async (key) => {
      const state = get();
      if (!state.meta) return;

      set({ saveStatus: 'saving', saveError: null });

      try {
        const returnId = state.meta.id;
        const payload = state[key as keyof ReturnState];

        const res = await fetch(`/api/returns/${returnId}/schedule/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error ?? 'Save failed');
        }

        set((s) => ({
          dirty: { ...s.dirty, [key]: false },
          saveStatus: 'saved',
          saveError: null,
          lastSavedAt: new Date(),
        }));

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

    recompute: () => {
      const state = get();
      const { summary, taxComp } = recomputeFromState(state);
      set({ summary, taxComp });
    },

    markSaved: (key) => {
      set((s) => ({ dirty: { ...s.dirty, [key]: false } }));
    },
  }))
);

// ─── Debounced auto-save ──────────────────────────────────────────────────────

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

export const selectIsAnyDirty = (s: ReturnState) =>
  Object.values(s.dirty).some(Boolean);

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

export const selectIsReadOnly = (s: ReturnState): boolean =>
  s.meta?.status === 'FILED' || s.meta?.status === 'ACKNOWLEDGED';

export const selectHasSalary = (s: ReturnState): boolean =>
  !!s.salary && s.salary.IncomeFromSalary > 0;

export const selectHasHP = (s: ReturnState): boolean =>
  !!s.houseProperty && (s.houseProperty.Properties?.length ?? 0) > 0;

export const selectApplicableTabs = (s: ReturnState): string[] => {
  const formType = s.meta?.formType ?? 'ITR-1';
  const tabs = ['salary', 'other_sources', 'deductions', 'tds', 'tax_payments', 'tax_summary', 'verification'];
  if (formType !== 'ITR-4') tabs.splice(1, 0, 'house_property');
  if (formType === 'ITR-2') tabs.splice(tabs.indexOf('deductions'), 0, 'capital_gains');
  if (formType === 'ITR-4') tabs.splice(1, 0, 'presumptive_income');
  return tabs;
};

export const useReturnMeta = () => useReturnStore((s) => s.meta);
export const useReturnSummary = () => useReturnStore((s) => s.summary);
export const useReturnTaxComp = () => useReturnStore((s) => s.taxComp);
export const useReturnSaveStatus = () => useReturnStore((s) => s.saveStatus);
export const useReturnDirty = () => useReturnStore((s) => s.dirty);
export const useIsReadOnly = () => useReturnStore(selectIsReadOnly);
export const useBalanceOrRefund = () => useReturnStore(selectBalanceOrRefund);
