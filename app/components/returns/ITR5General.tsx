'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { NATURE_OF_BUSINESS_CODES_ITR5 } from '@/app/lib/itrCodes';

// ── Types ─────────────────────────────────────────────────────────────────────

type EntityType = 'AOP' | 'BOI' | 'AJP' | 'LA' | 'COOP' | 'FIRM' | 'LLP';
type ResidentialStatus = 'RESIDENT' | 'NOR' | 'NON_RESIDENT';
type FilingSection = '139(1)' | '139(4)' | '139(5)' | '92CD' | '119(2)(b)' | '139(8A)';

type MemberStatus =
  | 'INDIVIDUAL' | 'HUF' | 'FIRM' | 'LLP'
  | 'DOMESTIC_COMPANY' | 'FOREIGN_COMPANY' | 'CO_OPERATIVE_SOCIETY'
  | 'LOCAL_AUTHORITY' | 'TRUST' | 'AOP_BOI' | 'ANY_OTHER_AJP'
  | 'SETTLER' | 'TRUSTEE' | 'BENEFICIARY' | 'PRINCIPAL_OFFICER' | 'EXECUTOR';

interface ITR5Member {
  name: string;
  pan: string;
  aadhaar: string;
  designatedPartnerID: string;
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

interface PartnerChange {
  name: string;
  pan: string;
  type: 'ADMITTED' | 'RETIRED';
  date: string;
  sharePercentage: number;
}

interface PartnerFirm {
  firmName: string;
  firmPAN: string;
}

interface BusinessNature {
  code: string;
  tradeName: string;
  description: string;
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
  // ── Part A-General (1): Organisation ──────────────────────────────────────
  entityType: EntityType;                      // * Mandatory
  subStatus: string;
  residentialStatus: ResidentialStatus;        // * Mandatory
  dateOfFormation: string;                     // * Mandatory
  filingSection: FilingSection;                // * Mandatory
  isReturnInResponseToNotice: boolean;
  noticeSection: string;
  noticeUniqueNo: string;
  noticeDate: string;
  origReceiptNo: string;                       // for revised/defective
  origFilingDate2: string;                     // for revised return
  isBusinessTrust: boolean;
  isInvestmentFund115UB: boolean;

  // ── Nature of Business (5 entries) ─────────────────────────────────────────
  businessCode: string;                        // * Primary code
  businessNatures: BusinessNature[];           // Table of up to 5

  // ── Books, Audit & Accounting ──────────────────────────────────────────────
  accountingMethod: 'MERCANTILE' | 'CASH';    // * Mandatory
  maintainsRegularBooks: boolean;
  icdsApplicable: boolean;
  presumptiveTaxation: '' | '44AD' | '44ADA' | '44AE';
  isAuditRequired: boolean;
  auditSection: '' | '44AB(a)' | '44AB(b)' | '44AB(c)' | '44AB(d)';
  auditorName: string;                         // * If audit required
  auditorMembership: string;                   // * If audit required
  auditFirmName: string;                       // * If audit required
  auditFirmRegNo: string;                      // * If audit required
  auditFirmPAN: string;                        // * If audit required
  auditReportDate: string;                     // * If audit required
  auditAckNo: string;                          // * If audit required
  udin: string;                                // * If audit required
  hasTPAudit92E: boolean;
  tpAuditDate: string;
  tpAuditAckNo: string;

  // ── New Tax Regime ─────────────────────────────────────────────────────────
  optNewTaxRegime115BAC: boolean;
  form10IEAFiled: boolean;
  form10IEADate: string;
  form10IEAAckNo: string;

  // ── Special Flags ──────────────────────────────────────────────────────────
  hasIFSCUnit: boolean;
  isDPIITStartup: boolean;
  dpiitRecognitionNo: string;
  hasIMBCertificate: boolean;
  imbCertificateNo: string;
  hasMSMERegistration: boolean;
  msmeRegistrationNo: string;
  isFIIFPI: boolean;
  sebiRegNo: string;

  // ── Non-resident specific ──────────────────────────────────────────────────
  hasNRPermanentEstablishment: boolean;
  hasNRSignificantEconomicPresence: boolean;
  nrSEPPaymentAmount: number;
  nrSEPUserCount: number;

  // ── Representative Assessee ────────────────────────────────────────────────
  isRepresentativeAssessee: boolean;
  representativeName: string;
  representativeCapacity: string;
  representativePAN: string;
  representativeAadhaar: string;
  representativeAddress: string;

  // ── Partner in Firm ────────────────────────────────────────────────────────
  isPartnerInFirm: boolean;
  partnerFirms: PartnerFirm[];

  // ── Unlisted Shares ────────────────────────────────────────────────────────
  hasUnlistedEquityShares: boolean;

  // ── LEI ────────────────────────────────────────────────────────────────────
  leiNumber: string;
  leiValidUpto: string;

  // ── Part A-General (2): Members / Partners / Trustees ─────────────────────
  changeInPartnersDuringYear: boolean;
  partnerChanges: PartnerChange[];
  hasForeignCompanyMember: boolean;
  foreignCompanySharePct: number;
  members: ITR5Member[];
  sharesDeterminable: boolean;
  anyMemberExceedsExemption: boolean;

  // ── Interest & Fees ────────────────────────────────────────────────────────
  interest234A: number;
  interest234B: number;
  interest234C: number;
  interest234F: number;

  // ── Filing Type ────────────────────────────────────────────────────────────
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
  hasDeemedDividend2_22e: boolean;
  hasBroughtForwardLoss: boolean;
  liableForAMT: boolean;
  hasUnlistedSharesTransfer: boolean;
  totalTurnover: number;
  gstRegistered: boolean;
  gstin: string;
}

// ── Empty defaults ─────────────────────────────────────────────────────────────

const EMPTY_MEMBER: ITR5Member = {
  name: '', pan: '', aadhaar: '', designatedPartnerID: '', status: 'TRUSTEE',
  sharePercentage: 0, rateOfInterest: 0, remunerationPaid: 0,
  flatNo: '', buildingName: '', streetName: '', localityOrArea: '',
  cityOrTownOrDistrict: '', stateCode: '07', pinCode: '', countryCode: '91',
};

const EMPTY_UPDATED: ITR5Updated = {
  updatedAY: '2025-26', previouslyFiled: true, previousFilingType: '1',
  origAckNo: '', origFilingDate: '', laidOutFlag: false, periodCode: '1', reasons: ['2'],
};

const EMPTY: ITR5GeneralState = {
  entityType: 'AOP',
  subStatus: '',
  residentialStatus: 'RESIDENT',
  dateOfFormation: '',
  filingSection: '139(1)',
  isReturnInResponseToNotice: false,
  noticeSection: '',
  noticeUniqueNo: '',
  noticeDate: '',
  origReceiptNo: '',
  origFilingDate2: '',
  isBusinessTrust: false,
  isInvestmentFund115UB: false,
  businessCode: '19009',
  businessNatures: [],
  accountingMethod: 'MERCANTILE',
  maintainsRegularBooks: false,
  icdsApplicable: false,
  presumptiveTaxation: '',
  isAuditRequired: false,
  auditSection: '',
  auditorName: '',
  auditorMembership: '',
  auditFirmName: '',
  auditFirmRegNo: '',
  auditFirmPAN: '',
  auditReportDate: '',
  auditAckNo: '',
  udin: '',
  hasTPAudit92E: false,
  tpAuditDate: '',
  tpAuditAckNo: '',
  optNewTaxRegime115BAC: false,
  form10IEAFiled: false,
  form10IEADate: '',
  form10IEAAckNo: '',
  hasIFSCUnit: false,
  isDPIITStartup: false,
  dpiitRecognitionNo: '',
  hasIMBCertificate: false,
  imbCertificateNo: '',
  hasMSMERegistration: false,
  msmeRegistrationNo: '',
  isFIIFPI: false,
  sebiRegNo: '',
  hasNRPermanentEstablishment: false,
  hasNRSignificantEconomicPresence: false,
  nrSEPPaymentAmount: 0,
  nrSEPUserCount: 0,
  isRepresentativeAssessee: false,
  representativeName: '',
  representativeCapacity: '',
  representativePAN: '',
  representativeAadhaar: '',
  representativeAddress: '',
  isPartnerInFirm: false,
  partnerFirms: [],
  hasUnlistedEquityShares: false,
  leiNumber: '',
  leiValidUpto: '',
  changeInPartnersDuringYear: false,
  partnerChanges: [],
  hasForeignCompanyMember: false,
  foreignCompanySharePct: 0,
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
  hasDeemedDividend2_22e: false,
  hasBroughtForwardLoss: false,
  liableForAMT: false,
  hasUnlistedSharesTransfer: false,
  totalTurnover: 0,
  gstRegistered: false,
  gstin: '',
};

// ── Static data ────────────────────────────────────────────────────────────────

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'AOP',  label: 'Association of Persons (AOP)' },
  { value: 'BOI',  label: 'Body of Individuals (BOI)' },
  { value: 'FIRM', label: 'Partnership Firm' },
  { value: 'LLP',  label: 'Limited Liability Partnership (LLP)' },
  { value: 'COOP', label: 'Co-operative Society' },
  { value: 'LA',   label: 'Local Authority' },
  { value: 'AJP',  label: 'Artificial Juridical Person (AJP)' },
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
  { value: 'FOREIGN_COMPANY',  label: 'Foreign Company (Member)' },
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

// ── Business code search ───────────────────────────────────────────────────────

function BusinessCodeSearch({ value, onChange, inputClass }: {
  value: string; onChange: (code: string) => void; inputClass: string;
}) {
  const match = NATURE_OF_BUSINESS_CODES_ITR5.find(c => c.code === value);
  const [query, setQuery] = useState(match ? `${match.code} — ${match.description}` : value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = NATURE_OF_BUSINESS_CODES_ITR5.find(c => c.code === value);
    setQuery(m ? `${m.code} — ${m.description}` : value);
  }, [value]);

  useEffect(() => {
    function onOut(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  const filtered = NATURE_OF_BUSINESS_CODES_ITR5.filter(c =>
    !query || c.code.includes(query) ||
    c.description.toLowerCase().includes(query.toLowerCase()) ||
    c.group.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 30);
  const groups = filtered.reduce<Record<string, typeof filtered>>((acc, c) => { (acc[c.group] ??= []).push(c); return acc; }, {});

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input type="text" className={inputClass} value={query}
        placeholder="Search by code or description…"
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(''); }} />
      {open && filtered.length > 0 && (
        <div style={{ position:'absolute',zIndex:50,top:'100%',left:0,right:0,background:'white',border:'1px solid #d1d5db',borderRadius:6,boxShadow:'0 4px 16px rgba(0,0,0,0.12)',maxHeight:280,overflowY:'auto',marginTop:2 }}>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div style={{ padding:'4px 10px',fontSize:10,fontWeight:700,color:'#6b7280',background:'#f9fafb',textTransform:'uppercase' }}>{group}</div>
              {items.map(c => (
                <div key={c.code} style={{ padding:'6px 12px',cursor:'pointer',fontSize:13,background:c.code===value?'#eff6ff':'white',borderLeft:c.code===value?'3px solid #3b82f6':'3px solid transparent' }}
                  onMouseDown={e => { e.preventDefault(); onChange(c.code); setQuery(`${c.code} — ${c.description}`); setOpen(false); }}>
                  <span style={{ fontFamily:'monospace',color:'#2563eb',marginRight:8 }}>{c.code}</span>{c.description}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  returnId: number;
  assessmentYear?: string;   // e.g. '2025-26', '2024-25'
  initialData?: Partial<ITR5GeneralState> | null;
  onSaved?: (data: ITR5GeneralState) => void;
}

// ── Sub-tab IDs ────────────────────────────────────────────────────────────────

type GenTab = 'basic' | 'books' | 'members' | 'compliance';

const GEN_TABS: { id: GenTab; label: string; icon: string }[] = [
  { id: 'basic',      label: 'Basic Info',            icon: '🏢' },
  { id: 'books',      label: 'Books & Audit',         icon: '📒' },
  { id: 'members',    label: 'Members / Partners',    icon: '👥' },
  { id: 'compliance', label: 'Compliance Questions',  icon: '✅' },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function ITR5General({ returnId, assessmentYear, initialData, onSaved }: Props) {
  const [form, setForm] = useState<ITR5GeneralState>({ ...EMPTY, ...initialData });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<GenTab>('basic');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<ITR5GeneralState>({ ...EMPTY, ...initialData });

  useEffect(() => { if (initialData) setForm({ ...EMPTY, ...initialData }); }, [initialData]);
  useEffect(() => { formRef.current = form; });
  useEffect(() => () => { if (debounceRef.current) { clearTimeout(debounceRef.current); save(formRef.current); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (data: ITR5GeneralState) => {
    setSaving(true);
    try {
      await fetch(`/api/returns/${returnId}/schedule/itr5General`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      setSavedAt(new Date()); onSaved?.(data);
    } finally { setSaving(false); }
  }, [returnId, onSaved]);

  const update = useCallback((patch: Partial<ITR5GeneralState>) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 1500);
      return next;
    });
  }, [save]);

  const updateUpd = useCallback((patch: Partial<ITR5Updated>) => update({ updated: { ...form.updated, ...patch } }), [form.updated, update]);

  const toggleReason = (r: UpdateReason) => {
    const cur = form.updated.reasons ?? [];
    updateUpd({ reasons: cur.includes(r) ? cur.filter(x => x !== r) : [...cur, r] });
  };

  const addMember = () => update({ members: [...form.members, { ...EMPTY_MEMBER }] });
  const removeMember = (i: number) => update({ members: form.members.filter((_, idx) => idx !== i) });
  const updateMember = (i: number, patch: Partial<ITR5Member>) =>
    update({ members: form.members.map((m, idx) => idx === i ? { ...m, ...patch } : m) });

  const inp = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1';
  const usesMMR = !form.sharesDeterminable || form.anyMemberExceedsExemption;

  // 139(8A) period dates derived from AY (e.g. '2025-26' → FY ends 31 Mar 2026)
  const updPeriods = (() => {
    const ay = assessmentYear ?? form.filingSection === '139(8A)' ? (assessmentYear ?? '2025-26') : '2025-26';
    const endYear = parseInt((ay ?? '2025-26').split('-')[1] ?? '26') + 2000;
    const ayEnd = new Date(endYear, 2, 31); // 31 March of end year
    const p1End = new Date(ayEnd); p1End.setFullYear(ayEnd.getFullYear() + 1);
    const p2End = new Date(ayEnd); p2End.setFullYear(ayEnd.getFullYear() + 2);
    const today = new Date();
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const currentPeriod = today <= p1End ? 1 : today <= p2End ? 2 : null;
    return { p1End: fmt(p1End), p2End: fmt(p2End), currentPeriod };
  })();

  // ── render helpers ──
  const F2 = ({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) => (
    <div>
      <label className={lbl}>{req && <Req />}{label}</label>
      {children}
    </div>
  );

  return (
    <div>
      {/* ── Sub-tab header ── */}
      <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 px-2 pt-2">
        <div className="flex gap-1">
          {GEN_TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-all border border-b-0 ${
                activeTab === t.id
                  ? 'bg-white border-gray-200 text-blue-700 shadow-sm -mb-px pb-[9px]'
                  : 'bg-transparent border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60'
              }`}>
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 pr-4 pb-2">{saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ''}</span>
      </div>

      <div className="pt-4">

      {/* ═══════════════════════ TAB: BASIC INFO ═══════════════════════ */}
      {activeTab === 'basic' && <div className="space-y-6 max-w-4xl">

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Part A — General Information</h2>
        </div>

        {/* Organisation */}
        <Section title="Organisation">
          <p className="text-xs text-gray-500 mb-1.5"><Req />Type of Organisation</p>
          <div className="grid grid-cols-2 gap-1 mb-2">
            {ENTITY_OPTIONS.map(opt => (
              <label key={opt.value} className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${form.entityType === opt.value ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold' : 'border-gray-200 hover:bg-gray-50 text-gray-700'}`}>
                <input type="radio" name="entityType" value={opt.value} checked={form.entityType === opt.value} onChange={() => update({ entityType: opt.value })} className="accent-blue-600 flex-shrink-0" />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Sub-category</label>
              <select className={inp} value={form.subStatus} onChange={e => update({ subStatus: e.target.value })}>
                <option value="">Auto from type</option>
                {SUB_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}><Req />Date of Formation</label>
              <input type="date" className={inp} value={form.dateOfFormation} onChange={e => update({ dateOfFormation: e.target.value })} />
            </div>
            <div>
              <label className={lbl}><Req />Residential Status</label>
              <select className={inp} value={form.residentialStatus} onChange={e => update({ residentialStatus: e.target.value as ResidentialStatus })}>
                <option value="RESIDENT">Resident</option>
                <option value="NOR">Not Ordinarily Resident (NOR)</option>
                <option value="NON_RESIDENT">Non-Resident</option>
              </select>
            </div>
            <div>
              <label className={lbl}><Req />Filed Under Section</label>
              <select className={inp} value={form.filingSection} onChange={e => update({ filingSection: e.target.value as FilingSection })}>
                <option value="139(1)">139(1) — Original return (on or before due date)</option>
                <option value="139(4)">139(4) — Belated return</option>
                <option value="139(5)">139(5) — Revised return</option>
                <option value="92CD">92CD — Modified return (APA)</option>
                <option value="119(2)(b)">119(2)(b) — Condonation of delay</option>
                <option value="139(8A)">139(8A) — Updated return</option>
              </select>
            </div>
          </div>

          {(form.filingSection === '139(5)' || form.filingSection === '92CD' || form.filingSection === '119(2)(b)') && (
            <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-2">
              <div><label className={lbl}><Req />Original/Previous Ack No.</label><input className={`${inp} font-mono`} value={form.origReceiptNo} onChange={e => update({ origReceiptNo: e.target.value })} placeholder="15 digits" maxLength={15} /></div>
              <div><label className={lbl}><Req />Date of Original Filing</label><input type="date" className={inp} value={form.origFilingDate2} onChange={e => update({ origFilingDate2: e.target.value })} /></div>
            </div>
          )}
          {form.filingSection === '139(8A)' && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-800 mb-1">⚠ Updated Return — Additional Tax u/s 140B</p>
              <p className="text-xs text-amber-700 mb-2">
                An additional tax on the <strong>incremental tax + interest</strong> must be paid via challan (Sec 140B) before filing:
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className={`rounded border p-2 text-center ${updPeriods.currentPeriod === 1 ? 'bg-amber-100 border-amber-400' : 'bg-white border-amber-200'}`}>
                  <p className="text-xs text-amber-600 font-semibold">Period 1 {updPeriods.currentPeriod === 1 && <span className="ml-1 bg-amber-500 text-white rounded px-1 text-[9px]">NOW</span>}</p>
                  <p className="text-lg font-bold text-amber-800">25%</p>
                  <p className="text-[10px] text-amber-600">On or before<br/>{updPeriods.p1End}</p>
                </div>
                <div className={`rounded border p-2 text-center ${updPeriods.currentPeriod === 2 ? 'bg-amber-100 border-amber-400' : 'bg-white border-amber-200'}`}>
                  <p className="text-xs text-amber-600 font-semibold">Period 2 {updPeriods.currentPeriod === 2 && <span className="ml-1 bg-amber-500 text-white rounded px-1 text-[9px]">NOW</span>}</p>
                  <p className="text-lg font-bold text-amber-800">50%</p>
                  <p className="text-[10px] text-amber-600">On or before<br/>{updPeriods.p2End}</p>
                </div>
              </div>
              {updPeriods.currentPeriod === null && (
                <p className="text-[10px] font-semibold text-red-600 mb-1">⛔ Updated return window has expired for this AY.</p>
              )}
              <p className="text-[10px] text-amber-600">
                Enter the 140B challan under <strong>Tax Payments</strong> before generating JSON.
              </p>
            </div>
          )}

          <YesNo label="Return filed in response to a notice" checked={form.isReturnInResponseToNotice} onChange={v => update({ isReturnInResponseToNotice: v })} />
          {form.isReturnInResponseToNotice && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div><label className={lbl}><Req />Notice Section</label>
                <select className={inp} value={form.noticeSection} onChange={e => update({ noticeSection: e.target.value })}>
                  <option value="">Select</option>
                  <option value="139(9)">139(9) — Defective return</option>
                  <option value="142(1)">142(1) — Inquiry before assessment</option>
                  <option value="148">148 — Reassessment</option>
                  <option value="153C">153C — Undisclosed income of other person</option>
                  <option value="119(2)(b)">119(2)(b) — Condonation</option>
                  <option value="92CD">92CD — APA</option>
                </select>
              </div>
              <div><label className={lbl}><Req />Unique No. / DIN</label><input className={inp} value={form.noticeUniqueNo} onChange={e => update({ noticeUniqueNo: e.target.value })} /></div>
              <div><label className={lbl}><Req />Date of Notice/Order</label><input type="date" className={inp} value={form.noticeDate} onChange={e => update({ noticeDate: e.target.value })} /></div>
            </div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-1">
            <YesNo label="Business Trust u/s 2(13A)" checked={form.isBusinessTrust} onChange={v => update({ isBusinessTrust: v })} />
            <YesNo label="Investment Fund u/s 115UB" checked={form.isInvestmentFund115UB} onChange={v => update({ isInvestmentFund115UB: v })} />
          </div>
        </Section>

        {/* Nature of Business */}
        <Section title="Nature of Business / Activity">
          <div className="mb-2">
            <label className={lbl}><Req />Primary Business Code</label>
            <BusinessCodeSearch value={form.businessCode} onChange={code => update({ businessCode: code })} inputClass={inp} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Total Turnover / Gross Receipts (₹)</label>
              <input type="number" min={0} className={inp} value={form.totalTurnover || ''} onChange={e => update({ totalTurnover: Number(e.target.value) || 0 })} />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className={lbl}>GST Registered</label>
                <div className="flex gap-2 mt-1">
                  <label className={`flex items-center gap-1 text-xs cursor-pointer ${form.gstRegistered ? 'text-blue-700 font-bold' : 'text-gray-400'}`}><input type="radio" checked={form.gstRegistered} onChange={() => update({ gstRegistered: true })} className="accent-blue-600 w-3 h-3" /> Yes</label>
                  <label className={`flex items-center gap-1 text-xs cursor-pointer ${!form.gstRegistered ? 'text-gray-700 font-bold' : 'text-gray-400'}`}><input type="radio" checked={!form.gstRegistered} onChange={() => update({ gstRegistered: false, gstin: '' })} className="accent-gray-500 w-3 h-3" /> No</label>
                </div>
              </div>
              {form.gstRegistered && <div className="flex-1"><label className={lbl}>GSTIN</label><input className={`${inp} uppercase font-mono`} value={form.gstin} onChange={e => update({ gstin: e.target.value.toUpperCase() })} placeholder="15-char GSTIN" maxLength={15} /></div>}
            </div>
          </div>
          {/* Additional nature of business rows (up to 4 more) */}
          <div className="mt-2">
            <p className="text-xs text-gray-500 mb-1">Additional Business Activities (up to 4 more, as per ITR schema)</p>
            {(form.businessNatures ?? []).map((bn, i) => (
              <div key={i} className="grid grid-cols-3 gap-1 mb-1 items-end">
                <div><label className={lbl}>Code {i + 2}</label>
                  <input className={`${inp} font-mono`} value={bn.code} onChange={e => { const arr = [...(form.businessNatures ?? [])]; arr[i] = { ...arr[i], code: e.target.value }; update({ businessNatures: arr }); }} maxLength={5} placeholder="e.g. 09001" /></div>
                <div><label className={lbl}>Trade Name</label>
                  <input className={inp} value={bn.tradeName} onChange={e => { const arr = [...(form.businessNatures ?? [])]; arr[i] = { ...arr[i], tradeName: e.target.value }; update({ businessNatures: arr }); }} /></div>
                <div className="flex items-end gap-1">
                  <div className="flex-1"><label className={lbl}>Description</label>
                    <input className={inp} value={bn.description} onChange={e => { const arr = [...(form.businessNatures ?? [])]; arr[i] = { ...arr[i], description: e.target.value }; update({ businessNatures: arr }); }} /></div>
                  <button onClick={() => update({ businessNatures: (form.businessNatures ?? []).filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600 text-xs mb-1.5">✕</button>
                </div>
              </div>
            ))}
            {(form.businessNatures ?? []).length < 4 && (
              <button onClick={() => update({ businessNatures: [...(form.businessNatures ?? []), { code: '', tradeName: '', description: '' }] })} className="text-xs text-blue-600 hover:underline">+ Add activity</button>
            )}
          </div>
        </Section>

      </div>}
      {/* ═══ TAB: BOOKS & AUDIT (moved here) ═══ */}
      {activeTab === 'books' && <div className="space-y-6 max-w-4xl">
        <Section title="Books of Accounts &amp; Audit">
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-1 font-medium"><Req />Method of Accounting</p>
            <div className="flex gap-2">
              {([['MERCANTILE','Mercantile (Accrual)'],['CASH','Cash Basis']] as const).map(([v, l]) => (
                <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer text-xs font-medium flex-1 justify-center ${form.accountingMethod === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  <input type="radio" name="accMethod" value={v} checked={form.accountingMethod === v} onChange={() => update({ accountingMethod: v })} className="accent-blue-600" /> {l}
                </label>
              ))}
            </div>
          </div>
          <YesNo label="Liable to maintain accounts u/s 44AA" checked={form.maintainsRegularBooks} onChange={v => update({ maintainsRegularBooks: v })} />
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
            <>
              <div className="mt-1">
                <label className={lbl}><Req />Audit Clause</label>
                <select className={inp} value={form.auditSection} onChange={e => update({ auditSection: e.target.value as any })}>
                  <option value="">Select clause</option>
                  <option value="44AB(a)">44AB(a) — Business turnover {'>'} ₹1 Cr (₹10 Cr if digital)</option>
                  <option value="44AB(b)">44AB(b) — Profession receipts {'>'} ₹50 L</option>
                  <option value="44AB(c)">44AB(c) — Opted presumptive but declaring lower profit</option>
                  <option value="44AB(d)">44AB(d) — Trust / 10(23C) / 12A eligible</option>
                </select>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Auditor Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl}><Req />Auditor Name</label><input className={inp} value={form.auditorName} onChange={e => update({ auditorName: e.target.value })} placeholder="CA full name" /></div>
                  <div><label className={lbl}><Req />Membership No.</label><input className={inp} value={form.auditorMembership} onChange={e => update({ auditorMembership: e.target.value })} placeholder="ICAI number" /></div>
                  <div><label className={lbl}><Req />Firm Name</label><input className={inp} value={form.auditFirmName} onChange={e => update({ auditFirmName: e.target.value })} /></div>
                  <div><label className={lbl}><Req />Firm Reg. No.</label><input className={inp} value={form.auditFirmRegNo} onChange={e => update({ auditFirmRegNo: e.target.value })} /></div>
                  <div><label className={lbl}><Req />Firm PAN</label><input className={`${inp} uppercase font-mono`} value={form.auditFirmPAN} maxLength={10} onChange={e => update({ auditFirmPAN: e.target.value.toUpperCase() })} /></div>
                  <div><label className={lbl}><Req />Date of Audit Report</label><input type="date" className={inp} value={form.auditReportDate} onChange={e => update({ auditReportDate: e.target.value })} /></div>
                  <div><label className={lbl}><Req />Ack. No. of Audit Report</label><input className={inp} value={form.auditAckNo} onChange={e => update({ auditAckNo: e.target.value })} /></div>
                  <div><label className={lbl}><Req />UDIN</label><input className={inp} value={form.udin} onChange={e => update({ udin: e.target.value })} /></div>
                </div>
              </div>
            </>
          )}
          <YesNo label="Liable for TP audit u/s 92E (transfer pricing report)" checked={form.hasTPAudit92E} onChange={v => update({ hasTPAudit92E: v })} />
          {form.hasTPAudit92E && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div><label className={lbl}><Req />92E Audit Report Date</label><input type="date" className={inp} value={form.tpAuditDate} onChange={e => update({ tpAuditDate: e.target.value })} /></div>
              <div><label className={lbl}><Req />92E Ack. No.</label><input className={inp} value={form.tpAuditAckNo} onChange={e => update({ tpAuditAckNo: e.target.value })} /></div>
            </div>
          )}
        </Section>

        {/* New Tax Regime */}
        <Section title="New Tax Regime (115BAC / 115BAD / 115BAE)">
          <YesNo label="Opting for New Tax Regime u/s 115BAC / 115BAD / 115BAE" checked={form.optNewTaxRegime115BAC} onChange={v => update({ optNewTaxRegime115BAC: v, form10IEAFiled: false })} />
          <YesNo label="Form 10-IEA / 10-IF / 10-IFA filed for regime opt-out" checked={form.form10IEAFiled} onChange={v => update({ form10IEAFiled: v })} />
          {form.form10IEAFiled && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div><label className={lbl}><Req />Date of Filing (Form 10-IEA/IF/IFA)</label><input type="date" className={inp} value={form.form10IEADate} onChange={e => update({ form10IEADate: e.target.value })} /></div>
              <div><label className={lbl}><Req />Ack. No.</label><input className={inp} value={form.form10IEAAckNo} onChange={e => update({ form10IEAAckNo: e.target.value })} /></div>
            </div>
          )}
        </Section>

      </div>}
      {/* ═══ Continue basic tab after books ═══ */}
      {activeTab === 'basic' && <div className="space-y-6 max-w-4xl">
        {/* Special Flags: IFSC / DPIIT / MSME / FII */}
        <Section title="Special Registrations &amp; Status">
          <YesNo label="Unit in IFSC — income solely in convertible foreign exchange" checked={form.hasIFSCUnit} onChange={v => update({ hasIFSCUnit: v })} />
          <YesNo label="DPIIT-recognised start-up" checked={form.isDPIITStartup} onChange={v => update({ isDPIITStartup: v, dpiitRecognitionNo: '', hasIMBCertificate: false, imbCertificateNo: '' })} />
          {form.isDPIITStartup && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div><label className={lbl}><Req />DPIIT Recognition No.</label><input className={inp} value={form.dpiitRecognitionNo} onChange={e => update({ dpiitRecognitionNo: e.target.value })} /></div>
              <div>
                <YesNo label="Inter-Ministerial Board certificate received" checked={form.hasIMBCertificate} onChange={v => update({ hasIMBCertificate: v })} />
                {form.hasIMBCertificate && <input className={inp} value={form.imbCertificateNo} onChange={e => update({ imbCertificateNo: e.target.value })} placeholder="IMB Certificate No." />}
              </div>
            </div>
          )}
          <YesNo label="MSME / Udyam registered" checked={form.hasMSMERegistration} onChange={v => update({ hasMSMERegistration: v, msmeRegistrationNo: '' })} />
          {form.hasMSMERegistration && <div className="mt-1"><input className={`${inp} uppercase font-mono`} value={form.msmeRegistrationNo} onChange={e => update({ msmeRegistrationNo: e.target.value.toUpperCase() })} placeholder="UDYAM-XX-00-0000000" /></div>}
          <YesNo label="FII / FPI registered with SEBI" checked={form.isFIIFPI} onChange={v => update({ isFIIFPI: v, sebiRegNo: '' })} />
          {form.isFIIFPI && <div className="mt-1"><label className={lbl}><Req />SEBI Registration No.</label><input className={`${inp} uppercase`} value={form.sebiRegNo} onChange={e => update({ sebiRegNo: e.target.value.toUpperCase() })} /></div>}
        </Section>

        {/* Non-resident */}
        {form.residentialStatus === 'NON_RESIDENT' && (
          <Section title="Non-Resident — PE &amp; SEP">
            <YesNo label="Permanent Establishment (PE) in India" checked={form.hasNRPermanentEstablishment} onChange={v => update({ hasNRPermanentEstablishment: v })} />
            <YesNo label="Significant Economic Presence (SEP) in India u/s 9(1)(i)" checked={form.hasNRSignificantEconomicPresence} onChange={v => update({ hasNRSignificantEconomicPresence: v })} />
            {form.hasNRSignificantEconomicPresence && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div><label className={lbl}>SEP — Aggregate Payments (₹)</label><input type="number" min={0} className={inp} value={form.nrSEPPaymentAmount || ''} onChange={e => update({ nrSEPPaymentAmount: Number(e.target.value) || 0 })} /></div>
                <div><label className={lbl}>SEP — No. of Users in India</label><input type="number" min={0} className={inp} value={form.nrSEPUserCount || ''} onChange={e => update({ nrSEPUserCount: Number(e.target.value) || 0 })} /></div>
              </div>
            )}
          </Section>
        )}

        {/* Representative Assessee */}
        <Section title="Representative Assessee">
          <YesNo label="Return filed by a representative assessee" checked={form.isRepresentativeAssessee} onChange={v => update({ isRepresentativeAssessee: v })} />
          {form.isRepresentativeAssessee && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div><label className={lbl}><Req />Name</label><input className={inp} value={form.representativeName} onChange={e => update({ representativeName: e.target.value })} /></div>
              <div><label className={lbl}><Req />Capacity</label>
                <select className={inp} value={form.representativeCapacity} onChange={e => update({ representativeCapacity: e.target.value })}>
                  <option value="">Select</option>
                  <option value="GUARDIAN">Guardian</option>
                  <option value="TRUSTEE">Trustee</option>
                  <option value="AGENT">Agent</option>
                  <option value="PRINCIPAL_OFFICER">Principal Officer</option>
                  <option value="EXECUTOR">Executor</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div><label className={lbl}><Req />PAN</label><input className={`${inp} uppercase font-mono`} value={form.representativePAN} maxLength={10} onChange={e => update({ representativePAN: e.target.value.toUpperCase() })} /></div>
              <div><label className={lbl}>Aadhaar No.</label><input className={inp} value={form.representativeAadhaar} maxLength={12} onChange={e => update({ representativeAadhaar: e.target.value.replace(/\D/g,'') })} /></div>
              <div className="col-span-2"><label className={lbl}>Address</label><input className={inp} value={form.representativeAddress} onChange={e => update({ representativeAddress: e.target.value })} /></div>
            </div>
          )}
        </Section>

        {/* Partner in Firm */}
        <Section title="Partner in Firm">
          <YesNo label="This entity is a partner in any firm" checked={form.isPartnerInFirm} onChange={v => update({ isPartnerInFirm: v, partnerFirms: [] })} />
          {form.isPartnerInFirm && (
            <>
              {(form.partnerFirms ?? []).map((pf, i) => (
                <div key={i} className="flex gap-2 mt-1 items-end">
                  <div className="flex-1"><label className={lbl}>Firm Name</label><input className={inp} value={pf.firmName} onChange={e => { const arr = [...(form.partnerFirms ?? [])]; arr[i] = { ...arr[i], firmName: e.target.value }; update({ partnerFirms: arr }); }} /></div>
                  <div className="flex-1"><label className={lbl}><Req />Firm PAN</label><input className={`${inp} uppercase font-mono`} value={pf.firmPAN} maxLength={10} onChange={e => { const arr = [...(form.partnerFirms ?? [])]; arr[i] = { ...arr[i], firmPAN: e.target.value.toUpperCase() }; update({ partnerFirms: arr }); }} /></div>
                  <button onClick={() => update({ partnerFirms: (form.partnerFirms ?? []).filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600 text-xs mb-1.5">✕</button>
                </div>
              ))}
              {(form.partnerFirms ?? []).length < 4 && (
                <button onClick={() => update({ partnerFirms: [...(form.partnerFirms ?? []), { firmName: '', firmPAN: '' }] })} className="text-xs text-blue-600 mt-1 hover:underline">+ Add firm</button>
              )}
            </>
          )}
        </Section>

        {/* Unlisted shares & LEI */}
        <Section title="Unlisted Shares &amp; LEI">
          <YesNo label="Held unlisted equity shares at any time during the year" checked={form.hasUnlistedEquityShares} onChange={v => update({ hasUnlistedEquityShares: v })} warn />
          <YesNo label="Transfer of unlisted shares (FMV basis u/s 50CA / 56(2)(x))" checked={form.hasUnlistedSharesTransfer} onChange={v => update({ hasUnlistedSharesTransfer: v })} />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div><label className={lbl}>LEI Number (mandatory if refund ≥ ₹50 Cr)</label><input className={`${inp} uppercase font-mono`} value={form.leiNumber} onChange={e => update({ leiNumber: e.target.value.toUpperCase() })} placeholder="20-char LEI" maxLength={20} /></div>
            <div><label className={lbl}>LEI Valid Upto</label><input type="date" className={inp} value={form.leiValidUpto} onChange={e => update({ leiValidUpto: e.target.value })} /></div>
          </div>
        </Section>

        {/* Interest & Fees */}
        <Section title="Interest &amp; Fees on Tax (u/s 234)">
          <div className="grid grid-cols-2 gap-2">
            {([['interest234A','234A — Late Filing Interest'],['interest234B','234B — Advance Tax Shortfall'],['interest234C','234C — Instalment Deferral'],['interest234F','234F — Late Filing Fee']] as const).map(([f, l]) => (
              <div key={f}><label className={lbl}>{l} (₹)</label><input type="number" min={0} className={inp} value={(form as any)[f] || ''} onChange={e => update({ [f]: Number(e.target.value) || 0 } as any)} /></div>
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
                <div><label className={lbl}><Req />Original Ack. No.</label><input className={`${inp} font-mono`} value={form.updated.origAckNo} maxLength={15} onChange={e => updateUpd({ origAckNo: e.target.value.replace(/\D/g,'').slice(0,15) })} placeholder="15 digits" /></div>
                <div><label className={lbl}><Req />Original Filing Date</label><input type="date" className={inp} value={form.updated.origFilingDate} onChange={e => updateUpd({ origFilingDate: e.target.value })} /></div>
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
                      <input type="checkbox" checked={(form.updated.reasons??[]).includes(code)} onChange={() => toggleReason(code)} className="accent-blue-600" /> {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Section>

      </div>}
      {/* ═══════════════════════ TAB: MEMBERS ═══════════════════════ */}
      {activeTab === 'members' && <div className="space-y-6 max-w-4xl">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Part A-General (2) — Members &amp; Partners</h2>

        {/* Tax Rate */}
        <Section title="Tax Rate (AOP / BOI / Trust)">
          <YesNo label="Share of each member in income is determinable" checked={form.sharesDeterminable} onChange={v => update({ sharesDeterminable: v, anyMemberExceedsExemption: false })} />
          {form.sharesDeterminable && (
            <YesNo label="Any member's total income exceeds ₹2,50,000 (basic exemption)" checked={form.anyMemberExceedsExemption} onChange={v => update({ anyMemberExceedsExemption: v })} warn />
          )}
          <div className={`mt-2 text-xs font-semibold px-2 py-1.5 rounded ${usesMMR ? 'bg-orange-50 text-orange-800' : 'bg-green-50 text-green-800'}`}>
            Tax Rate: {usesMMR ? 'Maximum Marginal Rate (30%)' : 'Slab Rates'}
          </div>
        </Section>

        {/* Members / Partners / Trustees */}
        <Section
          title={<span>Trustees / Members / Partners <Req /> <span className="text-[10px] font-normal text-gray-400">(at least 1 required)</span></span>}
          action={<button onClick={addMember} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">+ Add</button>}
        >
          <div className="mb-2 grid grid-cols-2 gap-1">
            <YesNo label="Change in partners/members during the year" checked={form.changeInPartnersDuringYear} onChange={v => update({ changeInPartnersDuringYear: v, partnerChanges: [] })} />
            <YesNo label="Any member is a foreign company" checked={form.hasForeignCompanyMember} onChange={v => update({ hasForeignCompanyMember: v, foreignCompanySharePct: 0 })} warn />
          </div>
          {form.hasForeignCompanyMember && (
            <div className="mb-2"><label className={lbl}><Req />% share of foreign company member</label>
              <input type="number" min={0} max={100} className={inp} value={form.foreignCompanySharePct || ''} onChange={e => update({ foreignCompanySharePct: parseFloat(e.target.value) || 0 })} />
            </div>
          )}
          {form.changeInPartnersDuringYear && (
            <div className="mb-2 border border-dashed border-gray-200 rounded p-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">Partner/Member Changes During Year</p>
              {(form.partnerChanges ?? []).map((pc, i) => (
                <div key={i} className="grid grid-cols-4 gap-1 mb-1 items-end">
                  <div><label className={lbl}>Name</label><input className={inp} value={pc.name} onChange={e => { const a=[...(form.partnerChanges??[])]; a[i]={...a[i],name:e.target.value}; update({partnerChanges:a}); }} /></div>
                  <div><label className={lbl}><Req />PAN</label><input className={`${inp} uppercase font-mono`} value={pc.pan} maxLength={10} onChange={e => { const a=[...(form.partnerChanges??[])]; a[i]={...a[i],pan:e.target.value.toUpperCase()}; update({partnerChanges:a}); }} /></div>
                  <div><label className={lbl}>Type</label><select className={inp} value={pc.type} onChange={e => { const a=[...(form.partnerChanges??[])]; a[i]={...a[i],type:e.target.value as any}; update({partnerChanges:a}); }}><option value="ADMITTED">Admitted</option><option value="RETIRED">Retired</option></select></div>
                  <div className="flex gap-1 items-end"><div className="flex-1"><label className={lbl}>Date</label><input type="date" className={inp} value={pc.date} onChange={e => { const a=[...(form.partnerChanges??[])]; a[i]={...a[i],date:e.target.value}; update({partnerChanges:a}); }} /></div>
                    <button onClick={() => update({partnerChanges:(form.partnerChanges??[]).filter((_,j)=>j!==i)})} className="text-red-400 text-xs mb-1.5">✕</button></div>
                </div>
              ))}
              <button onClick={() => update({partnerChanges:[...(form.partnerChanges??[]),{name:'',pan:'',type:'ADMITTED',date:'',sharePercentage:0}]})} className="text-xs text-blue-600 hover:underline">+ Add change</button>
            </div>
          )}
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
                <div className="col-span-3"><label className={lbl}><Req />Full Name</label><input className={inp} value={m.name} onChange={e => updateMember(i, { name: e.target.value })} placeholder="Name as per PAN" /></div>
                <div><label className={lbl}><Req />Role / Status</label><select className={inp} value={m.status} onChange={e => updateMember(i, { status: e.target.value as MemberStatus })}>{MEMBER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label className={lbl}>Share %</label><input type="number" className={inp} value={m.sharePercentage || ''} min={0} max={100} onChange={e => updateMember(i, { sharePercentage: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className={lbl}><Req />PAN</label><input className={`${inp} uppercase font-mono`} value={m.pan} maxLength={10} onChange={e => updateMember(i, { pan: e.target.value.toUpperCase() })} /></div>
                <div><label className={lbl}>Aadhaar</label><input className={inp} value={m.aadhaar} maxLength={12} onChange={e => updateMember(i, { aadhaar: e.target.value.replace(/\D/g,'') })} /></div>
                <div><label className={lbl}>Interest Rate %</label><input type="number" className={inp} value={m.rateOfInterest || ''} onChange={e => updateMember(i, { rateOfInterest: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className={lbl}>Remuneration (₹)</label><input type="number" className={inp} value={m.remunerationPaid || ''} onChange={e => updateMember(i, { remunerationPaid: parseInt(e.target.value) || 0 })} /></div>
                {(form.entityType === 'LLP') && <div><label className={lbl}>Designated Partner ID</label><input className={inp} value={m.designatedPartnerID} onChange={e => updateMember(i, { designatedPartnerID: e.target.value })} /></div>}
                <details className="col-span-3 group">
                  <summary className="text-xs text-blue-600 cursor-pointer select-none">▶ Address</summary>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100">
                    <div><label className={lbl}>Flat/Door</label><input className={inp} value={m.flatNo} onChange={e => updateMember(i, { flatNo: e.target.value })} /></div>
                    <div><label className={lbl}>Building</label><input className={inp} value={m.buildingName} onChange={e => updateMember(i, { buildingName: e.target.value })} /></div>
                    <div><label className={lbl}>Street</label><input className={inp} value={m.streetName} onChange={e => updateMember(i, { streetName: e.target.value })} /></div>
                    <div><label className={lbl}>Locality</label><input className={inp} value={m.localityOrArea} onChange={e => updateMember(i, { localityOrArea: e.target.value })} /></div>
                    <div><label className={lbl}><Req />City</label><input className={inp} value={m.cityOrTownOrDistrict} onChange={e => updateMember(i, { cityOrTownOrDistrict: e.target.value })} placeholder="Required for JSON generation" /></div>
                    <div><label className={lbl}>State</label><select className={inp} value={m.stateCode} onChange={e => updateMember(i, { stateCode: e.target.value })}>{STATE_CODES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></div>
                    <div><label className={lbl}>PIN</label><input className={inp} value={m.pinCode} maxLength={6} onChange={e => updateMember(i, { pinCode: e.target.value.replace(/\D/g,'') })} /></div>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </Section>

      </div>}
      {/* ═══════════════════════ TAB: COMPLIANCE ═══════════════════════ */}
      {activeTab === 'compliance' && <div className="space-y-6 max-w-4xl">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Compliance Questions — Part A-General (2)</h2>

        {/* Transfer Pricing */}
        <Section title="Transfer Pricing (Part A-General 2)">
          <YesNo label="International transactions with associated enterprises u/s 92B" checked={form.hasInternationalTransactions92B} onChange={v => update({ hasInternationalTransactions92B: v, hasFiled3CEB: false, hasSecondaryAdjustment92CE: false })} warn />
          {form.hasInternationalTransactions92B && <>
            <YesNo label="Form 3CEB (TP audit report) filed / to be filed u/s 92E" checked={form.hasFiled3CEB} onChange={v => update({ hasFiled3CEB: v })} />
            <YesNo label="Secondary adjustment applicable u/s 92CE" checked={form.hasSecondaryAdjustment92CE} onChange={v => update({ hasSecondaryAdjustment92CE: v, secondaryAdjustmentAmount92CE: 0 })} warn />
            {form.hasSecondaryAdjustment92CE && <div className="mt-1"><label className={lbl}><Req />Secondary Adjustment Amount (₹)</label><input type="number" min={0} className={inp} value={form.secondaryAdjustmentAmount92CE||''} onChange={e => update({ secondaryAdjustmentAmount92CE: Number(e.target.value)||0 })} /></div>}
          </>}
          <YesNo label="Specified domestic transactions u/s 92BA (> ₹20 Cr)" checked={form.hasSpecifiedDomesticTransactions92BA} onChange={v => update({ hasSpecifiedDomesticTransactions92BA: v })} />
          <YesNo label="Transactions in notified jurisdictional areas u/s 94A" checked={form.hasNotifiedJurisdictionalTransactions94A} onChange={v => update({ hasNotifiedJurisdictionalTransactions94A: v })} warn />
          <YesNo label="Payments to related parties covered u/s 40A(2)(b)" checked={form.hasRelatedPartyTransactions40A2b} onChange={v => update({ hasRelatedPartyTransactions40A2b: v })} />
        </Section>

        {/* Foreign */}
        <Section title="Foreign Assets &amp; Income">
          <YesNo label="Entity holds assets outside India — Schedule FA required" checked={form.hasForeignAssets} onChange={v => update({ hasForeignAssets: v })} warn />
          <YesNo label="Income from foreign sources — Schedule FSI required" checked={form.hasForeignIncome} onChange={v => update({ hasForeignIncome: v })} />
          <YesNo label="Form 15CA / 15CB filed for foreign remittances" checked={form.hasFiled15CA15CB} onChange={v => update({ hasFiled15CA15CB: v })} />
          <YesNo label="Subsidiary / associate of a foreign company" checked={form.isForeignSubsidiary} onChange={v => update({ isForeignSubsidiary: v })} />
          <YesNo label="Financial statements prepared under Ind AS" checked={form.financialStatementsIndAS} onChange={v => update({ financialStatementsIndAS: v })} />
        </Section>

        {/* Income & Asset Disclosures */}
        <Section title="Income &amp; Asset Disclosures">
          <YesNo label="Income from Virtual Digital Assets (crypto/NFT) — Sec 115BBH" checked={form.hasVirtualDigitalAssets} onChange={v => update({ hasVirtualDigitalAssets: v })} warn />
          <YesNo label="Agricultural income — partial rate integration applies" checked={form.hasAgriculturalIncome} onChange={v => update({ hasAgriculturalIncome: v })} />
          {form.hasAgriculturalIncome && (
            <div className="mt-1"><label className={lbl}><Req />Agricultural Income (₹)</label>
              <input type="number" min={0} className={inp} value={(form as any).agriculturalIncome || ''} onChange={e => update({ agriculturalIncome: Number(e.target.value) || 0 })} />
            </div>
          )}
          <YesNo label="Deemed dividend u/s 2(22)(e) — loans/advances from closely-held co." checked={form.hasDeemedDividend2_22e} onChange={v => update({ hasDeemedDividend2_22e: v })} warn />
          <YesNo label="Brought forward losses / unabsorbed depreciation from prior years" checked={form.hasBroughtForwardLoss} onChange={v => update({ hasBroughtForwardLoss: v })} />
          <YesNo label="Liable to Alternate Minimum Tax (AMT) u/s 115JC" checked={form.liableForAMT} onChange={v => update({ liableForAMT: v })} />
        </Section>

        {/* Special Deductions */}
        <Section title="Special Deductions Claimed (Ch. VI-A / 10AA)">
          <p className="text-sm text-gray-500 mb-3">Tick whichever applies — the relevant schedule must be filled separately.</p>
          <YesNo label="10AA — SEZ unit export profits" checked={form.claims10AA} onChange={v => update({ claims10AA: v })} />
          <YesNo label="80-IA — Infrastructure / telecom / power / SEZ developer" checked={form.claims80IA} onChange={v => update({ claims80IA: v })} />
          <YesNo label="80-IB — Industrial undertakings / hotels / hospitals" checked={form.claims80IB} onChange={v => update({ claims80IB: v })} />
          <YesNo label="80-IC — Special category state undertakings (NE / J&K)" checked={form.claims80IC} onChange={v => update({ claims80IC: v })} />
          <YesNo label="80-IE — North-Eastern states eligible businesses" checked={form.claims80IE} onChange={v => update({ claims80IE: v })} />
          <YesNo label="80JJA — Processing bio-degradable waste business" checked={form.claims80JJA} onChange={v => update({ claims80JJA: v })} />
          <YesNo label="80JJAA — 30% of additional employee cost for 3 years" checked={form.claims80JJAA} onChange={v => update({ claims80JJAA: v })} />
          <YesNo label="80P — Co-operative society income exemption" checked={form.claims80P} onChange={v => update({ claims80P: v })} />
        </Section>

      </div>}{/* end compliance tab */}

      </div>{/* end pt-4 wrapper */}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Req() {
  return <span className="text-red-500 mr-0.5">*</span>;
}

function YesNo({ label, checked, onChange, warn = false }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; warn?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0 ${warn && checked ? 'bg-amber-50 -mx-4 px-4 rounded' : ''}`}>
      <span className={`text-sm flex-1 pr-6 leading-snug ${warn && checked ? 'text-amber-900 font-medium' : 'text-gray-700'}`}>{label}</span>
      <div className="flex items-center gap-4 flex-shrink-0">
        <label className={`flex items-center gap-1.5 cursor-pointer text-sm font-medium ${checked ? 'text-blue-700' : 'text-gray-400'}`}>
          <input type="radio" checked={checked} onChange={() => onChange(true)} className="accent-blue-600" /> Yes
        </label>
        <label className={`flex items-center gap-1.5 cursor-pointer text-sm font-medium ${!checked ? 'text-gray-700' : 'text-gray-400'}`}>
          <input type="radio" checked={!checked} onChange={() => onChange(false)} className="accent-gray-500" /> No
        </label>
      </div>
    </div>
  );
}

function Section({ title, action, children }: {
  title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}
