'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface CFLYearRow {
  ay: string;
  housePropertyLoss: number;
  nonSpeculativeBusinessLoss: number;
  speculativeBusinessLoss: number;
  specifiedBusinessLoss: number;
  ltcgLoss: number;
  stcgLoss: number;
  unabsorbedDepreciation: number;
}

interface CurrentYearLosses {
  houseProperty: number;
  nonSpeculativeBusiness: number;
  speculativeBusiness: number;
  specifiedBusiness: number;
  ltcg: number;
  stcg: number;
  unabsorbedDepreciation: number;
}

interface CFLState {
  rows: CFLYearRow[];
  currentYearLosses: CurrentYearLosses;
}

const AY_LIST = ['2019-20','2020-21','2021-22','2022-23','2023-24','2024-25','2025-26','2026-27'];

function makeEmptyRow(ay: string): CFLYearRow {
  return { ay, housePropertyLoss: 0, nonSpeculativeBusinessLoss: 0, speculativeBusinessLoss: 0, specifiedBusinessLoss: 0, ltcgLoss: 0, stcgLoss: 0, unabsorbedDepreciation: 0 };
}

const DEFAULT_STATE: CFLState = {
  rows: AY_LIST.map(makeEmptyRow),
  currentYearLosses: { houseProperty: 0, nonSpeculativeBusiness: 0, speculativeBusiness: 0, specifiedBusiness: 0, ltcg: 0, stcg: 0, unabsorbedDepreciation: 0 },
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

const CELL_INP = 'w-28 border border-gray-200 rounded px-1.5 py-1 text-xs text-right focus:outline-none focus:border-blue-400 bg-white';
const CY_INP = 'w-44 border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-blue-400 bg-white';

const COL_HEADERS = [
  { key: 'housePropertyLoss', label: 'HP Loss' },
  { key: 'nonSpeculativeBusinessLoss', label: 'Business Loss (Non-Spec)' },
  { key: 'speculativeBusinessLoss', label: 'Business Loss (Spec)' },
  { key: 'specifiedBusinessLoss', label: 'Specified Business (35AD)' },
  { key: 'ltcgLoss', label: 'LTCG Loss' },
  { key: 'stcgLoss', label: 'STCG Loss' },
  { key: 'unabsorbedDepreciation', label: 'Unabsorbed Depreciation' },
] as const;

const CY_ROWS: { key: keyof CurrentYearLosses; label: string }[] = [
  { key: 'houseProperty', label: 'House Property Loss' },
  { key: 'nonSpeculativeBusiness', label: 'Non-Speculative Business Loss' },
  { key: 'speculativeBusiness', label: 'Speculative Business Loss' },
  { key: 'specifiedBusiness', label: 'Specified Business Loss u/s 35AD' },
  { key: 'ltcg', label: 'Long-Term Capital Loss' },
  { key: 'stcg', label: 'Short-Term Capital Loss' },
  { key: 'unabsorbedDepreciation', label: 'Unabsorbed Depreciation' },
];

interface Props {
  returnId: number;
  initialData?: Partial<CFLState> | null;
  onSaved?: (data: CFLState) => void;
}

export default function ITR5CFL({ returnId, initialData, onSaved }: Props) {
  const merged: CFLState = {
    rows: initialData?.rows ?? DEFAULT_STATE.rows,
    currentYearLosses: { ...DEFAULT_STATE.currentYearLosses, ...initialData?.currentYearLosses },
  };
  const [state, setState] = useState<CFLState>(merged);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback(async (data: CFLState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5CFL`, {
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

  const schedule = useCallback((data: CFLState) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(data), 1500);
  }, [save]);

  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); save(stateRef.current); }
  }, [save]);

  function setRowField(ayIdx: number, field: keyof CFLYearRow, val: string) {
    if (field === 'ay') return;
    setState(prev => {
      const rows = prev.rows.map((r, i) => i === ayIdx ? { ...r, [field]: Math.round(Number(val.replace(/,/g, '')) || 0) } : r);
      const next = { ...prev, rows };
      schedule(next);
      return next;
    });
  }

  function setCY(field: keyof CurrentYearLosses, val: string) {
    setState(prev => {
      const next = { ...prev, currentYearLosses: { ...prev.currentYearLosses, [field]: Math.round(Number(val.replace(/,/g, '')) || 0) } };
      schedule(next);
      return next;
    });
  }

  // Column totals
  const colTotals = COL_HEADERS.reduce((acc, col) => {
    acc[col.key] = state.rows.reduce((s, r) => s + (r[col.key] as number), 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Schedule CFL — Carry Forward of Losses</span>
        {saving && <span className="text-xs text-amber-600">Saving…</span>}
        {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt}</span>}
      </div>

      {/* Current Year Losses */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Current Year Losses (being carried forward)</span>
        </div>
        <table className="w-full border-collapse"><tbody>
          {CY_ROWS.map(({ key, label }) => (
            <tr key={key} className="hover:bg-gray-50 border-b border-gray-100">
              <td className="py-2 px-4 text-sm text-gray-700">{label}</td>
              <td className="py-2 px-4 text-right">
                <input className={CY_INP} type="number" min={0}
                  value={state.currentYearLosses[key] || ''} placeholder="0"
                  onChange={e => setCY(key, e.target.value)} />
              </td>
              <td className="py-2 px-4 text-xs text-gray-400 text-right w-32">{fmt(state.currentYearLosses[key])}</td>
            </tr>
          ))}
        </tbody></table>
      </div>

      {/* Brought Forward Losses Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Brought Forward Losses from Earlier Years</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-2 px-3 text-left font-semibold text-gray-500 whitespace-nowrap">AY</th>
                {COL_HEADERS.map(col => (
                  <th key={col.key} className="py-2 px-2 text-right font-semibold text-gray-500 whitespace-nowrap">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, idx) => (
                <tr key={row.ay} className="hover:bg-gray-50 border-b border-gray-100">
                  <td className="py-1.5 px-3 font-medium text-gray-700 whitespace-nowrap">{row.ay}</td>
                  {COL_HEADERS.map(col => (
                    <td key={col.key} className="py-1.5 px-2 text-right">
                      <input className={CELL_INP} type="number" min={0}
                        value={(row[col.key] as number) || ''} placeholder="0"
                        onChange={e => setRowField(idx, col.key, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-blue-50 border-t-2 border-blue-200 font-semibold">
                <td className="py-2 px-3 text-xs text-blue-800">Total</td>
                {COL_HEADERS.map(col => (
                  <td key={col.key} className="py-2 px-2 text-right text-xs text-blue-700">{fmt(colTotals[col.key])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          Enter losses from each assessment year that are being carried forward to future years. Losses can be carried forward for 8 years (except unabsorbed depreciation which can be carried forward indefinitely).
        </div>
      </div>
    </div>
  );
}
