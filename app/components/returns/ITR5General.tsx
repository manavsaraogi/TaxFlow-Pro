'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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

const BUSINESS_CODE_OPTIONS = [
  { value: '19006', label: '19006 — Religious organisations' },
  { value: '19009', label: '19009 — Social / community service (general)' },
  { value: '19007', label: '19007 — Educational institutions' },
  { value: '19008', label: '19008 — Health / medical services' },
  { value: '01001', label: '01001 — Agriculture (crop growing)' },
  { value: '09001', label: '09001 — Trading — retail' },
  { value: '09002', label: '09002 — Trading — wholesale' },
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
          {(() => {
            const isPreset = BUSINESS_CODE_OPTIONS.some(o => o.value === form.businessCode);
            return (
              <>
                <select
                  className={inp}
                  value={isPreset ? form.businessCode : '__other__'}
                  onChange={e => {
                    if (e.target.value === '__other__') {
                      update({ businessCode: '' });
                    } else {
                      update({ businessCode: e.target.value });
                    }
                  }}
                >
                  {BUSINESS_CODE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                  <option value="__other__">Other (enter code manually)…</option>
                </select>
                {!isPreset && (
                  <input
                    className={`${inp} mt-2`}
                    value={form.businessCode}
                    onChange={e => update({ businessCode: e.target.value })}
                    placeholder="Enter 5-digit activity code (e.g. 21008)"
                    autoFocus
                  />
                )}
              </>
            );
          })()}
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
