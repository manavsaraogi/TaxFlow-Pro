'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReturnData } from '@/shared/types/itr';

// ─── Portal import types ──────────────────────────────────────────────────────

interface PortalTDSEntry {
  tan?: string;
  name: string;
  section?: string;
  incomeAmount?: number;
  tdsDeducted: number;
  entryType?: string;
}

interface ParsedPortalData {
  source: string;
  importedAt: string;
  pan?: string;
  tdsEntries: PortalTDSEntry[];
  tcsEntries: Array<{ tan?: string; name: string; amount: number; tcsCollected: number }>;
}

interface MismatchItem {
  type: string;
  severity: 'ERROR' | 'WARNING';
  tan?: string;
  name: string;
  field: string;
  portalValue?: number;
  itrValue?: number;
  message: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TDSSalaryEntry {
  id: string;
  employerName: string;
  employerTAN: string;
  grossSalary: number;
  tdsDeducted: number;
}

interface TDSOtherEntry {
  id: string;
  deductorName: string;
  deductorTAN: string;
  incomeType: string;
  incomeCredited: number;
  tdsDeducted: number;
}

interface TDSPropertyEntry {
  id: string;
  buyerName: string;
  buyerPAN: string;
  considerationAmount: number;
  tdsDeducted: number;
}

interface TDSRentEntry {
  id: string;
  tenantName: string;
  tenantPAN: string;
  rentPaid: number;
  tdsDeducted: number;
}

interface TCSEntry {
  id: string;
  collectorName: string;
  collectorTAN: string;
  amountPaid: number;
  tcsCollected: number;
}

interface TDSState {
  salarySources: TDSSalaryEntry[];
  otherSources: TDSOtherEntry[];
  propertySources: TDSPropertyEntry[];
  rentSources: TDSRentEntry[];
  tcsSources: TCSEntry[];
}

interface Props {
  returnId: string;
  clientId?: string | number;
  returnData: ReturnData;
  onSaved?: () => void;
  setDirty?: (dirty: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => (n === 0 ? '—' : '₹' + n.toLocaleString('en-IN'));
const isValidTAN = (s: string) => /^[A-Z]{4}[0-9]{5}[A-Z]$/i.test(s.trim());
const isValidPAN = (s: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(s.trim());
const uuid = () => crypto.randomUUID();

const INCOME_TYPES = [
  'Interest on FD',
  'Interest on RD',
  'Interest on Savings',
  'Dividend',
  'Commission',
  'Professional Fees',
  'Rent (194I)',
  'Contractor Payment',
  'Other (specify)',
];

const EMPTY_STATE: TDSState = {
  salarySources: [],
  otherSources: [],
  propertySources: [],
  rentSources: [],
  tcsSources: [],
};

// ─── IPC ──────────────────────────────────────────────────────────────────────

const ipc = {
  upsertTDS: async (returnId: string, data: unknown) => {
    const res = await fetch(`/api/returns/${returnId}/schedule/tds`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Save failed'); }
    return { ok: true };
  },
  getPortalData: async (returnId: string): Promise<ParsedPortalData | null> => {
    try {
      const res = await fetch(`/api/returns/${returnId}/portal-data`);
      if (!res.ok) return null;
      const j = await res.json();
      return j.data ?? null;
    } catch { return null; }
  },
  savePortalData: async (returnId: string, data: ParsedPortalData) => {
    const res = await fetch(`/api/returns/${returnId}/portal-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to save portal data');
  },
  getMismatches: async (returnId: string): Promise<MismatchItem[]> => {
    try {
      const res = await fetch(`/api/returns/${returnId}/portal-mismatch`);
      if (!res.ok) return [];
      const j = await res.json();
      return j.data ?? [];
    } catch { return []; }
  },
};

// ── Map DB tdsEntries rows → TDSState ─────────────────────────────────────────
function dbEntriesToState(entries: any[]): TDSState {
  if (!Array.isArray(entries) || entries.length === 0) return EMPTY_STATE;
  const state: TDSState = { salarySources: [], otherSources: [], propertySources: [], rentSources: [], tcsSources: [] };
  for (const e of entries) {
    switch (e.entryType) {
      case 'SALARY':
        state.salarySources.push({ id: String(e.id ?? uuid()), employerName: e.nameOfDeductor ?? '', employerTAN: e.tanOfDeductor ?? '', grossSalary: e.incomeChargeable ?? 0, tdsDeducted: e.tdsDeducted ?? 0 });
        break;
      case 'PROPERTY':
        state.propertySources.push({ id: String(e.id ?? uuid()), buyerName: e.nameOfDeductor ?? '', buyerPAN: e.panOfTenant ?? '', considerationAmount: e.amtForTaxDeduct ?? 0, tdsDeducted: e.tdsDeducted ?? 0 });
        break;
      case 'RENT':
        state.rentSources.push({ id: String(e.id ?? uuid()), tenantName: e.nameOfTenant ?? e.nameOfDeductor ?? '', tenantPAN: e.panOfTenant ?? '', rentPaid: e.grossRentReceived ?? 0, tdsDeducted: e.tdsDeducted ?? 0 });
        break;
      case 'TCS':
        state.tcsSources.push({ id: String(e.id ?? uuid()), collectorName: e.nameOfDeductor ?? '', collectorTAN: e.tanOfDeductor ?? '', amountPaid: e.amtOnWhichTCS ?? 0, tcsCollected: e.tcsCollected ?? 0 });
        break;
      default:
        state.otherSources.push({ id: String(e.id ?? uuid()), deductorName: e.nameOfDeductor ?? '', deductorTAN: e.tanOfDeductor ?? '', incomeType: e.tdsSection ?? 'Other (specify)', incomeCredited: e.incomeChargeable ?? 0, tdsDeducted: e.tdsDeducted ?? 0 });
    }
  }
  return state;
}

// ─── Portal parsers ───────────────────────────────────────────────────────────

function parseAISJson(raw: any): ParsedPortalData {
  const entries: PortalTDSEntry[] = [];
  const tcsEntries: ParsedPortalData['tcsEntries'] = [];

  // ── AIS Utility v14+ format (partB.sections[0] = TDS/TCS section) ─────────
  // Structure: { partA: { columnData: [PAN,...,DOB,...] }, partB: { sections: [...] } }
  if (raw?.partB?.sections && raw?.partA?.columnData) {
    const pan: string = raw.partA.columnData[0] ?? '';
    const tdsSections: any[] = raw.partB.sections.filter(
      (s: any) => /part b1|tax deducted|tax collected/i.test(s.title ?? '')
    );
    for (const section of tdsSections) {
      for (const el of (section.elements ?? [])) {
        const tan: string  = el.infoSrcId ?? '';
        const name: string = el.l1Src === 'AIS_TDS_TCS' ? (el.title ?? 'Unknown') : (el.title ?? 'Unknown');
        const labels: string[] = (el.l1?.columnLabel ?? []).map((c: any) => c.field as string);
        const isTCS = /TCS|tax collected/i.test(section.title ?? '');
        const infoCode: string = el.l1?.columnLabel?.find((c: any) => c.infoCode)?.infoCode ?? '';
        // infoCode is like "TDS-194A" → section = "194A"
        const section_code = infoCode.replace(/^TDS-/i, '').replace(/^TCS-/i, '');

        for (const row of (el.l1?.columnData ?? [])) {
          const rowObj: Record<string, string> = {};
          labels.forEach((f, i) => { rowObj[f] = row[i] ?? ''; });
          const parseAmt = (v: string) => parseFloat((v ?? '0').replace(/,/g, '')) || 0;
          const gross = parseAmt(rowObj.amtPaid);
          const tax   = parseAmt(rowObj.amountDeducted);
          if (isTCS) {
            tcsEntries.push({ tan, name, amount: gross, tcsCollected: tax });
          } else {
            entries.push({ tan, name, section: section_code, incomeAmount: gross, tdsDeducted: tax, entryType: el.title ?? 'OTHER' });
          }
        }
      }
    }
    if (entries.length || tcsEntries.length) {
      return { source: 'AIS', importedAt: new Date().toISOString(), pan, tdsEntries: entries, tcsEntries };
    }
  }

  // ── IT Portal AIS API format (from ais.insight.gov.in API response) ──────
  // Structure: { data: { aisTaxpayerData: { aisInformation: [...] } } }
  // Each aisInformation entry has informationCategory + transactionDetails[]
  const aisTaxpayerData =
    raw?.data?.aisTaxpayerData ??
    raw?.aisTaxpayerData ??
    null;

  if (aisTaxpayerData) {
    const infoList: any[] = aisTaxpayerData.aisInformation ?? [];
    for (const info of infoList) {
      const cat: string = info.informationCategory ?? '';
      const isTDS = /TDS|tax deducted/i.test(cat);
      const isTCS = /TCS|tax collected/i.test(cat);
      const txns: any[] = info.transactionDetails ?? info.aisTransactionDetails ?? [];

      for (const t of txns) {
        const tan = t.deductorTAN ?? t.collectorTAN ?? t.tan ?? '';
        const name = t.deductorName ?? t.collectorName ?? t.payerName ?? t.name ?? info.informationType ?? 'Unknown';
        const section = t.sectionCode ?? t.section ?? info.informationType ?? '';
        const gross = Number(t.transactionAmount ?? t.grossAmount ?? t.amount ?? 0);
        const tax = Number(t.taxDeducted ?? t.taxCollected ?? t.tdsAmount ?? 0);

        if (isTCS) {
          tcsEntries.push({ tan, name, amount: gross, tcsCollected: tax });
        } else if (isTDS || tax > 0) {
          entries.push({ tan, name, section, incomeAmount: gross, tdsDeducted: tax, entryType: cat || 'OTHER' });
        }
      }
    }
  }

  // ── Flat aisInformation array at root (some API versions) ─────────────────
  if (entries.length === 0) {
    const infoList: any[] = raw?.aisInformation ?? raw?.ais_information ?? [];
    for (const info of infoList) {
      const txns: any[] = info.transactionDetails ?? info.aisTransactionDetails ?? [];
      for (const t of txns) {
        const tax = Number(t.taxDeducted ?? t.taxCollected ?? 0);
        if (tax > 0 || t.deductorTAN) {
          entries.push({
            tan: t.deductorTAN ?? t.tan ?? '',
            name: t.deductorName ?? info.informationType ?? 'Unknown',
            section: t.sectionCode ?? info.informationType ?? '',
            incomeAmount: Number(t.transactionAmount ?? t.grossAmount ?? 0),
            tdsDeducted: tax,
            entryType: info.informationCategory ?? 'OTHER',
          });
        }
      }
    }
  }

  // ── Legacy / guessed formats ───────────────────────────────────────────────
  if (entries.length === 0) {
    const tdsArr =
      raw?.taxData?.tds ??
      raw?.aisData?.tdsDetails ??
      raw?.tdsDetails ??
      raw?.tdsSummary ??
      raw?.TDS_DETAILS ??
      [];
    for (const t of tdsArr) {
      entries.push({
        tan: t.tan ?? t.TAN ?? t.deductorTAN ?? '',
        name: t.payerName ?? t.deductorName ?? t.name ?? 'Unknown',
        section: t.section ?? t.sectionCode ?? '',
        incomeAmount: Number(t.grossAmount ?? t.amountCredited ?? t.amount ?? 0),
        tdsDeducted: Number(t.taxDeducted ?? t.TDS ?? t.tds ?? 0),
        entryType: t.type ?? t.category ?? 'OTHER',
      });
    }
    const tcsArr =
      raw?.taxData?.tcs ?? raw?.aisData?.tcsDetails ?? raw?.tcsDetails ?? raw?.TCS_DETAILS ?? [];
    for (const t of tcsArr) {
      tcsEntries.push({
        tan: t.tan ?? t.collectorTAN ?? '',
        name: t.collectorName ?? t.payerName ?? t.name ?? 'Unknown',
        amount: Number(t.amount ?? t.grossAmount ?? 0),
        tcsCollected: Number(t.taxCollected ?? t.TCS ?? t.tcs ?? 0),
      });
    }
  }

  // ── Flat array at root ─────────────────────────────────────────────────────
  if (entries.length === 0 && Array.isArray(raw)) {
    for (const t of raw) {
      if (t.taxDeducted !== undefined || t.tds !== undefined || t.deductorTAN) {
        entries.push({
          tan: t.tan ?? t.deductorTAN ?? '',
          name: t.deductorName ?? t.payerName ?? t.name ?? 'Unknown',
          section: t.section ?? '',
          incomeAmount: Number(t.grossAmount ?? t.amount ?? 0),
          tdsDeducted: Number(t.taxDeducted ?? t.tds ?? 0),
        });
      }
    }
  }

  const pan =
    raw?.data?.aisTaxpayerData?.taxpayerInfo?.pan ??
    raw?.payerInfo?.pan ?? raw?.pan ?? raw?.PAN ?? '';

  return { source: 'AIS', importedAt: new Date().toISOString(), pan, tdsEntries: entries, tcsEntries };
}

function parse26ASText(text: string): ParsedPortalData {
  const entries: PortalTDSEntry[] = [];
  const lines = text.split('\n').map((l) => l.trim());
  let currentPart = '';
  let inDataSection = false;
  let headers: string[] = [];

  for (const line of lines) {
    if (!line) continue;

    // Detect section headers
    if (/PART\s+A\s*[:\-]/i.test(line)) { currentPart = 'SALARY'; inDataSection = false; continue; }
    if (/PART\s+B\s*[:\-]/i.test(line)) { currentPart = 'OTHER'; inDataSection = false; continue; }
    if (/PART\s+C\s*[:\-]/i.test(line)) { currentPart = 'PROPERTY'; inDataSection = false; continue; }
    if (/PART\s+D\s*[:\-]/i.test(line)) { currentPart = 'RENT'; inDataSection = false; continue; }

    // Detect header row (SNo or Sr No pattern)
    if (/^(SNo|Sr\.?\s*No|S\.?No)/i.test(line)) {
      headers = line.split(/\t|\|/).map((h) => h.trim().toLowerCase());
      inDataSection = true;
      continue;
    }

    if (!inDataSection || !currentPart) continue;

    const cols = line.split(/\t|\|/).map((c) => c.trim());
    if (cols.length < 4) continue;

    // Try to extract TAN, name, amount, TDS from columns
    const tanIdx = headers.findIndex((h) => h.includes('tan'));
    const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('deduct'));
    const amtIdx = headers.findIndex((h) => h.includes('paid') || h.includes('credited') || h.includes('amount'));
    const tdsIdx = headers.findIndex((h) => h.includes('tax deducted') || (h.includes('tds') && !h.includes('deposited')));

    const getValue = (idx: number) => (idx >= 0 && cols[idx] ? cols[idx] : '');
    const getNum = (idx: number) => parseFloat(getValue(idx).replace(/,/g, '')) || 0;

    const tan = getValue(tanIdx !== -1 ? tanIdx : 1);
    const name = getValue(nameIdx !== -1 ? nameIdx : 2);
    const income = getNum(amtIdx !== -1 ? amtIdx : cols.length - 3);
    const tds = getNum(tdsIdx !== -1 ? tdsIdx : cols.length - 2);

    if (name && tds > 0) {
      entries.push({ tan, name, incomeAmount: income, tdsDeducted: tds, entryType: currentPart });
    }
  }

  return {
    source: '26AS',
    importedAt: new Date().toISOString(),
    tdsEntries: entries,
    tcsEntries: [],
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PartHeader({ part, title, sub }: { part: string; title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
      <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', letterSpacing: 1 }}>
        {part}
      </span>
      <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{title}</span>
      {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{sub}</span>}
    </div>
  );
}

function TotalsRow({ label, income, tds, tdsLabel = 'TDS Deducted' }: { label: string; income?: number; tds: number; tdsLabel?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, marginTop: 12 }}>
      {income !== undefined && (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {label}: <strong className="amount">{fmt(income)}</strong>
        </span>
      )}
      <span style={{ fontSize: 13, color: 'var(--brand-text)', fontWeight: 700 }}>
        {tdsLabel}: <span className="amount">{fmt(tds)}</span>
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduleTDS({ returnId, clientId, returnData, onSaved, setDirty }: Props) {
  const [state, setState] = useState<TDSState>(EMPTY_STATE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Portal import state
  const [portalData, setPortalData] = useState<ParsedPortalData | null>(null);
  const [mismatches, setMismatches] = useState<MismatchItem[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [mismatchLoading, setMismatchLoading] = useState(false);

  // Local agent state
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null); // null = not checked yet
  const [agentFetching, setAgentFetching] = useState(false);
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const agentPollRef = useRef<ReturnType<typeof setInterval> | null>(null);


  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Populate TDS state from returnData prop (no extra fetch needed)
    const entries = (returnData as any)?.tdsEntries;
    if (entries?.length) {
      setState(dbEntriesToState(entries));
    }
    setLoaded(true);

    // Load portal data in background — non-blocking, failures are silent
    ipc.getPortalData(returnId).then((portal) => {
      if (portal) setPortalData(portal);
    });
  }, [returnId]);

  // ── Local agent helpers ─────────────────────────────────────────────────────

  // Finds the agent URL — tries localhost first, then any saved office IP
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

  async function checkAgent(): Promise<boolean> {
    const url = await findAgentUrl();
    setAgentAvailable(!!url);
    return !!url;
  }

  async function fetchFromAgent() {
    setAgentError(null);
    setAgentLog([]);
    // Get pan + password for this client from the API
    let pan = (returnData as any)?.client?.pan ?? '';
    let password = '';
    let dob = '';
    try {
      const cr = await fetch(`/api/clients/${(returnData as any)?.clientId ?? (returnData as any)?.client?.id ?? ''}/portal-credentials`);
      if (cr.ok) {
        const cj = await cr.json();
        pan = cj.data?.pan ?? pan;
        password = cj.data?.portalPassword ?? '';
        dob = cj.data?.dob ?? '';
      }
    } catch { /* ignore */ }

    if (!password) {
      setAgentError('No portal password stored for this client. Edit the client and add the portal password first.');
      return;
    }
    if (!dob) {
      setAgentError('Date of Birth not set for this client. Edit the client and save the Date of Birth (needed to decrypt the AIS file).');
      return;
    }

    setAgentFetching(true);
    setAgentLog(['Starting portal agent...']);

    const agentUrl = await findAgentUrl();
    if (!agentUrl) { setAgentFetching(false); setAgentError('LOCAL_AGENT_NOT_RUNNING'); return; }

    // Derive assessment year from return data (e.g. "2025-26")
    const ayLabel: string = (returnData as any)?.assessmentYear?.label ?? '2025-26';

    try {
      const startRes = await fetch(`${agentUrl}/fetch-portal-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, password, dob, assessmentYear: ayLabel, force: true }),
      });
      if (!startRes.ok) {
        const j = await startRes.json().catch(() => ({}));
        throw new Error(j.error ?? 'Agent failed to start');
      }

      // Poll for status
      agentPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${agentUrl}/status`);
          const s = await statusRes.json();
          if (s.log?.length) setAgentLog(s.log);

          if (s.status === 'done') {
            clearInterval(agentPollRef.current!);
            setAgentFetching(false);
            const data = s.result;

            let parsed: ParsedPortalData | null = null;

            // Try AIS JSON first
            if (data?.ais) {
              const p = parseAISJson(data.ais);
              if (p.tdsEntries.length || p.tcsEntries.length) parsed = p;
            }
            // Fall back to 26AS (may be raw text or JSON)
            if (!parsed && data?.form26AS) {
              if (data.form26AS.raw) {
                const p = parse26ASText(data.form26AS.raw);
                if (p.tdsEntries.length || p.tcsEntries.length) parsed = p;
              } else {
                const p = parseAISJson(data.form26AS);
                if (p.tdsEntries.length || p.tcsEntries.length) parsed = p;
              }
            }

            if (parsed) {
              await ipc.savePortalData(returnId, parsed);
              setPortalData(parsed);
              const mm = await ipc.getMismatches(returnId);
              setMismatches(mm);
              setAgentLog(prev => [...prev, `Done! ${parsed!.tdsEntries.length} TDS + ${parsed!.tcsEntries.length} TCS entries imported.`]);
            } else {
              setAgentError('Portal data fetched but no TDS/TCS entries found. Please upload the AIS JSON file manually.');
            }
          } else if (s.status === 'error') {
            clearInterval(agentPollRef.current!);
            setAgentFetching(false);
            setAgentError(s.error ?? 'Portal fetch failed');
          }
        } catch { /* ignore poll errors */ }
      }, 2000);

    } catch (e: any) {
      setAgentFetching(false);
      setAgentError(e.message ?? 'Failed to contact local agent');
    }
  }

  // ── Portal helpers ──────────────────────────────────────────────────────────
  // Decrypt an AIS Utility v14+ encrypted file in the browser.
  // Format: [32-hex IV][32-hex Salt][Base64 AES-256-CBC ciphertext]
  // Password = pan.toLowerCase() + "GQ39%*g" + dob_DDMMYYYY
  // Key = PBKDF2-SHA256(password, salt, 1000 iterations, 32 bytes)
  async function decryptAISFile(content: string, pan: string, dob: string): Promise<any> {
    const trimmed = content.trim();
    if (!/^[0-9a-f]{64}/i.test(trimmed)) throw new Error('Not an encrypted AIS Utility file');

    function hexToBytes(hex: string) {
      const arr = new Uint8Array(hex.length / 2);
      for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return arr;
    }

    const iv       = hexToBytes(trimmed.slice(0, 32));
    const salt     = hexToBytes(trimmed.slice(32, 64));
    const encBytes = Uint8Array.from(atob(trimmed.slice(64)), c => c.charCodeAt(0));
    const AIS_ID   = 'GQ39%*g';

    const password = pan.toLowerCase() + AIS_ID + dob;
    const pwBytes  = new TextEncoder().encode(password);
    const baseKey  = await crypto.subtle.importKey('raw', pwBytes, 'PBKDF2', false, ['deriveBits']);
    const keyBits  = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' }, baseKey, 256);
    const aesKey   = await crypto.subtle.importKey('raw', keyBits, { name: 'AES-CBC' }, false, ['decrypt']);
    const plain    = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, encBytes);
    return JSON.parse(new TextDecoder().decode(plain).trim());
  }

  async function handleFileImport(file: File) {
    setImportLoading(true);
    setImportError(null);
    try {
      const text = await file.text();
      let parsed: ParsedPortalData;

      if (file.name.endsWith('.json') || file.type === 'application/json') {
        let json: any;
        // Detect encrypted AIS Utility format (64-char hex prefix)
        if (/^[0-9a-f]{64}/i.test(text.trimStart())) {
          // Fetch client PAN + DOB to derive decryption key
          const cid = (returnData as any)?.clientId ?? (returnData as any)?.client?.id ?? '';
          let pan = (returnData as any)?.client?.pan ?? '';
          let dob = '';
          try {
            const cr = await fetch(`/api/clients/${cid}/portal-credentials`);
            if (cr.ok) { const cj = await cr.json(); pan = cj.data?.pan ?? pan; dob = cj.data?.dob ?? ''; }
          } catch { /* proceed with available values */ }
          json = await decryptAISFile(text.trimStart(), pan, dob);
        } else {
          json = JSON.parse(text);
        }
        parsed = parseAISJson(json);
      } else {
        parsed = parse26ASText(text);
      }

      if (parsed.tdsEntries.length === 0 && parsed.tcsEntries.length === 0) {
        setImportError('No TDS/TCS entries found in the file. Make sure you are uploading AIS JSON or 26AS text.');
        return;
      }

      await ipc.savePortalData(returnId, parsed);
      setPortalData(parsed);
      setShowImportPanel(false);

      // Fetch mismatches after import
      const mm = await ipc.getMismatches(returnId);
      setMismatches(mm);
    } catch (e: any) {
      setImportError(e.message ?? 'Failed to parse file');
    } finally {
      setImportLoading(false);
    }
  }


  async function refreshMismatches() {
    setMismatchLoading(true);
    try {
      const mm = await ipc.getMismatches(returnId);
      setMismatches(mm);
    } finally {
      setMismatchLoading(false);
    }
  }

  function populateFromPortal() {
    if (!portalData) return;
    const newSalarySources: TDSState['salarySources'] = [];
    const newOtherSources: TDSState['otherSources'] = [];
    const newTcsSources: TDSState['tcsSources'] = [];

    for (const e of portalData.tdsEntries) {
      const isSalary = (e.section ?? '').startsWith('192') || e.entryType === 'SALARY';
      if (isSalary) {
        newSalarySources.push({
          id: uuid(),
          employerName: e.name,
          employerTAN: e.tan ?? '',
          grossSalary: e.incomeAmount ?? 0,
          tdsDeducted: e.tdsDeducted,
        });
      } else {
        newOtherSources.push({
          id: uuid(),
          deductorName: e.name,
          deductorTAN: e.tan ?? '',
          incomeType: sectionToIncomeType(e.section),
          incomeCredited: e.incomeAmount ?? 0,
          tdsDeducted: e.tdsDeducted,
        });
      }
    }

    for (const t of portalData.tcsEntries) {
      newTcsSources.push({
        id: uuid(),
        collectorName: t.name,
        collectorTAN: t.tan ?? '',
        amountPaid: t.amount,
        tcsCollected: t.tcsCollected,
      });
    }

    const next: TDSState = {
      ...state,
      salarySources: newSalarySources.length > 0 ? newSalarySources : state.salarySources,
      otherSources: newOtherSources.length > 0 ? newOtherSources : state.otherSources,
      tcsSources: newTcsSources.length > 0 ? newTcsSources : state.tcsSources,
    };
    setState(next);
    persist(next);
  }

  function sectionToIncomeType(section?: string): string {
    if (!section) return 'Other (specify)';
    if (section.startsWith('194A')) return 'Interest on FD';
    if (section.startsWith('194I')) return 'Rent (194I)';
    if (section.startsWith('194J')) return 'Professional Fees';
    if (section.startsWith('194')) return 'Other (specify)';
    return 'Other (specify)';
  }

  // ── Auto-save ───────────────────────────────────────────────────────────────
  const persist = useCallback(
    (data: TDSState) => {
      setDirty?.(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        setSaveError(null);
        try {
          await ipc.upsertTDS(returnId, data);
          setDirty?.(false);
          onSaved?.();
        } catch (e: any) {
          setSaveError(e?.message ?? 'Save failed');
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [returnId, onSaved, setDirty]
  );

  const update = useCallback(
    (patch: Partial<TDSState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalTDSSalary = state.salarySources.reduce((s, r) => s + r.tdsDeducted, 0);
  const totalTDSOther = state.otherSources.reduce((s, r) => s + r.tdsDeducted, 0);
  const totalTDSProperty = state.propertySources.reduce((s, r) => s + r.tdsDeducted, 0);
  const totalTDSRent = state.rentSources.reduce((s, r) => s + r.tdsDeducted, 0);
  const totalTCS = state.tcsSources.reduce((s, r) => s + r.tcsCollected, 0);
  const grandTotal = totalTDSSalary + totalTDSOther + totalTDSProperty + totalTDSRent + totalTCS;

  if (!loaded) {
    return (
      <div className="card animate-in" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading TDS details…
      </div>
    );
  }

  const errorCount = mismatches.filter((m) => m.severity === 'ERROR').length;
  const warnCount = mismatches.filter((m) => m.severity === 'WARNING').length;

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Portal Fetch Panel ────────────────────────────────────────────────── */}
      <div className="card" style={{ borderColor: portalData ? 'rgba(63,185,80,0.3)' : 'var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
              26AS / AIS / TIS — Income Tax Portal
            </div>
            {portalData ? (
              <div style={{ fontSize: 12, color: 'var(--status-success)' }}>
                {portalData.source} · {portalData.tdsEntries.length} TDS + {portalData.tcsEntries.length} TCS entries
                · {new Date(portalData.importedAt).toLocaleDateString('en-IN')}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Fetch automatically using portal credentials, or upload AIS JSON / 26AS file.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {portalData && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={populateFromPortal} title="Overwrite TDS entries with portal data">
                  ↓ Populate from Portal
                </button>
                <button className="btn btn-secondary btn-sm" onClick={refreshMismatches} disabled={mismatchLoading}>
                  {mismatchLoading ? 'Checking…' : '⚡ Check Mismatches'}
                </button>
              </>
            )}
            {/* Auto fetch button — uses local agent */}
            <button
              className="btn btn-primary btn-sm"
              disabled={agentFetching}
              onClick={async () => {
                setAgentError(null);
                const avail = await checkAgent();
                if (!avail) {
                  setAgentError('LOCAL_AGENT_NOT_RUNNING');
                  return;
                }
                await fetchFromAgent();
              }}
            >
              {agentFetching ? '⏳ Fetching…' : '🔄 Fetch from Portal'}
            </button>
            {/* Manual file upload fallback */}
            <label style={{ cursor: 'pointer' }}>
              <input type="file" accept=".json,.txt,.csv" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileImport(f); e.target.value = ''; }} />
              <span className="btn btn-secondary btn-sm">
                {importLoading ? '⏳ Importing…' : '⬆ Upload AIS / 26AS'}
              </span>
            </label>
          </div>
        </div>

        {/* Agent log while fetching */}
        {agentFetching && agentLog.length > 0 && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(30,40,60,0.4)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {agentLog.map((l, i) => <div key={i}>▶ {l}</div>)}
          </div>
        )}

        {/* Error states */}
        {agentError === 'LOCAL_AGENT_NOT_RUNNING' && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.3)', borderRadius: 6, fontSize: 12, lineHeight: 1.9 }}>
            <strong style={{ color: 'var(--status-warning)' }}>Portal Agent not found on this computer.</strong><br />
            <strong>Option 1 — Install on this PC (one-time):</strong><br />
            Run <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>local-portal-agent\install-startup.bat</code> — agent will auto-start every login.<br />
            <strong>Option 2 — Use office PC running the agent:</strong><br />
            Enter the IP of the PC that has the agent running:&nbsp;
            <input
              type="text" placeholder="e.g. 192.168.1.10:3001"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'var(--text-primary)', padding: '2px 6px', width: 160 }}
              onBlur={e => {
                const val = e.target.value.trim();
                if (val) {
                  const url = val.startsWith('http') ? val : `http://${val}`;
                  localStorage.setItem('taxflow_agent_url', url);
                  setAgentError(null);
                }
              }}
            />&nbsp;
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(press Tab to save)</span><br />
            <strong>Option 3:</strong> Upload AIS JSON manually using the Upload button above.
          </div>
        )}
        {agentError && agentError !== 'LOCAL_AGENT_NOT_RUNNING' && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 6, fontSize: 12, color: '#f85149' }}>
            {agentError}
          </div>
        )}
        {importError && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 6, fontSize: 12, color: '#f85149' }}>
            {importError}
          </div>
        )}
      </div>

      {/* ── Mismatch Panel ────────────────────────────────────────────────────── */}
      {mismatches.length > 0 && (
        <div className="card" style={{ borderColor: errorCount > 0 ? 'rgba(248,81,73,0.4)' : 'rgba(210,153,34,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>{errorCount > 0 ? '🔴' : '🟡'}</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              Portal vs ITR Mismatches
            </span>
            {errorCount > 0 && (
              <span style={{ background: 'rgba(248,81,73,0.15)', color: '#f85149', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                {errorCount} ERROR{errorCount !== 1 ? 'S' : ''}
              </span>
            )}
            {warnCount > 0 && (
              <span style={{ background: 'rgba(210,153,34,0.15)', color: '#D29922', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                {warnCount} WARNING{warnCount !== 1 ? 'S' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mismatches.map((m, i) => (
              <div key={i} style={{
                padding: '10px 14px',
                borderRadius: 6,
                border: `1px solid ${m.severity === 'ERROR' ? 'rgba(248,81,73,0.3)' : 'rgba(210,153,34,0.3)'}`,
                background: m.severity === 'ERROR' ? 'rgba(248,81,73,0.06)' : 'rgba(210,153,34,0.06)',
                fontSize: 13,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: m.severity === 'ERROR' ? '#f85149' : '#D29922', fontWeight: 700, fontSize: 11 }}>
                    {m.severity}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{m.message}</span>
                </div>
                {m.portalValue !== undefined && m.itrValue !== undefined && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                    <span>Portal: <strong className="amount" style={{ color: 'var(--text-primary)' }}>₹{m.portalValue.toLocaleString('en-IN')}</strong></span>
                    <span>ITR: <strong className="amount" style={{ color: 'var(--text-primary)' }}>₹{m.itrValue.toLocaleString('en-IN')}</strong></span>
                    <span style={{ color: m.severity === 'ERROR' ? '#f85149' : '#D29922' }}>
                      Diff: ₹{Math.abs(m.portalValue - m.itrValue).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Part A: TDS on Salary ─────────────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part A" title="TDS on Salary" sub="Form 16 from each employer" />
        {state.salarySources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No salary TDS entries. Add your employer details from Form 16.</div>
        )}
        {state.salarySources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Employer #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ salarySources: state.salarySources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Employer Name</label>
                <input className="form-input" value={row.employerName} placeholder="As in Form 16"
                  onChange={(e) => update({ salarySources: state.salarySources.map((r) => r.id === row.id ? { ...r, employerName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Employer TAN</label>
                <input
                  className={`form-input pan-field${row.employerTAN && !isValidTAN(row.employerTAN) ? ' form-error' : ''}`}
                  value={row.employerTAN} maxLength={10} placeholder="AAAA00000A"
                  onChange={(e) => update({ salarySources: state.salarySources.map((r) => r.id === row.id ? { ...r, employerTAN: e.target.value.toUpperCase() } : r) })} />
                {row.employerTAN && !isValidTAN(row.employerTAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid TAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Gross Salary Paid / Credited (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.grossSalary || ''}
                  onChange={(e) => update({ salarySources: state.salarySources.map((r) => r.id === row.id ? { ...r, grossSalary: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Deducted (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tdsDeducted || ''}
                  onChange={(e) => update({ salarySources: state.salarySources.map((r) => r.id === row.id ? { ...r, tdsDeducted: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ salarySources: [...state.salarySources, { id: uuid(), employerName: '', employerTAN: '', grossSalary: 0, tdsDeducted: 0 }] })}>
          + Add Employer
        </button>
        {state.salarySources.length > 0 && (
          <TotalsRow label="Total Gross Salary" income={state.salarySources.reduce((s, r) => s + r.grossSalary, 0)} tds={totalTDSSalary} />
        )}
      </div>

      {/* ── Part B: TDS on Other Income ───────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part B" title="TDS on Other Income" sub="Form 16A — FD interest, professional fees, etc." />
        {state.otherSources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No TDS entries. Add income sources where TDS was deducted (Form 16A).</div>
        )}
        {state.otherSources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Entry #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ otherSources: state.otherSources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Deductor Name</label>
                <input className="form-input" value={row.deductorName} placeholder="Bank / Company name"
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, deductorName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Deductor TAN</label>
                <input
                  className={`form-input pan-field${row.deductorTAN && !isValidTAN(row.deductorTAN) ? ' form-error' : ''}`}
                  value={row.deductorTAN} maxLength={10} placeholder="AAAA00000A"
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, deductorTAN: e.target.value.toUpperCase() } : r) })} />
                {row.deductorTAN && !isValidTAN(row.deductorTAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid TAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Nature of Income</label>
                <select className="form-input" value={row.incomeType}
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, incomeType: e.target.value } : r) })}>
                  <option value="">— Select —</option>
                  {INCOME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Income Credited (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.incomeCredited || ''}
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, incomeCredited: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Deducted (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tdsDeducted || ''}
                  onChange={(e) => update({ otherSources: state.otherSources.map((r) => r.id === row.id ? { ...r, tdsDeducted: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ otherSources: [...state.otherSources, { id: uuid(), deductorName: '', deductorTAN: '', incomeType: '', incomeCredited: 0, tdsDeducted: 0 }] })}>
          + Add Entry
        </button>
        {state.otherSources.length > 0 && (
          <TotalsRow label="Total Income" income={state.otherSources.reduce((s, r) => s + r.incomeCredited, 0)} tds={totalTDSOther} />
        )}
      </div>

      {/* ── Part C: TDS on Property Sale ──────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part C" title="TDS on Sale of Immovable Property" sub="Form 16B — buyer deducts @ 1% u/s 194IA" />
        {state.propertySources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No property TDS entries. Add if buyer deducted TDS on property sale.</div>
        )}
        {state.propertySources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Property Sale #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ propertySources: state.propertySources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Buyer Name</label>
                <input className="form-input" value={row.buyerName} placeholder="Name of buyer"
                  onChange={(e) => update({ propertySources: state.propertySources.map((r) => r.id === row.id ? { ...r, buyerName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Buyer PAN</label>
                <input
                  className={`form-input pan-field${row.buyerPAN && !isValidPAN(row.buyerPAN) ? ' form-error' : ''}`}
                  value={row.buyerPAN} maxLength={10} placeholder="AAAAA0000A"
                  onChange={(e) => update({ propertySources: state.propertySources.map((r) => r.id === row.id ? { ...r, buyerPAN: e.target.value.toUpperCase() } : r) })} />
                {row.buyerPAN && !isValidPAN(row.buyerPAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid PAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Sale Consideration (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.considerationAmount || ''}
                  onChange={(e) => update({ propertySources: state.propertySources.map((r) => r.id === row.id ? { ...r, considerationAmount: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Deducted @ 1% (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tdsDeducted || ''}
                  onChange={(e) => update({ propertySources: state.propertySources.map((r) => r.id === row.id ? { ...r, tdsDeducted: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ propertySources: [...state.propertySources, { id: uuid(), buyerName: '', buyerPAN: '', considerationAmount: 0, tdsDeducted: 0 }] })}>
          + Add Property Sale
        </button>
        {state.propertySources.length > 0 && (
          <TotalsRow label="Total Consideration" income={state.propertySources.reduce((s, r) => s + r.considerationAmount, 0)} tds={totalTDSProperty} />
        )}
      </div>

      {/* ── Part D: TDS on Rent ───────────────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part D" title="TDS on Rent" sub="Form 16C — tenant deducts @ 5% u/s 194IB" />
        {state.rentSources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No rent TDS entries. Add if tenant deducted TDS on rent payments to you.</div>
        )}
        {state.rentSources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Rent #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ rentSources: state.rentSources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Tenant Name</label>
                <input className="form-input" value={row.tenantName} placeholder="Name of tenant"
                  onChange={(e) => update({ rentSources: state.rentSources.map((r) => r.id === row.id ? { ...r, tenantName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Tenant PAN</label>
                <input
                  className={`form-input pan-field${row.tenantPAN && !isValidPAN(row.tenantPAN) ? ' form-error' : ''}`}
                  value={row.tenantPAN} maxLength={10} placeholder="AAAAA0000A"
                  onChange={(e) => update({ rentSources: state.rentSources.map((r) => r.id === row.id ? { ...r, tenantPAN: e.target.value.toUpperCase() } : r) })} />
                {row.tenantPAN && !isValidPAN(row.tenantPAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid PAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Total Rent Paid to You (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.rentPaid || ''}
                  onChange={(e) => update({ rentSources: state.rentSources.map((r) => r.id === row.id ? { ...r, rentPaid: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Deducted @ 5% (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tdsDeducted || ''}
                  onChange={(e) => update({ rentSources: state.rentSources.map((r) => r.id === row.id ? { ...r, tdsDeducted: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ rentSources: [...state.rentSources, { id: uuid(), tenantName: '', tenantPAN: '', rentPaid: 0, tdsDeducted: 0 }] })}>
          + Add Rent TDS
        </button>
        {state.rentSources.length > 0 && (
          <TotalsRow label="Total Rent" income={state.rentSources.reduce((s, r) => s + r.rentPaid, 0)} tds={totalTDSRent} />
        )}
      </div>

      {/* ── Part E: TCS ───────────────────────────────────────────────────────── */}
      <div className="card">
        <PartHeader part="Part E" title="Tax Collected at Source (TCS)" sub="Vehicle purchase, foreign remittance, etc." />
        {state.tcsSources.length === 0 && (
          <div className="empty-state" style={{ paddingBottom: 16 }}>No TCS entries. Add if any seller collected tax at source from you.</div>
        )}
        {state.tcsSources.map((row, idx) => (
          <div key={row.id} className="card-elevated" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>TCS Entry #{idx + 1}</span>
              <button className="btn btn-sm btn-secondary" style={{ color: '#f87171' }}
                onClick={() => update({ tcsSources: state.tcsSources.filter((r) => r.id !== row.id) })}>
                Remove
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Collector Name</label>
                <input className="form-input" value={row.collectorName} placeholder="Seller / dealer name"
                  onChange={(e) => update({ tcsSources: state.tcsSources.map((r) => r.id === row.id ? { ...r, collectorName: e.target.value } : r) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Collector TAN</label>
                <input
                  className={`form-input pan-field${row.collectorTAN && !isValidTAN(row.collectorTAN) ? ' form-error' : ''}`}
                  value={row.collectorTAN} maxLength={10} placeholder="AAAA00000A"
                  onChange={(e) => update({ tcsSources: state.tcsSources.map((r) => r.id === row.id ? { ...r, collectorTAN: e.target.value.toUpperCase() } : r) })} />
                {row.collectorTAN && !isValidTAN(row.collectorTAN) && (
                  <span className="form-error" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Invalid TAN format</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Amount Paid / Credited (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.amountPaid || ''}
                  onChange={(e) => update({ tcsSources: state.tcsSources.map((r) => r.id === row.id ? { ...r, amountPaid: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">TCS Collected (₹)</label>
                <input type="number" min={0} className="form-input amount" value={row.tcsCollected || ''}
                  onChange={(e) => update({ tcsSources: state.tcsSources.map((r) => r.id === row.id ? { ...r, tcsCollected: Math.max(0, Number(e.target.value)) } : r) })}
                  placeholder="0" />
              </div>
            </div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm"
          onClick={() => update({ tcsSources: [...state.tcsSources, { id: uuid(), collectorName: '', collectorTAN: '', amountPaid: 0, tcsCollected: 0 }] })}>
          + Add TCS Entry
        </button>
        {state.tcsSources.length > 0 && (
          <TotalsRow label="Total Amount" income={state.tcsSources.reduce((s, r) => s + r.amountPaid, 0)} tds={totalTCS} tdsLabel="TCS Collected" />
        )}
      </div>

      {/* ── Grand Total ───────────────────────────────────────────────────────── */}
      <div className="card stat-card">
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--brand-text)' }}>TDS / TCS Summary</h3>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Part</th>
              <th>Source</th>
              <th style={{ textAlign: 'right' }}>TDS / TCS</th>
            </tr>
          </thead>
          <tbody>
            {[
              { part: 'A', label: 'TDS on Salary (Form 16)', val: totalTDSSalary },
              { part: 'B', label: 'TDS on Other Income (Form 16A)', val: totalTDSOther },
              { part: 'C', label: 'TDS on Property Sale (Form 16B)', val: totalTDSProperty },
              { part: 'D', label: 'TDS on Rent (Form 16C)', val: totalTDSRent },
              { part: 'E', label: 'TCS (Tax Collected at Source)', val: totalTCS },
            ].map((row) => (
              <tr key={row.part}>
                <td><span className="badge-primary" style={{ fontSize: 11, padding: '2px 6px' }}>Part {row.part}</span></td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{row.label}</td>
                <td className="amount" style={{ textAlign: 'right', color: row.val > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{fmt(row.val)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
              <td colSpan={2} style={{ fontWeight: 700, fontSize: 14, paddingTop: 10 }}>Total TDS / TCS Credit</td>
              <td className="amount" style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: 'var(--brand-text)', paddingTop: 10 }}>{fmt(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Save status ───────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', minHeight: 20 }}>
        {saving && '💾 Saving…'}
        {saveError && <span style={{ color: '#f87171' }}>⚠ {saveError}</span>}
      </div>
    </div>
  );
}
