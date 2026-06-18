'use client';

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
  Item2a:0,Item2b:0,Item3a:0,Item3b:0,Item3ci:0,Item3cii:0,Item3d:0,Item3e:0,Item3f:0,
  Item4a_44AD:0,Item4a_44ADA:0,Item4a_44AE:0,Item4a_44B:0,Item4a_44BB:0,
  Item4a_44BBA:0,Item4a_44BBB:0,Item4a_44D:0,Item4a_44DA:0,Item4a_44DB:0,Item4b:0,
  Item5a:0,Item5b:0,Item5c:0,
  Item7a:0,Item7b:0,Item7c:0,Item7d:0,Item7e:0,Item7f:0,Item8a:0,Item8b:0,
  Item11:0,Item12i:0,Item12ii:0,
  Item14:0,Item15:0,Item16:0,Item17:0,Item18:0,Item19:0,Item20:0,
  Item21a:0,Item21b:0,Item21c:0,Item21d:0,Item21e:0,Item21f:0,
  Item21g:0,Item21h:0,Item21i:0,Item21j:0,Item21k:0,Item21l:0,
  Item22:0,Item23:0,Item24a:0,Item24b:0,Item24c:0,Item24d:0,Item24e:0,Item25:0,
  Item27:0,Item28:0,Item29:0,Item30:0,Item31:0,Item32:0,
  Item35i_44AD:0,Item35ii_44ADA:0,Item35iii_44AE:0,Item35iv_44B:0,
  Item35v_44BB:0,Item35vi_44BBA:0,Item35vii_44BBB:0,Item35viii_44D:0,Item35ix_44DB:0,
  Item39:0,Item40:0,Item41:0,Item43:0,Item44:0,Item45:0,Item47a:0,Item47b:0,
};

export function computeBP5(bp: BP5State, netProfitFromPL: number) {
  const Item1 = netProfitFromPL;
  const Item3c = bp.Item3ci+bp.Item3cii;
  const Item4a = bp.Item4a_44AD+bp.Item4a_44ADA+bp.Item4a_44AE+bp.Item4a_44B+bp.Item4a_44BB
    +bp.Item4a_44BBA+bp.Item4a_44BBB+bp.Item4a_44D+bp.Item4a_44DA+bp.Item4a_44DB;
  const Item5d = bp.Item5a+bp.Item5b+bp.Item5c;
  const Item6 = Item1-bp.Item2a-bp.Item2b-bp.Item3a-bp.Item3b-Item3c
    -bp.Item3d-bp.Item3e-bp.Item3f-Item4a-bp.Item4b-Item5d;
  const Item9 = bp.Item7a+bp.Item7b+bp.Item7c+bp.Item7d+bp.Item7e+bp.Item7f+bp.Item8a+bp.Item8b;
  const Item10 = Item6+Item9;
  const Item12iii = bp.Item12i+bp.Item12ii;
  const Item13 = Item10+bp.Item11-Item12iii;
  const Item21 = bp.Item21a+bp.Item21b+bp.Item21c+bp.Item21d+bp.Item21e+bp.Item21f
    +bp.Item21g+bp.Item21h+bp.Item21i+bp.Item21j+bp.Item21k+bp.Item21l;
  const Item24 = bp.Item24a+bp.Item24b+bp.Item24c+bp.Item24d+bp.Item24e;
  const Item26 = bp.Item14+bp.Item15+bp.Item16+bp.Item17+bp.Item18+bp.Item19
    +bp.Item20+Item21+bp.Item22+bp.Item23+Item24+bp.Item25;
  const Item33 = bp.Item27+bp.Item28+bp.Item29+bp.Item30+bp.Item31+bp.Item32;
  const Item34 = Item13+Item26-Item33;
  const Item35Total = bp.Item35i_44AD+bp.Item35ii_44ADA+bp.Item35iii_44AE+bp.Item35iv_44B
    +bp.Item35v_44BB+bp.Item35vi_44BBA+bp.Item35vii_44BBB+bp.Item35viii_44D+bp.Item35ix_44DB;
  const Item36 = Item34+Item35Total;
  const Item42 = bp.Item39+bp.Item40-bp.Item41;
  const Item46 = bp.Item43+bp.Item44-bp.Item45;
  const Item47 = bp.Item47a+bp.Item47b;
  const Item48 = Item46-Item47;
  return { Item1,Item3c,Item4a,Item5d,Item6,Item9,Item10,Item12iii,Item13,Item21,Item24,
    Item26,Item33,Item34,Item35Total,Item36,Item42,Item46,Item47,Item48 };
}

function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  const s = n < 0 ? '(' : '';
  const e = n < 0 ? ')' : '';
  if (abs >= 10000000) return `${s}₹${(abs/10000000).toFixed(2)} Cr${e}`;
  if (abs >= 100000) return `${s}₹${(abs/100000).toFixed(2)} L${e}`;
  return `${s}₹${abs.toLocaleString('en-IN')}${e}`;
}

const INP = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-blue-400 bg-white';

function Row({ label, note, tag, field, bp, set }: {
  label: string; note?: string; tag?: string; field: keyof BP5State;
  bp: BP5State; set: (k: keyof BP5State, v: string) => void;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="py-1.5 pr-4 pl-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{label}</span>
          {tag && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">{tag}</span>}
        </div>
        {note && <div className="text-xs text-gray-400 mt-0.5">{note}</div>}
      </td>
      <td className="py-1.5 w-44 pr-2">
        <input type="number" className={INP} value={bp[field] || ''}
          onChange={e => set(field, e.target.value)} />
      </td>
    </tr>
  );
}

function Computed({ label, value, highlight = false, sub = false }: {
  label: string; value: number; highlight?: boolean; sub?: boolean;
}) {
  const rowCls = highlight ? 'bg-blue-50 border-t-2 border-blue-100' : sub ? 'bg-gray-50' : '';
  const lblCls = highlight ? 'text-blue-900 font-bold' : sub ? 'text-gray-600 font-semibold' : 'text-gray-700 font-medium';
  const valCls = highlight
    ? (value < 0 ? 'text-red-700 font-bold' : 'text-blue-700 font-bold')
    : (value < 0 ? 'text-red-600 font-semibold' : 'text-gray-600 font-semibold');
  return (
    <tr className={rowCls}>
      <td className={`py-2 pr-4 pl-3 text-sm ${lblCls}`}>{label}</td>
      <td className={`py-2 text-right text-sm font-mono pr-2 ${valCls}`}>{fmt(value)}</td>
    </tr>
  );
}

function SubHead({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} className="pt-4 pb-1 pl-3 text-xs font-bold text-gray-500 uppercase tracking-wide border-t border-gray-100">
        {label}
      </td>
    </tr>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-5 overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</span>
      </div>
      <table className="w-full border-collapse">
        <tbody>{children}</tbody>
      </table>
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
  const debRef = useRef<ReturnType<typeof setTimeout>|null>(null);
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
      <div className="p-6 max-w-xl">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          <p className="font-semibold text-base mb-1">Presumptive / No Account Case</p>
          <p>Schedule BP adjustments apply only when regular books of accounts are maintained u/s 44AA. Your business income flows directly from the P&L entries above.</p>
          <p className="mt-2 text-xs text-amber-600">To enable: go to <strong>General Info</strong> and turn on "maintains regular books of accounts".</p>
        </div>
      </div>
    );
  }

  const tabs: { id: SubTab; label: string; desc: string; amount: number }[] = [
    { id: 'sectionA', label: 'Business / Profession', desc: 'Regular non-speculative income', amount: t.Item36 },
    { id: 'sectionB', label: 'Speculative Business', desc: 'Intraday equity, commodity etc.', amount: t.Item42 },
    { id: 'sectionC', label: 'Specified Business (35AD)', desc: 'Cold chain, hospitals, warehousing etc.', amount: t.Item48 },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Schedule BP — Business &amp; Profession Income</h2>
          <p className="text-xs text-gray-400 mt-0.5">Adjustments to P&amp;L profit to arrive at taxable business income</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ''}</span>
          <div className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${t.Item36 >= 0 ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            Total Business Income: {fmt(t.Item36)}
          </div>
        </div>
      </div>

      <div className="flex bg-gray-50 border-b border-gray-200 flex-shrink-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`px-5 py-3 text-left border-b-2 transition-colors flex-1 max-w-xs ${subTab === tab.id ? 'border-blue-600 bg-white' : 'border-transparent hover:bg-gray-100'}`}>
            <div className={`text-sm font-semibold ${subTab === tab.id ? 'text-blue-700' : 'text-gray-600'}`}>{tab.label}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">{tab.desc}</span>
              {tab.amount !== 0 && (
                <span className={`text-xs font-bold font-mono ${tab.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(tab.amount)}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6 bg-gray-50">

        {subTab === 'sectionA' && (
          <div className="max-w-2xl">

            <Card title="Step 1 — Net Profit as per P&L Account">
              <tr className="bg-green-50">
                <td className="py-3 pr-4 pl-3">
                  <div className="text-sm font-semibold text-green-800">Net Profit / Loss as per P&amp;L Account</div>
                  <div className="text-xs text-green-600 mt-0.5">Auto-populated from your P&amp;L Account (Item 54)</div>
                </td>
                <td className="py-3 text-right pr-3 text-lg font-bold text-green-700 font-mono">{fmt(t.Item1)}</td>
              </tr>
            </Card>

            <Card title="Step 2 — Less: Amounts Not from Regular Business">
              <Row bp={bp} set={set} label="Speculative business profit included in P&L" note="Will be computed separately in Section B below" field="Item2a" tag="Spec." />
              <Row bp={bp} set={set} label="Specified business (35AD) profit included in P&L" note="Cold chain / hospitals etc. — computed in Section C" field="Item2b" tag="35AD" />
              <SubHead label="Other-Head Income Credited to P&L" />
              <Row bp={bp} set={set} label="House Property income credited to P&L" field="Item3a" />
              <Row bp={bp} set={set} label="Capital Gains credited to P&L" field="Item3b" />
              <Row bp={bp} set={set} label="Dividend income (Other Sources) credited to P&L" field="Item3ci" />
              <Row bp={bp} set={set} label="Other income from Other Sources credited to P&L" field="Item3cii" />
              <Row bp={bp} set={set} label="Patent royalty income u/s 115BBF credited to P&L" field="Item3d" />
              <Row bp={bp} set={set} label="Carbon credit income u/s 115BBG credited to P&L" field="Item3e" />
              <Row bp={bp} set={set} label="Virtual Digital Asset income u/s 115BBH (net of cost)" field="Item3f" />
              <SubHead label="Presumptive Income included in P&L" />
              <Row bp={bp} set={set} label="Presumptive business income u/s 44AD" field="Item4a_44AD" tag="44AD" />
              <Row bp={bp} set={set} label="Presumptive profession income u/s 44ADA" field="Item4a_44ADA" tag="44ADA" />
              <Row bp={bp} set={set} label="Transport operators (per vehicle) u/s 44AE" field="Item4a_44AE" tag="44AE" />
              <Row bp={bp} set={set} label="Shipping business non-resident u/s 44B" field="Item4a_44B" tag="44B" />
              <Row bp={bp} set={set} label="Mineral exploration (non-resident) u/s 44BB" field="Item4a_44BB" tag="44BB" />
              <Row bp={bp} set={set} label="Air transport (non-resident) u/s 44BBA" field="Item4a_44BBA" tag="44BBA" />
              <Row bp={bp} set={set} label="Turnkey power projects (non-resident) u/s 44BBB" field="Item4a_44BBB" tag="44BBB" />
              <Row bp={bp} set={set} label="Royalty from technical know-how (foreign company) u/s 44D" field="Item4a_44D" tag="44D" />
              <Row bp={bp} set={set} label="Royalty / fees from non-residents u/s 44DA" field="Item4a_44DA" tag="44DA" />
              <Row bp={bp} set={set} label="Co-operative business abroad u/s 44DB" field="Item4a_44DB" tag="44DB" />
              <Row bp={bp} set={set} label="Life insurance business income (1st Schedule)" field="Item4b" />
              <SubHead label="Exempt Income Included in P&L" />
              <Row bp={bp} set={set} label="Share of income from partnership firm(s) — exempt" field="Item5a" />
              <Row bp={bp} set={set} label="Share of income from AOP / BOI — exempt" field="Item5b" />
              <Row bp={bp} set={set} label="Any other exempt income included in P&L" field="Item5c" />
              <Computed label="Adjusted Business Profit" value={t.Item6} sub />
            </Card>

            <Card title="Step 3 — Add: Business Expenses Debited for Other Heads">
              <SubHead label="Other-Head Expenses Debited to P&L" />
              <Row bp={bp} set={set} label="House Property expenses debited to P&L" field="Item7a" />
              <Row bp={bp} set={set} label="Capital Gains expenses debited to P&L" field="Item7b" />
              <Row bp={bp} set={set} label="Other Sources expenses debited to P&L" field="Item7c" />
              <Row bp={bp} set={set} label="Expenses relating to patent royalty (115BBF)" field="Item7d" />
              <Row bp={bp} set={set} label="Expenses relating to carbon credits (115BBG)" field="Item7e" />
              <Row bp={bp} set={set} label="Expenses for VDA (115BBH) — excl. cost of acquisition" field="Item7f" />
              <Row bp={bp} set={set} label="Exempt income expenditure disallowable u/s 14A" field="Item8a" />
              <Row bp={bp} set={set} label="Expenses for speculative / specified business" field="Item8b" />
              <Computed label="Total other-head expenses added back" value={t.Item9} sub />
              <Computed label="Profit after adjustment" value={t.Item10} highlight />
            </Card>

            <Card title="Step 4 — Depreciation: Books vs IT Act">
              <Row bp={bp} set={set} label="Add: Depreciation charged in books of accounts" field="Item11" />
              <Row bp={bp} set={set} label="Less: IT Act depreciation — Written Down Value method u/s 32(1)(ii)/(iia)" field="Item12i" />
              <Row bp={bp} set={set} label="Less: IT Act depreciation — Straight Line Method u/s 32(1)(i)" field="Item12ii" />
              <Computed label="Total IT Act depreciation" value={t.Item12iii} sub />
              <Computed label="Profit after IT Act depreciation" value={t.Item13} highlight />
            </Card>

            <Card title="Step 5 — Add: Disallowances &amp; Deemed Income">
              <Row bp={bp} set={set} label="Personal / inadmissible expenses u/s 30–37" field="Item14" />
              <Row bp={bp} set={set} label="TDS non-compliance disallowance u/s 40(a)" field="Item15" />
              <Row bp={bp} set={set} label="Cash payment limit exceeded — disallowance u/s 40A(3)" field="Item16" />
              <Row bp={bp} set={set} label="Taxes / PF / bonus unpaid by due date — u/s 43B" field="Item17" />
              <Row bp={bp} set={set} label="Prior year disallowed amount reversed in current year" field="Item18" />
              <Row bp={bp} set={set} label="MSME interest disallowable u/s 23" field="Item19" />
              <Row bp={bp} set={set} label="Deemed income — trading liability written off u/s 41" field="Item20" />
              <SubHead label="Deemed Income — Section-wise" />
              <Row bp={bp} set={set} label="Investment allowance withdrawn u/s 32AC" field="Item21a" tag="32AC" />
              <Row bp={bp} set={set} label="Investment allowance (backward areas) withdrawn u/s 32AD" field="Item21b" tag="32AD" />
              <Row bp={bp} set={set} label="Tea development / replanting deposit withdrawn u/s 33AB" field="Item21c" tag="33AB" />
              <Row bp={bp} set={set} label="Site restoration fund withdrawn u/s 33ABA" field="Item21d" tag="33ABA" />
              <Row bp={bp} set={set} label="Telecom spectrum amortisation reversal u/s 35ABA" field="Item21e" tag="35ABA" />
              <Row bp={bp} set={set} label="Licence fee amortisation reversal u/s 35ABB" field="Item21f" tag="35ABB" />
              <Row bp={bp} set={set} label="Eligible project / CSR expenditure u/s 35AC" field="Item21g" tag="35AC" />
              <Row bp={bp} set={set} label="Deemed profit on cash payments u/s 40A(3A)" field="Item21h" tag="40A(3A)" />
              <Row bp={bp} set={set} label="Shipping business reserve reversal u/s 33AC" field="Item21i" tag="33AC" />
              <Row bp={bp} set={set} label="Deemed income on amalgamation u/s 72A" field="Item21j" tag="72A" />
              <Row bp={bp} set={set} label="Hotel industry reserve reversal u/s 80HHD" field="Item21k" tag="80HHD" />
              <Row bp={bp} set={set} label="Infrastructure / power business u/s 80-IA" field="Item21l" tag="80-IA" />
              <Row bp={bp} set={set} label="Deemed income on stamp value u/s 43CA" field="Item22" />
              <Row bp={bp} set={set} label="Any other addition under sections 28–44DB" field="Item23" />
              <SubHead label="Income Not Passed Through P&L" />
              <Row bp={bp} set={set} label="Salary / remuneration received from firm (not in P&L)" field="Item24a" />
              <Row bp={bp} set={set} label="Bonus received from firm (not in P&L)" field="Item24b" />
              <Row bp={bp} set={set} label="Commission received from firm (not in P&L)" field="Item24c" />
              <Row bp={bp} set={set} label="Interest received from firm (not in P&L)" field="Item24d" />
              <Row bp={bp} set={set} label="Other income not routed through P&L" field="Item24e" />
              <Row bp={bp} set={set} label="ICDS adjustment — income increase" note="Income Computation and Disclosure Standards" field="Item25" />
              <Computed label="Total additions" value={t.Item26} sub />
            </Card>

            <Card title="Step 6 — Less: Allowable Deductions">
              <Row bp={bp} set={set} label="Unabsorbed depreciation u/s 32(1)(iii)" field="Item27" />
              <Row bp={bp} set={set} label="Additional depreciation / R&D deduction in excess of books" note="u/s 32AD, 35, 35CCC, 35CCD exceeding what is in P&L" field="Item28" />
              <Row bp={bp} set={set} label="u/s 40 disallowances of earlier years now allowed" field="Item29" />
              <Row bp={bp} set={set} label="u/s 43B disallowances of earlier years now allowed" note="Taxes / PF paid after year-end but before filing" field="Item30" />
              <Row bp={bp} set={set} label="Any other deduction allowable u/s 28–44DB" field="Item31" />
              <Row bp={bp} set={set} label="ICDS adjustment — income decrease" field="Item32" />
              <Computed label="Total deductions" value={t.Item33} sub />
              <Computed label="Regular Business / Profession Income" value={t.Item34} highlight />
            </Card>

            <Card title="Step 7 — Add: Presumptive Income (not already in P&L)">
              <Row bp={bp} set={set} label="Presumptive income — small business turnover u/s 44AD" field="Item35i_44AD" tag="44AD" />
              <Row bp={bp} set={set} label="Presumptive income — professionals u/s 44ADA" field="Item35ii_44ADA" tag="44ADA" />
              <Row bp={bp} set={set} label="Transport vehicle operators u/s 44AE" field="Item35iii_44AE" tag="44AE" />
              <Row bp={bp} set={set} label="Shipping business (non-resident) u/s 44B" field="Item35iv_44B" tag="44B" />
              <Row bp={bp} set={set} label="Mineral exploration (non-resident) u/s 44BB" field="Item35v_44BB" tag="44BB" />
              <Row bp={bp} set={set} label="Air transport (non-resident) u/s 44BBA" field="Item35vi_44BBA" tag="44BBA" />
              <Row bp={bp} set={set} label="Turnkey power projects (non-resident) u/s 44BBB" field="Item35vii_44BBB" tag="44BBB" />
              <Row bp={bp} set={set} label="Technical know-how royalty (foreign company) u/s 44D" field="Item35viii_44D" tag="44D" />
              <Row bp={bp} set={set} label="Royalty / fees from non-residents u/s 44DB" field="Item35ix_44DB" tag="44DB" />
              <Computed label="Net Business / Profession Income" value={t.Item36} highlight />
            </Card>
          </div>
        )}

        {subTab === 'sectionB' && (
          <div className="max-w-xl">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-800">
              <strong>Speculative Business</strong> — typically intraday equity trading or commodity futures. Losses can only be set off against speculative gains, not against regular business income.
            </div>
            <Card title="Speculative Business Computation">
              <Row bp={bp} set={set} label="Net profit / (loss) from speculative business as per P&L" field="Item39" />
              <Row bp={bp} set={set} label="Add: Additions (disallowances etc.) u/s 28–44DB" field="Item40" />
              <Row bp={bp} set={set} label="Less: Allowable deductions u/s 28–44DB" field="Item41" />
              <Computed label="Income from Speculative Business" value={t.Item42} highlight />
            </Card>
          </div>
        )}

        {subTab === 'sectionC' && (
          <div className="max-w-xl">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5 text-sm text-purple-800">
              <strong>Specified Business u/s 35AD</strong> — cold chain facilities, warehousing, hospitals, affordable housing, inland container depots, production of fertilisers, honey/bee-keeping etc. Losses only set off against other specified business income.
            </div>
            <Card title="Specified Business u/s 35AD Computation">
              <Row bp={bp} set={set} label="Net profit / (loss) from specified business as per P&L" field="Item43" />
              <Row bp={bp} set={set} label="Add: Additions (disallowances etc.) u/s 28–44DB" field="Item44" />
              <Row bp={bp} set={set} label="Less: Deductions u/s 28–44DB (other than 35AD itself)" field="Item45" />
              <Computed label="Sub-total before 35AD capital expenditure deduction" value={t.Item46} sub />
              <Row bp={bp} set={set} label="Less: Capital expenditure deduction u/s 35AD(1)" field="Item47a" />
              <Row bp={bp} set={set} label="Less: Capital expenditure deduction u/s 35AD(1A)" field="Item47b" />
              <Computed label="Total 35AD deduction" value={t.Item47} sub />
              <Computed label="Income from Specified Business" value={t.Item48} highlight />
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
