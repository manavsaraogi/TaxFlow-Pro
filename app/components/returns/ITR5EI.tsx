'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface EIState {
  agriculturalIncome: number;
  housePropertyIncome: number;
  shareFromFirm: number;
  shareFromAOP: number;
  dividendIncome: number;
  interestOnGovtSec: number;
  educationalInstitutionIncome: number;
  charitableTrustIncome: number;
  mutualFundIncome: number;
  infrastructureBondInterest: number;
  ppfInterest: number;
  gratuityExempt: number;
  otherExemptIncome: number;
}

const ZERO: EIState = {
  agriculturalIncome: 0,
  housePropertyIncome: 0,
  shareFromFirm: 0,
  shareFromAOP: 0,
  dividendIncome: 0,
  interestOnGovtSec: 0,
  educationalInstitutionIncome: 0,
  charitableTrustIncome: 0,
  mutualFundIncome: 0,
  infrastructureBondInterest: 0,
  ppfInterest: 0,
  gratuityExempt: 0,
  otherExemptIncome: 0,
};

const ROWS: { key: keyof EIState; label: string; section: string }[] = [
  { key: 'agriculturalIncome', label: 'Agricultural income', section: 'u/s 10(1)' },
  { key: 'housePropertyIncome', label: 'Income from self-occupied property (HP loss set aside)', section: 'u/s 22' },
  { key: 'shareFromFirm', label: 'Share of profit from a firm', section: 'u/s 10(2A)' },
  { key: 'shareFromAOP', label: 'Share of profit from AOP / BOI', section: 'u/s 86' },
  { key: 'dividendIncome', label: 'Dividend from domestic company (pre-AY 2022)', section: 'u/s 10(34)' },
  { key: 'interestOnGovtSec', label: 'Interest on Government securities', section: 'u/s 10(15)' },
  { key: 'educationalInstitutionIncome', label: 'Income of educational institution', section: 'u/s 10(23C)' },
  { key: 'charitableTrustIncome', label: 'Income of charitable / religious trust', section: 'u/s 11/12/13' },
  { key: 'mutualFundIncome', label: 'Income from specified mutual funds', section: 'u/s 10(35)' },
  { key: 'infrastructureBondInterest', label: 'Interest on infrastructure bonds', section: 'u/s 10(15)(iv)(h)' },
  { key: 'ppfInterest', label: 'PPF / PF interest and maturity', section: 'u/s 10(11)/10(12)' },
  { key: 'gratuityExempt', label: 'Exempt gratuity', section: 'u/s 10(10)' },
  { key: 'otherExemptIncome', label: 'Any other exempt income', section: 'u/s 10 (others)' },
];

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

interface Props {
  returnId: number;
  initialData?: Partial<EIState> | null;
  onSaved?: (data: EIState) => void;
}

export default function ITR5EI({ returnId, initialData, onSaved }: Props) {
  const [state, setState] = useState<EIState>({ ...ZERO, ...initialData });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback(async (data: EIState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5EI`, {
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

  const schedule = useCallback((data: EIState) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(data), 1500);
  }, [save]);

  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); save(stateRef.current); }
  }, [save]);

  function num(key: keyof EIState, val: string) {
    setState(prev => {
      const next = { ...prev, [key]: Math.round(Number(val.replace(/,/g, '')) || 0) };
      schedule(next);
      return next;
    });
  }

  const total = Object.values(state).reduce((s, v) => s + (v as number), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Schedule EI — Exempt Income</span>
        {saving && <span className="text-xs text-amber-600">Saving…</span>}
        {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt}</span>}
      </div>

      {/* Note */}
      <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
        These amounts do NOT form part of Total Income but are reported for disclosure purposes.
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Exempt Income Items</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-left">Description</th>
              <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-center">Section</th>
              <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-right">Amount (₹)</th>
              <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-right w-32"></th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, label, section }) => (
              <tr key={key} className="hover:bg-gray-50 border-b border-gray-100">
                <td className="py-2 px-4 text-sm text-gray-700">{label}</td>
                <td className="py-2 px-4 text-xs text-center">
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">{section}</span>
                </td>
                <td className="py-2 px-4 text-right">
                  <input className={INP} type="number" min={0} value={(state[key] as number) || ''} placeholder="0"
                    onChange={e => num(key, e.target.value)} />
                </td>
                <td className="py-2 px-4 text-xs text-gray-400 text-right">{fmt(state[key] as number)}</td>
              </tr>
            ))}
            <tr className="bg-blue-50 border-t-2 border-blue-200">
              <td className="py-3 px-4 text-sm font-bold text-gray-800" colSpan={2}>Total Exempt Income</td>
              <td className="py-3 px-4 text-right text-sm font-bold text-blue-700">{fmt(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
