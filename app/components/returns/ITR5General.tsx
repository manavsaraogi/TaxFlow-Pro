'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { NATURE_OF_BUSINESS_CODES_ITR5 } from '@/app/lib/itrCodes';

type EntityType = 'AOP' | 'BOI' | 'AJP' | 'LA' | 'COOP' | 'FIRM' | 'LLP';

type MemberStatus =
  | 'INDIVIDUAL' | 'IND_WORKING' | 'IND_RETIRED' | 'HUF' | 'FIRM' | 'LLP'
  | 'DOMESTIC_COMPANY' | 'FOREIGN_COMPANY' | 'CO_OPERATIVE_SOCIETY'
  | 'LOCAL_AUTHORITY' | 'TRUST' | 'AOP_BOI' | 'ANY_OTHER_AJP'
  | 'SETTLER' | 'TRUSTEE' | 'BENEFICIARY' | 'PRINCIPAL_OFFICER' | 'EXECUTOR';

interface ITR5Member {
  name: string;
  pan: string;
  aadhaar: string;
  status: MemberStatus;
  sharePercentage: number;
  rateOfInterest: number;
  remunerationPaid: number;
  flatNo: string;
  buildingName: string;
  streetName: string;
  localityOrArea: string;
  cityOrTownOrDistrict: string;
  stateCode: string;
  pinCode: string;
  countryCode: string;
}

type UpdateReason = '1' | '2' | '3' | '4' | '5' | '6' | '7' | 'OTH';
type UpdatedAY = '2024-25' | '2025-26';
type UpdatedPeriod = '1' | '2' | '3' | '4';

interface ITR5Updated {
  updatedAY: UpdatedAY;
  previouslyFiled: boolean;
  previousFilingType: '1' | '2';
  origAckNo: string;
  origFilingDate: string;
  laidOutFlag: boolean;
  periodCode: UpdatedPeriod;
  reasons: UpdateReason[];
}

interface ITR5GeneralState {
  entityType: EntityType;
  subStatus: string;
  dateOfFormation: string;
  businessCode: string;
  maintainsRegularBooks: boolean;
  isAuditRequired: boolean;
  accountingMethod: 'MERCANTILE' | 'CASH';
  icdsApplicable: boolean;
  presumptiveTaxation: '' | '44AD' | '44ADA' | '44AE';
  auditSection: '' | '44AB(a)' | '44AB(b)' | '44AB(c)' | '44AB(d)';
  auditorName: string;
  auditorMembership: string;
  auditFirmName: string;
  auditFirmRegNo: string;
  auditFirmPAN: string;
  auditReportDate: string;
  auditAckNo: string;
  udin: string;
  members: ITR5Member[];
  sharesDeterminable: boolean;
  anyMemberExceedsExemption: boolean;
  interest234A: number;
  interest234B: number;
  interest234C: number;
  interest234F: number;
  isUpdatedReturn: boolean;
  updated: ITR5Updated;
  // ── Compliance Questions (Part A-General 2) ───────────────────────────────
  hasRelatedPartyTransactions40A2b: boolean;
  hasInternationalTransactions92B: boolean;
  hasFiled3CEB: boolean;
  hasSecondaryAdjustment92CE: boolean;
  secondaryAdjustmentAmount92CE: number;
  hasSpecifiedDomesticTransactions92BA: boolean;
  hasNotifiedJurisdictionalTransactions94A: boolean;
  hasForeignAssets: boolean;
  hasForeignIncome: boolean;
  hasFiled15CA15CB: boolean;
  financialStatementsIndAS: boolean;
  isForeignSubsidiary: boolean;
  claims10AA: boolean;
  claims80IA: boolean;
  claims80IB: boolean;
  claims80IC: boolean;
  claims80IE: boolean;
  claims80JJA: boolean;
  claims80JJAA: boolean;
  claims80P: boolean;
  hasVirtualDigitalAssets: boolean;
  hasAgriculturalIncome: boolean;
  agriculturalIncome: number;
  totalTurnover: number;
  gstRegistered: boolean;
  gstin: string;
  hasDeemedDividend2_22e: boolean;
  hasMSMERegistration: boolean;
  msmeRegistrationNo: string;
  hasUnlistedSharesTransfer: boolean;
  hasBroughtForwardLoss: boolean;
  liableForAMT: boolean;
  optNewTaxRegime115BAC: boolean;
}

const EMPTY_MEMBER: ITR5Member = {
  name: '', pan: '', aadhaar: '', status: 'TRUSTEE',
  sharePercentage: 0, rateOfInterest: 0, remunerationPaid: 0,
  flatNo: '', buildingName: '', streetName: '', localityOrArea: '',
  cityOrTownOrDistrict: '', stateCode: '07', pinCode: '', countryCode: '91',
};

const EMPTY_UPDATED: ITR5Updated = {
  updatedAY: '2025-26',
  previouslyFiled: true,
  previousFilingType: '1',
  origAckNo: '',
  origFilingDate: '',
  laidOutFlag: false,
  periodCode: '1',
  reasons: ['2'],
};

const EMPTY: ITR5GeneralState = {
  entityType: 'AOP',
  subStatus: '',
  dateOfFormation: '',
  businessCode: '19009',
  maintainsRegularBooks: false,
  accountingMethod: 'MERCANTILE',
  icdsApplicable: false,
  presumptiveTaxation: '',
  auditSection: '',
  isAuditRequired: false,
  auditorName: '',
  auditorMembership: '',
  auditFirmName: '',
  auditFirmRegNo: '',
  auditFirmPAN: '',
  auditReportDate: '',
  auditAckNo: '',
  udin: '',
  members: [],
  sharesDeterminable: false,
  anyMemberExceedsExemption: false,
  interest234A: 0,
  interest234B: 0,
  interest234C: 0,
  interest234F: 0,
  isUpdatedReturn: false,
  updated: { ...EMPTY_UPDATED },
  hasRelatedPartyTransactions40A2b: false,
  hasInternationalTransactions92B: false,
  hasFiled3CEB: false,
  hasSecondaryAdjustment92CE: false,
  secondaryAdjustmentAmount92CE: 0,
  hasSpecifiedDomesticTransactions92BA: false,
  hasNotifiedJurisdictionalTransactions94A: false,
  hasForeignAssets: false,
  hasForeignIncome: false,
  hasFiled15CA15CB: false,
  financialStatementsIndAS: false,
  isForeignSubsidiary: false,
  claims10AA: false,
  claims80IA: false,
  claims80IB: false,
  claims80IC: false,
  claims80IE: false,
  claims80JJA: false,
  claims80JJAA: false,
  claims80P: false,
  hasVirtualDigitalAssets: false,
  hasAgriculturalIncome: false,
  agriculturalIncome: 0,
  totalTurnover: 0,
  gstRegistered: false,
  gstin: '',
  hasDeemedDividend2_22e: false,
  hasMSMERegistration: false,
  msmeRegistrationNo: '',
  hasUnlistedSharesTransfer: false,
  hasBroughtForwardLoss: false,
  liableForAMT: false,
  optNewTaxRegime115BAC: false,
};

const ENTITY_OPTIONS: { value: EntityType; label: string; hint: string }[] = [
  { value: 'AOP',  label: 'Association of Persons (AOP)', hint: 'Clubs, societies, trusts not filing ITR-7' },
  { value: 'BOI',  label: 'Body of Individuals (BOI)',    hint: 'Group of individuals with common income' },
  { value: 'FIRM', label: 'Partnership Firm',             hint: 'Registered or unregistered firm' },
  { value: 'LLP',  label: 'Limited Liability Partnership (LLP)', hint: 'LLP registered under LLP Act' },
  { value: 'COOP', label: 'Co-operative Society',         hint: 'Co-op society not filing ITR-7' },
  { value: 'LA',   label: 'Local Authority',              hint: 'Municipal body, panchayat, etc.' },
  { value: 'AJP',  label: 'Artificial Juridical Person',  hint: 'Universities, bar councils, etc.' },
];

const SUB_STATUS_OPTIONS = [
  { value: '4',  label: 'Co-operative Society (Other)' },
  { value: '5',  label: 'LLP' },
  { value: '8',  label: 'AOP / BOI (Any other)' },
  { value: '10', label: 'Partnership Firm' },
  { value: '11', label: 'Society (Societies Registration Act)' },
  { value: '13', label: 'Trust (other than ITR-7 eligible)' },
  { value: '19', label: 'Other AJP' },
  { value: '20', label: 'Business Trust' },
  { value: '21', label: 'Investment Fund' },
];


const MEMBER_STATUS_OPTIONS: { value: MemberStatus; label: string }[] = [
  { value: 'TRUSTEE',          label: 'Trustee' },
  { value: 'SETTLER',          label: 'Settlor' },
  { value: 'BENEFICIARY',      label: 'Beneficiary' },
  { value: 'PRINCIPAL_OFFICER',label: 'Principal Officer' },
  { value: 'EXECUTOR',         label: 'Executor' },
  { value: 'INDIVIDUAL',       label: 'Individual (Member)' },
  { value: 'HUF',              label: 'HUF (Member)' },
  { value: 'FIRM',             label: 'Firm (Member)' },
  { value: 'LLP',              label: 'LLP (Member)' },
  { value: 'DOMESTIC_COMPANY', label: 'Company (Member)' },
  { value: 'TRUST',            label: 'Trust (Member)' },
  { value: 'AOP_BOI',          label: 'AOP / BOI (Member)' },
];

const STATE_CODES = [
  ['01','Jammu & Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],
  ['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],
  ['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],['13','Nagaland'],['14','Manipur'],
  ['15','Mizoram'],['16','Tripura'],['17','Meghalaya'],['18','Assam'],['19','West Bengal'],
  ['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],
  ['24','Gujarat'],['27','Maharashtra'],['28','Andhra Pradesh'],['29','Karnataka'],
  ['30','Goa'],['32','Kerala'],['33','Tamil Nadu'],['36','Telangana'],['99','Foreign'],
];

const UPDATE_REASONS: [UpdateReason, string][] = [
  ['1', 'Did not file a return earlier for this year'],
  ['2', 'Income was reported incorrectly or missed'],
  ['3', 'Income was reported under the wrong head'],
  ['4', 'Carried forward loss needs to be reduced'],
  ['5', 'Unabsorbed depreciation needs to be reduced'],
  ['6', 'MAT/AMT credit needs to be reduced'],
  ['7', 'Wrong tax rate was applied'],
  ['OTH', 'Any other reason'],
];

// ── Searchable business code dropdown ────────────────────────────────────────

function BusinessCodeSearch({ value, onChange, inputClass }: {
  value: string;
  onChange: (code: string) => void;
  inputClass: string;
}) {
  const match = NATURE_OF_BUSINESS_CODES_ITR5.find(c => c.code === value);
  const [query, setQuery] = useState(match ? `${match.code} — ${match.description}` : value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync display when value changes from outside (e.g. initial load)
  useEffect(() => {
    const m = NATURE_OF_BUSINESS_CODES_ITR5.find(c => c.code === value);
    setQuery(m ? `${m.code} — ${m.description}` : value);
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = query.length >= 1
    ? NATURE_OF_BUSINESS_CODES_ITR5.filter(c =>
        c.code.includes(query) ||
        c.description.toLowerCase().includes(query.toLowerCase()) ||
        c.group.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 30)
    : NATURE_OF_BUSINESS_CODES_ITR5;

  // Group filtered results
  const groups = filtered.reduce<Record<string, typeof filtered>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        className={inputClass}
        value={query}
        placeholder="Search by code or description (e.g. 19006, religious, trading…)"
        onFocus={() => setOpen(true)}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          // If user clears the field, clear the code too
          if (!e.target.value) onChange('');
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0,
          background: 'white', border: '1px solid #d1d5db', borderRadius: '6px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: '280px', overflowY: 'auto',
          marginTop: '2px',
        }}>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 700, color: '#6b7280', background: '#f9fafb', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {group}
              </div>
              {items.map(c => (
                <div
                  key={c.code}
                  style={{
                    padding: '6px 12px', cursor: 'pointer', fontSize: '13px',
                    background: c.code === value ? '#eff6ff' : 'white',
                    borderLeft: c.code === value ? '3px solid #3b82f6' : '3px solid transparent',
                  }}
                  onMouseDown={e => {
                    e.preventDefault();
                    onChange(c.code);
                    setQuery(`${c.code} — ${c.description}`);
                    setOpen(false);
                  }}
                >
                  <span style={{ fontFamily: 'monospace', color: '#2563eb', marginRight: '8px' }}>{c.code}</span>
                  {c.description}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  returnId: number;
  initialData?: Partial<ITR5GeneralState> | null;
  onSaved?: (data: ITR5GeneralState) => void;
}

export default function ITR5General({ returnId, initialData, onSaved }: Props) {
  const [form, setForm] = useState<ITR5GeneralState>({ ...EMPTY, ...initialData });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialData) setForm({ ...EMPTY, ...initialData });
  }, [initialData]);

  // Flush debounce immediately on unmount so tab-switches don't lose pending saves
  const formRef = useRef<ITR5GeneralState>({ ...EMPTY, ...initialData });
  useEffect(() => {
    formRef.current = form;
  });
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        save(formRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (data: ITR5GeneralState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5General`, {
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

  const update = useCallback((patch: Partial<ITR5GeneralState>) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1500);
      return next;
    });
  }, [save]);

  const updateUpd = useCallback((patch: Partial<ITR5Updated>) => {
    update({ updated: { ...form.updated, ...patch } });
  }, [form.updated, update]);

  const toggleReason = (r: UpdateReason) => {
    const cur = form.updated.reasons ?? [];
    const next = cur.includes(r) ? cur.filter(x => x !== r) : [...cur, r];
    updateUpd({ reasons: next });
  };

  const addMember = () => update({ members: [...form.members, { ...EMPTY_MEMBER }] });
  const removeMember = (i: number) => update({ members: form.members.filter((_, idx) => idx !== i) });
  const updateMember = (i: number, patch: Partial<ITR5Member>) =>
    update({ members: form.members.map((m, idx) => idx === i ? { ...m, ...patch } : m) });

  const inp = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-white';
  const lbl = 'block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide';

  const usesMMR = !form.sharesDeterminable || form.anyMemberExceedsExemption;

  return (
    <div className="grid grid-cols-2 gap-4 items-start">

      {/* ── LEFT COLUMN ── */}
      <div className="space-y-3">

        {/* Header + save status */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Part A — General Information</h2>
          <span className="text-xs text-gray-400">{saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ''}</span>
        </div>

        {/* Organisation Details */}
        <Section title="Organisation">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Type of Organisation</p>
            <div className="grid grid-cols-2 gap-1">
              {ENTITY_OPTIONS.map(opt => (
                <label key={opt.value} className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                  form.entityType === opt.value ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}>
                  <input type="radio" name="entityType" value={opt.value} checked={form.entityType === opt.value}
                    onChange={() => update({ entityType: opt.value })} className="accent-blue-600 flex-shrink-0" />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className={lbl}>Sub-category</label>
              <select className={inp} value={form.subStatus} onChange={e => update({ subStatus: e.target.value })}>
                <option value="">Auto from above</option>
                {SUB_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Date of Formation</label>
              <input type="date" className={inp} value={form.dateOfFormation} onChange={e => update({ dateOfFormation: e.target.value })} />
            </div>
          </div>
          <div className="mt-2">
            <label className={lbl}>Nature of Business / Activity</label>
            <BusinessCodeSearch value={form.businessCode} onChange={code => update({ businessCode: code })} inputClass={inp} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className={lbl}>Total Turnover / Gross Receipts (₹)</label>
              <input type="number" min={0} className={inp} value={form.totalTurnover || ''} onChange={e => update({ totalTurnover: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className={lbl}>Agricultural Income (₹)</label>
              <input type="number" min={0} className={inp} value={form.agriculturalIncome || ''} onChange={e => update({ agriculturalIncome: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="gstReg" checked={form.gstRegistered} onChange={e => update({ gstRegistered: e.target.checked })} className="accent-blue-600" />
              <label htmlFor="gstReg" className="text-xs text-gray-700 cursor-pointer">GST Registered</label>
            </div>
            {form.gstRegistered && (
              <input className={`${inp} font-mono uppercase`} value={form.gstin} onChange={e => update({ gstin: e.target.value.toUpperCase() })} placeholder="GSTIN" maxLength={15} />
            )}
          </div>
        </Section>

        {/* Books & Audit */}
        <Section title="Books of Accounts &amp; Audit">
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-1 font-medium">Method of Accounting</p>
            <div className="flex gap-2">
              {([['MERCANTILE','Mercantile (Accrual)'],['CASH','Cash Basis']] as const).map(([v,l]) => (
                <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer text-xs font-medium flex-1 justify-center ${form.accountingMethod===v?'border-blue-500 bg-blue-50 text-blue-700':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  <input type="radio" name="accMethod" value={v} checked={form.accountingMethod===v} onChange={()=>update({accountingMethod:v})} className="accent-blue-600"/> {l}
                </label>
              ))}
            </div>
          </div>
          <YesNo label="Maintains regular books of accounts u/s 44AA" checked={form.maintainsRegularBooks} onChange={v => update({ maintainsRegularBooks: v })} />
          <div className="mt-1">
            <label className={lbl}>Presumptive Taxation (if applicable)</label>
            <select className={inp} value={form.presumptiveTaxation} onChange={e => update({ presumptiveTaxation: e.target.value as any })}>
              <option value="">Not applicable</option>
              <option value="44AD">Sec 44AD — Business (turnover ≤ ₹3 Cr)</option>
              <option value="44ADA">Sec 44ADA — Profession (receipts ≤ ₹75 L)</option>
              <option value="44AE">Sec 44AE — Goods carriages</option>
            </select>
          </div>
          <YesNo label="ICDS (Income Computation & Disclosure Standards) applicable" checked={form.icdsApplicable} onChange={v => update({ icdsApplicable: v })} />
          <YesNo label="Tax Audit required u/s 44AB" checked={form.isAuditRequired} onChange={v => update({ isAuditRequired: v })} />
          {form.isAuditRequired && (
            <div className="mt-1">
              <label className={lbl}>Audit Section</label>
              <select className={inp} value={form.auditSection} onChange={e => update({ auditSection: e.target.value as any })}>
                <option value="">Select</option>
                <option value="44AB(a)">44AB(a) — Business turnover {'>'} ₹1 Cr (or ₹10 Cr if digital)</option>
                <option value="44AB(b)">44AB(b) — Profession receipts {'>'} ₹50 L</option>
                <option value="44AB(c)">44AB(c) — Opted for presumptive but declaring lower profit</option>
                <option value="44AB(d)">44AB(d) — Trust / 10(23C) / 12A eligible</option>
              </select>
            </div>
          )}
          {form.isAuditRequired && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">Auditor Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>Auditor Name</label><input className={inp} value={form.auditorName} onChange={e => update({ auditorName: e.target.value })} placeholder="CA full name" /></div>
                <div><label className={lbl}>Membership No.</label><input className={inp} value={form.auditorMembership} onChange={e => update({ auditorMembership: e.target.value })} placeholder="ICAI number" /></div>
                <div><label className={lbl}>Firm Name</label><input className={inp} value={form.auditFirmName} onChange={e => update({ auditFirmName: e.target.value })} /></div>
                <div><label className={lbl}>Firm Reg. No.</label><input className={inp} value={form.auditFirmRegNo} onChange={e => update({ auditFirmRegNo: e.target.value })} /></div>
                <div><label className={lbl}>Firm PAN</label><input className={`${inp} uppercase font-mono`} value={form.auditFirmPAN} maxLength={10} onChange={e => update({ auditFirmPAN: e.target.value.toUpperCase() })} /></div>
                <div><label className={lbl}>Audit Report Date</label><input type="date" className={inp} value={form.auditReportDate} onChange={e => update({ auditReportDate: e.target.value })} /></div>
                <div><label className={lbl}>Ack. No.</label><input className={inp} value={form.auditAckNo} onChange={e => update({ auditAckNo: e.target.value })} /></div>
                <div><label className={lbl}>UDIN</label><input className={inp} value={form.udin} onChange={e => update({ udin: e.target.value })} /></div>
              </div>
            </div>
          )}
        </Section>

        {/* Tax Rate */}
        <Section title="Tax Rate (AOP / BOI / Trust)">
          <YesNo label="Share of each member in income is determinable" checked={form.sharesDeterminable} onChange={v => update({ sharesDeterminable: v, anyMemberExceedsExemption: false })} />
          {form.sharesDeterminable && (
            <YesNo label="Any member's total income exceeds ₹2,50,000" checked={form.anyMemberExceedsExemption} onChange={v => update({ anyMemberExceedsExemption: v })} warn />
          )}
          <div className={`mt-2 text-xs font-semibold px-2 py-1.5 rounded ${usesMMR ? 'bg-orange-50 text-orange-800' : 'bg-green-50 text-green-800'}`}>
            Tax Rate: {usesMMR ? 'Maximum Marginal Rate (30%)' : 'Slab Rates'}
          </div>
        </Section>

        {/* Members */}
        <Section title="Trustees / Members / Partners" action={<button onClick={addMember} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">+ Add</button>}>
          {form.members.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded">No members added. Click + Add to begin.</p>
          )}
          {form.members.map((m, i) => (
            <div key={i} className="border border-gray-200 rounded mb-2 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-700">{i + 1}. {m.name || 'New Person'} <span className="text-gray-400 font-normal">— {MEMBER_STATUS_OPTIONS.find(o => o.value === m.status)?.label}</span></span>
                <button onClick={() => removeMember(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <div className="p-2 grid grid-cols-3 gap-2">
                <div className="col-span-3"><label className={lbl}>Full Name</label><input className={inp} value={m.name} onChange={e => updateMember(i, { name: e.target.value })} placeholder="Name as per PAN" /></div>
                <div><label className={lbl}>Role</label><select className={inp} value={m.status} onChange={e => updateMember(i, { status: e.target.value as MemberStatus })}>{MEMBER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label className={lbl}>Share %</label><input type="number" className={inp} value={m.sharePercentage || ''} min={0} max={100} onChange={e => updateMember(i, { sharePercentage: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className={lbl}>PAN</label><input className={`${inp} uppercase font-mono`} value={m.pan} maxLength={10} onChange={e => updateMember(i, { pan: e.target.value.toUpperCase() })} /></div>
                <div><label className={lbl}>Aadhaar</label><input className={inp} value={m.aadhaar} maxLength={12} onChange={e => updateMember(i, { aadhaar: e.target.value.replace(/\D/g,'') })} /></div>
                <div><label className={lbl}>Interest Rate %</label><input type="number" className={inp} value={m.rateOfInterest || ''} onChange={e => updateMember(i, { rateOfInterest: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className={lbl}>Remuneration (₹)</label><input type="number" className={inp} value={m.remunerationPaid || ''} onChange={e => updateMember(i, { remunerationPaid: parseInt(e.target.value) || 0 })} /></div>
                <details className="col-span-3 group">
                  <summary className="text-xs text-blue-600 cursor-pointer select-none">▶ Address</summary>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100">
                    <div><label className={lbl}>Flat/Door</label><input className={inp} value={m.flatNo} onChange={e => updateMember(i, { flatNo: e.target.value })} /></div>
                    <div><label className={lbl}>Building</label><input className={inp} value={m.buildingName} onChange={e => updateMember(i, { buildingName: e.target.value })} /></div>
                    <div><label className={lbl}>Street</label><input className={inp} value={m.streetName} onChange={e => updateMember(i, { streetName: e.target.value })} /></div>
                    <div><label className={lbl}>Locality</label><input className={inp} value={m.localityOrArea} onChange={e => updateMember(i, { localityOrArea: e.target.value })} /></div>
                    <div><label className={lbl}>City</label><input className={inp} value={m.cityOrTownOrDistrict} onChange={e => updateMember(i, { cityOrTownOrDistrict: e.target.value })} /></div>
                    <div><label className={lbl}>State</label><select className={inp} value={m.stateCode} onChange={e => updateMember(i, { stateCode: e.target.value })}>{STATE_CODES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></div>
                    <div><label className={lbl}>PIN</label><input className={inp} value={m.pinCode} maxLength={6} onChange={e => updateMember(i, { pinCode: e.target.value.replace(/\D/g,'') })} /></div>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </Section>

        {/* Interest & Fees */}
        <Section title="Interest &amp; Fees on Tax (u/s 234)">
          <div className="grid grid-cols-2 gap-2">
            {([['interest234A','234A — Late Filing Interest'],['interest234B','234B — Advance Tax Shortfall'],['interest234C','234C — Instalment Deferral'],['interest234F','234F — Late Filing Fee']] as const).map(([f,l]) => (
              <div key={f}><label className={lbl}>{l} (₹)</label><input type="number" min={0} className={inp} value={(form as any)[f] || ''} onChange={e => update({ [f]: Number(e.target.value)||0 } as any)} /></div>
            ))}
          </div>
        </Section>

        {/* Updated Return */}
        <Section title="Filing Type">
          <YesNo label="This is an Updated Return u/s 139(8A)" checked={form.isUpdatedReturn} onChange={v => update({ isUpdatedReturn: v })} />
          {form.isUpdatedReturn && (
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
              <div className="flex gap-2">
                {(['2024-25','2025-26'] as UpdatedAY[]).map(ay => (
                  <label key={ay} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer text-xs font-medium ${form.updated.updatedAY === ay ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                    <input type="radio" name="updatedAY" value={ay} checked={form.updated.updatedAY === ay}
                      onChange={() => { const sy=parseInt(ay.split('-')[0]); const ay2=new Date(sy+1,2,31); const m=(new Date().getFullYear()-ay2.getFullYear())*12+new Date().getMonth()-ay2.getMonth(); const p:UpdatedPeriod=m<=12?'1':m<=24?'2':m<=36?'3':'4'; updateUpd({ updatedAY: ay, periodCode: p }); }}
                      className="accent-blue-600" /> FY {ay}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>Original Ack. No.</label><input className={`${inp} font-mono`} value={form.updated.origAckNo} maxLength={15} onChange={e => updateUpd({ origAckNo: e.target.value.replace(/\D/g,'').slice(0,15) })} placeholder="15 digits" /></div>
                <div><label className={lbl}>Original Filing Date</label><input type="date" className={inp} value={form.updated.origFilingDate} onChange={e => updateUpd({ origFilingDate: e.target.value })} /></div>
                <div><label className={lbl}>Previously Filed?</label>
                  <select className={inp} value={form.updated.previouslyFiled?'Y':'N'} onChange={e => updateUpd({ previouslyFiled: e.target.value==='Y' })}>
                    <option value="Y">Yes</option><option value="N">No — first return</option>
                  </select>
                </div>
                <div><label className={lbl}>Period of Updated Return</label>
                  <select className={inp} value={form.updated.periodCode} onChange={e => updateUpd({ periodCode: e.target.value as UpdatedPeriod })}>
                    <option value="1">Within 1 year of AY end</option>
                    <option value="2">1–2 years after AY end</option>
                    <option value="3">2–3 years after AY end</option>
                    <option value="4">3–4 years after AY end</option>
                  </select>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Reasons for update (select all applicable)</p>
                <div className="grid grid-cols-1 gap-0.5">
                  {UPDATE_REASONS.map(([code, label]) => (
                    <label key={code} className="flex items-center gap-2 text-xs py-0.5 cursor-pointer">
                      <input type="checkbox" checked={(form.updated.reasons??[]).includes(code)} onChange={() => toggleReason(code)} className="accent-blue-600" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* ── RIGHT COLUMN — Compliance Questions ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Part A-General (2) — Compliance</h2>
        </div>

        {/* Transfer Pricing */}
        <Section title="Transfer Pricing">
          <YesNo label="International transactions with associated enterprises u/s 92B" checked={form.hasInternationalTransactions92B} onChange={v => update({ hasInternationalTransactions92B: v, hasFiled3CEB: false, hasSecondaryAdjustment92CE: false })} warn />
          {form.hasInternationalTransactions92B && <>
            <YesNo label="Form 3CEB (TP report) filed/to be filed u/s 92E" checked={form.hasFiled3CEB} onChange={v => update({ hasFiled3CEB: v })} />
            <YesNo label="Secondary adjustment u/s 92CE applicable" checked={form.hasSecondaryAdjustment92CE} onChange={v => update({ hasSecondaryAdjustment92CE: v, secondaryAdjustmentAmount92CE: 0 })} warn />
            {form.hasSecondaryAdjustment92CE && <div className="mt-1"><label className={lbl}>Secondary Adjustment Amount (₹)</label><input type="number" min={0} className={inp} value={form.secondaryAdjustmentAmount92CE||''} onChange={e => update({ secondaryAdjustmentAmount92CE: Number(e.target.value)||0 })} /></div>}
          </>}
          <YesNo label="Specified domestic transactions u/s 92BA (>₹20 Cr)" checked={form.hasSpecifiedDomesticTransactions92BA} onChange={v => update({ hasSpecifiedDomesticTransactions92BA: v })} />
          <YesNo label="Transactions in notified jurisdictional areas u/s 94A" checked={form.hasNotifiedJurisdictionalTransactions94A} onChange={v => update({ hasNotifiedJurisdictionalTransactions94A: v })} warn />
          <YesNo label="Payments to related parties covered u/s 40A(2)(b)" checked={form.hasRelatedPartyTransactions40A2b} onChange={v => update({ hasRelatedPartyTransactions40A2b: v })} />
        </Section>

        {/* Foreign */}
        <Section title="Foreign Assets &amp; Income">
          <YesNo label="Entity holds assets outside India (Schedule FA required)" checked={form.hasForeignAssets} onChange={v => update({ hasForeignAssets: v })} warn />
          <YesNo label="Income from foreign sources (Schedule FSI required)" checked={form.hasForeignIncome} onChange={v => update({ hasForeignIncome: v })} />
          <YesNo label="Form 15CA / 15CB filed for foreign remittances" checked={form.hasFiled15CA15CB} onChange={v => update({ hasFiled15CA15CB: v })} />
          <YesNo label="Entity is subsidiary / associate of a foreign company" checked={form.isForeignSubsidiary} onChange={v => update({ isForeignSubsidiary: v })} />
          <YesNo label="Financial statements prepared under Ind AS" checked={form.financialStatementsIndAS} onChange={v => update({ financialStatementsIndAS: v })} />
        </Section>

        {/* Assets */}
        <Section title="Income &amp; Assets Disclosure">
          <YesNo label="Income from Virtual Digital Assets (crypto/NFT) — Sec 115BBH" checked={form.hasVirtualDigitalAssets} onChange={v => update({ hasVirtualDigitalAssets: v })} warn />
          <YesNo label="Agricultural income — partial integration applies" checked={form.hasAgriculturalIncome} onChange={v => update({ hasAgriculturalIncome: v })} />
          <YesNo label="Transfer of unlisted shares (FMV basis u/s 50CA/56(2)(x))" checked={form.hasUnlistedSharesTransfer} onChange={v => update({ hasUnlistedSharesTransfer: v })} />
          <YesNo label="Deemed dividend u/s 2(22)(e) — loans/advances by closely-held co." checked={form.hasDeemedDividend2_22e} onChange={v => update({ hasDeemedDividend2_22e: v })} warn />
          <YesNo label="Brought forward losses / unabsorbed depreciation from earlier years" checked={form.hasBroughtForwardLoss} onChange={v => update({ hasBroughtForwardLoss: v })} />
          <YesNo label="Liable to Alternate Minimum Tax (AMT) u/s 115JC" checked={form.liableForAMT} onChange={v => update({ liableForAMT: v })} />
        </Section>

        {/* Tax Regime & MSME */}
        <Section title="Tax Regime &amp; Other Disclosures">
          <YesNo label="Opt for new tax regime u/s 115BAC (Co-operative: 115BAD / 115BAE)" checked={form.optNewTaxRegime115BAC} onChange={v => update({ optNewTaxRegime115BAC: v })} />
          <YesNo label="MSME / Udyam registered entity" checked={form.hasMSMERegistration} onChange={v => update({ hasMSMERegistration: v, msmeRegistrationNo: '' })} />
          {form.hasMSMERegistration && (
            <div className="mt-1"><label className={lbl}>Udyam Registration No.</label>
              <input className={`${inp} uppercase font-mono`} value={form.msmeRegistrationNo} onChange={e => update({ msmeRegistrationNo: e.target.value.toUpperCase() })} placeholder="UDYAM-XX-00-0000000" />
            </div>
          )}
        </Section>

        {/* Special Deductions */}
        <Section title="Special Deductions Claimed (Chapter VI-A / 10AA)">
          <p className="text-xs text-gray-400 mb-1">Tick whichever applies — the relevant schedule must be filled</p>
          <YesNo label="10AA — SEZ unit export profits" checked={form.claims10AA} onChange={v => update({ claims10AA: v })} />
          <YesNo label="80-IA — Infrastructure / telecom / power / SEZ developer" checked={form.claims80IA} onChange={v => update({ claims80IA: v })} />
          <YesNo label="80-IB — Industrial undertakings / hotels / hospitals" checked={form.claims80IB} onChange={v => update({ claims80IB: v })} />
          <YesNo label="80-IC — Special category state undertakings (NE / J&K)" checked={form.claims80IC} onChange={v => update({ claims80IC: v })} />
          <YesNo label="80-IE — North-Eastern states eligible businesses" checked={form.claims80IE} onChange={v => update({ claims80IE: v })} />
          <YesNo label="80JJA — Processing bio-degradable waste business" checked={form.claims80JJA} onChange={v => update({ claims80JJA: v })} />
          <YesNo label="80JJAA — 30% of additional employee cost for 3 years" checked={form.claims80JJAA} onChange={v => update({ claims80JJAA: v })} />
          <YesNo label="80P — Co-operative society income exemption" checked={form.claims80P} onChange={v => update({ claims80P: v })} />
        </Section>
      </div>

    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function YesNo({ label, checked, onChange, warn = false }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; warn?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1 border-b border-gray-100 last:border-0 ${warn && checked ? 'bg-amber-50 -mx-2 px-2' : ''}`}>
      <span className={`text-xs flex-1 pr-3 ${warn && checked ? 'text-amber-800 font-medium' : 'text-gray-700'}`}>{label}</span>
      <div className="flex items-center gap-3 flex-shrink-0">
        <label className={`flex items-center gap-1 cursor-pointer text-xs ${checked ? 'text-blue-700 font-bold' : 'text-gray-400'}`}>
          <input type="radio" checked={checked} onChange={() => onChange(true)} className="accent-blue-600 w-3 h-3" /> Yes
        </label>
        <label className={`flex items-center gap-1 cursor-pointer text-xs ${!checked ? 'text-gray-700 font-bold' : 'text-gray-400'}`}>
          <input type="radio" checked={!checked} onChange={() => onChange(false)} className="accent-gray-500 w-3 h-3" /> No
        </label>
      </div>
    </div>
  );
}

function Section({ title, hint, action, children }: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// Legacy alias — kept for compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ToggleCard({ title, color = 'blue', onChange, checked }: {
  id: string; checked: boolean; onChange: (v: boolean) => void;
  title: string; description: string; color?: 'blue' | 'amber';
}) {
  return <YesNo label={title} checked={checked} onChange={onChange} warn={color === 'amber'} />;
}
