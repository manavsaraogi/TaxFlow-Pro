'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface PLState {
  // No-account case (item 65)
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
  // Full P&L key items
  GrossProfitFromTrading: number;
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
  NetProfitBeforeTaxes: number;
  ProvisionCurrentTax: number;
  ProfitAfterTax: number;
  BalanceBroughtForward: number;
  TransferToReserves: number;
}

const ZERO_PL: PLState = {
  BizGrossReceiptsElectronic: 0, BizGrossReceiptsOther: 0, BizGrossProfit: 0, BizExpenses: 0, BizNetProfit: 0,
  ProfGrossReceiptsElectronic: 0, ProfGrossReceiptsOther: 0, ProfGrossProfit: 0, ProfExpenses: 0, ProfNetProfit: 0,
  GrossProfitFromTrading: 0, OtherIncomeRent: 0, OtherIncomeCommission: 0, OtherIncomeDividend: 0,
  OtherIncomeInterest: 0, OtherIncomeSaleFixedAsset: 0, OtherIncomeInvSTT: 0, OtherIncomeOtherInv: 0,
  OtherIncomeForexGainLoss: 0, OtherIncomeInvToCapital: 0, OtherIncomeAgricultural: 0,
  OtherIncomeOther: 0, FreightOutward: 0, PowerAndFuel: 0, Rents: 0,
  RepairsBuilding: 0, RepairsMachinery: 0, TotalEmployeeComp: 0, TotalInsurance: 0, WorkmenWelfare: 0,
  Advertisement: 0, TotalCommission: 0, TotalProfFees: 0, TravellingExpenses: 0, TelephoneExpenses: 0,
  Donation: 0, TotalRatesAndTaxes: 0, AuditFee: 0, PartnersSalary: 0, OtherExpenses: 0,
  TotalBadDebts: 0, DepreciationPL: 0, NetProfitBeforeTaxes: 0, ProvisionCurrentTax: 0,
  ProfitAfterTax: 0, BalanceBroughtForward: 0, TransferToReserves: 0,
};

function fmt(n: number) {
  if (!n) return '—';
  const abs = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${s}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${s}₹${(abs / 100000).toFixed(2)} L`;
  return `${s}₹${abs.toLocaleString('en-IN')}`;
}

interface Props {
  returnId: number;
  maintainsRegularBooks: boolean;
  initialData?: Partial<PLState> | null;
  onSaved?: () => void;
}

export default function ITR5PL({ returnId, maintainsRegularBooks, initialData, onSaved }: Props) {
  const [pl, setPL] = useState<PLState>({ ...ZERO_PL, ...initialData });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialData) setPL({ ...ZERO_PL, ...initialData });
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
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }, [returnId, onSaved]);

  const set = useCallback((key: keyof PLState, val: string) => {
    setPL(prev => {
      const next = { ...prev, [key]: Number(val) || 0 };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1500);
      return next;
    });
  }, [save]);

  const inp = 'w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-blue-500';
  const lbl = 'text-sm text-gray-700';

  function Row({ label, field }: { label: string; field: keyof PLState }) {
    return (
      <tr>
        <td className="py-1 pr-2"><span className={lbl}>{label}</span></td>
        <td className="py-1 w-44">
          <input type="number" className={inp} value={pl[field] || ''} onChange={e => set(field, e.target.value)} />
        </td>
      </tr>
    );
  }

  function ComputedRow({ label, value }: { label: string; value: number }) {
    return (
      <tr className="bg-gray-50 font-semibold">
        <td className="py-1.5 pr-2 text-sm text-gray-800">{label}</td>
        <td className="py-1.5 text-right text-sm text-blue-700 pr-1">{fmt(value)}</td>
      </tr>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          ITR-5 — {maintainsRegularBooks ? 'Profit & Loss Account' : 'Income / Expenditure (No-Account Case, Item 65)'}
        </h2>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-blue-500">Saving…</span>}
          {!saving && savedAt && <span className="text-xs text-green-600">Saved {savedAt.toLocaleTimeString()}</span>}
        </div>
      </div>

      {!maintainsRegularBooks ? (
        /* ── No-Account Case (Item 65) ── */
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">65(i) — Business Income</h3>
            <table className="w-full border-collapse">
              <tbody>
                <Row label="(a) Gross receipts — Electronic mode" field="BizGrossReceiptsElectronic" />
                <Row label="(b) Gross receipts — Other mode" field="BizGrossReceiptsOther" />
                <ComputedRow label="Total Gross Receipts" value={pl.BizGrossReceiptsElectronic + pl.BizGrossReceiptsOther} />
                <Row label="(c) Gross Profit" field="BizGrossProfit" />
                <Row label="(d) Expenses" field="BizExpenses" />
                <Row label="(e) Net Profit [c − d]" field="BizNetProfit" />
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">65(ii) — Profession Income</h3>
            <table className="w-full border-collapse">
              <tbody>
                <Row label="(a) Gross receipts — Electronic mode" field="ProfGrossReceiptsElectronic" />
                <Row label="(b) Gross receipts — Other mode" field="ProfGrossReceiptsOther" />
                <ComputedRow label="Total Gross Receipts" value={pl.ProfGrossReceiptsElectronic + pl.ProfGrossReceiptsOther} />
                <Row label="(c) Gross Profit" field="ProfGrossProfit" />
                <Row label="(d) Expenses" field="ProfExpenses" />
                <Row label="(e) Net Profit [c − d]" field="ProfNetProfit" />
              </tbody>
            </table>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-blue-800">Total Net Profit (Business + Profession)</span>
              <span className="text-base font-bold text-blue-900">{fmt(pl.BizNetProfit + pl.ProfNetProfit)}</span>
            </div>
          </div>
        </div>
      ) : (
        /* ── Full P&L (Items 13–61) ── */
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Income</h3>
            <table className="w-full border-collapse">
              <tbody>
                <Row label="Gross Profit from Trading (item 15)" field="GrossProfitFromTrading" />
                <Row label="Other Income — Rent" field="OtherIncomeRent" />
                <Row label="Other Income — Commission" field="OtherIncomeCommission" />
                <Row label="Other Income — Dividend" field="OtherIncomeDividend" />
                <Row label="Other Income — Interest" field="OtherIncomeInterest" />
                <Row label="Other Income — Profit on Sale of Fixed Assets" field="OtherIncomeSaleFixedAsset" />
                <Row label="Other Income — Profit on Investments (STT paid)" field="OtherIncomeInvSTT" />
                <Row label="Other Income — Profit on Other Investments" field="OtherIncomeOtherInv" />
                <Row label="Other Income — Forex Gain / Loss (Sec. 43AA)" field="OtherIncomeForexGainLoss" />
                <Row label="Other Income — Inventory Converted to Capital Asset" field="OtherIncomeInvToCapital" />
                <Row label="Other Income — Agricultural Income" field="OtherIncomeAgricultural" />
                <Row label="Other Income — Miscellaneous" field="OtherIncomeOther" />
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Expenditure</h3>
            <table className="w-full border-collapse">
              <tbody>
                <Row label="Freight Outward" field="FreightOutward" />
                <Row label="Power & Fuel" field="PowerAndFuel" />
                <Row label="Rents" field="Rents" />
                <Row label="Repairs — Building" field="RepairsBuilding" />
                <Row label="Repairs — Machinery" field="RepairsMachinery" />
                <Row label="Employee Compensation (total)" field="TotalEmployeeComp" />
                <Row label="Insurance" field="TotalInsurance" />
                <Row label="Workmen / Staff Welfare" field="WorkmenWelfare" />
                <Row label="Advertisement" field="Advertisement" />
                <Row label="Commission" field="TotalCommission" />
                <Row label="Professional / Legal Fees" field="TotalProfFees" />
                <Row label="Travelling Expenses" field="TravellingExpenses" />
                <Row label="Telephone / Internet" field="TelephoneExpenses" />
                <Row label="Donation" field="Donation" />
                <Row label="Rates & Taxes (excl. Income Tax)" field="TotalRatesAndTaxes" />
                <Row label="Audit Fee" field="AuditFee" />
                <Row label="Partners' Salary / Remuneration" field="PartnersSalary" />
                <Row label="Other Expenses" field="OtherExpenses" />
                <Row label="Bad Debts" field="TotalBadDebts" />
                <Row label="Depreciation" field="DepreciationPL" />
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Profit Appropriation</h3>
            <table className="w-full border-collapse">
              <tbody>
                <Row label="Net Profit Before Taxes" field="NetProfitBeforeTaxes" />
                <Row label="Provision for Current Tax" field="ProvisionCurrentTax" />
                <Row label="Profit After Tax" field="ProfitAfterTax" />
                <Row label="Balance B/F from previous year" field="BalanceBroughtForward" />
                <Row label="Transfer to Reserves" field="TransferToReserves" />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
