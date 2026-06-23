'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface OIState {
  relatedPartyPayments: number;
  paymentsCash269ST: number;
  csrRequired: boolean;
  csrPrescribedAmount: number;
  csrActualSpent: number;
  deemedDividend: number;
  receiptsCash: number;
  auditedOtherLaw: boolean;
  otherLawAuditName: string;
  otherLawAuditDate: string;
  dtaaBenefit: boolean;
  dtaaCountry: string;
  dtaaArticle: string;
  turnoverAsPerGST: number;
  turnoverAsPerBooks: number;
  previousYearPresumptive44AD: boolean;
  previousYearPresumptive44ADA: boolean;
}

const ZERO: OIState = {
  relatedPartyPayments: 0,
  paymentsCash269ST: 0,
  csrRequired: false,
  csrPrescribedAmount: 0,
  csrActualSpent: 0,
  deemedDividend: 0,
  receiptsCash: 0,
  auditedOtherLaw: false,
  otherLawAuditName: '',
  otherLawAuditDate: '',
  dtaaBenefit: false,
  dtaaCountry: '',
  dtaaArticle: '',
  turnoverAsPerGST: 0,
  turnoverAsPerBooks: 0,
  previousYearPresumptive44AD: false,
  previousYearPresumptive44ADA: false,
};

function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  const s = n < 0 ? '(' : '';
  const e = n < 0 ? ')' : '';
  if (abs >= 10000000) return `${s}₹${(abs / 10000000).toFixed(2)} Cr${e}`;
  if (abs >= 100000) return `${s}₹${(abs / 100000).toFixed(2)} L${e}`;
  return `${s}₹${abs.toLocaleString('en-IN')}${e}`;
}

const INP = 'w-44 border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-blue-400 bg-white';
const TEXT_INP = 'w-64 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 bg-white';

interface Props {
  returnId: number;
  initialData?: Partial<OIState> | null;
  onSaved?: (data: OIState) => void;
}

export default function ITR5OI({ returnId, initialData, onSaved }: Props) {
  const [state, setState] = useState<OIState>({ ...ZERO, ...initialData });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback(async (data: OIState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5OI`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const now = new Date();
      setSavedAt(`${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`);
      onSaved?.(data);
    } finally {
      setSaving(false);
    }
  }, [returnId, onSaved]);

  const schedule = useCallback((data: OIState) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(data), 1500);
  }, [save]);

  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); save(stateRef.current); }
  }, [save]);

  function set<K extends keyof OIState>(key: K, value: OIState[K]) {
    setState(prev => {
      const next = { ...prev, [key]: value };
      schedule(next);
      return next;
    });
  }

  function num(key: keyof OIState, val: string) {
    set(key as keyof OIState, Math.round(Number(val.replace(/,/g, '')) || 0) as OIState[typeof key]);
  }

  const csrExcess = Math.max(0, state.csrPrescribedAmount - state.csrActualSpent);
  const gstDiff = state.turnoverAsPerBooks - state.turnoverAsPerGST;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Part A-OI — Other Information</span>
        {saving && <span className="text-xs text-amber-600">Saving…</span>}
        {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt}</span>}
      </div>

      {/* Related Party Payments */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Payments to Related Parties u/s 40A(2)(b)</span>
        </div>
        <table className="w-full border-collapse"><tbody>
          <tr className="hover:bg-gray-50">
            <td className="py-2 px-4 text-sm text-gray-700">Total payments to persons covered u/s 40A(2)(b)</td>
            <td className="py-2 px-4 text-right">
              <input className={INP} type="number" min={0} value={state.relatedPartyPayments || ''} placeholder="0"
                onChange={e => num('relatedPartyPayments', e.target.value)} />
            </td>
            <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state.relatedPartyPayments)}</td>
          </tr>
        </tbody></table>
      </div>

      {/* Cash Payments u/s 269ST */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Cash Receipts u/s 269ST</span>
        </div>
        <table className="w-full border-collapse"><tbody>
          <tr className="hover:bg-gray-50">
            <td className="py-2 px-4 text-sm text-gray-700">Aggregate cash receipts ≥ ₹2L from any single person</td>
            <td className="py-2 px-4 text-right">
              <input className={INP} type="number" min={0} value={state.paymentsCash269ST || ''} placeholder="0"
                onChange={e => num('paymentsCash269ST', e.target.value)} />
            </td>
            <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state.paymentsCash269ST)}</td>
          </tr>
        </tbody></table>
      </div>

      {/* Corporate Social Responsibility */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Corporate Social Responsibility (CSR)</span>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={state.csrRequired} onChange={e => set('csrRequired', e.target.checked)} className="rounded" />
            CSR mandatory for this entity
          </label>
        </div>
        {state.csrRequired && (
          <table className="w-full border-collapse"><tbody>
            <tr className="hover:bg-gray-50">
              <td className="py-2 px-4 text-sm text-gray-700">Prescribed CSR amount required to be spent</td>
              <td className="py-2 px-4 text-right">
                <input className={INP} type="number" min={0} value={state.csrPrescribedAmount || ''} placeholder="0"
                  onChange={e => num('csrPrescribedAmount', e.target.value)} />
              </td>
              <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state.csrPrescribedAmount)}</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="py-2 px-4 text-sm text-gray-700">Actual CSR amount spent</td>
              <td className="py-2 px-4 text-right">
                <input className={INP} type="number" min={0} value={state.csrActualSpent || ''} placeholder="0"
                  onChange={e => num('csrActualSpent', e.target.value)} />
              </td>
              <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state.csrActualSpent)}</td>
            </tr>
            <tr className="bg-blue-50">
              <td className="py-2 px-4 text-sm font-medium text-gray-700">Unspent CSR amount (auto)</td>
              <td className="py-2 px-4 text-right text-sm font-semibold text-blue-700">{fmt(csrExcess)}</td>
              <td></td>
            </tr>
          </tbody></table>
        )}
        {!state.csrRequired && (
          <div className="px-4 py-3 text-xs text-gray-400">CSR reporting not applicable — toggle above if mandatory.</div>
        )}
      </div>

      {/* Deemed Dividend & Cash Receipts */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Deemed Dividend & Cash Receipts</span>
        </div>
        <table className="w-full border-collapse"><tbody>
          <tr className="hover:bg-gray-50">
            <td className="py-2 px-4 text-sm text-gray-700">Deemed dividend u/s 2(22)(e)</td>
            <td className="py-2 px-4 text-right">
              <input className={INP} type="number" min={0} value={state.deemedDividend || ''} placeholder="0"
                onChange={e => num('deemedDividend', e.target.value)} />
            </td>
            <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state.deemedDividend)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="py-2 px-4 text-sm text-gray-700">Receipts in cash or bearer instruments</td>
            <td className="py-2 px-4 text-right">
              <input className={INP} type="number" min={0} value={state.receiptsCash || ''} placeholder="0"
                onChange={e => num('receiptsCash', e.target.value)} />
            </td>
            <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state.receiptsCash)}</td>
          </tr>
        </tbody></table>
      </div>

      {/* Audit under other law */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Audit under Any Other Law (not u/s 44AB)</span>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={state.auditedOtherLaw} onChange={e => set('auditedOtherLaw', e.target.checked)} className="rounded" />
            Books audited under another law
          </label>
        </div>
        {state.auditedOtherLaw && (
          <table className="w-full border-collapse"><tbody>
            <tr className="hover:bg-gray-50">
              <td className="py-2 px-4 text-sm text-gray-700">Name of the Act</td>
              <td className="py-2 px-4 text-right">
                <input className={TEXT_INP} type="text" value={state.otherLawAuditName}
                  placeholder="e.g. Companies Act 2013"
                  onChange={e => set('otherLawAuditName', e.target.value)} />
              </td>
              <td></td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="py-2 px-4 text-sm text-gray-700">Date of audit report</td>
              <td className="py-2 px-4 text-right">
                <input className={TEXT_INP} type="date" value={state.otherLawAuditDate}
                  onChange={e => set('otherLawAuditDate', e.target.value)} />
              </td>
              <td></td>
            </tr>
          </tbody></table>
        )}
      </div>

      {/* DTAA */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Double Taxation Avoidance Agreement (DTAA)</span>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={state.dtaaBenefit} onChange={e => set('dtaaBenefit', e.target.checked)} className="rounded" />
            DTAA relief claimed
          </label>
        </div>
        {state.dtaaBenefit && (
          <table className="w-full border-collapse"><tbody>
            <tr className="hover:bg-gray-50">
              <td className="py-2 px-4 text-sm text-gray-700">Country</td>
              <td className="py-2 px-4 text-right">
                <input className={TEXT_INP} type="text" value={state.dtaaCountry}
                  placeholder="e.g. USA"
                  onChange={e => set('dtaaCountry', e.target.value)} />
              </td>
              <td></td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="py-2 px-4 text-sm text-gray-700">Article of DTAA</td>
              <td className="py-2 px-4 text-right">
                <input className={TEXT_INP} type="text" value={state.dtaaArticle}
                  placeholder="e.g. Article 7"
                  onChange={e => set('dtaaArticle', e.target.value)} />
              </td>
              <td></td>
            </tr>
          </tbody></table>
        )}
      </div>

      {/* GST Reconciliation */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">GST Turnover Reconciliation (GSTR-3B)</span>
        </div>
        <table className="w-full border-collapse"><tbody>
          <tr className="hover:bg-gray-50">
            <td className="py-2 px-4 text-sm text-gray-700">Turnover as per GSTR-3B</td>
            <td className="py-2 px-4 text-right">
              <input className={INP} type="number" min={0} value={state.turnoverAsPerGST || ''} placeholder="0"
                onChange={e => num('turnoverAsPerGST', e.target.value)} />
            </td>
            <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state.turnoverAsPerGST)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="py-2 px-4 text-sm text-gray-700">Turnover as per books of accounts</td>
            <td className="py-2 px-4 text-right">
              <input className={INP} type="number" min={0} value={state.turnoverAsPerBooks || ''} placeholder="0"
                onChange={e => num('turnoverAsPerBooks', e.target.value)} />
            </td>
            <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state.turnoverAsPerBooks)}</td>
          </tr>
          <tr className="bg-blue-50">
            <td className="py-2 px-4 text-sm font-medium text-gray-700">Reconciliation difference (Books − GST)</td>
            <td className="py-2 px-4 text-right text-sm font-semibold text-blue-700">{fmt(gstDiff)}</td>
            <td></td>
          </tr>
        </tbody></table>
      </div>

      {/* Presumptive income history */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Presumptive Income — Prior Year Declarations</span>
        </div>
        <div className="px-4 py-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={state.previousYearPresumptive44AD}
              onChange={e => set('previousYearPresumptive44AD', e.target.checked)} className="rounded" />
            Declared presumptive income u/s 44AD in any of the previous 5 assessment years
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={state.previousYearPresumptive44ADA}
              onChange={e => set('previousYearPresumptive44ADA', e.target.checked)} className="rounded" />
            Declared presumptive income u/s 44ADA in any of the previous 5 assessment years
          </label>
        </div>
      </div>
    </div>
  );
}
