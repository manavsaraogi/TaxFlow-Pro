'use client';

/**
 * ITR-5 — Part A: Manufacturing Account, Trading Account, Profit & Loss Account
 * Item numbers match the official Excel utility exactly (items 1–66).
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ── State (one field per Excel item/sub-item) ─────────────────────────────────

export interface PLState {
  // ── MANUFACTURING ACCOUNT ──────────────────────────────────────────────────
  Mfg1Ai:    number; // 1Ai  Opening stock of raw material
  Mfg1Aii:   number; // 1Aii Opening stock of WIP
  Mfg1B:     number; // 1B   Purchases (net of refunds & duty)
  Mfg1C:     number; // 1C   Direct wages
  Mfg1Di:    number; // 1Di  Carriage inward
  Mfg1Dii:   number; // 1Dii Power and fuel
  Mfg1Diii:  number; // 1Diii Other direct expenses
  Mfg1Ei:    number; // 1Ei   Indirect wages
  Mfg1Eii:   number; // 1Eii  Factory rent and rates
  Mfg1Eiii:  number; // 1Eiii Factory insurance
  Mfg1Eiv:   number; // 1Eiv  Factory fuel and power
  Mfg1Ev:    number; // 1Ev   Factory general expenses
  Mfg1Evi:   number; // 1Evi  Depreciation of factory machinery
  Mfg2i:     number; // 2i   Closing stock – raw material
  Mfg2ii:    number; // 2ii  Closing stock – WIP

  // ── TRADING ACCOUNT ────────────────────────────────────────────────────────
  T4Ai:      number; // 4Ai  Sale of goods
  T4Aii:     number; // 4Aii Sale of services
  T4Aiii:    number; // 4Aiii Other operating revenues
  T4B:       number; // 4B   Gross receipts from Profession
  T4Ci:      number; // 4C duties received: Union excise duties
  T4Cii:     number; // Service tax
  T4Ciii:    number; // VAT/Sales tax
  T4Civ:     number; // CGST
  T4Cv:      number; // SGST
  T4Cvi:     number; // IGST
  T4Cvii:    number; // UTGST
  T4Cviii:   number; // Any other duty
  T5:        number; // 5    Closing stock of finished goods
  T7:        number; // 7    Opening stock of finished goods
  T8:        number; // 8    Purchases (net)
  T9i:       number; // 9i   Carriage inward
  T9ii:      number; // 9ii  Power and fuel
  T9iii:     number; // 9iii Other direct expenses
  T10i:      number; // 10i  Custom duty
  T10ii:     number; // 10ii Counter veiling duty
  T10iii:    number; // 10iii Special additional duty
  T10iv:     number; // 10iv Union excise duty
  T10v:      number; // 10v  Service Tax
  T10vi:     number; // 10vi VAT/Sales tax
  T10vii:    number; // 10vii CGST
  T10viii:   number; // 10viii SGST
  T10ix:     number; // 10ix IGST
  T10x:      number; // 10x  UTGST
  T10xi:     number; // 10xi Any other tax
  T12a:      number; // 12a  Turnover from intraday trading
  T12b:      number; // 12b  Income from intraday trading

  // ── PROFIT & LOSS ACCOUNT ──────────────────────────────────────────────────
  PL14i:     number; // 14i   Rent
  PL14ii:    number; // 14ii  Commission
  PL14iii:   number; // 14iii Dividend income
  PL14iv:    number; // 14iv  Interest income
  PL14v:     number; // 14v   Profit on sale of fixed assets
  PL14vi:    number; // 14vi  Profit on sale of STT investments
  PL14vii:   number; // 14vii Profit on sale of other investments
  PL14viii:  number; // 14viii Forex gain/loss u/s 43AA
  PL14ix:    number; // 14ix  Conversion of inventory to capital asset u/s 28(via)
  PL14x:     number; // 14x   Agricultural income
  PL14xia:   number; // 14xia Liabilities written back
  PL14xi:    number; // 14xi  Any other income (total of entries)
  PL16:      number; // 16    Freight outward
  PL17:      number; // 17    Consumption of stores and spare parts
  PL18:      number; // 18    Power and fuel
  PL19:      number; // 19    Rents
  PL20:      number; // 20    Repairs to building
  PL21:      number; // 21    Repairs to machinery
  PL22i:     number; // 22i   Salaries and wages
  PL22ii:    number; // 22ii  Bonus
  PL22iii:   number; // 22iii Reimbursement of medical expenses
  PL22iv:    number; // 22iv  Leave encashment
  PL22v:     number; // 22v   Leave travel benefits
  PL22vi:    number; // 22vi  Contribution to approved superannuation fund
  PL22vii:   number; // 22vii Contribution to recognised PF
  PL22viii:  number; // 22viii Contribution to recognised gratuity fund
  PL22ix:    number; // 22ix  Contribution to any other fund
  PL22x:     number; // 22x   Any other benefit to employees
  PL22xiiAmt:number; // 22xii Amount paid to non-residents (compensation)
  PL23i:     number; // 23i   Medical insurance
  PL23ii:    number; // 23ii  Life insurance
  PL23iii:   number; // 23iii Keyman's insurance
  PL23iv:    number; // 23iv  Other insurance
  PL24:      number; // 24    Workmen and staff welfare
  PL25:      number; // 25    Entertainment
  PL26:      number; // 26    Hospitality
  PL27:      number; // 27    Conference
  PL28:      number; // 28    Sales promotion
  PL29:      number; // 29    Advertisement
  PL30i:     number; // 30i   Commission – outside India / non-resident
  PL30ii:    number; // 30ii  Commission – to others
  PL31i:     number; // 31i   Royalty – outside India
  PL31ii:    number; // 31ii  Royalty – to others
  PL32i:     number; // 32i   Professional/Consultancy fees – outside India
  PL32ii:    number; // 32ii  Professional/Consultancy fees – to others
  PL33:      number; // 33    Hotel, boarding and lodging
  PL34:      number; // 34    Travelling expenses (other than foreign)
  PL35:      number; // 35    Foreign travelling expenses
  PL36:      number; // 36    Conveyance expenses
  PL37:      number; // 37    Telephone expenses
  PL38:      number; // 38    Guest house expenses
  PL39:      number; // 39    Club expenses
  PL40:      number; // 40    Festival celebration expenses
  PL41:      number; // 41    Scholarship
  PL42:      number; // 42    Gift
  PL43:      number; // 43    Donation
  PL44i:     number; // 44i   Union excise duty paid
  PL44ii:    number; // 44ii  Service tax paid
  PL44iii:   number; // 44iii VAT/Sales tax paid
  PL44iv:    number; // 44iv  Cess
  PL44v:     number; // 44v   CGST paid
  PL44vi:    number; // 44vi  SGST paid
  PL44vii:   number; // 44vii IGST paid
  PL44viii:  number; // 44viii UTGST paid
  PL44ix:    number; // 44ix  Any other rate/tax/duty
  PL45:      number; // 45    Audit fee
  PL46:      number; // 46    Salary/Remuneration to Partners
  PL47:      number; // 47    Other expenses (total)
  PL48iv:    number; // 48iv  Bad debts (total)
  PL49:      number; // 49    Provision for bad and doubtful debts
  PL50:      number; // 50    Other provisions
  PL52ia:    number; // 52ia  Interest to Partners (outside India)
  PL52ib:    number; // 52ib  Interest to others (outside India)
  PL52iia:   number; // 52iia Interest to Partners (India)
  PL52iib:   number; // 52iib Interest to others (India)
  PL53:      number; // 53    Depreciation and amortization
  PL55:      number; // 55    Provision for current tax
  PL56:      number; // 56    Provision for deferred tax
  PL58:      number; // 58    Balance brought forward
  PL60:      number; // 60    Transferred to reserves and surplus

  // ── PRESUMPTIVE INCOME ─────────────────────────────────────────────────────
  P62iA:     number; // 62iA  44AD receipts – banking/digital mode
  P62iB:     number; // 62iB  44AD receipts – cash
  P62iC:     number; // 62iC  44AD receipts – other mode
  P62iiA:    number; // 62iiA 44AD income 6% on A
  P62iiB:    number; // 62iiB 44AD income 8% on B+C
  P63iA:     number; // 63iA  44ADA receipts – banking
  P63iB:     number; // 63iB  44ADA receipts – cash
  P63iC:     number; // 63iC  44ADA receipts – other
  P63ii:     number; // 63ii  44ADA income (50%)

  // ── NO-ACCOUNT CASE (Item 65) ──────────────────────────────────────────────
  N65ia1:    number; // Business receipts – banking/digital
  N65ia2:    number; // Business receipts – other
  N65ib:     number; // Business gross profit
  N65ic:     number; // Business expenses
  N65id:     number; // Business net profit
  N65iia1:   number; // Profession receipts – banking
  N65iia2:   number; // Profession receipts – other
  N65iib:    number; // Profession gross profit
  N65iic:    number; // Profession expenses
  N65iid:    number; // Profession net profit

  // ── SPECULATIVE INCOME (Item 66) ───────────────────────────────────────────
  P66i:      number; // 66i  Turnover from speculative activity
  P66ii:     number; // 66ii Gross profit
  P66iii:    number; // 66iii Expenditure
  // P66iv computed

  // ── COMPUTED FIELDS (stored for itrBuilder) ────────────────────────────────
  Mfg3:           number; // Cost of goods produced
  T12:            number; // Gross profit from trading
  PL13:           number; // Gross profit b/d (13 = T12 + T12b)
  PL14xii:        number; // Total other income
  PL15:           number; // Total credits
  PL22xi:         number; // Total employee compensation
  PL44x:          number; // Total rates and taxes
  PL51:           number; // EBITDA
  PL52iii:        number; // Total interest
  NetProfitBeforeTaxes: number; // Item 54
  ProfitAfterTax:       number; // Item 57
}

const ZERO: PLState = {
  Mfg1Ai:0,Mfg1Aii:0,Mfg1B:0,Mfg1C:0,Mfg1Di:0,Mfg1Dii:0,Mfg1Diii:0,
  Mfg1Ei:0,Mfg1Eii:0,Mfg1Eiii:0,Mfg1Eiv:0,Mfg1Ev:0,Mfg1Evi:0,
  Mfg2i:0,Mfg2ii:0,
  T4Ai:0,T4Aii:0,T4Aiii:0,T4B:0,T4Ci:0,T4Cii:0,T4Ciii:0,T4Civ:0,T4Cv:0,T4Cvi:0,T4Cvii:0,T4Cviii:0,
  T5:0,T7:0,T8:0,T9i:0,T9ii:0,T9iii:0,
  T10i:0,T10ii:0,T10iii:0,T10iv:0,T10v:0,T10vi:0,T10vii:0,T10viii:0,T10ix:0,T10x:0,T10xi:0,
  T12a:0,T12b:0,
  PL14i:0,PL14ii:0,PL14iii:0,PL14iv:0,PL14v:0,PL14vi:0,PL14vii:0,PL14viii:0,PL14ix:0,PL14x:0,PL14xia:0,PL14xi:0,
  PL16:0,PL17:0,PL18:0,PL19:0,PL20:0,PL21:0,
  PL22i:0,PL22ii:0,PL22iii:0,PL22iv:0,PL22v:0,PL22vi:0,PL22vii:0,PL22viii:0,PL22ix:0,PL22x:0,PL22xiiAmt:0,
  PL23i:0,PL23ii:0,PL23iii:0,PL23iv:0,
  PL24:0,PL25:0,PL26:0,PL27:0,PL28:0,PL29:0,
  PL30i:0,PL30ii:0,PL31i:0,PL31ii:0,PL32i:0,PL32ii:0,
  PL33:0,PL34:0,PL35:0,PL36:0,PL37:0,PL38:0,PL39:0,PL40:0,PL41:0,PL42:0,PL43:0,
  PL44i:0,PL44ii:0,PL44iii:0,PL44iv:0,PL44v:0,PL44vi:0,PL44vii:0,PL44viii:0,PL44ix:0,
  PL45:0,PL46:0,PL47:0,PL48iv:0,PL49:0,PL50:0,
  PL52ia:0,PL52ib:0,PL52iia:0,PL52iib:0,PL53:0,PL55:0,PL56:0,PL58:0,PL60:0,
  P62iA:0,P62iB:0,P62iC:0,P62iiA:0,P62iiB:0,P63iA:0,P63iB:0,P63iC:0,P63ii:0,
  N65ia1:0,N65ia2:0,N65ib:0,N65ic:0,N65id:0,N65iia1:0,N65iia2:0,N65iib:0,N65iic:0,N65iid:0,
  P66i:0,P66ii:0,P66iii:0,
  Mfg3:0,T12:0,PL13:0,PL14xii:0,PL15:0,PL22xi:0,PL44x:0,PL51:0,PL52iii:0,
  NetProfitBeforeTaxes:0,ProfitAfterTax:0,
};

// ── Computation ───────────────────────────────────────────────────────────────

export function computePLTotals(p: PLState) {
  // Manufacturing
  const Mfg1Aiii  = p.Mfg1Ai + p.Mfg1Aii;
  const Mfg1D     = p.Mfg1Di + p.Mfg1Dii + p.Mfg1Diii;
  const Mfg1Evii  = p.Mfg1Ei + p.Mfg1Eii + p.Mfg1Eiii + p.Mfg1Eiv + p.Mfg1Ev + p.Mfg1Evi;
  const Mfg1F     = Mfg1Aiii + p.Mfg1B + p.Mfg1C + Mfg1D + Mfg1Evii;
  const Mfg2iii   = p.Mfg2i + p.Mfg2ii;
  const Mfg3      = Mfg1F - Mfg2iii;

  // Trading
  const T4Aiv     = p.T4Ai + p.T4Aii + p.T4Aiii;
  const T4Cix     = p.T4Ci + p.T4Cii + p.T4Ciii + p.T4Civ + p.T4Cv + p.T4Cvi + p.T4Cvii + p.T4Cviii;
  const T4D       = T4Aiv + p.T4B + T4Cix;
  const T6        = T4D + p.T5;   // Total credits to Trading A/c
  const T9        = p.T9i + p.T9ii + p.T9iii;
  const T10xii    = p.T10i + p.T10ii + p.T10iii + p.T10iv + p.T10v + p.T10vi + p.T10vii + p.T10viii + p.T10ix + p.T10x + p.T10xi;
  const T11       = Math.max(0, Mfg3);
  const T12       = T6 - p.T7 - p.T8 - T9 - T10xii - T11; // Gross Profit from trading
  const PL13      = T12 + p.T12b;

  // P&L Income
  const PL14xii   = p.PL14i + p.PL14ii + p.PL14iii + p.PL14iv + p.PL14v + p.PL14vi + p.PL14vii
                  + p.PL14viii + p.PL14ix + p.PL14x + p.PL14xia + p.PL14xi;
  const PL15      = PL13 + PL14xii;

  // P&L Expenses
  const PL22xi    = p.PL22i + p.PL22ii + p.PL22iii + p.PL22iv + p.PL22v + p.PL22vi + p.PL22vii + p.PL22viii + p.PL22ix + p.PL22x;
  const PL23v     = p.PL23i + p.PL23ii + p.PL23iii + p.PL23iv;
  const PL30iii   = p.PL30i + p.PL30ii;
  const PL31iii   = p.PL31i + p.PL31ii;
  const PL32iii   = p.PL32i + p.PL32ii;
  const PL44x     = p.PL44i + p.PL44ii + p.PL44iii + p.PL44iv + p.PL44v + p.PL44vi + p.PL44vii + p.PL44viii + p.PL44ix;

  const totalExpenses = p.PL16 + p.PL17 + p.PL18 + p.PL19 + p.PL20 + p.PL21
    + PL22xi + PL23v + p.PL24 + p.PL25 + p.PL26 + p.PL27 + p.PL28 + p.PL29
    + PL30iii + PL31iii + PL32iii + p.PL33 + p.PL34 + p.PL35 + p.PL36 + p.PL37
    + p.PL38 + p.PL39 + p.PL40 + p.PL41 + p.PL42 + p.PL43 + PL44x
    + p.PL45 + p.PL46 + p.PL47 + p.PL48iv + p.PL49 + p.PL50;

  const PL51      = PL15 - totalExpenses; // EBITDA
  const PL52iii   = p.PL52ia + p.PL52ib + p.PL52iia + p.PL52iib;
  const NetProfitBeforeTaxes = PL51 - PL52iii - p.PL53; // Item 54
  const ProfitAfterTax = NetProfitBeforeTaxes - p.PL55 - p.PL56;

  // No-account totals
  const N65Total  = p.N65id + p.N65iid;
  const P66iv     = p.P66ii - p.P66iii;

  return {
    Mfg1Aiii, Mfg1D, Mfg1Evii, Mfg1F, Mfg2iii, Mfg3,
    T4Aiv, T4Cix, T4D, T6, T9, T10xii, T11, T12,
    PL13, PL14xii, PL15, PL22xi, PL23v, PL30iii, PL31iii, PL32iii, PL44x,
    totalExpenses, PL51, PL52iii, NetProfitBeforeTaxes, ProfitAfterTax,
    N65Total, P66iv,
  };
}

// ── UI Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '(' : '';
  const end  = n < 0 ? ')' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr${end}`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(2)} L${end}`;
  return `${sign}₹${abs.toLocaleString('en-IN')}${end}`;
}

const INP = 'w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-blue-500 bg-white';

function Row({ label, note, field, state, set }: {
  label: string; note?: string; field: keyof PLState;
  state: PLState; set: (k: keyof PLState, v: string) => void;
}) {
  return (
    <tr>
      <td className="py-1.5 pr-3 w-3/5">
        <div className="text-sm text-gray-700">{label}</div>
        {note && <div className="text-xs text-gray-400 mt-0.5">{note}</div>}
      </td>
      <td className="py-1.5 w-2/5">
        <input type="number" className={INP} value={state[field] || ''}
          onChange={e => set(field, e.target.value)} />
      </td>
    </tr>
  );
}

function Total({ label, value, level = 1 }: { label: string; value: number; level?: 1 | 2 | 3 }) {
  const bg   = level === 3 ? 'bg-blue-50 font-bold' : level === 2 ? 'bg-gray-100 font-semibold' : 'bg-gray-50 font-medium';
  const text = level === 3 ? 'text-blue-800 font-bold' : 'text-gray-700 font-semibold';
  const val  = level === 3 ? 'text-blue-700 font-bold' : 'text-gray-600 font-semibold';
  return (
    <tr className={bg}>
      <td className={`py-1.5 pr-3 text-sm ${text}`}>{label}</td>
      <td className={`py-1.5 text-right text-sm pr-1 font-mono ${val}`}>{fmt(value)}</td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
}

// ── Props & Component ──────────────────────────────────────────────────────────

interface Props {
  returnId: number;
  maintainsRegularBooks: boolean;
  initialData?: Partial<PLState> | null;
  onSaved?: (data: PLState) => void;
}

type SubTab = 'manufacturing' | 'trading' | 'pl' | 'presumptive' | 'speculative';

export default function ITR5PL({ returnId, maintainsRegularBooks, initialData, onSaved }: Props) {
  const [pl, setPL] = useState<PLState>({ ...ZERO, ...initialData });
  const [subTab, setSubTab] = useState<SubTab>(maintainsRegularBooks ? 'trading' : 'presumptive');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plRef = useRef(pl);
  useEffect(() => { plRef.current = pl; });

  useEffect(() => {
    if (initialData) setPL({ ...ZERO, ...initialData });
  }, [initialData]);

  useEffect(() => () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); save(plRef.current); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (data: PLState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5PL`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      setSavedAt(new Date());
      onSaved?.(data);
    } finally { setSaving(false); }
  }, [returnId, onSaved]);

  const set = useCallback((key: keyof PLState, val: string) => {
    setPL(prev => {
      const partial = { ...prev, [key]: Number(val) || 0 };
      const t = computePLTotals(partial);
      const next: PLState = {
        ...partial,
        Mfg3: t.Mfg3, T12: t.T12, PL13: t.PL13,
        PL14xii: t.PL14xii, PL15: t.PL15,
        PL22xi: t.PL22xi, PL44x: t.PL44x,
        PL51: t.PL51, PL52iii: t.PL52iii,
        NetProfitBeforeTaxes: t.NetProfitBeforeTaxes,
        ProfitAfterTax: t.ProfitAfterTax,
      };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1500);
      return next;
    });
  }, [save]);

  const t = computePLTotals(pl);

  // ── No account case ──────────────────────────────────────────────────────────
  if (!maintainsRegularBooks) {
    return (
      <div className="max-w-2xl space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Income Statement — No Account Case</h2>
          <div className="text-xs text-gray-400">{saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ''}</div>
        </div>

        <Section title="Item 65(i) — Business Income">
          <Row state={pl} set={set} label="(a) Gross receipts — Banking/digital mode (a1)" field="N65ia1" />
          <Row state={pl} set={set} label="(a) Gross receipts — Other mode (a2)" field="N65ia2" />
          <Total label="Total Gross Receipts (a1 + a2)" value={pl.N65ia1 + pl.N65ia2} />
          <Row state={pl} set={set} label="(b) Gross Profit" field="N65ib" />
          <Row state={pl} set={set} label="(c) Expenses" field="N65ic" />
          <Row state={pl} set={set} label="(d) Net Profit [b − c]" field="N65id" />
        </Section>

        <Section title="Item 65(ii) — Profession Income">
          <Row state={pl} set={set} label="(a) Gross receipts — Banking/digital mode (a1)" field="N65iia1" />
          <Row state={pl} set={set} label="(a) Gross receipts — Other mode (a2)" field="N65iia2" />
          <Total label="Total Gross Receipts" value={pl.N65iia1 + pl.N65iia2} />
          <Row state={pl} set={set} label="(b) Gross Profit" field="N65iib" />
          <Row state={pl} set={set} label="(c) Expenses" field="N65iic" />
          <Row state={pl} set={set} label="(d) Net Profit [b − c]" field="N65iid" />
        </Section>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
          <span className="text-sm font-bold text-blue-800">Total Net Profit (65(i)d + 65(ii)d)</span>
          <span className="text-xl font-bold text-blue-900 font-mono">{fmt(t.N65Total)}</span>
        </div>

        <Section title="Item 66 — Speculative Activity (if any)">
          <Row state={pl} set={set} label="(i) Turnover from speculative activity" field="P66i" />
          <Row state={pl} set={set} label="(ii) Gross Profit" field="P66ii" />
          <Row state={pl} set={set} label="(iii) Expenditure" field="P66iii" />
          <Total label="(iv) Net income from speculative activity (ii − iii)" value={t.P66iv} level={3} />
        </Section>
      </div>
    );
  }

  // ── Sub-tab header (regular books) ───────────────────────────────────────────
  const tabs: { id: SubTab; label: string; badge?: string }[] = [
    { id: 'manufacturing', label: 'Manufacturing A/c', badge: t.Mfg3 ? fmt(t.Mfg3) : undefined },
    { id: 'trading',       label: 'Trading A/c',       badge: fmt(t.T12) },
    { id: 'pl',            label: 'Profit & Loss A/c', badge: fmt(t.NetProfitBeforeTaxes) },
    { id: 'presumptive',   label: 'Presumptive (44AD/ADA)' },
    { id: 'speculative',   label: 'Speculative (66)' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-800">Part A — Accounts (Manufacturing / Trading / P&L)</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ''}</span>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${t.NetProfitBeforeTaxes >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            Net Profit (Item 54): {fmt(t.NetProfitBeforeTaxes)}
          </div>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`px-5 py-2.5 text-sm whitespace-nowrap flex items-center gap-2 border-b-2 transition-colors ${
              subTab === tab.id
                ? 'border-blue-600 text-blue-700 font-semibold bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 font-normal'
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${subTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">

        {/* ── MANUFACTURING ACCOUNT ── */}
        {subTab === 'manufacturing' && (
          <div className="max-w-2xl">
            <p className="text-xs text-gray-500 mb-4">Part A-Manufacturing Account for the financial year. Fill only if applicable. Cost of goods produced (Item 3) transfers automatically to Trading Account (Item 11).</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Section title="1 — Debits to Manufacturing Account">
                  <Total label="1A — Opening Inventory (i + ii)" value={t.Mfg1Aiii} />
                  <Row state={pl} set={set} label="1A(i) Opening stock of raw material" field="Mfg1Ai" />
                  <Row state={pl} set={set} label="1A(ii) Opening stock of WIP" field="Mfg1Aii" />
                  <Row state={pl} set={set} label="1B — Purchases (net of refunds & duty)" field="Mfg1B" />
                  <Row state={pl} set={set} label="1C — Direct wages" field="Mfg1C" />
                  <Total label="1D — Direct Expenses (i+ii+iii)" value={t.Mfg1D} />
                  <Row state={pl} set={set} label="1D(i) Carriage inward" field="Mfg1Di" />
                  <Row state={pl} set={set} label="1D(ii) Power and fuel" field="Mfg1Dii" />
                  <Row state={pl} set={set} label="1D(iii) Other direct expenses" field="Mfg1Diii" />
                  <Total label="1E — Factory Overheads (i to vi)" value={t.Mfg1Evii} />
                  <Row state={pl} set={set} label="1E(i) Indirect wages" field="Mfg1Ei" />
                  <Row state={pl} set={set} label="1E(ii) Factory rent and rates" field="Mfg1Eii" />
                  <Row state={pl} set={set} label="1E(iii) Factory insurance" field="Mfg1Eiii" />
                  <Row state={pl} set={set} label="1E(iv) Factory fuel and power" field="Mfg1Eiv" />
                  <Row state={pl} set={set} label="1E(v) Factory general expenses" field="Mfg1Ev" />
                  <Row state={pl} set={set} label="1E(vi) Depreciation of factory machinery" field="Mfg1Evi" />
                  <Total label="1F — Total Debits (1Aiii+B+C+D+Evii)" value={t.Mfg1F} level={2} />
                </Section>
              </div>
              <div>
                <Section title="2 — Closing Stock">
                  <Row state={pl} set={set} label="2(i) Raw material" field="Mfg2i" />
                  <Row state={pl} set={set} label="2(ii) Work-in-progress" field="Mfg2ii" />
                  <Total label="2(iii) Total (2i + 2ii)" value={t.Mfg2iii} level={2} />
                </Section>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-2">
                  <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Item 3 — Cost of Goods Produced</div>
                  <div className="text-2xl font-bold text-blue-800 font-mono">{fmt(t.Mfg3)}</div>
                  <div className="text-xs text-blue-500 mt-1">= 1F − 2(iii) → transfers to Trading A/c Item 11</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TRADING ACCOUNT ── */}
        {subTab === 'trading' && (
          <div className="max-w-2xl">
            <p className="text-xs text-gray-500 mb-4">Part A-Trading Account. Enter sales, purchases and direct expenses. Gross Profit (Item 12) transfers to P&L Account (Item 13).</p>
            <div className="grid grid-cols-2 gap-4">
              {/* Credits side */}
              <div>
                <Section title="Credits to Trading Account">
                  <Total label="4 — Revenue from Operations" value={t.T4D} />
                  <Total label="4A — Sales/Gross Receipts (i+ii+iii)" value={t.T4Aiv} />
                  <Row state={pl} set={set} label="4A(i) Sale of goods" field="T4Ai" />
                  <Row state={pl} set={set} label="4A(ii) Sale of services" field="T4Aii" />
                  <Row state={pl} set={set} label="4A(iii) Other operating revenues" field="T4Aiii" />
                  <Row state={pl} set={set} label="4B — Gross receipts from Profession" field="T4B" />
                  <Total label="4C — Duties/taxes received (i to viii)" value={t.T4Cix} />
                  <Row state={pl} set={set} label="4C(i) Union excise duties" field="T4Ci" />
                  <Row state={pl} set={set} label="4C(ii) Service tax" field="T4Cii" />
                  <Row state={pl} set={set} label="4C(iii) VAT/Sales tax" field="T4Ciii" />
                  <Row state={pl} set={set} label="4C(iv) CGST" field="T4Civ" />
                  <Row state={pl} set={set} label="4C(v) SGST" field="T4Cv" />
                  <Row state={pl} set={set} label="4C(vi) IGST" field="T4Cvi" />
                  <Row state={pl} set={set} label="4C(vii) UTGST" field="T4Cvii" />
                  <Row state={pl} set={set} label="4C(viii) Any other duty/tax" field="T4Cviii" />
                  <Total label="4D — Total Revenue (4Aiv + 4B + 4Cix)" value={t.T4D} level={2} />
                  <Row state={pl} set={set} label="5 — Closing Stock of Finished Goods" field="T5" />
                  <Total label="6 — Total Credits (4D + 5)" value={t.T6} level={2} />
                  <Row state={pl} set={set} label="12a — Turnover from Intraday Trading" field="T12a" />
                  <Row state={pl} set={set} label="12b — Income from Intraday Trading" field="T12b" />
                </Section>
              </div>
              {/* Debits side */}
              <div>
                <Section title="Debits to Trading Account">
                  <Row state={pl} set={set} label="7 — Opening Stock of Finished Goods" field="T7" />
                  <Row state={pl} set={set} label="8 — Purchases (net of refunds/duty)" field="T8" />
                  <Total label="9 — Direct Expenses (i+ii+iii)" value={t.T9} />
                  <Row state={pl} set={set} label="9(i) Carriage inward" field="T9i" />
                  <Row state={pl} set={set} label="9(ii) Power and fuel" field="T9ii" />
                  <Row state={pl} set={set} label="9(iii) Other direct expenses" field="T9iii" />
                  <Total label="10 — Duties and Taxes Paid (i to xi)" value={t.T10xii} />
                  <Row state={pl} set={set} label="10(i) Custom duty" field="T10i" />
                  <Row state={pl} set={set} label="10(ii) Counter veiling duty" field="T10ii" />
                  <Row state={pl} set={set} label="10(iii) Special additional duty" field="T10iii" />
                  <Row state={pl} set={set} label="10(iv) Union excise duty" field="T10iv" />
                  <Row state={pl} set={set} label="10(v) Service Tax" field="T10v" />
                  <Row state={pl} set={set} label="10(vi) VAT/Sales tax" field="T10vi" />
                  <Row state={pl} set={set} label="10(vii) CGST" field="T10vii" />
                  <Row state={pl} set={set} label="10(viii) SGST" field="T10viii" />
                  <Row state={pl} set={set} label="10(ix) IGST" field="T10ix" />
                  <Row state={pl} set={set} label="10(x) UTGST" field="T10x" />
                  <Row state={pl} set={set} label="10(xi) Any other tax" field="T10xi" />
                  {t.Mfg3 > 0 && <Total label={`11 — Cost of Goods Produced (from Mfg A/c Item 3)`} value={t.T11} />}
                </Section>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-2">
                  <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Item 12 — Gross Profit from Business/Profession</div>
                  <div className="text-2xl font-bold text-blue-800 font-mono">{fmt(t.T12)}</div>
                  <div className="text-xs text-blue-500 mt-1">= 6 − 7 − 8 − 9 − 10 − 11 → transfers to P&L A/c Item 13</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PROFIT & LOSS ACCOUNT ── */}
        {subTab === 'pl' && (
          <div className="max-w-2xl">
            <p className="text-xs text-gray-500 mb-4">Part A-P&L Account. Gross profit from Trading A/c flows in automatically as Item 13.</p>

            <Section title="Credits to P&L Account">
              <tr className="bg-green-50 font-semibold">
                <td className="py-1.5 pr-3 text-sm text-green-800">13 — Gross profit from Trading A/c (12 + 12b)</td>
                <td className="py-1.5 text-right text-sm font-bold text-green-700 font-mono pr-1">{fmt(t.PL13)}</td>
              </tr>
              <Total label="14 — Other Income (i to xi) — Total" value={t.PL14xii} />
              <Row state={pl} set={set} label="14(i) Rent" field="PL14i" />
              <Row state={pl} set={set} label="14(ii) Commission" field="PL14ii" />
              <Row state={pl} set={set} label="14(iii) Dividend income" field="PL14iii" />
              <Row state={pl} set={set} label="14(iv) Interest income" field="PL14iv" />
              <Row state={pl} set={set} label="14(v) Profit on sale of fixed assets" field="PL14v" />
              <Row state={pl} set={set} label="14(vi) Profit on sale of investments (STT paid)" field="PL14vi" />
              <Row state={pl} set={set} label="14(vii) Profit on sale of other investments" field="PL14vii" />
              <Row state={pl} set={set} label="14(viii) Forex gain/loss u/s 43AA" field="PL14viii" />
              <Row state={pl} set={set} label="14(ix) Conversion of inventory to capital asset u/s 28(via)" field="PL14ix" />
              <Row state={pl} set={set} label="14(x) Agricultural income" field="PL14x" />
              <Row state={pl} set={set} label="14(xia) Liabilities written back" field="PL14xia" />
              <Row state={pl} set={set} label="14(xi) Any other income (total)" field="PL14xi" />
              <Total label="15 — Total Credits to P&L (13 + 14xii)" value={t.PL15} level={2} />
            </Section>

            <Section title="Debits to P&L Account — Expenses">
              <Row state={pl} set={set} label="16 — Freight outward" field="PL16" />
              <Row state={pl} set={set} label="17 — Consumption of stores and spare parts" field="PL17" />
              <Row state={pl} set={set} label="18 — Power and fuel" field="PL18" />
              <Row state={pl} set={set} label="19 — Rents" field="PL19" />
              <Row state={pl} set={set} label="20 — Repairs to building" field="PL20" />
              <Row state={pl} set={set} label="21 — Repairs to machinery" field="PL21" />
              <Total label="22 — Compensation to Employees (22i to 22x)" value={t.PL22xi} />
              <Row state={pl} set={set} label="22(i) Salaries and wages" field="PL22i" />
              <Row state={pl} set={set} label="22(ii) Bonus" field="PL22ii" />
              <Row state={pl} set={set} label="22(iii) Medical expenses reimbursement" field="PL22iii" />
              <Row state={pl} set={set} label="22(iv) Leave encashment" field="PL22iv" />
              <Row state={pl} set={set} label="22(v) Leave travel benefits" field="PL22v" />
              <Row state={pl} set={set} label="22(vi) Contribution to approved superannuation fund" field="PL22vi" />
              <Row state={pl} set={set} label="22(vii) Contribution to recognised PF" field="PL22vii" />
              <Row state={pl} set={set} label="22(viii) Contribution to recognised gratuity fund" field="PL22viii" />
              <Row state={pl} set={set} label="22(ix) Contribution to any other fund" field="PL22ix" />
              <Row state={pl} set={set} label="22(x) Any other benefit to employees" field="PL22x" />
              <Row state={pl} set={set} label="22(xii) Amount paid to non-residents (if any)" field="PL22xiiAmt" note="Disclose if compensation paid to non-residents" />
              <Total label="23 — Insurance (i to iv)" value={t.PL23v} />
              <Row state={pl} set={set} label="23(i) Medical insurance" field="PL23i" />
              <Row state={pl} set={set} label="23(ii) Life insurance" field="PL23ii" />
              <Row state={pl} set={set} label="23(iii) Keyman's insurance" field="PL23iii" />
              <Row state={pl} set={set} label="23(iv) Other insurance (factory, office, car, goods)" field="PL23iv" />
              <Row state={pl} set={set} label="24 — Workmen and staff welfare" field="PL24" />
              <Row state={pl} set={set} label="25 — Entertainment" field="PL25" />
              <Row state={pl} set={set} label="26 — Hospitality" field="PL26" />
              <Row state={pl} set={set} label="27 — Conference" field="PL27" />
              <Row state={pl} set={set} label="28 — Sales promotion (other than advertisement)" field="PL28" />
              <Row state={pl} set={set} label="29 — Advertisement" field="PL29" />
              <Total label="30 — Commission (i + ii)" value={t.PL30iii} />
              <Row state={pl} set={set} label="30(i) Commission paid outside India / to non-residents" field="PL30i" />
              <Row state={pl} set={set} label="30(ii) Commission to others" field="PL30ii" />
              <Total label="31 — Royalty (i + ii)" value={t.PL31iii} />
              <Row state={pl} set={set} label="31(i) Royalty paid outside India / to non-residents" field="PL31i" />
              <Row state={pl} set={set} label="31(ii) Royalty to others" field="PL31ii" />
              <Total label="32 — Professional / Consultancy Fees (i + ii)" value={t.PL32iii} />
              <Row state={pl} set={set} label="32(i) Prof fees paid outside India / to non-residents" field="PL32i" />
              <Row state={pl} set={set} label="32(ii) Prof fees to others" field="PL32ii" />
              <Row state={pl} set={set} label="33 — Hotel, boarding and lodging" field="PL33" />
              <Row state={pl} set={set} label="34 — Travelling expenses (other than foreign)" field="PL34" />
              <Row state={pl} set={set} label="35 — Foreign travelling expenses" field="PL35" />
              <Row state={pl} set={set} label="36 — Conveyance expenses" field="PL36" />
              <Row state={pl} set={set} label="37 — Telephone expenses" field="PL37" />
              <Row state={pl} set={set} label="38 — Guest house expenses" field="PL38" />
              <Row state={pl} set={set} label="39 — Club expenses" field="PL39" />
              <Row state={pl} set={set} label="40 — Festival celebration expenses" field="PL40" />
              <Row state={pl} set={set} label="41 — Scholarship" field="PL41" />
              <Row state={pl} set={set} label="42 — Gift" field="PL42" />
              <Row state={pl} set={set} label="43 — Donation" field="PL43" />
              <Total label="44 — Rates and Taxes (i to ix)" value={t.PL44x} />
              <Row state={pl} set={set} label="44(i) Union excise duty" field="PL44i" />
              <Row state={pl} set={set} label="44(ii) Service tax" field="PL44ii" />
              <Row state={pl} set={set} label="44(iii) VAT/Sales tax" field="PL44iii" />
              <Row state={pl} set={set} label="44(iv) Cess" field="PL44iv" />
              <Row state={pl} set={set} label="44(v) CGST" field="PL44v" />
              <Row state={pl} set={set} label="44(vi) SGST" field="PL44vi" />
              <Row state={pl} set={set} label="44(vii) IGST" field="PL44vii" />
              <Row state={pl} set={set} label="44(viii) UTGST" field="PL44viii" />
              <Row state={pl} set={set} label="44(ix) Any other rate/tax/duty/cess (incl. STT, CTT)" field="PL44ix" />
              <Row state={pl} set={set} label="45 — Audit fee" field="PL45" />
              <Row state={pl} set={set} label="46 — Salary/Remuneration to Partners of the firm" field="PL46" />
              <Row state={pl} set={set} label="47 — Other expenses (total of all)" field="PL47" note="Enter total; attach details separately if required" />
              <Row state={pl} set={set} label="48(iv) — Bad debts (total: 48i + 48ii + 48iii)" field="PL48iv" note="Enter total bad debts; enter PAN-wise details in Schedule DB" />
              <Row state={pl} set={set} label="49 — Provision for bad and doubtful debts" field="PL49" />
              <Row state={pl} set={set} label="50 — Other provisions" field="PL50" />
              <Total label="51 — Profit before Interest, Depreciation and Taxes (EBITDA)" value={t.PL51} level={2} />
            </Section>

            <Section title="Interest, Depreciation & Tax">
              <Total label="52 — Interest (ia + ib + iia + iib)" value={t.PL52iii} />
              <Row state={pl} set={set} label="52(i)(a) Interest to Partners — outside India/non-residents" field="PL52ia" />
              <Row state={pl} set={set} label="52(i)(b) Interest to others — outside India/non-residents" field="PL52ib" />
              <Row state={pl} set={set} label="52(ii)(a) Interest to Partners — India/residents" field="PL52iia" />
              <Row state={pl} set={set} label="52(ii)(b) Interest to others — India/residents" field="PL52iib" />
              <Row state={pl} set={set} label="53 — Depreciation and amortization (as per books)" field="PL53" />
              <Total label="54 — Net Profit Before Taxes (51 − 52iii − 53)" value={t.NetProfitBeforeTaxes} level={3} />
              <Row state={pl} set={set} label="55 — Provision for current tax" field="PL55" />
              <Row state={pl} set={set} label="56 — Provision for deferred tax" field="PL56" />
              <Total label="57 — Profit After Tax (54 − 55 − 56)" value={t.ProfitAfterTax} level={2} />
              <Row state={pl} set={set} label="58 — Balance brought forward from previous year" field="PL58" />
              <Total label="59 — Amount available for appropriation (57 + 58)" value={t.ProfitAfterTax + pl.PL58} />
              <Row state={pl} set={set} label="60 — Transferred to reserves and surplus" field="PL60" />
              <Total label="61 — Balance carried to Balance Sheet (59 − 60)" value={t.ProfitAfterTax + pl.PL58 - pl.PL60} level={2} />
            </Section>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <strong>Item 54 Net Profit Before Tax: {fmt(t.NetProfitBeforeTaxes)}</strong> flows automatically to Schedule BP (Item 1) as the starting point for tax adjustments.
            </div>
          </div>
        )}

        {/* ── PRESUMPTIVE INCOME ── */}
        {subTab === 'presumptive' && (
          <div className="max-w-2xl space-y-4">
            <Section title="Item 62 — Presumptive Income u/s 44AD (Business)">
              <Row state={pl} set={set} label="62(i)(A) Gross Turnover — Banking/digital mode" field="P62iA" />
              <Row state={pl} set={set} label="62(i)(B) Gross Turnover — Cash" field="P62iB" />
              <Row state={pl} set={set} label="62(i)(C) Gross Turnover — Other mode" field="P62iC" />
              <Total label="Total Gross Turnover (A+B+C)" value={pl.P62iA + pl.P62iB + pl.P62iC} />
              <Row state={pl} set={set} label="62(ii)(A) Presumptive Income @ 6% of 62iA (or higher)" field="P62iiA" />
              <Row state={pl} set={set} label="62(ii)(B) Presumptive Income @ 8% of (62iB+62iC) (or higher)" field="P62iiB" />
              <Total label="Total Presumptive Income u/s 44AD (ii A + ii B)" value={pl.P62iiA + pl.P62iiB} level={3} />
            </Section>
            <Section title="Item 63 — Presumptive Income u/s 44ADA (Profession)">
              <Row state={pl} set={set} label="63(i)(A) Gross Receipts — Banking/digital mode" field="P63iA" />
              <Row state={pl} set={set} label="63(i)(B) Gross Receipts — Cash" field="P63iB" />
              <Row state={pl} set={set} label="63(i)(C) Gross Receipts — Other mode" field="P63iC" />
              <Total label="Total Gross Receipts" value={pl.P63iA + pl.P63iB + pl.P63iC} />
              <Row state={pl} set={set} label="63(ii) Presumptive Income u/s 44ADA (50% or higher)" field="P63ii" />
              <Total label="Presumptive Income u/s 44ADA" value={pl.P63ii} level={3} />
            </Section>
          </div>
        )}

        {/* ── SPECULATIVE ── */}
        {subTab === 'speculative' && (
          <div className="max-w-lg">
            <Section title="Item 66 — Speculative Activity">
              <Row state={pl} set={set} label="66(i) Turnover from speculative activity" field="P66i" />
              <Row state={pl} set={set} label="66(ii) Gross Profit" field="P66ii" />
              <Row state={pl} set={set} label="66(iii) Expenditure" field="P66iii" />
              <Total label="66(iv) Net income from speculative activity (ii − iii)" value={t.P66iv} level={3} />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
