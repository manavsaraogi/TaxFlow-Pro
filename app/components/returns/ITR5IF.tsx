'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FirmEntry {
  id: string;
  firmName: string;
  firmPAN: string;
  firmRegistrationNo: string;
  firmAddress: string;
  isRegistered: boolean;
  shareOfProfit: number;
  salaryReceived: number;
  interestReceived: number;
  commissionReceived: number;
  bonusReceived: number;
}

interface IFState {
  isFirmOrLLP: boolean;
  partnerInFirms: FirmEntry[];
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

function emptyFirm(): FirmEntry {
  return { id: uid(), firmName: '', firmPAN: '', firmRegistrationNo: '', firmAddress: '', isRegistered: true, shareOfProfit: 0, salaryReceived: 0, interestReceived: 0, commissionReceived: 0, bonusReceived: 0 };
}

function totalFromFirm(f: FirmEntry) {
  return f.salaryReceived + f.interestReceived + f.commissionReceived + f.bonusReceived;
}

const INP_TEXT = 'border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 bg-white w-full';
const INP_NUM = 'w-44 border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-blue-400 bg-white';

interface Props {
  returnId: number;
  initialData?: Partial<IFState> | null;
  onSaved?: (data: IFState) => void;
}

export default function ITR5IF({ returnId, initialData, onSaved }: Props) {
  const [state, setState] = useState<IFState>({
    isFirmOrLLP: initialData?.isFirmOrLLP ?? false,
    partnerInFirms: initialData?.partnerInFirms ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback(async (data: IFState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5IF`, {
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

  const schedule = useCallback((data: IFState) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(data), 1500);
  }, [save]);

  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); save(stateRef.current); }
  }, [save]);

  function updateFirm(id: string, field: keyof FirmEntry, value: string | number | boolean) {
    setState(prev => {
      const partnerInFirms = prev.partnerInFirms.map(f => {
        if (f.id !== id) return f;
        const numFields: (keyof FirmEntry)[] = ['shareOfProfit','salaryReceived','interestReceived','commissionReceived','bonusReceived'];
        if (numFields.includes(field)) {
          return { ...f, [field]: Math.round(Number(String(value).replace(/,/g,'')) || 0) };
        }
        return { ...f, [field]: value };
      });
      const next = { ...prev, partnerInFirms };
      schedule(next);
      return next;
    });
  }

  function addFirm() {
    setState(prev => {
      const next = { ...prev, partnerInFirms: [...prev.partnerInFirms, emptyFirm()] };
      schedule(next);
      return next;
    });
  }

  function removeFirm(id: string) {
    setState(prev => {
      const next = { ...prev, partnerInFirms: prev.partnerInFirms.filter(f => f.id !== id) };
      schedule(next);
      return next;
    });
  }

  function setMeta(field: keyof IFState, value: boolean) {
    setState(prev => {
      const next = { ...prev, [field]: value };
      schedule(next);
      return next;
    });
  }

  const grandTotal = state.partnerInFirms.reduce((s, f) => s + totalFromFirm(f), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Schedule IF — Information of Firms (as Partner)</span>
        {saving && <span className="text-xs text-amber-600">Saving…</span>}
        {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt}</span>}
      </div>

      {/* Entity type note */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Entity Status</span>
        </div>
        <div className="px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={state.isFirmOrLLP}
              onChange={e => setMeta('isFirmOrLLP', e.target.checked)} className="rounded" />
            This entity is itself a Firm / LLP (filing as a firm that is also a partner elsewhere)
          </label>
        </div>
      </div>

      {/* Firms table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Firms in which this entity is a Partner ({state.partnerInFirms.length})</span>
          <button onClick={addFirm} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            + Add Firm
          </button>
        </div>

        {state.partnerInFirms.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No firms added yet. Click &quot;Add Firm&quot; to begin.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {state.partnerInFirms.map((firm, idx) => {
              const total = totalFromFirm(firm);
              return (
                <div key={firm.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Firm {idx + 1}</span>
                    <button onClick={() => removeFirm(firm.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 border border-red-200 rounded">
                      Remove
                    </button>
                  </div>

                  {/* Firm details grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Firm Name</label>
                      <input className={INP_TEXT} type="text" placeholder="Name of the firm / LLP"
                        value={firm.firmName} onChange={e => updateFirm(firm.id, 'firmName', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Firm PAN</label>
                      <input className={INP_TEXT} type="text" placeholder="AAAAA0000A" maxLength={10}
                        value={firm.firmPAN} onChange={e => updateFirm(firm.id, 'firmPAN', e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Registration Number</label>
                      <input className={INP_TEXT} type="text" placeholder="Firm registration no."
                        value={firm.firmRegistrationNo} onChange={e => updateFirm(firm.id, 'firmRegistrationNo', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Address</label>
                      <input className={INP_TEXT} type="text" placeholder="Registered address"
                        value={firm.firmAddress} onChange={e => updateFirm(firm.id, 'firmAddress', e.target.value)} />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={firm.isRegistered}
                        onChange={e => updateFirm(firm.id, 'isRegistered', e.target.checked)} className="rounded" />
                      Registered firm (under Partnership Act / LLP Act)
                    </label>
                  </div>

                  {/* Receipts from firm */}
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="py-1.5 px-3 text-xs font-semibold text-gray-500 text-left">Income from this Firm</th>
                        <th className="py-1.5 px-3 text-xs font-semibold text-gray-500 text-right">Amount (₹)</th>
                        <th className="py-1.5 px-3 text-xs font-semibold text-gray-500 text-right w-32"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-3 text-sm text-gray-700">Share of profit (%)</td>
                        <td className="py-1.5 px-3 text-right">
                          <input className={INP_NUM} type="number" min={0} max={100} placeholder="0"
                            value={firm.shareOfProfit || ''}
                            onChange={e => updateFirm(firm.id, 'shareOfProfit', e.target.value)} />
                        </td>
                        <td className="py-1.5 px-3 text-xs text-gray-400 text-right">{firm.shareOfProfit ? `${firm.shareOfProfit}%` : '—'}</td>
                      </tr>
                      {[
                        { field: 'salaryReceived' as const, label: 'Salary / remuneration' },
                        { field: 'interestReceived' as const, label: 'Interest on capital' },
                        { field: 'commissionReceived' as const, label: 'Commission' },
                        { field: 'bonusReceived' as const, label: 'Bonus' },
                      ].map(({ field, label }) => (
                        <tr key={field} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-1.5 px-3 text-sm text-gray-700">{label}</td>
                          <td className="py-1.5 px-3 text-right">
                            <input className={INP_NUM} type="number" min={0} placeholder="0"
                              value={firm[field] || ''}
                              onChange={e => updateFirm(firm.id, field, e.target.value)} />
                          </td>
                          <td className="py-1.5 px-3 text-xs text-gray-400 text-right">{fmt(firm[field])}</td>
                        </tr>
                      ))}
                      <tr className="bg-blue-50 border-t border-blue-200">
                        <td className="py-2 px-3 text-sm font-semibold text-gray-700">Total from this firm</td>
                        <td className="py-2 px-3 text-right text-sm font-bold text-blue-700">{fmt(total)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* Grand total */}
            {state.partnerInFirms.length > 1 && (
              <div className="px-4 py-3 bg-blue-50 border-t-2 border-blue-200 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">Grand Total — Income from all Firms</span>
                <span className="text-sm font-bold text-blue-700">{fmt(grandTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
