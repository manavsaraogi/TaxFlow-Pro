'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type AssetType = 'CRYPTOCURRENCY' | 'NFT' | 'OTHER_VDA';

interface VDAEntry {
  id: string;
  assetType: AssetType;
  assetName: string;
  dateOfAcquisition: string;
  dateOfTransfer: string;
  costOfAcquisition: number;
  saleConsideration: number;
}

interface VDAState {
  entries: VDAEntry[];
}

function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(2)} L`;
  return `₹${abs.toLocaleString('en-IN')}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyEntry(): VDAEntry {
  return { id: uid(), assetType: 'CRYPTOCURRENCY', assetName: '', dateOfAcquisition: '', dateOfTransfer: '', costOfAcquisition: 0, saleConsideration: 0 };
}

const INP_SM = 'border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 bg-white w-full';
const INP_NUM = 'border border-gray-200 rounded px-1.5 py-1 text-xs text-right focus:outline-none focus:border-blue-400 bg-white w-28';

interface Props {
  returnId: number;
  initialData?: Partial<VDAState> | null;
  onSaved?: (data: VDAState) => void;
}

export default function ITR5VDA({ returnId, initialData, onSaved }: Props) {
  const [state, setState] = useState<VDAState>({ entries: initialData?.entries ?? [] });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback(async (data: VDAState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5VDA`, {
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

  const schedule = useCallback((data: VDAState) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(data), 1500);
  }, [save]);

  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); save(stateRef.current); }
  }, [save]);

  function update(id: string, field: keyof VDAEntry, value: string | number) {
    setState(prev => {
      const entries = prev.entries.map(e => e.id === id ? { ...e, [field]: field === 'costOfAcquisition' || field === 'saleConsideration' ? Math.round(Number(String(value).replace(/,/g, '')) || 0) : value } : e);
      const next = { entries };
      schedule(next);
      return next;
    });
  }

  function addEntry() {
    setState(prev => {
      const next = { entries: [...prev.entries, emptyEntry()] };
      schedule(next);
      return next;
    });
  }

  function removeEntry(id: string) {
    setState(prev => {
      const next = { entries: prev.entries.filter(e => e.id !== id) };
      schedule(next);
      return next;
    });
  }

  const computeIncome = (e: VDAEntry) => Math.max(0, e.saleConsideration - e.costOfAcquisition);
  const totalIncome = state.entries.reduce((s, e) => s + computeIncome(e), 0);

  const ASSET_LABELS: Record<AssetType, string> = {
    CRYPTOCURRENCY: 'Cryptocurrency',
    NFT: 'NFT',
    OTHER_VDA: 'Other VDA',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Schedule VDA — Virtual Digital Assets</span>
        {saving && <span className="text-xs text-amber-600">Saving…</span>}
        {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt}</span>}
      </div>

      {/* Info banner */}
      <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-1">
        <div><strong>u/s 115BBH:</strong> Income from VDA is taxed at flat 30% (+ surcharge + cess). No deduction except cost of acquisition.</div>
        <div>Loss from VDA transfer cannot be set off against any other income or carried forward.</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">VDA Transactions ({state.entries.length})</span>
          <button
            onClick={addEntry}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            + Add Transaction
          </button>
        </div>

        {state.entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No VDA transactions added yet. Click &quot;Add Transaction&quot; to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-2 px-2 text-left font-semibold text-gray-500">#</th>
                  <th className="py-2 px-2 text-left font-semibold text-gray-500">Type</th>
                  <th className="py-2 px-2 text-left font-semibold text-gray-500">Asset Name</th>
                  <th className="py-2 px-2 text-left font-semibold text-gray-500">Date of Acquisition</th>
                  <th className="py-2 px-2 text-left font-semibold text-gray-500">Date of Transfer</th>
                  <th className="py-2 px-2 text-right font-semibold text-gray-500">Cost (₹)</th>
                  <th className="py-2 px-2 text-right font-semibold text-gray-500">Sale (₹)</th>
                  <th className="py-2 px-2 text-right font-semibold text-gray-500">Income (₹)</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {state.entries.map((entry, idx) => {
                  const income = computeIncome(entry);
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50 border-b border-gray-100">
                      <td className="py-2 px-2 text-gray-400">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <select
                          className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 bg-white"
                          value={entry.assetType}
                          onChange={e => update(entry.id, 'assetType', e.target.value)}
                        >
                          {(Object.keys(ASSET_LABELS) as AssetType[]).map(k => (
                            <option key={k} value={k}>{ASSET_LABELS[k]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input className={INP_SM} type="text" placeholder="e.g. Bitcoin"
                          value={entry.assetName} onChange={e => update(entry.id, 'assetName', e.target.value)} />
                      </td>
                      <td className="py-2 px-2">
                        <input className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 bg-white"
                          type="date" value={entry.dateOfAcquisition}
                          onChange={e => update(entry.id, 'dateOfAcquisition', e.target.value)} />
                      </td>
                      <td className="py-2 px-2">
                        <input className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 bg-white"
                          type="date" value={entry.dateOfTransfer}
                          onChange={e => update(entry.id, 'dateOfTransfer', e.target.value)} />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input className={INP_NUM} type="number" min={0} placeholder="0"
                          value={entry.costOfAcquisition || ''}
                          onChange={e => update(entry.id, 'costOfAcquisition', e.target.value)} />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input className={INP_NUM} type="number" min={0} placeholder="0"
                          value={entry.saleConsideration || ''}
                          onChange={e => update(entry.id, 'saleConsideration', e.target.value)} />
                      </td>
                      <td className={`py-2 px-2 text-right font-semibold ${income > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                        {fmt(income)}
                      </td>
                      <td className="py-2 px-2">
                        <button onClick={() => removeEntry(entry.id)}
                          className="text-red-400 hover:text-red-600 transition-colors text-xs px-1">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-200">
                  <td colSpan={7} className="py-3 px-4 text-sm font-bold text-gray-800 text-right">Total VDA Income (taxable @ 30%)</td>
                  <td className="py-3 px-2 text-right text-sm font-bold text-blue-700">{fmt(totalIncome)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
