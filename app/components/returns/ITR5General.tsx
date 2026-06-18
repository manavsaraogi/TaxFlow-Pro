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

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1.5';

  const usesMMR = !form.sharesDeterminable || form.anyMemberExceedsExemption;

  return (
    <div className="max-w-2xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">General Information</h2>
          <p className="text-xs text-gray-400 mt-0.5">Basic details about the organisation filing ITR-5</p>
        </div>
        <div className="text-xs">
          {saving && <span className="text-blue-500 animate-pulse">Saving…</span>}
          {!saving && savedAt && <span className="text-green-600">Saved {savedAt.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* ── Organisation Details ─────────────────────────────────────────── */}
      <Section title="Organisation Details">
        <div>
          <label className={lbl}>What type of organisation is this?</label>
          <div className="space-y-2">
            {ENTITY_OPTIONS.map(opt => (
              <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                form.entityType === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="entityType"
                  value={opt.value}
                  checked={form.entityType === opt.value}
                  onChange={() => update({ entityType: opt.value })}
                  className="mt-0.5 accent-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{opt.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-1">
          <div>
            <label className={lbl}>Sub-category (if applicable)</label>
            <select className={inp} value={form.subStatus} onChange={e => update({ subStatus: e.target.value })}>
              <option value="">Auto-detected from type above</option>
              {SUB_STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">For a Trust (not under ITR-7) → select "Trust (other than ITR-7 eligible)"</p>
          </div>
          <div>
            <label className={lbl}>Date of Formation / Registration</label>
            <input type="date" className={inp} value={form.dateOfFormation}
              onChange={e => update({ dateOfFormation: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={lbl}>Main activity / nature of business</label>
          <BusinessCodeSearch
            value={form.businessCode}
            onChange={code => update({ businessCode: code })}
            inputClass={inp}
          />
        </div>
      </Section>

      {/* ── Books & Audit ────────────────────────────────────────────────── */}
      <Section title="Books of Accounts & Audit">
        <ToggleCard
          id="regularBooks"
          checked={form.maintainsRegularBooks}
          onChange={v => update({ maintainsRegularBooks: v })}
          title="Organisation maintains regular books of accounts"
          description="Cashbook, ledger, vouchers etc. maintained throughout the year"
        />
        <ToggleCard
          id="auditReq"
          checked={form.isAuditRequired}
          onChange={v => update({ isAuditRequired: v })}
          title="Audit is required (Sec 44AB, 12A, 10(23C), etc.)"
          description="If total receipts exceed ₹2.5 crore, or if required by the trust registration"
        />

        {form.isAuditRequired && (
          <div className="border border-gray-100 rounded-lg p-4 space-y-4 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Auditor Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Auditor's Name</label>
                <input className={inp} value={form.auditorName} onChange={e => update({ auditorName: e.target.value })} placeholder="CA full name" />
              </div>
              <div>
                <label className={lbl}>Membership No.</label>
                <input className={inp} value={form.auditorMembership} onChange={e => update({ auditorMembership: e.target.value })} placeholder="e.g. 123456" />
              </div>
              <div>
                <label className={lbl}>Audit Firm Name</label>
                <input className={inp} value={form.auditFirmName} onChange={e => update({ auditFirmName: e.target.value })} placeholder="Firm name" />
              </div>
              <div>
                <label className={lbl}>Firm Registration No.</label>
                <input className={inp} value={form.auditFirmRegNo} onChange={e => update({ auditFirmRegNo: e.target.value })} placeholder="FRN number" />
              </div>
              <div>
                <label className={lbl}>Firm PAN</label>
                <input className={inp} value={form.auditFirmPAN} onChange={e => update({ auditFirmPAN: e.target.value.toUpperCase() })} placeholder="AAAAA9999A" maxLength={10} />
              </div>
              <div>
                <label className={lbl}>Audit Report Date</label>
                <input type="date" className={inp} value={form.auditReportDate} onChange={e => update({ auditReportDate: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Audit Report Ack. No.</label>
                <input className={inp} value={form.auditAckNo} onChange={e => update({ auditAckNo: e.target.value })} placeholder="Acknowledgement number" />
              </div>
              <div>
                <label className={lbl}>UDIN</label>
                <input className={inp} value={form.udin} onChange={e => update({ udin: e.target.value })} placeholder="Unique Document Identification No." />
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── How is tax calculated? ───────────────────────────────────────── */}
      <Section title="How should tax be calculated?">
        <p className="text-sm text-gray-500 -mt-1">
          For an AOP/Trust/BOI, the tax rate depends on whether each member's share of income is known.
        </p>

        <ToggleCard
          id="sharesDet"
          checked={form.sharesDeterminable}
          onChange={v => update({ sharesDeterminable: v, anyMemberExceedsExemption: false })}
          title="The share of each member in the income is known"
          description="You can clearly say what percentage of income belongs to each trustee/member"
        />

        {form.sharesDeterminable && (
          <ToggleCard
            id="memberExceeds"
            checked={form.anyMemberExceedsExemption}
            onChange={v => update({ anyMemberExceedsExemption: v })}
            title="Any member's total income (including their share) is more than ₹2,50,000"
            description="This includes income from all sources, not just the share from this organisation"
            color="amber"
          />
        )}

        {/* Result badge */}
        <div className={`flex items-start gap-3 p-4 rounded-lg border ${usesMMR ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${usesMMR ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
            {usesMMR ? '%' : '='}
          </div>
          <div>
            <p className={`text-sm font-semibold ${usesMMR ? 'text-orange-800' : 'text-green-800'}`}>
              {usesMMR ? 'Tax at Maximum Marginal Rate (30%)' : 'Tax at Slab Rates'}
            </p>
            <p className={`text-xs mt-0.5 ${usesMMR ? 'text-orange-600' : 'text-green-600'}`}>
              {usesMMR
                ? '30% on normal income + 20% on STCG + 12.5% on LTCG · Surcharge (if applicable) · 4% Health & Education Cess'
                : 'Normal tax slabs (0/5/20/30%) + surcharge if applicable + 4% Health & Education Cess'}
            </p>
          </div>
        </div>
      </Section>

      {/* ── Trustees / Members ───────────────────────────────────────────── */}
      <Section
        title="Trustees / Members / Partners"
        action={<button onClick={addMember} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">+ Add Person</button>}
        hint="Required for Trust/AOP — list all trustees, settlors, beneficiaries, and partners"
      >
        {form.members.length === 0 && (
          <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
            No trustees or members added yet.<br/>
            <span className="text-xs">Click "Add Person" to add trustees, settlors, beneficiaries, or partners.</span>
          </div>
        )}

        {form.members.map((m, i) => (
          <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Member header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span className="text-sm font-medium text-gray-700">{m.name || 'New Person'}</span>
                {m.status && <span className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded-full text-gray-500">{MEMBER_STATUS_OPTIONS.find(o => o.value === m.status)?.label}</span>}
              </div>
              <button onClick={() => removeMember(i)} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={lbl}>Full Name</label>
                  <input className={inp} value={m.name} onChange={e => updateMember(i, { name: e.target.value })} placeholder="Full name as per PAN" />
                </div>
                <div>
                  <label className={lbl}>Role in the Organisation</label>
                  <select className={inp} value={m.status} onChange={e => updateMember(i, { status: e.target.value as MemberStatus })}>
                    {MEMBER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Share in Income (%)</label>
                  <input type="number" className={inp} value={m.sharePercentage} min={0} max={100} step={0.01}
                    placeholder="0"
                    onChange={e => updateMember(i, { sharePercentage: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className={lbl}>PAN</label>
                  <input className={`${inp} font-mono uppercase`} value={m.pan} onChange={e => updateMember(i, { pan: e.target.value.toUpperCase() })} placeholder="AAAAA9999A" maxLength={10} />
                </div>
                <div>
                  <label className={lbl}>Aadhaar Number</label>
                  <input className={inp} value={m.aadhaar} onChange={e => updateMember(i, { aadhaar: e.target.value.replace(/\D/g,'') })} placeholder="12-digit number" maxLength={12} />
                </div>
                <div>
                  <label className={lbl}>Interest Rate Paid (%)</label>
                  <input type="number" className={inp} value={m.rateOfInterest} min={0} max={100} step={0.01}
                    placeholder="0"
                    onChange={e => updateMember(i, { rateOfInterest: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className={lbl}>Remuneration / Salary Paid (₹)</label>
                  <input type="number" className={inp} value={m.remunerationPaid} min={0}
                    placeholder="0"
                    onChange={e => updateMember(i, { remunerationPaid: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <details className="group">
                <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800 font-medium select-none list-none flex items-center gap-1">
                  <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                  Address (required for filing)
                </summary>
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
                  <div>
                    <label className={lbl}>Flat / Door No.</label>
                    <input className={inp} value={m.flatNo} onChange={e => updateMember(i, { flatNo: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Building / Premises Name</label>
                    <input className={inp} value={m.buildingName} onChange={e => updateMember(i, { buildingName: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Street / Road</label>
                    <input className={inp} value={m.streetName} onChange={e => updateMember(i, { streetName: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>Locality / Area</label>
                    <input className={inp} value={m.localityOrArea} onChange={e => updateMember(i, { localityOrArea: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>City / Town</label>
                    <input className={inp} value={m.cityOrTownOrDistrict} onChange={e => updateMember(i, { cityOrTownOrDistrict: e.target.value })} />
                  </div>
                  <div>
                    <label className={lbl}>State</label>
                    <select className={inp} value={m.stateCode} onChange={e => updateMember(i, { stateCode: e.target.value })}>
                      {STATE_CODES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>PIN Code</label>
                    <input className={inp} value={m.pinCode} onChange={e => updateMember(i, { pinCode: e.target.value.replace(/\D/g,'') })} maxLength={6} placeholder="6 digits" />
                  </div>
                </div>
              </details>
            </div>
          </div>
        ))}
      </Section>

      {/* ── Interest on Tax u/s 234A/234B/234C/234F ──────────────────────── */}
      <Section
        title="Interest & Fees (if any)"
        hint="Leave at 0 if not applicable. These are added on top of the computed tax. 234A = interest for late filing, 234B = advance tax shortfall, 234C = instalment deferral, 234F = late filing fee."
      >
        <div className="grid grid-cols-2 gap-4">
          {([
            ['interest234A', '234A — Late Filing Interest (₹)'],
            ['interest234B', '234B — Advance Tax Shortfall (₹)'],
            ['interest234C', '234C — Instalment Deferral (₹)'],
            ['interest234F', '234F — Late Filing Fee (₹)'],
          ] as const).map(([field, label]) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={(form as any)[field] || ''}
                onChange={e => update({ [field]: Number(e.target.value) || 0 } as any)}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* ── Updated Return 139(8A) ───────────────────────────────────────── */}
      <Section title="Filing Type">
        <ToggleCard
          id="updatedReturn"
          checked={form.isUpdatedReturn}
          onChange={v => update({ isUpdatedReturn: v })}
          title="This is an Updated Return (filed under Section 139(8A))"
          description="Use this if you are correcting or adding income to a return that was already filed"
        />

        {form.isUpdatedReturn && (
          <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated Return Details</p>

            {/* FY picker */}
            <div>
              <label className={lbl}>Which year's return are you updating?</label>
              <div className="flex gap-3">
                {(['2024-25', '2025-26'] as UpdatedAY[]).map(ay => (
                  <label key={ay} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                    form.updated.updatedAY === ay ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="updatedAY" value={ay} checked={form.updated.updatedAY === ay}
                      onChange={() => {
                        const startYear = parseInt(ay.split('-')[0]);
                        const ayEndDate = new Date(startYear + 1, 2, 31);
                        const monthsFromEnd = (new Date().getFullYear() - ayEndDate.getFullYear()) * 12 + new Date().getMonth() - ayEndDate.getMonth();
                        const period: UpdatedPeriod = monthsFromEnd <= 12 ? '1' : monthsFromEnd <= 24 ? '2' : monthsFromEnd <= 36 ? '3' : '4';
                        updateUpd({ updatedAY: ay, periodCode: period });
                      }}
                      className="accent-blue-600"
                    />
                    FY {ay}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Original Acknowledgement No.</label>
                <input className={`${inp} font-mono`} value={form.updated.origAckNo}
                  onChange={e => updateUpd({ origAckNo: e.target.value.replace(/\D/g,'').slice(0,15) })}
                  placeholder="15-digit number" maxLength={15} />
              </div>
              <div>
                <label className={lbl}>Date of Original Filing</label>
                <input type="date" className={inp} value={form.updated.origFilingDate}
                  onChange={e => updateUpd({ origFilingDate: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Was a return filed earlier for this year?</label>
                <select className={inp} value={form.updated.previouslyFiled ? 'Y' : 'N'}
                  onChange={e => updateUpd({ previouslyFiled: e.target.value === 'Y' })}>
                  <option value="Y">Yes — filed on time or with delay</option>
                  <option value="N">No — this is the first return for this year</option>
                </select>
              </div>
              {form.updated.previouslyFiled && (
                <div>
                  <label className={lbl}>How was the earlier return filed?</label>
                  <select className={inp} value={form.updated.previousFilingType}
                    onChange={e => updateUpd({ previousFilingType: e.target.value as '1' | '2' })}>
                    <option value="1">Filed on time (Section 139(1))</option>
                    <option value="2">Filed late or as revised return</option>
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className={lbl}>Time period of this updated return</label>
                <select className={inp} value={form.updated.periodCode}
                  onChange={e => updateUpd({ periodCode: e.target.value as UpdatedPeriod })}>
                  <option value="1">Within 1 year of the end of the assessment year</option>
                  <option value="2">Between 1 and 2 years after end of assessment year</option>
                  <option value="3">Between 2 and 3 years after end of assessment year</option>
                  <option value="4">Between 3 and 4 years after end of assessment year</option>
                </select>
              </div>
            </div>

            {/* Reasons */}
            <div>
              <label className={lbl}>Why are you updating the return? (select all that apply)</label>
              <div className="space-y-2">
                {UPDATE_REASONS.map(([code, label]) => (
                  <label key={code} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer text-sm transition-colors ${
                    (form.updated.reasons ?? []).includes(code)
                      ? 'border-blue-400 bg-blue-50 text-blue-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}>
                    <input type="checkbox"
                      checked={(form.updated.reasons ?? []).includes(code)}
                      onChange={() => toggleReason(code)}
                      className="w-4 h-4 accent-blue-600 flex-shrink-0"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── GST & Turnover ───────────────────────────────────────────────── */}
      <Section title="GST &amp; Turnover">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Total Turnover / Gross Receipts for the Year (₹)</label>
            <input type="number" min={0} className={inp} value={form.totalTurnover || ''}
              onChange={e => update({ totalTurnover: Number(e.target.value) || 0 })} />
            <p className="text-xs text-gray-400 mt-1">Used to determine audit applicability and GST reconciliation</p>
          </div>
          <div>
            <label className={lbl}>Agricultural income for the year (₹)</label>
            <input type="number" min={0} className={inp} value={form.agriculturalIncome || ''}
              onChange={e => update({ agriculturalIncome: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <ToggleCard
          id="gstReg"
          checked={form.gstRegistered}
          onChange={v => update({ gstRegistered: v })}
          title="Entity is registered under GST"
          description="GSTIN required if registered"
        />
        {form.gstRegistered && (
          <div>
            <label className={lbl}>GSTIN</label>
            <input className={`${inp} font-mono uppercase`} value={form.gstin}
              onChange={e => update({ gstin: e.target.value.toUpperCase() })}
              placeholder="22AAAAA0000A1Z5" maxLength={15} />
          </div>
        )}
        <ToggleCard
          id="vda"
          checked={form.hasVirtualDigitalAssets}
          onChange={v => update({ hasVirtualDigitalAssets: v })}
          title="Entity has income from Virtual Digital Assets (crypto, NFTs etc.)"
          description="Taxable at 30% u/s 115BBH; Schedule VDA must be filled"
          color="amber"
        />
        <ToggleCard
          id="agri"
          checked={form.hasAgriculturalIncome}
          onChange={v => update({ hasAgriculturalIncome: v })}
          title="Entity has agricultural income"
          description="Relevant for partial integration with business income for tax computation"
        />
      </Section>

      {/* ── Transfer Pricing & International Transactions ────────────────── */}
      <Section
        title="Transfer Pricing &amp; International Transactions"
        hint="Answer based on transactions during the financial year. These questions flow directly into Part A-General(2) of the ITR-5."
      >
        <ToggleCard
          id="intl92B"
          checked={form.hasInternationalTransactions92B}
          onChange={v => update({ hasInternationalTransactions92B: v, hasFiled3CEB: false, hasSecondaryAdjustment92CE: false })}
          title="Entity has entered into international transactions with associated enterprises (u/s 92B)"
          description="Transactions with group companies, subsidiaries, or associated enterprises outside India"
          color="amber"
        />
        {form.hasInternationalTransactions92B && (
          <div className="ml-4 space-y-3 border-l-2 border-amber-200 pl-4">
            <ToggleCard
              id="form3CEB"
              checked={form.hasFiled3CEB}
              onChange={v => update({ hasFiled3CEB: v })}
              title="Form 3CEB (Transfer Pricing Report) has been / will be filed u/s 92E"
              description="Mandatory if international transactions exceed ₹1 crore in aggregate"
            />
            <ToggleCard
              id="sec92CE"
              checked={form.hasSecondaryAdjustment92CE}
              onChange={v => update({ hasSecondaryAdjustment92CE: v, secondaryAdjustmentAmount92CE: 0 })}
              title="Secondary adjustment applies u/s 92CE"
              description="Where a primary transfer pricing adjustment has been made and the excess money has not been repatriated"
              color="amber"
            />
            {form.hasSecondaryAdjustment92CE && (
              <div>
                <label className={lbl}>Amount of secondary adjustment (₹)</label>
                <input type="number" min={0} className={inp} value={form.secondaryAdjustmentAmount92CE || ''}
                  onChange={e => update({ secondaryAdjustmentAmount92CE: Number(e.target.value) || 0 })} />
              </div>
            )}
          </div>
        )}

        <ToggleCard
          id="sdt92BA"
          checked={form.hasSpecifiedDomesticTransactions92BA}
          onChange={v => update({ hasSpecifiedDomesticTransactions92BA: v })}
          title="Entity has specified domestic transactions u/s 92BA"
          description="Transactions with domestic related parties exceeding ₹20 crore — TP provisions apply"
        />

        <ToggleCard
          id="nja94A"
          checked={form.hasNotifiedJurisdictionalTransactions94A}
          onChange={v => update({ hasNotifiedJurisdictionalTransactions94A: v })}
          title="Transactions with persons in Notified Jurisdictional Areas u/s 94A"
          description="Countries identified by CBDT where no effective exchange of information exists (e.g. Cyprus in earlier years)"
          color="amber"
        />

        <ToggleCard
          id="relParty"
          checked={form.hasRelatedPartyTransactions40A2b}
          onChange={v => update({ hasRelatedPartyTransactions40A2b: v })}
          title="Payments to related parties covered u/s 40A(2)(b)"
          description="Payments to directors, partners, relatives, or associated concerns that may be disallowed if excessive"
        />
      </Section>

      {/* ── Foreign Assets & Income ──────────────────────────────────────── */}
      <Section title="Foreign Assets &amp; Foreign Income">
        <ToggleCard
          id="foreignAssets"
          checked={form.hasForeignAssets}
          onChange={v => update({ hasForeignAssets: v })}
          title="Entity holds assets located outside India"
          description="Foreign bank accounts, shares in foreign companies, immovable property abroad, etc. — Schedule FA must be filled"
          color="amber"
        />
        <ToggleCard
          id="foreignIncome"
          checked={form.hasForeignIncome}
          onChange={v => update({ hasForeignIncome: v })}
          title="Entity has income from foreign sources during the year"
          description="Dividends, interest, royalties, capital gains on foreign assets — Schedule FSI required"
        />
        <ToggleCard
          id="form15CA"
          checked={form.hasFiled15CA15CB}
          onChange={v => update({ hasFiled15CA15CB: v })}
          title="Form 15CA / 15CB has been filed for foreign remittances"
          description="Required when remitting money outside India — certificate from CA and self-declaration"
        />
        <ToggleCard
          id="foreignSub"
          checked={form.isForeignSubsidiary}
          onChange={v => update({ isForeignSubsidiary: v })}
          title="Entity is a subsidiary / associate of a foreign company"
          description="Relevant for Country-by-Country Reporting (CbCR) and BEPS compliance"
        />
        <ToggleCard
          id="indAS"
          checked={form.financialStatementsIndAS}
          onChange={v => update({ financialStatementsIndAS: v })}
          title="Financial statements are prepared under Ind AS"
          description="Indian Accounting Standards (converged with IFRS) — affects ICDS adjustments in Schedule BP"
        />
      </Section>

      {/* ── Special Deductions Claimed ───────────────────────────────────── */}
      <Section
        title="Special Deductions &amp; Incentives"
        hint="Tick whichever your organisation is claiming. The relevant schedule will need to be filled separately."
      >
        <div className="grid grid-cols-1 gap-2">
          <ToggleCard id="c10AA" checked={form.claims10AA} onChange={v => update({ claims10AA: v })}
            title="Deduction u/s 10AA — Special Economic Zone (SEZ) units"
            description="Export profits from SEZ units — Schedule 10AA must be filled" />
          <ToggleCard id="c80IA" checked={form.claims80IA} onChange={v => update({ claims80IA: v })}
            title="Deduction u/s 80-IA — Infrastructure, telecom, power, SEZ developers"
            description="100% deduction for eligible infrastructure businesses" />
          <ToggleCard id="c80IB" checked={form.claims80IB} onChange={v => update({ claims80IB: v })}
            title="Deduction u/s 80-IB — Industrial undertakings / hotels / hospitals"
            description="Time-limited profit deduction for eligible businesses" />
          <ToggleCard id="c80IC" checked={form.claims80IC} onChange={v => update({ claims80IC: v })}
            title="Deduction u/s 80-IC — Special category state undertakings"
            description="North-East, J&K, Himachal Pradesh, Uttarakhand — eligible industries" />
          <ToggleCard id="c80IE" checked={form.claims80IE} onChange={v => update({ claims80IE: v })}
            title="Deduction u/s 80-IE — North-Eastern states eligible businesses"
            description="Manufacturing/hotel/adventure/eco-tourism activities in North-East" />
          <ToggleCard id="c80JJA" checked={form.claims80JJA} onChange={v => update({ claims80JJA: v })}
            title="Deduction u/s 80JJA — Business of collecting / processing bio-degradable waste"
            description="100% deduction for 5 years from commencement" />
          <ToggleCard id="c80JJAA" checked={form.claims80JJAA} onChange={v => update({ claims80JJAA: v })}
            title="Deduction u/s 80JJAA — New employees' cost (30% for 3 years)"
            description="For businesses subject to tax audit — additional wages to new employees" />
          <ToggleCard id="c80P" checked={form.claims80P} onChange={v => update({ claims80P: v })}
            title="Deduction u/s 80P — Co-operative society income exemption"
            description="Applies only to co-operative societies — various sub-sections" />
        </div>
      </Section>

    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Section({ title, hint, action, children }: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ToggleCard({ id, checked, onChange, title, description, color = 'blue' }: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
  color?: 'blue' | 'amber';
}) {
  const accent = color === 'amber' ? 'accent-amber-600' : 'accent-blue-600';
  const activeBorder = color === 'amber' ? 'border-amber-400 bg-amber-50' : 'border-blue-400 bg-blue-50';
  return (
    <label className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${checked ? activeBorder : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
      <input type="checkbox" id={id} checked={checked} onChange={e => onChange(e.target.checked)} className={`w-4 h-4 mt-0.5 flex-shrink-0 ${accent}`} />
      <div>
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
    </label>
  );
}
