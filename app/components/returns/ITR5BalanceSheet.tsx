'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface BSState {
  // Sources
  PartnersCapital: number;
  ReservesRevaluation: number;
  ReservesCapital: number;
  ReservesStatutory: number;
  ReservesOther: number;
  ReservesPLCredit: number;
  SecuredFCYLoans: number;
  SecuredLoansFromBanks: number;
  SecuredLoansFromOthers: number;
  UnsecuredFCYLoans: number;
  UnsecuredLoansFromBanks: number;
  UnsecuredLoansFrom40A2b: number;
  UnsecuredLoansFromOthers: number;
  DeferredTaxLiability: number;
  AdvancesFrom40A2b: number;
  AdvancesFromOthers: number;
  // Application
  GrossBlock: number;
  Depreciation: number;
  CapitalWIP: number;
  LTInvProperty: number;
  LTInvListedEquity: number;
  LTInvUnlistedEquity: number;
  LTInvPrefShares: number;
  LTInvGovtTrust: number;
  LTInvDebentures: number;
  LTInvMF: number;
  LTInvOthers: number;
  STInvListedEquity: number;
  STInvUnlistedEquity: number;
  STInvPrefShares: number;
  STInvGovtTrust: number;
  STInvDebentures: number;
  STInvMF: number;
  STInvOthers: number;
  InventoriesRawMaterial: number;
  InventoriesWIP: number;
  InventoriesFinishedGoods: number;
  InventoriesStockInTrade: number;
  InventoriesOthers: number;
  SundryDebtorsMoreThan1Yr: number;
  SundryDebtorsOthers: number;
  BalanceWithBanks: number;
  CashInHand: number;
  OtherCashBankBalances: number;
  OtherCurrentAssets: number;
  LoansRecoverable: number;
  LoansDepositsToOthers: number;
  LoansRevenueAuthorities: number;
  CLSundryCreditors1Yr: number;
  CLSundryCreditsOthers: number;
  CLLeasedAssets: number;
  CLInterestOnLeasedAsset: number;
  CLInterestAccruedNotDue: number;
  CLIncomeReceivedInAdvance: number;
  CLOtherPayables: number;
  CLOther: number;
  ProvisionsIncomeTax: number;
  ProvisionsLeaveGratuity: number;
  ProvisionsOther: number;
  MiscExpenditure: number;
  DeferredTaxAsset: number;
  DebitPLBalance: number;
}

const ZERO_BS: BSState = {
  PartnersCapital: 0, ReservesRevaluation: 0, ReservesCapital: 0, ReservesStatutory: 0,
  ReservesOther: 0, ReservesPLCredit: 0,
  SecuredFCYLoans: 0, SecuredLoansFromBanks: 0, SecuredLoansFromOthers: 0,
  UnsecuredFCYLoans: 0, UnsecuredLoansFromBanks: 0, UnsecuredLoansFrom40A2b: 0, UnsecuredLoansFromOthers: 0,
  DeferredTaxLiability: 0, AdvancesFrom40A2b: 0, AdvancesFromOthers: 0,
  GrossBlock: 0, Depreciation: 0, CapitalWIP: 0,
  LTInvProperty: 0, LTInvListedEquity: 0, LTInvUnlistedEquity: 0, LTInvPrefShares: 0,
  LTInvGovtTrust: 0, LTInvDebentures: 0, LTInvMF: 0, LTInvOthers: 0,
  STInvListedEquity: 0, STInvUnlistedEquity: 0, STInvPrefShares: 0, STInvGovtTrust: 0,
  STInvDebentures: 0, STInvMF: 0, STInvOthers: 0,
  InventoriesRawMaterial: 0, InventoriesWIP: 0, InventoriesFinishedGoods: 0,
  InventoriesStockInTrade: 0, InventoriesOthers: 0,
  SundryDebtorsMoreThan1Yr: 0, SundryDebtorsOthers: 0,
  BalanceWithBanks: 0, CashInHand: 0, OtherCashBankBalances: 0, OtherCurrentAssets: 0,
  LoansRecoverable: 0, LoansDepositsToOthers: 0, LoansRevenueAuthorities: 0,
  CLSundryCreditors1Yr: 0, CLSundryCreditsOthers: 0,
  CLLeasedAssets: 0, CLInterestOnLeasedAsset: 0, CLInterestAccruedNotDue: 0,
  CLIncomeReceivedInAdvance: 0, CLOtherPayables: 0, CLOther: 0,
  ProvisionsIncomeTax: 0, ProvisionsLeaveGratuity: 0, ProvisionsOther: 0,
  MiscExpenditure: 0, DeferredTaxAsset: 0, DebitPLBalance: 0,
};

function sum(...vals: number[]) { return vals.reduce((a, b) => a + b, 0); }
function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${s}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${s}₹${(abs / 100000).toFixed(2)} L`;
  return `${s}₹${abs.toLocaleString('en-IN')}`;
}

const INP = 'w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-blue-500';

function Row({ label, field, sub, bs, prev, set }: {
  label: string;
  field: keyof BSState;
  sub?: boolean;
  bs: BSState;
  prev?: BSState | null;
  set: (key: keyof BSState, val: string) => void;
}) {
  const prevVal = prev?.[field] ?? 0;
  return (
    <tr>
      <td className="py-1 pr-2">
        <span className={sub ? 'text-xs text-gray-500 pl-4' : 'text-sm text-gray-700'}>{label}</span>
        {prevVal ? <span className="block text-xs text-gray-400 pl-4">{prevVal.toLocaleString('en-IN')}</span> : null}
      </td>
      <td className="py-1 w-40">
        <input
          type="number"
          className={INP}
          value={bs[field] || ''}
          onChange={e => set(field, e.target.value)}
        />
      </td>
    </tr>
  );
}

interface Props {
  returnId: number;
  initialData?: Partial<BSState> | null;
  onSaved?: (data: BSState) => void;
}

export default function ITR5BalanceSheet({ returnId, initialData, onSaved }: Props) {
  const [bs, setBS] = useState<BSState>({ ...ZERO_BS, ...initialData });
  const [prevBS, setPrevBS] = useState<BSState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialData) setBS({ ...ZERO_BS, ...initialData });
  }, [initialData]);

  useEffect(() => {
    fetch(`/api/returns/${returnId}/client-defaults`)
      .then(r => r.json())
      .then(({ data }) => {
        if (data?.priorBalanceSheet) setPrevBS({ ...ZERO_BS, ...data.priorBalanceSheet });
      })
      .catch(() => { /* non-fatal */ });
  }, [returnId]);

  const save = useCallback(async (data: BSState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5BalanceSheet`, {
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

  const set = useCallback((key: keyof BSState, val: string) => {
    setBS(prev => {
      const next = { ...prev, [key]: Number(val) || 0 };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1500);
      return next;
    });
  }, [save]);

  // ── Computed totals ──
  const totalPartnersReserves = sum(bs.PartnersCapital, bs.ReservesRevaluation, bs.ReservesCapital, bs.ReservesStatutory, bs.ReservesOther, bs.ReservesPLCredit);
  const totalSecuredLoans = sum(bs.SecuredFCYLoans, bs.SecuredLoansFromBanks, bs.SecuredLoansFromOthers);
  const totalUnsecuredLoans = sum(bs.UnsecuredFCYLoans, bs.UnsecuredLoansFromBanks, bs.UnsecuredLoansFrom40A2b, bs.UnsecuredLoansFromOthers);
  const totalAdvances = sum(bs.AdvancesFrom40A2b, bs.AdvancesFromOthers);
  const totalSources = sum(totalPartnersReserves, totalSecuredLoans, totalUnsecuredLoans, bs.DeferredTaxLiability, totalAdvances);

  const netBlock = bs.GrossBlock - bs.Depreciation;
  const totalFixedAssets = sum(netBlock, bs.CapitalWIP);
  const totalLTInv = sum(bs.LTInvProperty, bs.LTInvListedEquity, bs.LTInvUnlistedEquity, bs.LTInvPrefShares, bs.LTInvGovtTrust, bs.LTInvDebentures, bs.LTInvMF, bs.LTInvOthers);
  const totalSTInv = sum(bs.STInvListedEquity, bs.STInvUnlistedEquity, bs.STInvPrefShares, bs.STInvGovtTrust, bs.STInvDebentures, bs.STInvMF, bs.STInvOthers);
  const totalInventories = sum(bs.InventoriesRawMaterial, bs.InventoriesWIP, bs.InventoriesFinishedGoods, bs.InventoriesStockInTrade, bs.InventoriesOthers);
  const totalDebtors = sum(bs.SundryDebtorsMoreThan1Yr, bs.SundryDebtorsOthers);
  const totalCashBank = sum(bs.BalanceWithBanks, bs.CashInHand, bs.OtherCashBankBalances);
  const totalCurrentAssets = sum(totalInventories, totalDebtors, totalCashBank, bs.OtherCurrentAssets);
  const totalLoansAdv = sum(bs.LoansRecoverable, bs.LoansDepositsToOthers, bs.LoansRevenueAuthorities);
  const totalCL = sum(
    bs.CLSundryCreditors1Yr, bs.CLSundryCreditsOthers,
    bs.CLLeasedAssets, bs.CLInterestOnLeasedAsset, bs.CLInterestAccruedNotDue,
    bs.CLIncomeReceivedInAdvance, bs.CLOtherPayables, bs.CLOther,
    bs.ProvisionsIncomeTax, bs.ProvisionsLeaveGratuity, bs.ProvisionsOther,
  );
  const totalApplication = sum(totalFixedAssets, totalLTInv, totalSTInv, totalCurrentAssets, totalLoansAdv, -totalCL, bs.MiscExpenditure, bs.DeferredTaxAsset, bs.DebitPLBalance);

  const balanced = Math.abs(totalSources - totalApplication) < 2;

  const inp = 'w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-blue-500';

  function TotalRow({ label, value, prevValue }: { label: string; value: number; prevValue?: number }) {
    return (
      <tr className="bg-gray-50 font-semibold text-sm text-gray-800">
        <td className="py-1.5 pr-2 font-semibold">
          {label}
          {prevValue ? <span className="block text-xs text-gray-400 font-normal pl-0">{prevValue.toLocaleString('en-IN')}</span> : null}
        </td>
        <td className="py-1.5 text-right pr-1 text-blue-700">{fmt(value)}</td>
      </tr>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">ITR-5 — Balance Sheet (Part A-BS)</h2>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-blue-500">Saving…</span>}
          {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt.toLocaleTimeString()}</span>}
          <span className={`text-sm font-medium px-2 py-0.5 rounded ${balanced ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {balanced ? '✓ Balanced' : `⚠ Diff ₹${Math.abs(totalSources - totalApplication).toLocaleString('en-IN')}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* SOURCES */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Sources of Funds</h3>
          <table className="w-full border-collapse">
            <tbody>
              <Row label="Partners' / Members' Capital" field="PartnersCapital" bs={bs} prev={prevBS} set={set} />
              <Row label="Reserves — Revaluation" field="ReservesRevaluation" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Reserves — Capital" field="ReservesCapital" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Reserves — Statutory" field="ReservesStatutory" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Reserves — Other" field="ReservesOther" sub bs={bs} prev={prevBS} set={set} />
              <Row label="P&L Credit Balance" field="ReservesPLCredit" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Partners' Fund" value={totalPartnersReserves} prevValue={prevBS ? sum(prevBS.PartnersCapital, prevBS.ReservesRevaluation, prevBS.ReservesCapital, prevBS.ReservesStatutory, prevBS.ReservesOther, prevBS.ReservesPLCredit) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Secured Loans</span></td></tr>
              <Row label="Foreign Currency Loans" field="SecuredFCYLoans" sub bs={bs} prev={prevBS} set={set} />
              <Row label="From Banks (Rupee)" field="SecuredLoansFromBanks" sub bs={bs} prev={prevBS} set={set} />
              <Row label="From Others (Rupee)" field="SecuredLoansFromOthers" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Secured Loans" value={totalSecuredLoans} prevValue={prevBS ? sum(prevBS.SecuredFCYLoans, prevBS.SecuredLoansFromBanks, prevBS.SecuredLoansFromOthers) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Unsecured Loans</span></td></tr>
              <Row label="Foreign Currency Loans" field="UnsecuredFCYLoans" sub bs={bs} prev={prevBS} set={set} />
              <Row label="From Banks (Rupee)" field="UnsecuredLoansFromBanks" sub bs={bs} prev={prevBS} set={set} />
              <Row label="From persons u/s 40A(2)(b)" field="UnsecuredLoansFrom40A2b" sub bs={bs} prev={prevBS} set={set} />
              <Row label="From Others (Rupee)" field="UnsecuredLoansFromOthers" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Unsecured Loans" value={totalUnsecuredLoans} prevValue={prevBS ? sum(prevBS.UnsecuredFCYLoans, prevBS.UnsecuredLoansFromBanks, prevBS.UnsecuredLoansFrom40A2b, prevBS.UnsecuredLoansFromOthers) : undefined} />

              <Row label="Deferred Tax Liability" field="DeferredTaxLiability" bs={bs} prev={prevBS} set={set} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Advances</span></td></tr>
              <Row label="From persons u/s 40A(2)(b)" field="AdvancesFrom40A2b" sub bs={bs} prev={prevBS} set={set} />
              <Row label="From Others" field="AdvancesFromOthers" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Advances" value={totalAdvances} prevValue={prevBS ? sum(prevBS.AdvancesFrom40A2b, prevBS.AdvancesFromOthers) : undefined} />

              <tr className="border-t-2 border-gray-400 bg-blue-50">
                <td className="py-2 font-bold text-gray-900">
                  TOTAL SOURCES
                  {prevBS ? <span className="block text-xs text-gray-400 font-normal">{sum(sum(prevBS.PartnersCapital, prevBS.ReservesRevaluation, prevBS.ReservesCapital, prevBS.ReservesStatutory, prevBS.ReservesOther, prevBS.ReservesPLCredit), sum(prevBS.SecuredFCYLoans, prevBS.SecuredLoansFromBanks, prevBS.SecuredLoansFromOthers), sum(prevBS.UnsecuredFCYLoans, prevBS.UnsecuredLoansFromBanks, prevBS.UnsecuredLoansFrom40A2b, prevBS.UnsecuredLoansFromOthers), prevBS.DeferredTaxLiability, sum(prevBS.AdvancesFrom40A2b, prevBS.AdvancesFromOthers)).toLocaleString('en-IN')}</span> : null}
                </td>
                <td className="py-2 text-right font-bold text-blue-800">{fmt(totalSources)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* APPLICATION */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Application of Funds</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-1 text-left text-xs text-gray-400 font-normal">Particulars</th>
                <th className="pb-1 text-right pr-3 text-xs text-gray-400 font-normal w-28">Prev. Year</th>
                <th className="pb-1 text-right text-xs text-gray-400 font-normal w-40">Current Year</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={2} className="pb-1"><span className="text-xs font-semibold text-gray-500">Fixed Assets</span></td></tr>
              <Row label="Gross Block" field="GrossBlock" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Less: Depreciation" field="Depreciation" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Net Block" value={netBlock} prevValue={prevBS ? prevBS.GrossBlock - prevBS.Depreciation : undefined} />
              <Row label="Capital WIP" field="CapitalWIP" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Fixed Assets" value={totalFixedAssets} prevValue={prevBS ? (prevBS.GrossBlock - prevBS.Depreciation + prevBS.CapitalWIP) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Long-term Investments</span></td></tr>
              <Row label="Immovable Property" field="LTInvProperty" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Listed Equity" field="LTInvListedEquity" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Unlisted Equity" field="LTInvUnlistedEquity" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Pref. Shares" field="LTInvPrefShares" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Govt / Trust Securities" field="LTInvGovtTrust" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Debentures / Bonds" field="LTInvDebentures" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Mutual Funds" field="LTInvMF" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Others" field="LTInvOthers" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total LT Investments" value={totalLTInv} prevValue={prevBS ? sum(prevBS.LTInvProperty, prevBS.LTInvListedEquity, prevBS.LTInvUnlistedEquity, prevBS.LTInvPrefShares, prevBS.LTInvGovtTrust, prevBS.LTInvDebentures, prevBS.LTInvMF, prevBS.LTInvOthers) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Short-term Investments</span></td></tr>
              <Row label="Listed Equity" field="STInvListedEquity" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Unlisted Equity" field="STInvUnlistedEquity" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Pref. Shares" field="STInvPrefShares" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Govt / Trust Securities" field="STInvGovtTrust" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Debentures / Bonds" field="STInvDebentures" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Mutual Funds" field="STInvMF" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Others" field="STInvOthers" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total ST Investments" value={totalSTInv} prevValue={prevBS ? sum(prevBS.STInvListedEquity, prevBS.STInvUnlistedEquity, prevBS.STInvPrefShares, prevBS.STInvGovtTrust, prevBS.STInvDebentures, prevBS.STInvMF, prevBS.STInvOthers) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Inventories</span></td></tr>
              <Row label="Raw Material" field="InventoriesRawMaterial" sub bs={bs} prev={prevBS} set={set} />
              <Row label="WIP" field="InventoriesWIP" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Finished Goods" field="InventoriesFinishedGoods" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Stock-in-Trade" field="InventoriesStockInTrade" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Others" field="InventoriesOthers" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Inventories" value={totalInventories} prevValue={prevBS ? sum(prevBS.InventoriesRawMaterial, prevBS.InventoriesWIP, prevBS.InventoriesFinishedGoods, prevBS.InventoriesStockInTrade, prevBS.InventoriesOthers) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Sundry Debtors</span></td></tr>
              <Row label="Outstanding > 1 year" field="SundryDebtorsMoreThan1Yr" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Others" field="SundryDebtorsOthers" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Debtors" value={totalDebtors} prevValue={prevBS ? sum(prevBS.SundryDebtorsMoreThan1Yr, prevBS.SundryDebtorsOthers) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Cash & Bank Balances</span></td></tr>
              <Row label="Balance with Banks" field="BalanceWithBanks" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Cash-in-Hand" field="CashInHand" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Other Cash / Bank" field="OtherCashBankBalances" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Cash & Bank" value={totalCashBank} prevValue={prevBS ? sum(prevBS.BalanceWithBanks, prevBS.CashInHand, prevBS.OtherCashBankBalances) : undefined} />

              <Row label="Other Current Assets" field="OtherCurrentAssets" bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Current Assets" value={totalCurrentAssets} prevValue={prevBS ? sum(sum(prevBS.InventoriesRawMaterial, prevBS.InventoriesWIP, prevBS.InventoriesFinishedGoods, prevBS.InventoriesStockInTrade, prevBS.InventoriesOthers), sum(prevBS.SundryDebtorsMoreThan1Yr, prevBS.SundryDebtorsOthers), sum(prevBS.BalanceWithBanks, prevBS.CashInHand, prevBS.OtherCashBankBalances), prevBS.OtherCurrentAssets) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-gray-500">Loans & Advances</span></td></tr>
              <Row label="Recoverable in cash or kind" field="LoansRecoverable" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Deposits / Others" field="LoansDepositsToOthers" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Advance Tax / TDS" field="LoansRevenueAuthorities" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total Loans & Advances" value={totalLoansAdv} prevValue={prevBS ? sum(prevBS.LoansRecoverable, prevBS.LoansDepositsToOthers, prevBS.LoansRevenueAuthorities) : undefined} />

              <tr><td colSpan={2} className="pt-3 pb-1"><span className="text-xs font-semibold text-red-500">Less: Current Liabilities</span></td></tr>
              <Row label="Sundry Creditors > 1 yr" field="CLSundryCreditors1Yr" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Sundry Creditors Others" field="CLSundryCreditsOthers" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Liability for Leased Assets" field="CLLeasedAssets" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Interest Accrued on Leased Asset" field="CLInterestOnLeasedAsset" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Interest Accrued but Not Due" field="CLInterestAccruedNotDue" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Income Received in Advance" field="CLIncomeReceivedInAdvance" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Other Payables" field="CLOtherPayables" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Other Liabilities" field="CLOther" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Provisions — Income Tax" field="ProvisionsIncomeTax" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Provisions — Leave / Gratuity / Superannuation" field="ProvisionsLeaveGratuity" sub bs={bs} prev={prevBS} set={set} />
              <Row label="Provisions — Others" field="ProvisionsOther" sub bs={bs} prev={prevBS} set={set} />
              <TotalRow label="Total CL & Provisions" value={totalCL} prevValue={prevBS ? sum(prevBS.CLSundryCreditors1Yr, prevBS.CLSundryCreditsOthers, prevBS.CLLeasedAssets, prevBS.CLInterestOnLeasedAsset, prevBS.CLInterestAccruedNotDue, prevBS.CLIncomeReceivedInAdvance, prevBS.CLOtherPayables, prevBS.CLOther, prevBS.ProvisionsIncomeTax, prevBS.ProvisionsLeaveGratuity, prevBS.ProvisionsOther) : undefined} />

              <Row label="Misc. Expenditure (unamortised)" field="MiscExpenditure" bs={bs} prev={prevBS} set={set} />
              <Row label="Deferred Tax Asset" field="DeferredTaxAsset" bs={bs} prev={prevBS} set={set} />
              <Row label="Debit Balance in P&L" field="DebitPLBalance" bs={bs} prev={prevBS} set={set} />

              <tr className="border-t-2 border-gray-400 bg-blue-50">
                <td className="py-2 font-bold text-gray-900">
                  TOTAL APPLICATION
                  {prevBS ? <span className="block text-xs text-gray-400 font-normal">{sum(prevBS.GrossBlock - prevBS.Depreciation + prevBS.CapitalWIP, sum(prevBS.LTInvProperty, prevBS.LTInvListedEquity, prevBS.LTInvUnlistedEquity, prevBS.LTInvPrefShares, prevBS.LTInvGovtTrust, prevBS.LTInvDebentures, prevBS.LTInvMF, prevBS.LTInvOthers), sum(prevBS.STInvListedEquity, prevBS.STInvUnlistedEquity, prevBS.STInvPrefShares, prevBS.STInvGovtTrust, prevBS.STInvDebentures, prevBS.STInvMF, prevBS.STInvOthers), sum(prevBS.InventoriesRawMaterial, prevBS.InventoriesWIP, prevBS.InventoriesFinishedGoods, prevBS.InventoriesStockInTrade, prevBS.InventoriesOthers, prevBS.SundryDebtorsMoreThan1Yr, prevBS.SundryDebtorsOthers, prevBS.BalanceWithBanks, prevBS.CashInHand, prevBS.OtherCashBankBalances, prevBS.OtherCurrentAssets), sum(prevBS.LoansRecoverable, prevBS.LoansDepositsToOthers, prevBS.LoansRevenueAuthorities), -sum(prevBS.CLSundryCreditors1Yr, prevBS.CLSundryCreditsOthers, prevBS.CLLeasedAssets, prevBS.CLInterestOnLeasedAsset, prevBS.CLInterestAccruedNotDue, prevBS.CLIncomeReceivedInAdvance, prevBS.CLOtherPayables, prevBS.CLOther, prevBS.ProvisionsIncomeTax, prevBS.ProvisionsLeaveGratuity, prevBS.ProvisionsOther), prevBS.MiscExpenditure, prevBS.DeferredTaxAsset, prevBS.DebitPLBalance).toLocaleString('en-IN')}</span> : null}
                </td>
                <td className="py-2 text-right font-bold text-blue-800">{fmt(totalApplication)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
