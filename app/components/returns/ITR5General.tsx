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
  isUpdatedReturn: boolean;
  updated: ITR5Updated;
}

const EMPTY_MEMBER: ITR5Member = {
  name: '', pan: '', aadhaar: '', status: 'TRUSTEE',
  sharePercentage: 0, rateOfInterest: 0, remunerationPaid: 0,
  flatNo: '', buildingName: '', streetName: '', localityOrArea: '',
  cityOrTownOrDistrict: '', stateCode: '27', pinCode: '', countryCode: '91',
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
  isUpdatedReturn: false,
  updated: { ...EMPTY_UPDATED },
};

const ENTITY_LABELS: Record<EntityType, string> = {
  AOP: 'AOP — Association of Persons',
  BOI: 'BOI — Body of Individuals',
  AJP: 'AJP — Artificial Juridical Person',
  LA: 'Local Authority',
  COOP: 'Co-operative Society',
  FIRM: 'Firm (Partnership)',
  LLP: 'LLP — Limited Liability Partnership',
};

const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  INDIVIDUAL: 'Individual', IND_WORKING: 'Individual (Working)', IND_RETIRED: 'Individual (Retired)',
  HUF: 'HUF', FIRM: 'Firm', LLP: 'LLP', DOMESTIC_COMPANY: 'Domestic Company',
  FOREIGN_COMPANY: 'Foreign Company', CO_OPERATIVE_SOCIETY: 'Co-operative Society',
  LOCAL_AUTHORITY: 'Local Authority', TRUST: 'Trust', AOP_BOI: 'AOP/BOI',
  ANY_OTHER_AJP: 'Other AJP', SETTLER: 'Settler', TRUSTEE: 'Trustee',
  BENEFICIARY: 'Beneficiary', PRINCIPAL_OFFICER: 'Principal Officer', EXECUTOR: 'Executor',
};

const STATE_CODES = [
  ['01','Jammu & Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],
  ['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],
  ['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],['13','Nagaland'],['14','Manipur'],
  ['15','Mizoram'],['16','Tripura'],['17','Meghalaya'],['18','Assam'],['19','West Bengal'],
  ['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],
  ['24','Gujarat'],['25','Daman & Diu'],['26','Dadra & NH'],['27','Maharashtra'],
  ['28','Andhra Pradesh'],['29','Karnataka'],['30','Goa'],['31','Lakshadweep'],
  ['32','Kerala'],['33','Tamil Nadu'],['34','Puducherry'],['35','Andaman & Nicobar'],
  ['36','Telangana'],['37','Andhra Pradesh (New)'],['38','Ladakh'],['99','Foreign'],
];

interface Props {
  returnId: number;
  initialData?: Partial<ITR5GeneralState> | null;
  onSaved?: () => void;
}

export default function ITR5General({ returnId, initialData, onSaved }: Props) {
  const [form, setForm] = useState<ITR5GeneralState>({ ...EMPTY, ...initialData });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialData) setForm({ ...EMPTY, ...initialData });
  }, [initialData]);

  const save = useCallback(async (data: ITR5GeneralState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5General`, {
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

  const removeMember = (i: number) => {
    const next = form.members.filter((_, idx) => idx !== i);
    update({ members: next });
  };

  const updateMember = (i: number, patch: Partial<ITR5Member>) => {
    const next = form.members.map((m, idx) => idx === i ? { ...m, ...patch } : m);
    update({ members: next });
  };

  const inp = 'w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">ITR-5 — General Information</h2>
        {saving && <span className="text-xs text-blue-500">Saving…</span>}
        {!saving && savedAt && (
          <span className="text-xs text-green-600">Saved {savedAt.toLocaleTimeString()}</span>
        )}
      </div>

      {/* Entity type */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Entity Details</h3>
        <div>
          <label className={lbl}>Type of Entity *</label>
          <select
            className={inp}
            value={form.entityType}
            onChange={e => update({ entityType: e.target.value as EntityType })}
          >
            {(Object.keys(ENTITY_LABELS) as EntityType[]).map(k => (
              <option key={k} value={k}>{ENTITY_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Sub-Status (Schema Code)</label>
            <select className={inp} value={form.subStatus} onChange={e => update({ subStatus: e.target.value })}>
              <option value="">— Auto from entity type —</option>
              <option value="4">4 — Other Co-operative Society</option>
              <option value="5">5 — LLP</option>
              <option value="8">8 — Any other AOP/BOI</option>
              <option value="10">10 — Partnership Firm</option>
              <option value="11">11 — Society (Societies Registration Act)</option>
              <option value="13">13 — Trust (other than ITR-7 eligible)</option>
              <option value="19">19 — Other AJP</option>
              <option value="20">20 — Business Trust</option>
              <option value="21">21 — Investment Fund</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">For Navshaala Foundation: 13 (Trust other than ITR-7 eligible)</p>
          </div>
          <div>
            <label className={lbl}>Date of Formation / Incorporation</label>
            <input type="date" className={inp} value={form.dateOfFormation} onChange={e => update({ dateOfFormation: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={lbl}>Nature of Business / Activity Code (NatOfBus) *</label>
          <input className={inp} value={form.businessCode} onChange={e => update({ businessCode: e.target.value })}
            placeholder="e.g. 19006 Religious, 19009 Social/community service" />
          <p className="text-xs text-gray-400 mt-1">
            19006 — Religious organisations &nbsp;|&nbsp; 19009 — Other social/community service n.e.c.
          </p>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.maintainsRegularBooks}
              onChange={e => update({ maintainsRegularBooks: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-gray-700">Maintains regular books of accounts</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isAuditRequired}
              onChange={e => update({ isAuditRequired: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-gray-700">Audit required (Sec 44AB / 12A / etc.)</span>
          </label>
        </div>
      </div>

      {/* Tax Rate — Section 167B */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Tax Rate (Section 167B)</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Determines whether the AOP/BOI/Trust is taxed at slab rates or Maximum Marginal Rate (30%)
          </p>
        </div>

        {/* Shares determinable? */}
        <div className="flex items-start gap-3 p-3 rounded-md bg-gray-50 border border-gray-200">
          <input
            type="checkbox"
            id="sharesDet"
            checked={form.sharesDeterminable}
            onChange={e => update({ sharesDeterminable: e.target.checked, anyMemberExceedsExemption: false })}
            className="w-4 h-4 mt-0.5 accent-blue-600"
          />
          <div>
            <label htmlFor="sharesDet" className="text-sm font-medium text-gray-700 cursor-pointer">
              Shares / income of members are determinable
            </label>
            <p className="text-xs text-gray-400 mt-0.5">
              Check if the share of each member in the income of the AOP/BOI is known. If unchecked → taxed at MMR (30%).
            </p>
          </div>
        </div>

        {/* If determinable — any member exceeds basic exemption? */}
        {form.sharesDeterminable && (
          <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200">
            <input
              type="checkbox"
              id="memberExceedsExemption"
              checked={form.anyMemberExceedsExemption}
              onChange={e => update({ anyMemberExceedsExemption: e.target.checked })}
              className="w-4 h-4 mt-0.5 accent-amber-600"
            />
            <div>
              <label htmlFor="memberExceedsExemption" className="text-sm font-medium text-gray-700 cursor-pointer">
                Any member's total income exceeds the basic exemption limit (₹2,50,000)
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                If yes → AOP taxed at MMR (30%) even though shares are determinable [Sec 167B(2)].
                If no → taxed at slab rates.
              </p>
            </div>
          </div>
        )}

        {/* Tax rate summary badge */}
        <div className={`text-xs font-semibold px-3 py-2 rounded-md ${
          (!form.sharesDeterminable || form.anyMemberExceedsExemption)
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {(!form.sharesDeterminable || form.anyMemberExceedsExemption)
            ? '⚡ Maximum Marginal Rate — 30% on normal income + applicable surcharge + 4% H&E Cess'
            : '📊 Slab Rates — Old regime slabs + applicable surcharge + 4% H&E Cess'}
        </div>
      </div>

      {/* Updated Return — 139(8A) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="updatedReturn"
            checked={form.isUpdatedReturn}
            onChange={e => update({ isUpdatedReturn: e.target.checked })}
            className="w-4 h-4 accent-blue-600"
          />
          <label htmlFor="updatedReturn" className="text-sm font-semibold text-gray-700 cursor-pointer">
            Updated Return u/s 139(8A)
          </label>
        </div>

        {form.isUpdatedReturn && (
          <div className="space-y-4 pt-2 border-t border-gray-100">
            {/* FY selector */}
            <div>
              <label className={lbl}>Financial Year being updated *</label>
              <div className="flex gap-3">
                {(['2024-25', '2025-26'] as UpdatedAY[]).map(ay => (
                  <label key={ay} className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.updated.updatedAY === ay
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="updatedAY"
                      value={ay}
                      checked={form.updated.updatedAY === ay}
                      onChange={() => {
                        // auto-set period based on today vs AY end date
                        const startYear = parseInt(ay.split('-')[0]);
                        const ayEndDate = new Date(startYear + 1, 2, 31); // March 31 of AY end year
                        const now = new Date();
                        const monthsFromEnd = (now.getFullYear() - ayEndDate.getFullYear()) * 12 + now.getMonth() - ayEndDate.getMonth();
                        const period: UpdatedPeriod = monthsFromEnd <= 12 ? '1' : monthsFromEnd <= 24 ? '2' : monthsFromEnd <= 36 ? '3' : '4';
                        updateUpd({ updatedAY: ay, periodCode: period });
                      }}
                      className="accent-blue-600"
                    />
                    FY {ay}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                FY 2023-24 = AY 2024-25 &nbsp;|&nbsp; FY 2024-25 = AY 2025-26
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Original Return Ack. No. * (15 digits)</label>
                <input
                  className={inp}
                  value={form.updated.origAckNo}
                  onChange={e => updateUpd({ origAckNo: e.target.value.replace(/\D/g, '').slice(0, 15) })}
                  placeholder="123456789012345"
                  maxLength={15}
                />
              </div>
              <div>
                <label className={lbl}>Date of Original Filing *</label>
                <input
                  type="date"
                  className={inp}
                  value={form.updated.origFilingDate}
                  onChange={e => updateUpd({ origFilingDate: e.target.value })}
                />
              </div>
              <div>
                <label className={lbl}>Was ITR previously filed for this AY? *</label>
                <select className={inp} value={form.updated.previouslyFiled ? 'Y' : 'N'}
                  onChange={e => updateUpd({ previouslyFiled: e.target.value === 'Y' })}>
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
              {form.updated.previouslyFiled && (
                <div>
                  <label className={lbl}>Previous filing type</label>
                  <select className={inp} value={form.updated.previousFilingType}
                    onChange={e => updateUpd({ previousFilingType: e.target.value as '1' | '2' })}>
                    <option value="1">139(1) — Filed on time</option>
                    <option value="2">Other (Belated/Revised etc.)</option>
                  </select>
                </div>
              )}
              <div>
                <label className={lbl}>Period of Updated Return *</label>
                <select className={inp} value={form.updated.periodCode}
                  onChange={e => updateUpd({ periodCode: e.target.value as UpdatedPeriod })}>
                  <option value="1">1 — Up to 12 months from end of AY</option>
                  <option value="2">2 — 12 to 24 months from end of AY</option>
                  <option value="3">3 — 24 to 36 months from end of AY</option>
                  <option value="4">4 — 36 to 48 months from end of AY</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Provisions laid out in 139(8A)?</label>
                <select className={inp} value={form.updated.laidOutFlag ? 'Y' : 'N'}
                  onChange={e => updateUpd({ laidOutFlag: e.target.value === 'Y' })}>
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </div>
            </div>

            {/* Reasons for updating */}
            <div>
              <label className={lbl}>Reason(s) for Updating Income *</label>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-1">
                {([
                  ['1', 'Return previously not filed'],
                  ['2', 'Income not reported correctly'],
                  ['3', 'Wrong heads of income chosen'],
                  ['4', 'Reduction of carried forward loss'],
                  ['5', 'Reduction of unabsorbed depreciation'],
                  ['6', 'Reduction of tax credit u/s 115JB/115JC'],
                  ['7', 'Wrong rate of tax'],
                  ['OTH', 'Others'],
                ] as [UpdateReason, string][]).map(([code, label]) => (
                  <label key={code} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={(form.updated.reasons ?? []).includes(code)}
                      onChange={() => toggleReason(code)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span><span className="font-medium text-gray-500">{code}.</span> {label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Audit details */}
      {form.isAuditRequired && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Audit Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Auditor Name *</label>
              <input className={inp} value={form.auditorName} onChange={e => update({ auditorName: e.target.value })} placeholder="CA / Auditor full name" />
            </div>
            <div>
              <label className={lbl}>Membership No. *</label>
              <input className={inp} value={form.auditorMembership} onChange={e => update({ auditorMembership: e.target.value })} placeholder="e.g. 123456" />
            </div>
            <div>
              <label className={lbl}>Firm Name</label>
              <input className={inp} value={form.auditFirmName} onChange={e => update({ auditFirmName: e.target.value })} placeholder="Audit firm name" />
            </div>
            <div>
              <label className={lbl}>Firm Reg. No.</label>
              <input className={inp} value={form.auditFirmRegNo} onChange={e => update({ auditFirmRegNo: e.target.value })} placeholder="FRN / Reg number" />
            </div>
            <div>
              <label className={lbl}>Firm PAN</label>
              <input className={inp} value={form.auditFirmPAN} onChange={e => update({ auditFirmPAN: e.target.value.toUpperCase() })} placeholder="AAAAA9999A" maxLength={10} />
            </div>
            <div>
              <label className={lbl}>Audit Report Date *</label>
              <input type="date" className={inp} value={form.auditReportDate} onChange={e => update({ auditReportDate: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>Audit Ack / Report No.</label>
              <input className={inp} value={form.auditAckNo} onChange={e => update({ auditAckNo: e.target.value })} placeholder="Acknowledgement number" />
            </div>
            <div>
              <label className={lbl}>UDIN</label>
              <input className={inp} value={form.udin} onChange={e => update({ udin: e.target.value })} placeholder="Unique Document Identification No." />
            </div>
          </div>
        </div>
      )}

      {/* Table F — Partners / Members / Trustees */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Table F — Partners / Members / Trustees
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Required for Trust (sub-status 13) per CBDT Rule 32. Add all trustees/settlors/beneficiaries.
            </p>
          </div>
          <button
            onClick={addMember}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            + Add
          </button>
        </div>

        {form.members.length === 0 && (
          <p className="text-sm text-gray-400 italic">No members added yet.</p>
        )}

        {form.members.map((m, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-4 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">Member {i + 1}</span>
              <button onClick={() => removeMember(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Name *</label>
                <input className={inp} value={m.name} onChange={e => updateMember(i, { name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <label className={lbl}>PAN</label>
                <input className={inp} value={m.pan} onChange={e => updateMember(i, { pan: e.target.value.toUpperCase() })} placeholder="AAAAA9999A" maxLength={10} />
              </div>
              <div>
                <label className={lbl}>Aadhaar</label>
                <input className={inp} value={m.aadhaar} onChange={e => updateMember(i, { aadhaar: e.target.value.replace(/\D/g,'') })} placeholder="12-digit Aadhaar" maxLength={12} />
              </div>
              <div>
                <label className={lbl}>Status *</label>
                <select className={inp} value={m.status} onChange={e => updateMember(i, { status: e.target.value as MemberStatus })}>
                  {(Object.keys(MEMBER_STATUS_LABELS) as MemberStatus[]).map(k => (
                    <option key={k} value={k}>{MEMBER_STATUS_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Share % *</label>
                <input type="number" className={inp} value={m.sharePercentage} min={0} max={100} step={0.01}
                  onChange={e => updateMember(i, { sharePercentage: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={lbl}>Rate of Interest % *</label>
                <input type="number" className={inp} value={m.rateOfInterest} min={0} max={100} step={0.01}
                  onChange={e => updateMember(i, { rateOfInterest: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={lbl}>Remuneration Paid (₹) *</label>
                <input type="number" className={inp} value={m.remunerationPaid} min={0}
                  onChange={e => updateMember(i, { remunerationPaid: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Address details</summary>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className={lbl}>Flat/Door No.</label>
                  <input className={inp} value={m.flatNo} onChange={e => updateMember(i, { flatNo: e.target.value })} />
                </div>
                <div>
                  <label className={lbl}>Building Name</label>
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
                    {STATE_CODES.map(([code, name]) => (
                      <option key={code} value={code}>{code} — {name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>PIN Code</label>
                  <input className={inp} value={m.pinCode} onChange={e => updateMember(i, { pinCode: e.target.value.replace(/\D/g,'') })} maxLength={6} />
                </div>
                <div>
                  <label className={lbl}>Country Code</label>
                  <input className={inp} value={m.countryCode} onChange={e => updateMember(i, { countryCode: e.target.value })} placeholder="91 for India" />
                </div>
              </div>
            </details>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        {form.maintainsRegularBooks
          ? 'Full P&L (items 13–61) will be required in the P&L tab.'
          : 'No-account case (item 65) will be used in the P&L tab.'}
      </p>
    </div>
  );
}
