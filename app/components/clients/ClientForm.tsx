'use client';
/**
 * renderer/app/components/clients/ClientForm.tsx
 *
 * Client create/edit form aligned with ITR schema fields.
 * Fields match what itrBuilder.ts and authHandlers need:
 *   PAN, fullName, assesseeType, dateOfBirth, residentialStatus,
 *   mobileNumber, email, address, city, stateCode, pinCode,
 *   aadhaarNumber, portalUsername, portalPassword
 */

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssesseeType =
  | 'INDIVIDUAL' | 'HUF' | 'DOMESTIC_COMPANY' | 'FOREIGN_COMPANY'
  | 'FIRM' | 'LLP' | 'AOP' | 'BOI' | 'AJP' | 'OTHER';

type ResidentialStatus = 'RES' | 'NRI' | 'RNR';
type TaxRegime = 'NEW' | 'OLD';

type EmployerCategory = 'CGOV' | 'SGOV' | 'PSU' | 'PE' | 'PESG' | 'PEPS' | 'PEO' | 'OTH' | 'NA';

interface ClientFormData {
  pan: string;
  fullName: string;
  fatherName: string;
  gender: string;
  assesseeType: AssesseeType;
  dateOfBirth: string;
  residentialStatus: ResidentialStatus;
  employerCategory: EmployerCategory;
  taxRegimePreference: TaxRegime;
  mobileNumber: string;
  email: string;
  flatDoorBlockNo: string;
  nameBuildingVillage: string;
  roadOrStreet: string;
  localityOrArea: string;
  city: string;
  stateCode: string;
  pinCode: string;
  aadhaarNumber: string;
  portalUsername: string;
  portalPassword: string;
}

interface ClientFormProps {
  clientId?: number | null;
  onSuccess: (clientId: number) => void;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSESSEE_TYPES: { value: AssesseeType; label: string }[] = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'HUF', label: 'HUF (Hindu Undivided Family)' },
  { value: 'FIRM', label: 'Firm (Partnership)' },
  { value: 'LLP', label: 'LLP (Limited Liability Partnership)' },
  { value: 'DOMESTIC_COMPANY', label: 'Company — Domestic' },
  { value: 'FOREIGN_COMPANY', label: 'Company — Foreign' },
  { value: 'AOP', label: 'AOP (Association of Persons)' },
  { value: 'BOI', label: 'BOI (Body of Individuals)' },
  { value: 'AJP', label: 'AJP (Artificial Juridical Person)' },
  { value: 'OTHER', label: 'Other' },
];

const RESIDENTIAL_STATUSES: { value: ResidentialStatus; label: string }[] = [
  { value: 'RES', label: 'Resident' },
  { value: 'NRI', label: 'Non-Resident (NRI)' },
  { value: 'RNR', label: 'Resident but Not Ordinarily Resident (RNOR)' },
];

// IT Portal state codes (as per Income Tax Department's official scheme)
const STATE_CODES: { value: string; label: string }[] = [
  { value: '01', label: 'Andaman & Nicobar Islands' },
  { value: '02', label: 'Andhra Pradesh' },
  { value: '03', label: 'Arunachal Pradesh' },
  { value: '04', label: 'Assam' },
  { value: '05', label: 'Bihar' },
  { value: '06', label: 'Chandigarh' },
  { value: '07', label: 'Dadra & Nagar Haveli' },
  { value: '08', label: 'Daman & Diu' },
  { value: '09', label: 'Delhi' },
  { value: '10', label: 'Goa' },
  { value: '11', label: 'Gujarat' },
  { value: '12', label: 'Haryana' },
  { value: '13', label: 'Himachal Pradesh' },
  { value: '14', label: 'Jammu & Kashmir' },
  { value: '15', label: 'Karnataka' },
  { value: '16', label: 'Kerala' },
  { value: '17', label: 'Lakshadweep' },
  { value: '18', label: 'Madhya Pradesh' },
  { value: '19', label: 'Maharashtra' },
  { value: '20', label: 'Manipur' },
  { value: '21', label: 'Meghalaya' },
  { value: '22', label: 'Mizoram' },
  { value: '23', label: 'Nagaland' },
  { value: '24', label: 'Odisha (Orissa)' },
  { value: '25', label: 'Puducherry (Pondicherry)' },
  { value: '26', label: 'Punjab' },
  { value: '27', label: 'Rajasthan' },
  { value: '28', label: 'Sikkim' },
  { value: '29', label: 'Tamil Nadu' },
  { value: '30', label: 'Tripura' },
  { value: '31', label: 'Uttar Pradesh' },
  { value: '32', label: 'West Bengal' },
  { value: '33', label: 'Chhattisgarh' },
  { value: '34', label: 'Uttarakhand (Uttaranchal)' },
  { value: '35', label: 'Jharkhand' },
  { value: '36', label: 'Telangana' },
  { value: '99', label: 'Outside India' },
];

// ─── Prefill JSON parser ──────────────────────────────────────────────────────

function parsePrefillJson(raw: unknown): Partial<ClientFormData> & { _preview?: string } {
  const out: Partial<ClientFormData> = {};
  let notes: string[] = [];

  // Unwrap nested ITR structure: ITR → ITR1/ITR2/ITR3/ITR4 → payload
  //   or  Form_ITR1 / Form_ITR2 at top level
  //   or  personalInfo at top level (flat export)
  let obj: any = raw;
  // IT portal API: { content: "<JSON string>", responseCode: 0 }
  if (typeof obj?.content === 'string') {
    try { obj = JSON.parse(obj.content); } catch {}
  }
  if (obj?.ITR) obj = obj.ITR;
  // pick first key that looks like ITR type
  const itrKey = Object.keys(obj ?? {}).find(k => /^(ITR[1-9U]|Form_ITR)/i.test(k));
  if (itrKey) obj = obj[itrKey];

  // PersonalInfo (camelCase or PascalCase)
  const pi: any = obj?.PersonalInfo ?? obj?.personalInfo ?? obj;

  // ── PAN ──────────────────────────────────────────────────────────────────────
  const pan = (pi?.PAN ?? pi?.pan ?? pi?.Pan ?? '').toUpperCase();
  if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) { out.pan = pan; notes.push(`PAN: ${pan}`); }

  // ── Name ─────────────────────────────────────────────────────────────────────
  const nameObj = pi?.AssesseeName ?? pi?.assesseeName ?? pi?.name ?? {};
  const firstName = nameObj?.FirstName ?? nameObj?.firstName ?? '';
  const middleName = nameObj?.MiddleName ?? nameObj?.middleName ?? '';
  const surName = nameObj?.SurName ?? nameObj?.surName ?? nameObj?.surNameOrOrgName ?? nameObj?.lastName ?? '';
  const fullName = [firstName, middleName, surName].filter(Boolean).join(' ').trim()
    || (typeof pi?.Name === 'string' ? pi.Name : '')
    || (typeof pi?.name === 'string' ? pi.name : '')
    || (typeof pi?.assesseeVerName === 'string' ? pi.assesseeVerName : '')
    || (typeof pi?.fullName === 'string' ? pi.fullName : '');
  if (fullName) { out.fullName = fullName; notes.push(`Name: ${fullName}`); }

  // ── DOB ──────────────────────────────────────────────────────────────────────
  // Portal format: "DD/MM/YYYY" or "YYYY-MM-DD"
  const dobRaw: string = pi?.DOB ?? pi?.dob ?? pi?.DateOfBirth ?? pi?.dateOfBirth ?? '';
  if (dobRaw) {
    let iso = '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dobRaw)) {
      const [d, m, y] = dobRaw.split('/');
      iso = `${y}-${m}-${d}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(dobRaw)) {
      iso = dobRaw.slice(0, 10);
    }
    if (iso) { out.dateOfBirth = iso; notes.push(`DOB: ${dobRaw}`); }
  }

  // ── Father's Name ─────────────────────────────────────────────────────────────
  const fatherName = (pi?.FatherName ?? pi?.fatherName ?? '').trim();
  if (fatherName) { out.fatherName = fatherName; notes.push(`Father: ${fatherName}`); }

  // ── Gender / Assessee type ────────────────────────────────────────────────────
  const genderRaw = (pi?.Gender ?? pi?.gender ?? '').toUpperCase();
  if (genderRaw === 'M' || genderRaw === 'MALE') { out.gender = 'M'; }
  else if (genderRaw === 'F' || genderRaw === 'FEMALE') { out.gender = 'F'; }
  else if (genderRaw === 'T' || genderRaw === 'TRANSGENDER') { out.gender = 'T'; }

  const status: string = (pi?.Status ?? pi?.status ?? '').toUpperCase();
  const atMap: Record<string, AssesseeType> = {
    I: 'INDIVIDUAL', H: 'HUF', F: 'FIRM', C: 'DOMESTIC_COMPANY', B: 'BOI', A: 'AOP', J: 'AJP',
  };
  if (atMap[status]) { out.assesseeType = atMap[status]; notes.push(`Type: ${atMap[status]}`); }

  // ── Residential status ────────────────────────────────────────────────────────
  const res: string = (pi?.ResidentialStatus ?? pi?.residentialStatus ?? pi?.filingStatus?.residentialStatus ?? '').toUpperCase();
  if (res === 'RES' || res === 'RESIDENT') { out.residentialStatus = 'RES'; }
  else if (res === 'NRI') { out.residentialStatus = 'NRI'; }
  else if (res === 'RNR') { out.residentialStatus = 'RNR'; }

  // ── Address (separate IT Portal components) ──────────────────────────────────
  const addr: any = typeof pi?.address === 'object' ? pi.address : pi?.Address ?? {};
  const flatDoor   = (addr?.ResidenceNo ?? addr?.residenceNo ?? addr?.FlatDoorBlockNo ?? addr?.flatDoorBlockNo ?? '').trim();
  const building   = (addr?.ResidenceName ?? addr?.residenceName ?? addr?.NameBuildingVillage ?? addr?.nameBuildingVillage ?? '').trim();
  const road       = (addr?.RoadOrStreet ?? addr?.roadOrStreet ?? addr?.RoadStreet ?? addr?.roadStreet ?? '').trim();
  const locality   = (addr?.LocalityOrArea ?? addr?.localityOrArea ?? '').trim();
  if (flatDoor)  { out.flatDoorBlockNo = flatDoor; }
  if (building)  { out.nameBuildingVillage = building; }
  if (road)      { out.roadOrStreet = road; }
  if (locality)  { out.localityOrArea = locality; }
  const addrStr = [flatDoor, building, road, locality].filter(Boolean).join(', ');
  if (addrStr) notes.push(`Address: ${addrStr.slice(0, 60)}`);

  // localityOrArea = actual city (e.g. "Shillong"); cityOrTownOrDistrict = district (e.g. "EAST KHASI HILLS")
  // Use localityOrArea as city — it's the actual city name, not the district
  const city = (addr?.localityOrArea ?? addr?.LocalityOrArea ?? addr?.CityOrTownOrDistrict ?? addr?.cityOrTownOrDistrict ?? pi?.city ?? '').trim();
  if (city) { out.city = city; notes.push(`City: ${city}`); }
  // localityOrArea form field gets the district (cityOrTownOrDistrict) if not already set
  if (!out.localityOrArea) {
    const district = (addr?.CityOrTownOrDistrict ?? addr?.cityOrTownOrDistrict ?? '').trim();
    if (district && district !== city) out.localityOrArea = district;
  }

  const pin = String(addr?.PinCode ?? addr?.pinCode ?? addr?.pincode ?? '').replace(/\D/g, '');
  if (/^\d{6}$/.test(pin)) { out.pinCode = pin; notes.push(`PIN: ${pin}`); }

  const stateRaw = String(addr?.StateCode ?? addr?.stateCode ?? '').padStart(2, '0');
  if (/^\d{2}$/.test(stateRaw) && stateRaw !== '00') { out.stateCode = stateRaw; notes.push(`State: ${stateRaw}`); }

  // ── Contact ───────────────────────────────────────────────────────────────────
  const mobile = String(addr?.MobileNo ?? addr?.mobileNo ?? pi?.mobileNumber ?? pi?.mobile ?? '').replace(/\D/g, '').slice(-10);
  if (/^[6-9]\d{9}$/.test(mobile)) { out.mobileNumber = mobile; notes.push(`Mobile: ${mobile}`); }

  const email = (addr?.EmailAddress ?? addr?.emailAddress ?? pi?.emailAddress ?? pi?.email ?? '').trim();
  if (email.includes('@')) { out.email = email; notes.push(`Email: ${email}`); }

  // ── Aadhaar ───────────────────────────────────────────────────────────────────
  // Portal stores Aadhaar base64-encoded; decode it first
  const rawAadhaar = String(pi?.AadhaarCardNo ?? pi?.aadhaarCardNo ?? '');
  const decodedAadhaar = rawAadhaar.length > 12
    ? (() => { try { return atob(rawAadhaar); } catch { return rawAadhaar; } })()
    : rawAadhaar;
  const aadhaar = decodedAadhaar.replace(/\D/g, '');
  if (/^\d{12}$/.test(aadhaar)) { out.aadhaarNumber = aadhaar; notes.push(`Aadhaar: ****${aadhaar.slice(-4)}`); }

  // ── Portal username defaults to PAN ──────────────────────────────────────────
  if (out.pan) out.portalUsername = out.pan;

  return { ...out, _preview: notes.join(' · ') };
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const AADHAAR_REGEX = /^\d{12}$/;
const PINCODE_REGEX = /^\d{6}$/;

const EMPLOYER_CATEGORIES: { value: EmployerCategory; label: string }[] = [
  { value: 'OTH',  label: 'Others (Private Sector)' },
  { value: 'CGOV', label: 'Central Government' },
  { value: 'SGOV', label: 'State Government' },
  { value: 'PSU',  label: 'Public Sector Undertaking (PSU)' },
  { value: 'PE',   label: 'Pensioner — Central Govt.' },
  { value: 'PESG', label: 'Pensioner — State Govt.' },
  { value: 'PEPS', label: 'Pensioner — PSU' },
  { value: 'PEO',  label: 'Pensioner — Others' },
  { value: 'NA',   label: 'Not Applicable (Business/Profession/No Salary)' },
];

const EMPTY_FORM: ClientFormData = {
  pan: '',
  fullName: '',
  fatherName: '',
  gender: '',
  assesseeType: 'INDIVIDUAL',
  dateOfBirth: '',
  residentialStatus: 'RES',
  employerCategory: 'OTH',
  taxRegimePreference: 'NEW',
  mobileNumber: '',
  email: '',
  flatDoorBlockNo: '',
  nameBuildingVillage: '',
  roadOrStreet: '',
  localityOrArea: '',
  city: '',
  stateCode: '11',
  pinCode: '',
  aadhaarNumber: '',
  portalUsername: '',
  portalPassword: '',
};

// ─── Validators ───────────────────────────────────────────────────────────────

function validateForm(data: ClientFormData, isEdit: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.pan) errors.pan = 'PAN is required';
  else if (!PAN_REGEX.test(data.pan)) errors.pan = 'Invalid PAN. Format: AAAAA0000A';
  if (!data.fullName.trim()) errors.fullName = 'Full name is required';
  if (!data.dateOfBirth) errors.dateOfBirth = 'Date of birth / incorporation is required';
  if (data.mobileNumber && !MOBILE_REGEX.test(data.mobileNumber))
    errors.mobileNumber = 'Enter a valid 10-digit mobile number';
  if (data.aadhaarNumber && !AADHAAR_REGEX.test(data.aadhaarNumber))
    errors.aadhaarNumber = 'Aadhaar must be 12 digits';
  if (data.pinCode && !PINCODE_REGEX.test(data.pinCode))
    errors.pinCode = 'Pin code must be 6 digits';
  if (!data.city.trim()) errors.city = 'City is required';
  if (!isEdit && !data.portalPassword)
    errors.portalPassword = 'Portal password is required for new clients';
  return errors;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientForm({ clientId, onSuccess, onCancel }: ClientFormProps) {
  const isEdit = Boolean(clientId);
  const isMock = false; // web app — always use fetch API

  const [form, setForm] = useState<ClientFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEdit);
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [importPreview, setImportPreview] = useState<string | null>(null);

  // Portal prefill fetch state
  const [prefillFetching, setPrefillFetching] = useState(false);
  const [prefillLog, setPrefillLog] = useState<string[]>([]);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillDone, setPrefillDone] = useState(false);

  // Load existing client in edit mode
  useEffect(() => {
    if (!isEdit) return;
    async function load() {
      setFetchLoading(true);
      try {
        let data: any;
        const res = await fetch(`/api/clients/${clientId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load client');
        data = json.data;
        setForm({
          pan: data.pan ?? '',
          fullName: data.fullName ?? data.name ?? '',
          fatherName: data.fatherName ?? '',
          gender: data.gender ?? '',
          assesseeType: data.assesseeType ?? 'INDIVIDUAL',
          dateOfBirth: (data.dateOfBirth ?? data.dateOfBirthOrIncorporation ?? '').split('T')[0],
          residentialStatus: data.residentialStatus ?? 'RES',
          employerCategory: data.employerCategory ?? 'OTH',
          taxRegimePreference: data.taxRegimePreference ?? 'NEW',
          mobileNumber: data.mobileNumber ?? data.mobile ?? '',
          email: data.email ?? '',
          flatDoorBlockNo: data.flatDoorBlockNo ?? '',
          nameBuildingVillage: data.nameBuildingVillage ?? '',
          roadOrStreet: data.roadOrStreet ?? '',
          localityOrArea: data.localityOrArea ?? '',
          city: data.city ?? '',
          stateCode: data.stateCode ?? data.state ?? '11',
          pinCode: data.pinCode ? String(data.pinCode) : '',
          aadhaarNumber: data.aadhaarNumber ?? '',
          portalUsername: data.portalUsername ?? '',
          portalPassword: '',
        });
      } catch (e: any) {
        setFeedback({ type: 'error', message: e.message });
      } finally {
        setFetchLoading(false);
      }
    }
    load();
  }, [clientId, isEdit, isMock]);

  const handleChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'pan') {
        updated.pan = value.toUpperCase();
        if (!isEdit && prev.portalUsername === prev.pan) {
          updated.portalUsername = updated.pan;
        }
      }
      return updated;
    });
    if (errors[name]) setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
  }, [errors, isEdit]);

  // ── Portal prefill fetch (PAN + password → auto-fill form → auto-create) ──
  async function findAgentUrl(): Promise<string | null> {
    const candidates = [
      'http://localhost:3001',
      ...(typeof localStorage !== 'undefined'
        ? [localStorage.getItem('taxflow_agent_url')].filter(Boolean) as string[]
        : []),
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return url;
      } catch { /* try next */ }
    }
    return null;
  }

  async function handleFetchFromPortal() {
    const pan = form.pan.trim().toUpperCase();
    const password = form.portalPassword.trim();
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      setPrefillError('Enter a valid PAN first (format: AAAAA0000A).');
      return;
    }
    if (!password) {
      setPrefillError('Enter the portal password first.');
      return;
    }

    setPrefillError(null);
    setPrefillLog([]);
    setPrefillDone(false);
    setPrefillFetching(true);
    setPrefillLog(['Connecting to portal agent…']);

    const agentUrl = await findAgentUrl();
    if (!agentUrl) {
      setPrefillFetching(false);
      setPrefillError('LOCAL_AGENT_NOT_RUNNING');
      return;
    }

    setPrefillLog(prev => [...prev, 'Launching browser…']);

    try {
      const startRes = await fetch(`${agentUrl}/fetch-prefill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, password, force: true }),
      });
      if (!startRes.ok) {
        const j = await startRes.json().catch(() => ({}));
        throw new Error(j.error ?? 'Agent failed to start');
      }

      // Poll until done
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${agentUrl}/status-prefill`);
          const s = await statusRes.json();
          if (s.log?.length) setPrefillLog(s.log);

          if (s.status === 'done') {
            clearInterval(pollInterval);
            setPrefillFetching(false);

            const prefill = s.result?.prefill;
            if (!prefill) {
              setPrefillError('Prefill JSON not captured. Try again or use "Import from file".');
              return;
            }

            // Apply prefill to form
            const { _preview, ...mapped } = parsePrefillJson(prefill);
            setForm(prev => ({
              ...prev,
              ...mapped,
              pan: mapped.pan || prev.pan,
              portalUsername: mapped.pan || prev.pan,
              portalPassword: prev.portalPassword, // keep password as entered
            }));
            setImportPreview(_preview ?? null);
            setPrefillDone(true);
            setPrefillLog(prev => [...prev, '✓ Details imported! Creating client…']);

            // Auto-submit to create the client
            await autoCreateClient(mapped, password, prefill);

          } else if (s.status === 'error') {
            clearInterval(pollInterval);
            setPrefillFetching(false);
            setPrefillError(s.error ?? 'Portal fetch failed');
          }
        } catch { /* ignore poll errors */ }
      }, 2000);

    } catch (e: any) {
      setPrefillFetching(false);
      setPrefillError(e.message ?? 'Failed to contact local agent');
    }
  }

  async function autoCreateClient(mapped: Partial<ClientFormData>, password: string, rawPrefill?: unknown) {
    const pan = (mapped.pan || form.pan).toUpperCase();
    const fullName = mapped.fullName || form.fullName;

    try {
      const res = await fetch('/api/clients/from-prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefill: rawPrefill, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefillError('Data imported but client creation failed: ' + (json.error ?? res.statusText));
        return;
      }
      setPrefillLog(prev => [...prev, `✓ Client created: ${fullName} (${pan})`]);
      setTimeout(() => onSuccess(json.data?.clientId ?? json.data?.id ?? 0), 1000);
    } catch (e: any) {
      setPrefillError('Data imported but client creation failed: ' + e.message);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const validationErrors = validateForm(form, isEdit);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const firstKey = Object.keys(validationErrors)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setLoading(true);
    try {
      let result: any;

      const payload = {
        pan: form.pan.toUpperCase(),
        assesseeType: form.assesseeType,
        fullName: form.fullName,
        fatherName: form.fatherName || undefined,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        residentialStatus: form.residentialStatus,
        employerCategory: form.employerCategory,
        taxRegimePreference: form.taxRegimePreference,
        mobileNumber: form.mobileNumber || undefined,
        email: form.email || undefined,
        flatDoorBlockNo: form.flatDoorBlockNo || undefined,
        nameBuildingVillage: form.nameBuildingVillage || undefined,
        roadOrStreet: form.roadOrStreet || undefined,
        localityOrArea: form.localityOrArea || undefined,
        address: [form.flatDoorBlockNo, form.nameBuildingVillage, form.roadOrStreet, form.localityOrArea].filter(Boolean).join(', ') || undefined,
        city: form.city,
        stateCode: form.stateCode,
        pinCode: form.pinCode ? parseInt(form.pinCode) : undefined,
        aadhaarNumber: form.aadhaarNumber || undefined,
        portalUsername: form.portalUsername || form.pan.toUpperCase(),
        portalPassword: form.portalPassword || undefined,
      };

      const safeJson = async (r: Response) => {
        const text = await r.text();
        try { return JSON.parse(text); } catch { return { error: `Server error (${r.status}): ${text.slice(0, 200)}` }; }
      };

      if (isEdit) {
        const res = await fetch(`/api/clients/${clientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await safeJson(res);
        if (!res.ok) throw new Error(json.error || 'Operation failed');
        result = { success: true, data: { id: clientId } };
      } else {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await safeJson(res);
        if (!res.ok) throw new Error(json.error || 'Operation failed');
        result = { success: true, data: json.data };
      }

      if (!result.success) throw new Error(result.error || 'Operation failed');

      setFeedback({ type: 'success', message: isEdit ? 'Client updated.' : 'Client created successfully.' });
      setTimeout(() => onSuccess(result.data?.id ?? clientId ?? 0), 800);
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message ?? 'An error occurred' });
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '0.75rem' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--text-muted)' }}>Loading client data…</span>
      </div>
    );
  }

  const dobLabel = ['INDIVIDUAL', 'HUF'].includes(form.assesseeType) ? 'Date of Birth' : 'Date of Incorporation';

  return (
    <div
      className="animate-in"
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: '1.5rem',
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 80px)',
        paddingBottom: '2rem',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isEdit ? 'Edit Client' : 'New Client'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Fields marked * are required. Client data is used to generate ITR JSON.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isEdit && (
            <label style={{ cursor: 'pointer' }} title="Upload prefill JSON file downloaded from IT portal">
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const parsed = JSON.parse(text);
                    const { _preview, ...mapped } = parsePrefillJson(parsed);
                    if (!mapped.pan && !mapped.fullName) {
                      setFeedback({ type: 'error', message: 'Could not read ITR prefill data from this file.' });
                      return;
                    }
                    setForm((prev) => ({ ...prev, ...mapped }));
                    setImportPreview(_preview ?? null);
                    setTimeout(() => setImportPreview(null), 6000);
                  } catch {
                    setFeedback({ type: 'error', message: 'Invalid JSON file — could not parse.' });
                  }
                  e.target.value = '';
                }}
              />
              <span className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}>
                📂 Import from File
              </span>
            </label>
          )}
        </div>
      </div>

      {importPreview && (
        <div style={{
          padding: '0.6rem 1rem', marginBottom: '0.75rem', borderRadius: 6, fontSize: '0.8rem',
          background: 'rgba(56,139,253,0.12)', border: '1px solid rgba(56,139,253,0.4)', color: '#79c0ff',
        }}>
          Prefill imported — {importPreview}
        </div>
      )}
      {feedback && (
        <div
          style={{
            padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 6, fontSize: '0.875rem',
            background: feedback.type === 'success' ? 'rgba(35,134,54,0.12)' : 'rgba(248,81,73,0.12)',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(35,134,54,0.4)' : 'rgba(248,81,73,0.4)'}`,
            color: feedback.type === 'success' ? '#3fb950' : '#f85149',
          }}
        >
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Identity ── */}
        <Section title="Identity" subtitle="As per Income Tax records — used in ITR PersonalInfo" />
        <div className="form-grid form-grid-2" style={{ marginBottom: '1.25rem' }}>

          <div className="form-group" id="field-pan">
            <label className="form-label">PAN *</label>
            <input
              name="pan"
              className={`form-input pan-field${errors.pan ? ' error' : ''}`}
              placeholder="AAAAA0000A"
              value={form.pan}
              onChange={handleChange}
              maxLength={10}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.pan && <span className="form-error">{errors.pan}</span>}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>5 letters · 4 digits · 1 letter</span>
          </div>

          <div className="form-group" id="field-fullName">
            <label className="form-label">Full Name / Entity Name *</label>
            <input
              name="fullName"
              className={`form-input${errors.fullName ? ' error' : ''}`}
              placeholder="As per PAN card"
              value={form.fullName}
              onChange={handleChange}
            />
            {errors.fullName && <span className="form-error">{errors.fullName}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Father's Name</label>
            <input
              name="fatherName"
              className="form-input"
              placeholder="As per PAN / Aadhaar records"
              value={form.fatherName}
              onChange={handleChange}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>ITR Verification → FatherName</span>
          </div>

          <div className="form-group">
            <label className="form-label">Gender</label>
            <select name="gender" className="form-select" value={form.gender} onChange={handleChange}>
              <option value="">— Select —</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="T">Transgender</option>
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>ITR PersonalInfo → Gender</span>
          </div>

          <div className="form-group">
            <label className="form-label">Assessee Type *</label>
            <select name="assesseeType" className="form-select" value={form.assesseeType} onChange={handleChange}>
              {ASSESSEE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
              Determines ITR form type: ITR-1/2 for Individual, ITR-4 for Presumptive
            </span>
          </div>

          <div className="form-group" id="field-dateOfBirth">
            <label className="form-label">{dobLabel} *</label>
            <input
              name="dateOfBirth"
              type="date"
              className={`form-input${errors.dateOfBirth ? ' error' : ''}`}
              value={form.dateOfBirth}
              onChange={handleChange}
              max={new Date().toISOString().split('T')[0]}
            />
            {errors.dateOfBirth && <span className="form-error">{errors.dateOfBirth}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Residential Status</label>
            <select name="residentialStatus" className="form-select" value={form.residentialStatus} onChange={handleChange}>
              {RESIDENTIAL_STATUSES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>ITR FilingStatus → ResidentialStatus</span>
          </div>

          <div className="form-group">
            <label className="form-label">Tax Regime</label>
            <select name="taxRegimePreference" className="form-select" value={form.taxRegimePreference} onChange={handleChange}>
              <option value="NEW">New Regime (115BAC) — Lower rates, no deductions</option>
              <option value="OLD">Old Regime — Higher rates, deductions allowed</option>
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>ITR FilingStatus → OptingNewTaxRegime</span>
          </div>

          <div className="form-group">
            <label className="form-label">Employer Category</label>
            <select name="employerCategory" className="form-select" value={form.employerCategory} onChange={handleChange}>
              {EMPLOYER_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>ITR PersonalInfo → EmployerCategory</span>
          </div>

          <div className="form-group" id="field-aadhaarNumber">
            <label className="form-label">Aadhaar Number</label>
            <input
              name="aadhaarNumber"
              className={`form-input font-mono${errors.aadhaarNumber ? ' error' : ''}`}
              placeholder="12-digit Aadhaar"
              value={form.aadhaarNumber}
              onChange={handleChange}
              maxLength={12}
            />
            {errors.aadhaarNumber && <span className="form-error">{errors.aadhaarNumber}</span>}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>ITR Verification → AadhaarCardNo</span>
          </div>

        </div>

        {/* ── Contact ── */}
        <Section title="Contact Details" subtitle="ITR PersonalInfo → Address → MobileNo / EmailAddress" />
        <div className="form-grid form-grid-2" style={{ marginBottom: '1.25rem' }}>
          <div className="form-group" id="field-mobileNumber">
            <label className="form-label">Mobile Number</label>
            <input
              name="mobileNumber"
              type="tel"
              className={`form-input${errors.mobileNumber ? ' error' : ''}`}
              placeholder="10-digit mobile"
              value={form.mobileNumber}
              onChange={handleChange}
              maxLength={10}
            />
            {errors.mobileNumber && <span className="form-error">{errors.mobileNumber}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              name="email"
              type="email"
              className="form-input"
              placeholder="client@email.com"
              value={form.email}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* ── Address ── */}
        <Section title="Address" subtitle="ITR PersonalInfo → Address — exact field names as required by IT Portal" />
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="form-grid form-grid-2" style={{ marginBottom: '0.75rem' }}>
            <div className="form-group" id="field-flatDoorBlockNo">
              <label className="form-label">Flat / Door / Block No.</label>
              <input
                name="flatDoorBlockNo"
                className="form-input"
                placeholder="e.g. Flat 4B / House No. 12"
                value={form.flatDoorBlockNo}
                onChange={handleChange}
                maxLength={50}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>Address → ResidenceNo / FlatDoorBlockNo</span>
            </div>
            <div className="form-group">
              <label className="form-label">Building / Village Name</label>
              <input
                name="nameBuildingVillage"
                className="form-input"
                placeholder="e.g. Sunrise Apartments"
                value={form.nameBuildingVillage}
                onChange={handleChange}
                maxLength={50}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>Address → ResidenceName / NameBuildingVillage</span>
            </div>
            <div className="form-group" id="field-roadOrStreet">
              <label className="form-label">Road / Street *</label>
              <input
                name="roadOrStreet"
                className={`form-input${errors.roadOrStreet ? ' error' : ''}`}
                placeholder="e.g. MG Road"
                value={form.roadOrStreet}
                onChange={handleChange}
                maxLength={100}
              />
              {errors.roadOrStreet && <span className="form-error">{errors.roadOrStreet}</span>}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>Address → RoadOrStreet</span>
            </div>
            <div className="form-group">
              <label className="form-label">Locality / Area</label>
              <input
                name="localityOrArea"
                className="form-input"
                placeholder="e.g. Koramangala"
                value={form.localityOrArea}
                onChange={handleChange}
                maxLength={100}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>Address → LocalityOrArea</span>
            </div>
          </div>
          <div className="form-grid form-grid-3">
            <div className="form-group" id="field-city">
              <label className="form-label">City / Town / District *</label>
              <input
                name="city"
                className={`form-input${errors.city ? ' error' : ''}`}
                placeholder="City"
                value={form.city}
                onChange={handleChange}
                maxLength={50}
              />
              {errors.city && <span className="form-error">{errors.city}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">State *</label>
              <select name="stateCode" className="form-select" value={form.stateCode} onChange={handleChange}>
                {STATE_CODES.map((s) => (
                  <option key={s.value} value={s.value}>{s.value} — {s.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" id="field-pinCode">
              <label className="form-label">PIN Code</label>
              <input
                name="pinCode"
                className={`form-input font-mono${errors.pinCode ? ' error' : ''}`}
                placeholder="6-digit PIN"
                value={form.pinCode}
                onChange={handleChange}
                maxLength={6}
              />
              {errors.pinCode && <span className="form-error">{errors.pinCode}</span>}
            </div>
          </div>
        </div>

        {/* ── Portal Credentials ── */}
        <Section
          title="Income Tax Portal Credentials"
          subtitle="Stored encrypted in vault (AES-256-GCM). Used for e-filing portal login."
        />
        <div className="card-elevated" style={{ padding: '1rem', borderRadius: 8, marginBottom: '1.5rem', border: '1px solid var(--border-subtle)' }}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Portal Username</label>
              <input
                name="portalUsername"
                className="form-input font-mono"
                placeholder="Defaults to PAN"
                value={form.portalUsername}
                onChange={handleChange}
                autoComplete="off"
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
                Usually the client's PAN. Used to log into incometax.gov.in
              </span>
            </div>
            <div className="form-group" id="field-portalPassword">
              <label className="form-label">Portal Password {!isEdit && '*'}</label>
              <div style={{ position: 'relative' }}>
                <input
                  name="portalPassword"
                  type={showPassword ? 'text' : 'password'}
                  className={`form-input font-mono${errors.portalPassword ? ' error' : ''}`}
                  placeholder={isEdit ? 'Leave blank to keep existing' : 'Enter portal password'}
                  value={form.portalPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: '0.5rem', top: '50%',
                    transform: 'translateY(-50%)', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.portalPassword && <span className="form-error">{errors.portalPassword}</span>}
            </div>
          </div>

          {/* ── Portal fetch button (new client only) ── */}
          {!isEdit && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={prefillFetching}
                  onClick={handleFetchFromPortal}
                  style={{ fontSize: '0.8rem' }}
                >
                  {prefillFetching
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Fetching from Portal…</>
                    : '⬇ Import from Portal & Create Client'}
                </button>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Enter PAN + password above, then click — logs in, fetches all details, creates the client automatically.
                </span>
              </div>

              {/* Live log */}
              {prefillLog.length > 0 && (
                <div style={{
                  marginTop: 10, padding: '8px 12px',
                  background: 'rgba(30,40,60,0.4)', borderRadius: 6,
                  fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: 1.8,
                }}>
                  {prefillLog.map((l, i) => <div key={i}>▶ {l}</div>)}
                  {prefillFetching && (
                    <div style={{ color: 'var(--brand-primary)', marginTop: 4 }}>
                      ● Browser window is open — follow any portal prompts (OTP, captcha)…
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {prefillError && prefillError !== 'LOCAL_AGENT_NOT_RUNNING' && (
                <div style={{
                  marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 12,
                  background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171',
                }}>
                  {prefillError}
                </div>
              )}
              {prefillError === 'LOCAL_AGENT_NOT_RUNNING' && (
                <div style={{
                  marginTop: 8, padding: '10px 14px', borderRadius: 6, fontSize: 12, lineHeight: 1.9,
                  background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.3)',
                }}>
                  <strong style={{ color: 'var(--status-warning)' }}>Portal Agent not running.</strong><br />
                  Run <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 3 }}>
                    local-portal-agent\start.bat
                  </code> on this PC first, then try again.{' '}
                  Or use <strong>📂 Import from File</strong> with a prefill JSON downloaded from the IT portal.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div style={{
          display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
          paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)',

        }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: 130 }}>
            {loading
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> {isEdit ? 'Saving…' : 'Creating…'}</>
              : isEdit ? 'Save Changes' : 'Create Client'}
          </button>
        </div>

      </form>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function Section({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: '0.75rem', marginTop: '0.5rem' }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--brand-primary)',
        borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem',
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
