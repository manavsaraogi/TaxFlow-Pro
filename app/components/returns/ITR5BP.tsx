'use client';

/**
 * ITR-5 Schedule BP — Computation of Business/Profession Income
 * Items 1-48 matching the official Excel utility.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface BP5State {
  Item2a: number; Item2b: number;
  Item3a: number; Item3b: number; Item3ci: number; Item3cii: number;
  Item3d: number; Item3e: number; Item3f: number;
  Item4a_44AD: number; Item4a_44ADA: number; Item4a_44AE: number; Item4a_44B: number;
  Item4a_44BB: number; Item4a_44BBA: number; Item4a_44BBB: number;
  Item4a_44D: number; Item4a_44DA: number; Item4a_44DB: number; Item4b: number;
  Item5a: number; Item5b: number; Item5c: number;
  Item7a: number; Item7b: number; Item7c: number; Item7d: number; Item7e: number; Item7f: number;
  Item8a: number; Item8b: number;
  Item11: number; Item12i: number; Item12ii: number;
  Item14: number; Item15: number; Item16: number; Item17: number; Item18: number; Item19: number;
  Item20: number;
  Item21a: number; Item21b: number; Item21c: number; Item21d: number; Item21e: number; Item21f: number;
  Item21g: number; Item21h: number; Item21i: number; Item21j: number; Item21k: number; Item21l: number;
  Item22: number; Item23: number;
  Item24a: number; Item24b: number; Item24c: number; Item24d: number; Item24e: number;
  Item25: number;
  Item27: number; Item28: number; Item29: number; Item30: number; Item31: number; Item32: number;
  Item35i_44AD: number; Item35ii_44ADA: number; Item35iii_44AE: number; Item35iv_44B: number;
  Item35v_44BB: number; Item35vi_44BBA: number; Item35vii_44BBB: number;
  Item35viii_44D: number; Item35ix_44DB: number;
  Item39: number; Item40: number; Item41: number;
  Item43: number; Item44: number; Item45: number; Item47a: number; Item47b: number;
}

const ZERO: BP5State = {
  Item2a: 0, Item2b: 0,
  Item3a: 0, Item3b: 0, Item3ci: 0, Item3cii: 0, Item3d: 0, Item3e: 0, Item3f: 0,
  Item4a_44AD: 0, Item4a_44ADA: 0, Item4a_44AE: 0, Item4a_44B: 0, Item4a_44BB: 0,
  Item4a_44BBA: 0, Item4a_44BBB: 0, Item4a_44D: 0, Item4a_44DA: 0, Item4a_44DB: 0, Item4b: 0,
  Item5a: 0, Item5b: 0, Item5c: 0,
  Item7a: 0, Item7b: 0, Item7c: 0, Item7d: 0, Item7e: 0, Item7f: 0, Item8a: 0, Item8b: 0,
  Item11: 0, Item12i: 0, Item12ii: 0,
  Item14: 0, Item15: 0, Item16: 0, Item17: 0, Item18: 0, Item19: 0, Item20: 0,
  Item21a: 0, Item21b: 0, Item21c: 0, Item21d: 0, Item21e: 0, Item21f: 0,
  Item21g: 0, Item21h: 0, Item21i: 0, Item21j: 0, Item21k: 0, Item21l: 0,
  Item22: 0, Item23: 0, Item24a: 0, Item24b: 0, Item24c: 0, Item24d: 0, Item24e: 0, Item25: 0,
  Item27: 0, Item28: 0, Item29: 0, Item30: 0, Item31: 0, Item32: 0,
  Item35i_44AD: 0, Item35ii_44ADA: 0, Item35iii_44AE: 0, Item35iv_44B: 0,
  Item35v_44BB: 0, Item35vi_44BBA: 0, Item35vii_44BBB: 0, Item35viii_44D: 0, Item35ix_44DB: 0,
  Item39: 0, Item40: 0, Item41: 0, Item43: 0, Item44: 0, Item45: 0, Item47a: 0, Item47b: 0,
};

export function computeBP5(bp: BP5State, netProfitFromPL: number) {
  const Item1 = netProfitFromPL;
  const Item3c = bp.Item3ci + bp.Item3cii;
  const Item4a = bp.Item4a_44AD + bp.Item4a_44ADA + bp.Item4a_44AE + bp.Item4a_44B + bp.Item4a_44BB
    + bp.Item4a_44BBA + bp.Item4a_44BBB + bp.Item4a_44D + bp.Item4a_44DA + bp.Item4a_44DB;
  const Item5d = bp.Item5a + bp.Item5b + bp.Item5c;
  const Item6 = Item1 - bp.Item2a - bp.Item2b - bp.Item3a - bp.Item3b - Item3c
    - bp.Item3d - bp.Item3e - bp.Item3f - Item4a - bp.Item4b - Item5d;
  const Item9 = bp.Item7a + bp.Item7b + bp.Item7c + bp.Item7d + bp.Item7e + bp.Item7f + bp.Item8a + bp.Item8b;
  const Item10 = Item6 + Item9;
  const Item12iii = bp.Item12i + bp.Item12ii;
  const Item13 = Item10 + bp.Item11 - Item12iii;
  const Item21 = bp.Item21a + bp.Item21b + bp.Item21c + bp.Item21d + bp.Item21e + bp.Item21f
    + bp.Item21g + bp.Item21h + bp.Item21i + bp.Item21j + bp.Item21k + bp.Item21l;
  const Item24 = bp.Item24a + bp.Item24b + bp.Item24c + bp.Item24d + bp.Item24e;
  const Item26 = bp.Item14 + bp.Item15 + bp.Item16 + bp.Item17 + bp.Item18 + bp.Item19
    + bp.Item20 + Item21 + bp.Item22 + bp.Item23 + Item24 + bp.Item25;
  const Item33 = bp.Item27 + bp.Item28 + bp.Item29 + bp.Item30 + bp.Item31 + bp.Item32;
  const Item34 = Item13 + Item26 - Item33;
  const Item35Total = bp.Item35i_44AD + bp.Item35ii_44ADA + bp.Item35iii_44AE + bp.Item35iv_44B
    + bp.Item35v_44BB + bp.Item35vi_44BBA + bp.Item35vii_44BBB + bp.Item35viii_44D + bp.Item35ix_44DB;
  const Item36 = Item34 + Item35Total;
  const Item42 = bp.Item39 + bp.Item40 - bp.Item41;
  const Item46 = bp.Item43 + bp.Item44 - bp.Item45;
  const Item47 = bp.Item47a + bp.Item47b;
  const Item48 = Item46 - Item47;
  return {
    Item1, Item3c, Item4a, Item5d, Item6, Item9, Item10,
    Item12iii, Item13, Item21, Item24, Item26, Item33, Item34,
    Item35Total, Item36, Item42, Item46, Item47, Item48,
  };
}

function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  const s = n < 0 ? '(' : '';
  const e = n < 0 ? ')' : '';
  if (abs >= 10000000) return `${s}₹${(abs / 10000000).toFixed(2)} Cr${e}`;
  if (abs >= 100000) return `${s}₹${(abs / 100000).toFixed(2)} L${e}`;
  return `${s}₹${abs.toLocaleString('en-IN')}${e}`;
}

const INP = 'w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-blue-500 bg-white';

function Row({ label, note, field, bp, set }: {
  label: string; note?: string; field: keyof BP5State;
  bp: BP5State; set: (k: keyof BP5State, v: string) => void;
}) {
  return (
    <tr>
      <td className="py-1.5 pr-4">
        <div className="text-sm text-gray-700">{label}</div>
        {note && <div className="text-xs text-gray-400">{note}</div>}
      </td>
      <td className="py-1.5 w-44">
        <input type="number" className={INP} value={bp[field] || ''}
          onChange={e => set(field, e.target.value)} />
      </td>
    </tr>
  );
}

function Auto({ label, value, level = 1 }: { label: string; value: number; level?: 1 | 2 | 3 }) {
  const bg = level === 3 ? 'bg-blue-50' : level === 2 ? 'bg-gray-100' : 'bg-gray-50';
  const tw = level === 3 ? 'text-blue-800 font-bold' : level === 2 ? 'text-gray-700 font-semibold' : 'text-gray-600 font-medium';
  const vt = value < 0 ? 'text-red-600' : level === 3 ? 'text-blue-700 font-bold' : 'text-gray-600 font-semibold';
  return (
    <tr className={bg}>
      <td className={`py-1.5 pr-4 text-sm ${tw}`}>{label}</td>
      <td className={`py-1.5 text-right text-sm font-bold font-mono pr-1 ${vt}`}>{fmt(value)}</td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</span>
      </div>
      <table className="w-full border-collapse"><tbody>{children}</tbody></table>
    </div>
  );
}

interface Props {
  returnId: number;
  maintainsRegularBooks: boolean;
  netProfitFromPL: number;
  initialData?: Partial<BP5State> | null;
  onSaved?: (data: BP5State) => void;
}

type SubTab = 'sectionA' | 'sectionB' | 'sectionC';

export default function ITR5BP({ returnId, maintainsRegularBooks, netProfitFromPL, initialData, onSaved }: Props) {
  const [bp, setBP] = useState<BP5State>({ ...ZERO, ...initialData });
  const [subTab, setSubTab] = useState<SubTab>('sectionA');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpRef = useRef(bp);
  useEffect(() => { bpRef.current = bp; });
  useEffect(() => { if (initialData) setBP({ ...ZERO, ...initialData }); }, [initialData]);

  const save = useCallback(async (data: BP5State) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5BP`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      setSavedAt(new Date());
      onSaved?.(data);
    } finally { setSaving(false); }
  }, [returnId, onSaved]);

  const set = useCallback((key: keyof BP5State, val: string) => {
    setBP(prev => {
      const next = { ...prev, [key]: Number(val) || 0 };
      if (debRef.current) clearTimeout(debRef.current);
      debRef.current = setTimeout(() => save(next), 1500);
      return next;
    });
  }, [save]);

  const t = computeBP5(bp, netProfitFromPL);

  if (!maintainsRegularBooks) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>No Account Case / Presumptive:</strong> Schedule BP adjustments apply only when regular books are maintained u/s 44AA. Business income flows directly from P&L entries.
        </div>
      </div>
    );
  }

  const tabs: { id: SubTab; label: string; value: number }[] = [
    { id: 'sectionA', label: 'Section A — Non-Speculative Business', value: t.Item36 },
    { id: 'sectionB', label: 'Section B — Speculative', value: t.Item42 },
    { id: 'sectionC', label: 'Section C — Specified (35AD)', value: t.Item48 },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-800">Schedule BP — Business/Profession Income Computation</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ''}</span>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${t.Item36 >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            BP Income (Item 36): {fmt(t.Item36)}
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`px-5 py-2.5 text-sm whitespace-nowrap flex items-center gap-2 border-b-2 transition-colors ${subTab === tab.id ? 'border-blue-600 text-blue-700 font-semibold bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${subTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>{fmt(tab.value)}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {subTab === 'sectionA' && (
          <div className="max-w-2xl">
            <p className="text-xs text-gray-500 mb-4">Items 1-36: Non-speculative business/profession. Item 1 auto-populates from P&L Account Item 54.</p>

            <Section title="Step 1 — P&L Net Profit (Item 1)">
              <tr className="bg-green-50">
                <td className="py-2 pr-4 text-sm font-semibold text-green-800">Item 1 — Net Profit as per P&L Account (Item 54)</td>
                <td className="py-2 text-right text-base font-bold text-green-700 font-mono pr-1">{fmt(t.Item1)}</td>
              </tr>
            </Section>

            <Section title="Step 2 — Deduct: Amounts Taxable Under Other Heads / Exempt">
              <Row bp={bp} set={set} label="Item 2a — Speculative business profit included in Item 1" field="Item2a" />
              <Row bp={bp} set={set} label="Item 2b — Specified Business (35AD) profit included in Item 1" field="Item2b" />
              <Auto label="Item 3 — Other-head income credited to P&L" value={bp.Item3a + bp.Item3b + t.Item3c + bp.Item3d + bp.Item3e + bp.Item3f} />
              <Row bp={bp} set={set} label="3a House Property income credited to P&L" field="Item3a" />
              <Row bp={bp} set={set} label="3b Capital Gains credited to P&L" field="Item3b" />
              <Row bp={bp} set={set} label="3c(i) Dividend income (Other Sources) credited to P&L" field="Item3ci" />
              <Row bp={bp} set={set} label="3c(ii) Other income (Other Sources) credited to P&L" field="Item3cii" />
              <Row bp={bp} set={set} label="3d Income u/s 115BBF credited to P&L" field="Item3d" />
              <Row bp={bp} set={set} label="3e Income u/s 115BBG credited to P&L" field="Item3e" />
              <Row bp={bp} set={set} label="3f Income u/s 115BBH (net of cost of acquisition)" field="Item3f" />
              <Auto label="Item 4a — Presumptive income included in Item 1" value={t.Item4a} />
              <Row bp={bp} set={set} label="4a(i) 44AD" field="Item4a_44AD" />
              <Row bp={bp} set={set} label="4a(ii) 44ADA" field="Item4a_44ADA" />
              <Row bp={bp} set={set} label="4a(iii) 44AE" field="Item4a_44AE" />
              <Row bp={bp} set={set} label="4a(iv) 44B" field="Item4a_44B" />
              <Row bp={bp} set={set} label="4a(v) 44BB" field="Item4a_44BB" />
              <Row bp={bp} set={set} label="4a(vi) 44BBA" field="Item4a_44BBA" />
              <Row bp={bp} set={set} label="4a(vii) 44BBB" field="Item4a_44BBB" />
              <Row bp={bp} set={set} label="4a(viii) 44D" field="Item4a_44D" />
              <Row bp={bp} set={set} label="4a(ix) 44DA" field="Item4a_44DA" />
              <Row bp={bp} set={set} label="4a(x) 44DB" field="Item4a_44DB" />
              <Row bp={bp} set={set} label="Item 4b — Life insurance business (1st Schedule)" field="Item4b" />
              <Auto label="Item 5d — Exempt income (5a + 5b + 5c)" value={t.Item5d} />
              <Row bp={bp} set={set} label="5a Share of income from firm(s)" field="Item5a" />
              <Row bp={bp} set={set} label="5b Share of income from AOP/BOI" field="Item5b" />
              <Row bp={bp} set={set} label="5c Any other exempt income (total)" field="Item5c" />
              <Auto label="Item 6 — Balance after removing other-head / exempt income" value={t.Item6} level={2} />
            </Section>

            <Section title="Step 3 — Add Back: Expenses for Other Heads (Items 7–9)">
              <Row bp={bp} set={set} label="7a House Property expenses debited to P&L" field="Item7a" />
              <Row bp={bp} set={set} label="7b Capital Gains expenses debited to P&L" field="Item7b" />
              <Row bp={bp} set={set} label="7c Other Sources expenses debited to P&L" field="Item7c" />
              <Row bp={bp} set={set} label="7d 115BBF expenses" field="Item7d" />
              <Row bp={bp} set={set} label="7e 115BBG expenses" field="Item7e" />
              <Row bp={bp} set={set} label="7f 115BBH expenses (excl. cost of acquisition)" field="Item7f" />
              <Row bp={bp} set={set} label="8a Expenses for exempt income u/s 14A" field="Item8a" />
              <Row bp={bp} set={set} label="8b Expenses for speculative/specified business" field="Item8b" />
              <Auto label="Item 9 — Total (7a to 8b)" value={t.Item9} level={2} />
              <Auto label="Item 10 — Adjusted Profit (6 + 9)" value={t.Item10} level={2} />
            </Section>

            <Section title="Step 4 — Depreciation Adjustment (Items 11–13)">
              <Row bp={bp} set={set} label="Item 11 — Depreciation as per books (debited to P&L)" field="Item11" />
              <Row bp={bp} set={set} label="Item 12(i) — Depreciation u/s 32(1)(ii)/(iia) [WDV method]" field="Item12i" />
              <Row bp={bp} set={set} label="Item 12(ii) — Depreciation u/s 32(1)(i) [SLM method]" field="Item12ii" />
              <Auto label="Item 12(iii) — Total IT Act depreciation (12i + 12ii)" value={t.Item12iii} />
              <Auto label="Item 13 — Profit after depreciation (10 + 11 − 12iii)" value={t.Item13} level={2} />
            </Section>

            <Section title="Step 5 — Additions u/s 28–44DB (Items 14–26)">
              <Row bp={bp} set={set} label="Item 14 — Amounts u/s 30-37 not allowable (personal, inadmissible)" field="Item14" />
              <Row bp={bp} set={set} label="Item 15 — Amounts u/s 40 disallowed (TDS non-compliance)" field="Item15" />
              <Row bp={bp} set={set} label="Item 16 — Amounts u/s 40A disallowed (cash payments over limit)" field="Item16" />
              <Row bp={bp} set={set} label="Item 17 — Amounts u/s 43B disallowed (taxes/PF/bonus unpaid by due date)" field="Item17" />
              <Row bp={bp} set={set} label="Item 18 — Prior year P&L amount not allowed then, added back" field="Item18" />
              <Row bp={bp} set={set} label="Item 19 — Interest disallowable u/s 23 MSME" field="Item19" />
              <Row bp={bp} set={set} label="Item 20 — Deemed income u/s 41 (trading liability written off etc.)" field="Item20" />
              <Auto label="Item 21 — Deemed income (32AC/32AD/33AB/33ABA/35ABA/35ABB etc.)" value={t.Item21} />
              <Row bp={bp} set={set} label="21a u/s 32AC" field="Item21a" />
              <Row bp={bp} set={set} label="21b u/s 32AD" field="Item21b" />
              <Row bp={bp} set={set} label="21c u/s 33AB" field="Item21c" />
              <Row bp={bp} set={set} label="21d u/s 33ABA" field="Item21d" />
              <Row bp={bp} set={set} label="21e u/s 35ABA" field="Item21e" />
              <Row bp={bp} set={set} label="21f u/s 35ABB" field="Item21f" />
              <Row bp={bp} set={set} label="21g u/s 35AC" field="Item21g" />
              <Row bp={bp} set={set} label="21h u/s 40A(3A)" field="Item21h" />
              <Row bp={bp} set={set} label="21i u/s 33AC" field="Item21i" />
              <Row bp={bp} set={set} label="21j u/s 72A" field="Item21j" />
              <Row bp={bp} set={set} label="21k u/s 80HHD" field="Item21k" />
              <Row bp={bp} set={set} label="21l u/s 80-IA" field="Item21l" />
              <Row bp={bp} set={set} label="Item 22 — Deemed income u/s 43CA" field="Item22" />
              <Row bp={bp} set={set} label="Item 23 — Any other addition u/s 28-44DB" field="Item23" />
              <Auto label="Item 24 — Other income not in P&L" value={t.Item24} />
              <Row bp={bp} set={set} label="24a Salary" field="Item24a" />
              <Row bp={bp} set={set} label="24b Bonus" field="Item24b" />
              <Row bp={bp} set={set} label="24c Commission" field="Item24c" />
              <Row bp={bp} set={set} label="24d Interest" field="Item24d" />
              <Row bp={bp} set={set} label="24e Others" field="Item24e" />
              <Row bp={bp} set={set} label="Item 25 — ICDS adjustment — increase in profit" field="Item25" />
              <Auto label="Item 26 — Total Additions (14 to 25)" value={t.Item26} level={2} />
            </Section>

            <Section title="Step 6 — Deductions (Items 27–33)">
              <Row bp={bp} set={set} label="Item 27 — Deduction u/s 32(1)(iii) unabsorbed depreciation" field="Item27" />
              <Row bp={bp} set={set} label="Item 28 — Deduction u/s 32AD or u/s 35/35CCC/35CCD in excess" field="Item28" />
              <Row bp={bp} set={set} label="Item 29 — u/s 40 amounts disallowed in prior years, now allowed" field="Item29" />
              <Row bp={bp} set={set} label="Item 30 — u/s 43B amounts disallowed in prior years, now allowed" field="Item30" />
              <Row bp={bp} set={set} label="Item 31 — Any other allowable deduction" field="Item31" />
              <Row bp={bp} set={set} label="Item 32 — ICDS adjustment — decrease in profit" field="Item32" />
              <Auto label="Item 33 — Total Deductions (27 to 32)" value={t.Item33} level={2} />
            </Section>

            <Section title="Step 7 — Final Business Income">
              <Auto label="Item 34 — Income from regular business (13 + 26 − 33)" value={t.Item34} level={2} />
              <Auto label="Item 35 — Add: Presumptive income (44AD/ADA/AE etc.)" value={t.Item35Total} />
              <Row bp={bp} set={set} label="35(i) u/s 44AD [auto-link from P&L Item 62(ii)]" field="Item35i_44AD" />
              <Row bp={bp} set={set} label="35(ii) u/s 44ADA [auto-link from P&L Item 63(ii)]" field="Item35ii_44ADA" />
              <Row bp={bp} set={set} label="35(iii) u/s 44AE" field="Item35iii_44AE" />
              <Row bp={bp} set={set} label="35(iv) u/s 44B" field="Item35iv_44B" />
              <Row bp={bp} set={set} label="35(v) u/s 44BB" field="Item35v_44BB" />
              <Row bp={bp} set={set} label="35(vi) u/s 44BBA" field="Item35vi_44BBA" />
              <Row bp={bp} set={set} label="35(vii) u/s 44BBB" field="Item35vii_44BBB" />
              <Row bp={bp} set={set} label="35(viii) u/s 44D" field="Item35viii_44D" />
              <Row bp={bp} set={set} label="35(ix) u/s 44DB" field="Item35ix_44DB" />
              <Auto label="Item 36 — Net Profit/Loss from Business/Profession (34 + 35)" value={t.Item36} level={3} />
            </Section>
          </div>
        )}

        {subTab === 'sectionB' && (
          <div className="max-w-xl">
            <p className="text-xs text-gray-500 mb-4">Section B — Speculative business (e.g., intraday equity trading). Losses can only be set off against speculative gains.</p>
            <Section title="Section B — Speculative Business (Items 39–42)">
              <Row bp={bp} set={set} label="Item 39 — Net profit/loss from speculative business as per P&L" field="Item39" />
              <Row bp={bp} set={set} label="Item 40 — Additions u/s 28-44DB" field="Item40" />
              <Row bp={bp} set={set} label="Item 41 — Deductions u/s 28-44DB" field="Item41" />
              <Auto label="Item 42 — Income from speculative business (39 + 40 − 41)" value={t.Item42} level={3} />
            </Section>
          </div>
        )}

        {subTab === 'sectionC' && (
          <div className="max-w-xl">
            <p className="text-xs text-gray-500 mb-4">Section C — Specified business u/s 35AD (cold chain, warehousing, hospitals etc.). Losses set off only against specified business income.</p>
            <Section title="Section C — Specified Business u/s 35AD (Items 43–48)">
              <Row bp={bp} set={set} label="Item 43 — Net profit/loss from specified business as per P&L" field="Item43" />
              <Row bp={bp} set={set} label="Item 44 — Additions u/s 28-44DB" field="Item44" />
              <Row bp={bp} set={set} label="Item 45 — Deductions u/s 28-44DB (other than 35AD)" field="Item45" />
              <Auto label="Item 46 — Profit/Loss (43 + 44 − 45)" value={t.Item46} />
              <Row bp={bp} set={set} label="Item 47a — Deduction u/s 35AD(1)" field="Item47a" />
              <Row bp={bp} set={set} label="Item 47b — Deduction u/s 35AD(1A)" field="Item47b" />
              <Auto label="Item 47 — Total 35AD deductions (47a + 47b)" value={t.Item47} />
              <Auto label="Item 48 — Income from specified business (46 − 47)" value={t.Item48} level={3} />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
