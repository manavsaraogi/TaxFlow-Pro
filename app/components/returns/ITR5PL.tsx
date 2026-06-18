'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── State ─────────────────────────────────────────────────────────────────────

export interface PLState {
  // No-account case (Item 65)
  BizGrossReceiptsElectronic: number;
  BizGrossReceiptsOther: number;
  BizGrossProfit: number;
  BizExpenses: number;
  BizNetProfit: number;
  ProfGrossReceiptsElectronic: number;
  ProfGrossReceiptsOther: number;
  ProfGrossProfit: number;
  ProfExpenses: number;
  ProfNetProfit: number;

  // Manufacturing Account
  MfgOpeningWIP: number;
  MfgRawMaterialOpening: number;
  MfgRawMaterialPurchases: number;
  MfgRawMaterialClosing: number;
  MfgDirectWages: number;
  MfgFactoryRent: number;
  MfgPowerFuelFactory: number;
  MfgRepairsMachinery: number;
  MfgDepreciation: number;
  MfgOtherMfgExpenses: number;
  MfgClosingWIP: number;

  // Trading Account
  TradingOpeningStock: number;
  TradingPurchasesCash: number;
  TradingPurchasesElectronic: number;
  TradingPurchaseReturns: number;
  TradingCustomsDuty: number;
  TradingFreightInward: number;
  TradingOtherDirectExp: number;
  TradingSalesCash: number;
  TradingSalesElectronic: number;
  TradingSalesReturns: number;
  TradingClosingStock: number;

  // P&L — Income
  GrossProfitFromTrading: number;  // auto-computed; stored for fallback
  OtherIncomeRent: number;
  OtherIncomeCommission: number;
  OtherIncomeDividend: number;
  OtherIncomeInterest: number;
  OtherIncomeSaleFixedAsset: number;
  OtherIncomeInvSTT: number;
  OtherIncomeOtherInv: number;
  OtherIncomeForexGainLoss: number;
  OtherIncomeInvToCapital: number;
  OtherIncomeAgricultural: number;
  OtherIncomeOther: number;

  // P&L — Expenses
  FreightOutward: number;
  PowerAndFuel: number;
  Rents: number;
  RepairsBuilding: number;
  RepairsMachinery: number;
  TotalEmployeeComp: number;
  TotalInsurance: number;
  WorkmenWelfare: number;
  Advertisement: number;
  TotalCommission: number;
  TotalProfFees: number;
  TravellingExpenses: number;
  TelephoneExpenses: number;
  Donation: number;
  TotalRatesAndTaxes: number;
  AuditFee: number;
  PartnersSalary: number;
  OtherExpenses: number;
  TotalBadDebts: number;
  DepreciationPL: number;

  // Profit Appropriation
  NetProfitBeforeTaxes: number;   // computed; stored so itrBuilder can read it
  ProvisionCurrentTax: number;
  ProfitAfterTax: number;
  BalanceBroughtForward: number;
  TransferToReserves: number;
}

const ZERO: PLState = {
  BizGrossReceiptsElectronic: 0, BizGrossReceiptsOther: 0, BizGrossProfit: 0, BizExpenses: 0, BizNetProfit: 0,
  ProfGrossReceiptsElectronic: 0, ProfGrossReceiptsOther: 0, ProfGrossProfit: 0, ProfExpenses: 0, ProfNetProfit: 0,
  MfgOpeningWIP: 0, MfgRawMaterialOpening: 0, MfgRawMaterialPurchases: 0, MfgRawMaterialClosing: 0,
  MfgDirectWages: 0, MfgFactoryRent: 0, MfgPowerFuelFactory: 0, MfgRepairsMachinery: 0,
  MfgDepreciation: 0, MfgOtherMfgExpenses: 0, MfgClosingWIP: 0,
  TradingOpeningStock: 0, TradingPurchasesCash: 0, TradingPurchasesElectronic: 0,
  TradingPurchaseReturns: 0, TradingCustomsDuty: 0, TradingFreightInward: 0, TradingOtherDirectExp: 0,
  TradingSalesCash: 0, TradingSalesElectronic: 0, TradingSalesReturns: 0, TradingClosingStock: 0,
  GrossProfitFromTrading: 0,
  OtherIncomeRent: 0, OtherIncomeCommission: 0, OtherIncomeDividend: 0, OtherIncomeInterest: 0,
  OtherIncomeSaleFixedAsset: 0, OtherIncomeInvSTT: 0, OtherIncomeOtherInv: 0,
  OtherIncomeForexGainLoss: 0, OtherIncomeInvToCapital: 0, OtherIncomeAgricultural: 0, OtherIncomeOther: 0,
  FreightOutward: 0, PowerAndFuel: 0, Rents: 0, RepairsBuilding: 0, RepairsMachinery: 0,
  TotalEmployeeComp: 0, TotalInsurance: 0, WorkmenWelfare: 0, Advertisement: 0,
  TotalCommission: 0, TotalProfFees: 0, TravellingExpenses: 0, TelephoneExpenses: 0,
  Donation: 0, TotalRatesAndTaxes: 0, AuditFee: 0, PartnersSalary: 0,
  OtherExpenses: 0, TotalBadDebts: 0, DepreciationPL: 0,
  NetProfitBeforeTaxes: 0, ProvisionCurrentTax: 0, ProfitAfterTax: 0,
  BalanceBroughtForward: 0, TransferToReserves: 0,
};

// ── Computations ──────────────────────────────────────────────────────────────

export function computePLTotals(pl: PLState) {
  const rawMaterialConsumed = pl.MfgRawMaterialOpening + pl.MfgRawMaterialPurchases - pl.MfgRawMaterialClosing;
  const mfgTotalDebit = pl.MfgOpeningWIP + rawMaterialConsumed + pl.MfgDirectWages
    + pl.MfgFactoryRent + pl.MfgPowerFuelFactory + pl.MfgRepairsMachinery
    + pl.MfgDepreciation + pl.MfgOtherMfgExpenses;
  const costOfProduction = mfgTotalDebit - pl.MfgClosingWIP;

  const hasMfg = mfgTotalDebit > 0 || pl.MfgClosingWIP > 0;

  const netPurchases = pl.TradingPurchasesCash + pl.TradingPurchasesElectronic - pl.TradingPurchaseReturns;
  const netSales = pl.TradingSalesCash + pl.TradingSalesElectronic - pl.TradingSalesReturns;
  const tradingDebit = pl.TradingOpeningStock + netPurchases + pl.TradingCustomsDuty
    + pl.TradingFreightInward + pl.TradingOtherDirectExp + (hasMfg ? Math.max(0, costOfProduction) : 0);
  const tradingCredit = netSales + pl.TradingClosingStock;
  const hasTrading = tradingDebit > 0 || tradingCredit > 0;
  const grossProfitFromTrading = hasTrading
    ? tradingCredit - tradingDebit
    : pl.GrossProfitFromTrading; // fall back to stored value if trading a/c not used

  const otherIncomeTotal = pl.OtherIncomeRent + pl.OtherIncomeCommission + pl.OtherIncomeDividend
    + pl.OtherIncomeInterest + pl.OtherIncomeSaleFixedAsset + pl.OtherIncomeInvSTT
    + pl.OtherIncomeOtherInv + pl.OtherIncomeForexGainLoss + pl.OtherIncomeInvToCapital
    + pl.OtherIncomeAgricultural + pl.OtherIncomeOther;
  const totalPLIncome = grossProfitFromTrading + otherIncomeTotal;

  const totalExpenses = pl.FreightOutward + pl.PowerAndFuel + pl.Rents + pl.RepairsBuilding
    + pl.RepairsMachinery + pl.TotalEmployeeComp + pl.TotalInsurance + pl.WorkmenWelfare
    + pl.Advertisement + pl.TotalCommission + pl.TotalProfFees + pl.TravellingExpenses
    + pl.TelephoneExpenses + pl.Donation + pl.TotalRatesAndTaxes + pl.AuditFee
    + pl.PartnersSalary + pl.OtherExpenses + pl.TotalBadDebts + pl.DepreciationPL;

  const netProfitBeforeTaxes = totalPLIncome - totalExpenses;

  return {
    rawMaterialConsumed, costOfProduction, hasMfg,
    mfgTotalDebit,
    netPurchases, netSales, tradingDebit, tradingCredit, hasTrading,
    grossProfitFromTrading,
    otherIncomeTotal, totalPLIncome, totalExpenses, netProfitBeforeTaxes,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  const s = n < 0 ? '(' : '';
  const e = n < 0 ? ')' : '';
  if (abs >= 10000000) return `${s}₹${(abs / 10000000).toFixed(2)} Cr${e}`;
  if (abs >= 100000)   return `${s}₹${(abs / 100000).toFixed(2)} L${e}`;
  return `${s}₹${abs.toLocaleString('en-IN')}${e}`;
}

const INP = 'w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-blue-500 bg-white';

// Module-level Row so it never remounts on parent re-render
function Row({ label, hint, field, pl, set }: {
  label: string; hint?: string; field: keyof PLState;
  pl: PLState; set: (k: keyof PLState, v: string) => void;
}) {
  return (
    <tr>
      <td className="py-1.5 pr-3 w-3/5">
        <span className="text-sm text-gray-700">{label}</span>
        {hint && <div className="text-xs text-gray-400">{hint}</div>}
      </td>
      <td className="py-1.5 w-2/5">
        <input type="number" className={INP} value={pl[field] || ''}
          onChange={e => set(field, e.target.value)} />
      </td>
    </tr>
  );
}

function ComputedRow({ label, value, highlight, indent }: { label: string; value: number; highlight?: boolean; indent?: boolean }) {
  return (
    <tr className={highlight ? 'bg-blue-50 font-bold' : 'bg-gray-50'}>
      <td className={`py-1.5 pr-3 text-sm ${highlight ? 'text-blue-800 font-bold' : 'text-gray-700 font-semibold'} ${indent ? 'pl-4' : ''}`}>{label}</td>
      <td className={`py-1.5 text-right text-sm pr-1 font-mono ${highlight ? 'text-blue-700 font-bold' : 'text-gray-600 font-semibold'}`}>{fmt(value)}</td>
    </tr>
  );
}

// ── Props & Component ─────────────────────────────────────────────────────────

interface Props {
  returnId: number;
  maintainsRegularBooks: boolean;
  initialData?: Partial<PLState> | null;
  onSaved?: (data: PLState) => void;
}

type SubTab = 'manufacturing' | 'trading' | 'pl';

export default function ITR5PL({ returnId, maintainsRegularBooks, initialData, onSaved }: Props) {
  const [pl, setPL] = useState<PLState>({ ...ZERO, ...initialData });
  const [subTab, setSubTab] = useState<SubTab>('trading');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialData) setPL({ ...ZERO, ...initialData });
  }, [initialData]);

  const save = useCallback(async (data: PLState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5PL`, {
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

  const set = useCallback((key: keyof PLState, val: string) => {
    setPL(prev => {
      const partial = { ...prev, [key]: Number(val) || 0 };
      // Recompute derived fields before saving
      const t = computePLTotals(partial);
      const next: PLState = {
        ...partial,
        GrossProfitFromTrading: t.grossProfitFromTrading,
        NetProfitBeforeTaxes: t.netProfitBeforeTaxes,
        ProfitAfterTax: t.netProfitBeforeTaxes - partial.ProvisionCurrentTax,
      };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1500);
      return next;
    });
  }, [save]);

  const t = computePLTotals(pl);

  if (!maintainsRegularBooks) {
    // ── No-account case ────────────────────────────────────────────────────
    return (
      <div className="max-w-2xl space-y-5 p-6">
        <h2 className="text-lg font-semibold text-gray-800">Income / Expenditure — No Account Case (Item 65)</h2>
        {saving && <span className="text-xs text-blue-500">Saving…</span>}
        {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt.toLocaleTimeString()}</span>}

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">65(i) — Business Income</h3>
          <table className="w-full border-collapse"><tbody>
            <Row pl={pl} set={set} label="Gross receipts — Electronic mode" field="BizGrossReceiptsElectronic" />
            <Row pl={pl} set={set} label="Gross receipts — Other mode" field="BizGrossReceiptsOther" />
            <ComputedRow label="Total Gross Receipts" value={pl.BizGrossReceiptsElectronic + pl.BizGrossReceiptsOther} indent />
            <Row pl={pl} set={set} label="Gross Profit" field="BizGrossProfit" />
            <Row pl={pl} set={set} label="Expenses" field="BizExpenses" />
            <Row pl={pl} set={set} label="Net Profit [Gross Profit − Expenses]" field="BizNetProfit" />
          </tbody></table>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">65(ii) — Profession Income</h3>
          <table className="w-full border-collapse"><tbody>
            <Row pl={pl} set={set} label="Gross receipts — Electronic mode" field="ProfGrossReceiptsElectronic" />
            <Row pl={pl} set={set} label="Gross receipts — Other mode" field="ProfGrossReceiptsOther" />
            <ComputedRow label="Total Gross Receipts" value={pl.ProfGrossReceiptsElectronic + pl.ProfGrossReceiptsOther} indent />
            <Row pl={pl} set={set} label="Gross Profit" field="ProfGrossProfit" />
            <Row pl={pl} set={set} label="Expenses" field="ProfExpenses" />
            <Row pl={pl} set={set} label="Net Profit [Gross Profit − Expenses]" field="ProfNetProfit" />
          </tbody></table>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
          <span className="text-sm font-semibold text-blue-800">Total Net Profit (Business + Profession)</span>
          <span className="text-lg font-bold text-blue-900 font-mono">{fmt(pl.BizNetProfit + pl.ProfNetProfit)}</span>
        </div>
      </div>
    );
  }

  // ── Regular books — sub-tab layout ────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-800">ITR-5 — Profit &amp; Loss Accounts</h2>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-blue-500">Saving…</span>}
          {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt.toLocaleTimeString()}</span>}
          {/* Net Profit badge */}
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${t.netProfitBeforeTaxes >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            Net Profit: {fmt(t.netProfitBeforeTaxes)}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 flex-shrink-0 bg-gray-50">
        {([
          { id: 'manufacturing', label: 'Manufacturing A/c', badge: t.hasMfg ? fmt(t.costOfProduction) : null },
          { id: 'trading',       label: 'Trading A/c',       badge: t.hasTrading ? fmt(t.grossProfitFromTrading) : null },
          { id: 'pl',            label: 'Profit & Loss A/c', badge: fmt(t.netProfitBeforeTaxes) },
        ] as { id: SubTab; label: string; badge: string | null }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: subTab === tab.id ? 700 : 400,
              color: subTab === tab.id ? '#1d4ed8' : '#6b7280',
              borderBottom: subTab === tab.id ? '2px solid #1d4ed8' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {tab.label}
            {tab.badge && (
              <span style={{
                fontSize: '10px', padding: '1px 6px', borderRadius: '9999px',
                background: subTab === tab.id ? '#dbeafe' : '#f3f4f6',
                color: subTab === tab.id ? '#1d4ed8' : '#9ca3af',
                fontWeight: 600,
              }}>{tab.badge}</span>
            )}
          </button>
        ))}
        <div className="ml-auto pr-4 flex items-center">
          <span className="text-xs text-gray-400">Profit flows automatically from Mfg → Trading → P&amp;L</span>
        </div>
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 overflow-auto p-6">

        {/* ── Manufacturing Account ── */}
        {subTab === 'manufacturing' && (
          <div className="max-w-2xl space-y-4">
            <p className="text-xs text-gray-500">
              Fill this only if you run a manufacturing activity. Cost of production flows automatically into the Trading Account.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {/* Debit side */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Debit (Expenses / Inputs)</h3>
                <table className="w-full border-collapse"><tbody>
                  <Row pl={pl} set={set} label="Opening WIP" field="MfgOpeningWIP" />
                  <Row pl={pl} set={set} label="Raw Material — Opening Stock" field="MfgRawMaterialOpening" />
                  <Row pl={pl} set={set} label="Raw Material — Purchases" field="MfgRawMaterialPurchases" />
                  <Row pl={pl} set={set} label="Less: Raw Material — Closing Stock" field="MfgRawMaterialClosing" />
                  <ComputedRow label="Raw Material Consumed" value={t.rawMaterialConsumed} indent />
                  <Row pl={pl} set={set} label="Direct Wages" field="MfgDirectWages" />
                  <Row pl={pl} set={set} label="Factory Rent" field="MfgFactoryRent" />
                  <Row pl={pl} set={set} label="Power & Fuel (Factory)" field="MfgPowerFuelFactory" />
                  <Row pl={pl} set={set} label="Repairs to Machinery" field="MfgRepairsMachinery" />
                  <Row pl={pl} set={set} label="Depreciation on Plant" field="MfgDepreciation" />
                  <Row pl={pl} set={set} label="Other Manufacturing Expenses" field="MfgOtherMfgExpenses" />
                  <ComputedRow label="Total Debit" value={t.mfgTotalDebit} />
                </tbody></table>
              </div>
              {/* Credit side */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Credit (Output / Closing)</h3>
                <table className="w-full border-collapse"><tbody>
                  <Row pl={pl} set={set} label="Closing WIP" field="MfgClosingWIP" />
                  <ComputedRow label="Cost of Production" value={Math.max(0, t.costOfProduction)} highlight />
                </tbody></table>
                <p className="text-xs text-gray-400 mt-3">Cost of Production = Total Debit − Closing WIP.<br/>This transfers automatically to the Trading Account.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Trading Account ── */}
        {subTab === 'trading' && (
          <div className="max-w-2xl space-y-4">
            <p className="text-xs text-gray-500">
              Enter sales, purchases and direct expenses. Gross profit transfers automatically to the P&amp;L Account.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {/* Debit side */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Debit (Purchases / Expenses)</h3>
                <table className="w-full border-collapse"><tbody>
                  <Row pl={pl} set={set} label="Opening Stock" field="TradingOpeningStock" />
                  <Row pl={pl} set={set} label="Purchases — Cash / Cheque" field="TradingPurchasesCash" />
                  <Row pl={pl} set={set} label="Purchases — Electronic / Banking" field="TradingPurchasesElectronic" />
                  <Row pl={pl} set={set} label="Less: Purchase Returns" field="TradingPurchaseReturns" />
                  <ComputedRow label="Net Purchases" value={t.netPurchases} indent />
                  <Row pl={pl} set={set} label="Customs Duty / Import Expenses" field="TradingCustomsDuty" />
                  <Row pl={pl} set={set} label="Freight Inward / Carriage Inward" field="TradingFreightInward" />
                  <Row pl={pl} set={set} label="Other Direct Expenses" field="TradingOtherDirectExp" />
                  {t.hasMfg && <ComputedRow label="Cost of Production (from Mfg A/c)" value={Math.max(0, t.costOfProduction)} indent />}
                  <ComputedRow label="Total Debit" value={t.tradingDebit} />
                </tbody></table>
              </div>
              {/* Credit side */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Credit (Sales / Closing Stock)</h3>
                <table className="w-full border-collapse"><tbody>
                  <Row pl={pl} set={set} label="Sales / Gross Receipts — Cash" field="TradingSalesCash" />
                  <Row pl={pl} set={set} label="Sales / Gross Receipts — Electronic" field="TradingSalesElectronic" />
                  <Row pl={pl} set={set} label="Less: Sales Returns / Discounts" field="TradingSalesReturns" />
                  <ComputedRow label="Net Sales" value={t.netSales} indent />
                  <Row pl={pl} set={set} label="Closing Stock" field="TradingClosingStock" />
                  <ComputedRow label="Total Credit" value={t.tradingCredit} />
                  <ComputedRow label="Gross Profit / (Loss)" value={t.grossProfitFromTrading} highlight />
                </tbody></table>
                <p className="text-xs text-gray-400 mt-3">Gross Profit = Total Credit − Total Debit.<br/>Transfers automatically to P&amp;L Account.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── P&L Account ── */}
        {subTab === 'pl' && (
          <div className="max-w-2xl space-y-4">
            {/* Income */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Credits to P&amp;L (Income)</h3>
              <table className="w-full border-collapse"><tbody>
                <tr className="bg-green-50">
                  <td className="py-1.5 pr-3 text-sm font-semibold text-green-800">Gross Profit b/d from Trading A/c</td>
                  <td className="py-1.5 text-right text-sm font-bold text-green-700 font-mono pr-1">{fmt(t.grossProfitFromTrading)}</td>
                </tr>
                {!t.hasTrading && (
                  <Row pl={pl} set={set} label="Gross Profit from Trading (manual — use Trading A/c tab to auto-compute)" field="GrossProfitFromTrading" />
                )}
                <Row pl={pl} set={set} label="Other Income — Rent received" field="OtherIncomeRent" />
                <Row pl={pl} set={set} label="Other Income — Commission" field="OtherIncomeCommission" />
                <Row pl={pl} set={set} label="Other Income — Dividend" field="OtherIncomeDividend" />
                <Row pl={pl} set={set} label="Other Income — Interest" field="OtherIncomeInterest" />
                <Row pl={pl} set={set} label="Other Income — Profit on Sale of Fixed Assets" field="OtherIncomeSaleFixedAsset" />
                <Row pl={pl} set={set} label="Other Income — Profit on Investments (STT paid)" field="OtherIncomeInvSTT" />
                <Row pl={pl} set={set} label="Other Income — Profit on Other Investments" field="OtherIncomeOtherInv" />
                <Row pl={pl} set={set} label="Other Income — Forex Gain / Loss (Sec. 43AA)" field="OtherIncomeForexGainLoss" />
                <Row pl={pl} set={set} label="Other Income — Inventory converted to Capital Asset" field="OtherIncomeInvToCapital" />
                <Row pl={pl} set={set} label="Other Income — Agricultural" field="OtherIncomeAgricultural" />
                <Row pl={pl} set={set} label="Other Income — Miscellaneous" field="OtherIncomeOther" />
                <ComputedRow label="Total Credits to P&L" value={t.totalPLIncome} />
              </tbody></table>
            </div>

            {/* Expenses */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Debits to P&amp;L (Expenses)</h3>
              <table className="w-full border-collapse"><tbody>
                <Row pl={pl} set={set} label="Freight Outward" field="FreightOutward" />
                <Row pl={pl} set={set} label="Power & Fuel" field="PowerAndFuel" />
                <Row pl={pl} set={set} label="Rents" field="Rents" />
                <Row pl={pl} set={set} label="Repairs — Building" field="RepairsBuilding" />
                <Row pl={pl} set={set} label="Repairs — Machinery" field="RepairsMachinery" />
                <Row pl={pl} set={set} label="Employee Compensation (total)" field="TotalEmployeeComp" />
                <Row pl={pl} set={set} label="Insurance" field="TotalInsurance" />
                <Row pl={pl} set={set} label="Workmen / Staff Welfare" field="WorkmenWelfare" />
                <Row pl={pl} set={set} label="Advertisement" field="Advertisement" />
                <Row pl={pl} set={set} label="Commission" field="TotalCommission" />
                <Row pl={pl} set={set} label="Professional / Legal Fees" field="TotalProfFees" />
                <Row pl={pl} set={set} label="Travelling Expenses" field="TravellingExpenses" />
                <Row pl={pl} set={set} label="Telephone / Internet" field="TelephoneExpenses" />
                <Row pl={pl} set={set} label="Donation" field="Donation" />
                <Row pl={pl} set={set} label="Rates & Taxes (excl. Income Tax)" field="TotalRatesAndTaxes" />
                <Row pl={pl} set={set} label="Audit Fee" field="AuditFee" />
                <Row pl={pl} set={set} label="Partners' Salary / Remuneration" field="PartnersSalary" />
                <Row pl={pl} set={set} label="Other Expenses" field="OtherExpenses" />
                <Row pl={pl} set={set} label="Bad Debts" field="TotalBadDebts" />
                <Row pl={pl} set={set} label="Depreciation (as per books)" field="DepreciationPL" />
                <ComputedRow label="Total Debits to P&L" value={t.totalExpenses} />
              </tbody></table>
            </div>

            {/* Net Profit / Appropriation */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Profit Appropriation</h3>
              <table className="w-full border-collapse"><tbody>
                <ComputedRow label="Net Profit Before Tax  (Total Credits − Total Debits)" value={t.netProfitBeforeTaxes} highlight />
                <Row pl={pl} set={set} label="Less: Provision for Current Tax" field="ProvisionCurrentTax" />
                <ComputedRow label="Profit After Tax" value={t.netProfitBeforeTaxes - pl.ProvisionCurrentTax} indent />
                <Row pl={pl} set={set} label="Add: Balance B/F from previous year" field="BalanceBroughtForward" />
                <Row pl={pl} set={set} label="Less: Transfer to Reserves" field="TransferToReserves" />
              </tbody></table>
            </div>

            {/* Flow indicator */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <strong>Net Profit Before Tax: {fmt(t.netProfitBeforeTaxes)}</strong> — this flows automatically to the
              <strong> Business / Profession</strong> tab as the starting point for Schedule BP tax adjustments.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
