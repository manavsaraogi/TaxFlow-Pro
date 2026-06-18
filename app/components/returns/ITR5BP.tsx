'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface ITR5BPState {
  // Additions to net profit (inadmissible / disallowed expenses)
  personalExpenses: number;
  inadmissibleU40aIa: number;
  inadmissibleU40A3: number;
  provisionIncomeTax: number;
  salaryToPartnersExcess: number;
  interestToPartnersExcess: number;
  otherAdditions: number;

  // Cross-head deductions: amounts credited to P&L but taxable under other heads
  dividendCreditedToPL: number;
  interestCreditedToPL: number;
  rentalIncomeCreditedToPL: number;
  capitalGainCreditedToPL: number;
  otherCrossHeadDeductions: number;

  // Deductions from BP income
  depreciationITAct: number;
  deductionU35: number;
  deductionU10AA: number;
  deductionU80IC: number;
  otherBPDeductions: number;

  // Amounts from other heads that are taxable under BP
  amtFromOtherHeadsToBP: number;
}

const ZERO: ITR5BPState = {
  personalExpenses: 0,
  inadmissibleU40aIa: 0,
  inadmissibleU40A3: 0,
  provisionIncomeTax: 0,
  salaryToPartnersExcess: 0,
  interestToPartnersExcess: 0,
  otherAdditions: 0,
  dividendCreditedToPL: 0,
  interestCreditedToPL: 0,
  rentalIncomeCreditedToPL: 0,
  capitalGainCreditedToPL: 0,
  otherCrossHeadDeductions: 0,
  depreciationITAct: 0,
  deductionU35: 0,
  deductionU10AA: 0,
  deductionU80IC: 0,
  otherBPDeductions: 0,
  amtFromOtherHeadsToBP: 0,
};

function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${s}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000)   return `${s}₹${(abs / 100000).toFixed(2)} L`;
  return `${s}₹${abs.toLocaleString('en-IN')}`;
}

const INP = 'w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-blue-500 bg-white';

interface RowProps {
  label: string;
  hint?: string;
  field: keyof ITR5BPState;
  st: ITR5BPState;
  set: (k: keyof ITR5BPState, v: string) => void;
}

function Row({ label, hint, field, st, set }: RowProps) {
  return (
    <tr>
      <td className="py-1.5 pr-3">
        <span className="text-sm text-gray-700">{label}</span>
        {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
      </td>
      <td className="py-1.5 w-44">
        <input
          type="number"
          className={INP}
          value={st[field] || ''}
          onChange={e => set(field, e.target.value)}
        />
      </td>
    </tr>
  );
}

function TotalRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <tr className={highlight ? 'bg-blue-50' : 'bg-gray-50'}>
      <td className={`py-1.5 pr-3 font-semibold text-sm ${highlight ? 'text-blue-800' : 'text-gray-700'}`}>{label}</td>
      <td className={`py-1.5 text-right text-sm font-bold pr-1 ${highlight ? 'text-blue-700' : 'text-gray-600'}`}>{fmt(value)}</td>
    </tr>
  );
}

interface Props {
  returnId: number;
  maintainsRegularBooks: boolean;
  netProfitFromPL: number;
  initialData?: Partial<ITR5BPState> | null;
  onSaved?: (data: ITR5BPState) => void;
}

export default function ITR5BP({ returnId, maintainsRegularBooks, netProfitFromPL, initialData, onSaved }: Props) {
  const [st, setSt] = useState<ITR5BPState>({ ...ZERO, ...initialData });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialData) setSt({ ...ZERO, ...initialData });
  }, [initialData]);

  const save = useCallback(async (data: ITR5BPState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5BP`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setSavedAt(new Date());
      onSaved?.(data);
    } finally {
      setSaving(false);
    }
  }, [returnId, onSaved]);

  const set = useCallback((key: keyof ITR5BPState, val: string) => {
    setSt(prev => {
      const next = { ...prev, [key]: Number(val) || 0 };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1500);
      return next;
    });
  }, [save]);

  // Computed totals
  const totalAdditions =
    st.personalExpenses + st.inadmissibleU40aIa + st.inadmissibleU40A3 +
    st.provisionIncomeTax + st.salaryToPartnersExcess + st.interestToPartnersExcess +
    st.otherAdditions;

  const totalCrossHeadDeductions =
    st.dividendCreditedToPL + st.interestCreditedToPL +
    st.rentalIncomeCreditedToPL + st.capitalGainCreditedToPL +
    st.otherCrossHeadDeductions;

  const totalBPDeductions =
    st.depreciationITAct + st.deductionU35 + st.deductionU10AA +
    st.deductionU80IC + st.otherBPDeductions;

  const taxableBPIncome =
    netProfitFromPL +
    totalAdditions +
    st.amtFromOtherHeadsToBP -
    totalCrossHeadDeductions -
    totalBPDeductions;

  if (!maintainsRegularBooks) {
    return (
      <div className="p-6 max-w-xl">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Schedule BP adjustments apply only when the organisation maintains regular books of accounts.
          Enable <strong>"Regular Books of Accounts"</strong> in the <em>ITR-5 General</em> tab to use this section.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Schedule BP — Business &amp; Profession Adjustments</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Adjustments to book profit to arrive at taxable income under Business / Profession
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-blue-500">Saving…</span>}
          {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* Starting point: net profit from P&L */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700">Net Profit as per Books of Account (from P&amp;L)</span>
          <span className="text-base font-bold text-gray-900 font-mono">{fmt(netProfitFromPL)}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Auto-read from the P&amp;L tab — update "Net Profit Before Taxes" there</p>
      </div>

      {/* Additions */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Additions to Net Profit
          <span className="text-xs font-normal text-gray-400 ml-2">Inadmissible / disallowed expenses under Income Tax Act</span>
        </h3>
        <table className="w-full border-collapse">
          <tbody>
            <Row st={st} set={set} label="Personal / household expenses charged to P&L" hint="u/s 37 — not for business purpose" field="personalExpenses" />
            <Row st={st} set={set} label="TDS default — payments without deduction" hint="u/s 40(a)(ia)" field="inadmissibleU40aIa" />
            <Row st={st} set={set} label="Cash payments exceeding ₹10,000" hint="u/s 40A(3)" field="inadmissibleU40A3" />
            <Row st={st} set={set} label="Provision for Income Tax / Wealth Tax" field="provisionIncomeTax" />
            <Row st={st} set={set} label="Excess salary paid to partners" hint="over limit u/s 40(b)" field="salaryToPartnersExcess" />
            <Row st={st} set={set} label="Excess interest paid to partners" hint="over 12% p.a. u/s 40(b)" field="interestToPartnersExcess" />
            <Row st={st} set={set} label="Other inadmissible amounts" field="otherAdditions" />
            <TotalRow label="Total Additions" value={totalAdditions} />
          </tbody>
        </table>
      </div>

      {/* Cross-head deductions */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Amounts Included in P&amp;L Taxable Under Other Heads
          <span className="text-xs font-normal text-gray-400 ml-2">These are credited to P&L but taxed under HP / CG / OS — deduct from BP</span>
        </h3>
        <table className="w-full border-collapse">
          <tbody>
            <Row st={st} set={set} label="Dividend income credited to P&L" hint="Taxable under Other Sources (Sec 56)" field="dividendCreditedToPL" />
            <Row st={st} set={set} label="Interest / FD income credited to P&L" hint="Taxable under Other Sources" field="interestCreditedToPL" />
            <Row st={st} set={set} label="Rental income credited to P&L" hint="Taxable under House Property (Sec 22)" field="rentalIncomeCreditedToPL" />
            <Row st={st} set={set} label="Capital gain on asset sale in P&L" hint="Taxable under Capital Gains (Sec 45)" field="capitalGainCreditedToPL" />
            <Row st={st} set={set} label="Other cross-head amounts" field="otherCrossHeadDeductions" />
            <TotalRow label="Total Cross-head Deductions" value={totalCrossHeadDeductions} />
          </tbody>
        </table>
      </div>

      {/* BP Deductions */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Deductions from Business / Profession Income
        </h3>
        <table className="w-full border-collapse">
          <tbody>
            <Row st={st} set={set} label="Depreciation as per IT Act u/s 32" hint="WDV method — may differ from books" field="depreciationITAct" />
            <Row st={st} set={set} label="Scientific Research expenditure u/s 35" field="deductionU35" />
            <Row st={st} set={set} label="Deduction u/s 10AA — SEZ units" field="deductionU10AA" />
            <Row st={st} set={set} label="Deduction u/s 80IC — Hill / NE states" field="deductionU80IC" />
            <Row st={st} set={set} label="Other deductions" field="otherBPDeductions" />
            <TotalRow label="Total BP Deductions" value={totalBPDeductions} />
          </tbody>
        </table>
      </div>

      {/* Amounts from other heads taxable under BP */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Amounts From Other Heads Taxable Under Business / Profession
          <span className="text-xs font-normal text-gray-400 ml-2">Reverse cross-head: income that went to other heads but belongs under BP</span>
        </h3>
        <table className="w-full border-collapse">
          <tbody>
            <Row st={st} set={set} label="Income chargeable under BP but reflected under other heads" field="amtFromOtherHeadsToBP" />
          </tbody>
        </table>
      </div>

      {/* Final taxable BP income */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="py-1 text-sm text-gray-600">Net Profit from Books</td>
              <td className="py-1 text-right text-sm text-gray-700 font-mono">{fmt(netProfitFromPL)}</td>
            </tr>
            <tr>
              <td className="py-1 text-sm text-gray-600">+ Additions (inadmissible)</td>
              <td className="py-1 text-right text-sm text-gray-700 font-mono">+ {fmt(totalAdditions)}</td>
            </tr>
            <tr>
              <td className="py-1 text-sm text-gray-600">+ From other heads</td>
              <td className="py-1 text-right text-sm text-gray-700 font-mono">+ {fmt(st.amtFromOtherHeadsToBP)}</td>
            </tr>
            <tr>
              <td className="py-1 text-sm text-gray-600">− Cross-head amounts (taxed elsewhere)</td>
              <td className="py-1 text-right text-sm text-gray-700 font-mono">− {fmt(totalCrossHeadDeductions)}</td>
            </tr>
            <tr>
              <td className="py-1 text-sm text-gray-600">− BP Deductions</td>
              <td className="py-1 text-right text-sm text-gray-700 font-mono">− {fmt(totalBPDeductions)}</td>
            </tr>
            <tr className="border-t border-blue-300">
              <td className="pt-2 text-base font-bold text-blue-800">Taxable Income from Business / Profession</td>
              <td className="pt-2 text-right text-base font-bold text-blue-800 font-mono">{fmt(taxableBPIncome)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
