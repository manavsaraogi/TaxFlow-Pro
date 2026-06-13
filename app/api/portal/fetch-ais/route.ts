/**
 * POST /api/portal/fetch-ais
 * Body: { clientId: number, returnId: number }
 * Logs into incometax.gov.in with client credentials and downloads AIS data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { decryptPassword } from '@/lib/portal-encrypt';
import { publicEncrypt, constants } from 'crypto';

const PORTAL_BASE = 'https://eportal.incometax.gov.in';
const AIS_BASE    = 'https://service.eportal.incometax.gov.in';

const BASE_HEADERS: Record<string, string> = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Content-Type':    'application/json',
  'Origin':          PORTAL_BASE,
  'Referer':         `${PORTAL_BASE}/iec/foservices/#/login`,
};

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

// ── Portal helpers ────────────────────────────────────────────────────────────

async function getPublicKey(cookies: string): Promise<string> {
  const res = await fetch(
    `${PORTAL_BASE}/iec/services/publicIPPublicKeyDownloadV2`,
    { headers: { ...BASE_HEADERS, Cookie: cookies }, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Public key fetch failed (${res.status})`);
  const j = await res.json();
  const key = j?.data?.keyPair?.publicKey ?? j?.publicKey ?? j?.data?.publicKey ?? j?.key;
  if (!key) throw new Error('Public key not found in portal response');
  return key;
}

function encryptWithKey(pemRaw: string, password: string): string {
  const pem = pemRaw.includes('BEGIN')
    ? pemRaw
    : `-----BEGIN PUBLIC KEY-----\n${pemRaw.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
  return publicEncrypt(
    { key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(password)
  ).toString('base64');
}

function extractCookies(res: Response, existing = ''): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return existing;
  // Merge new cookies into existing
  const newPairs = setCookie.split(/,(?=[^ ].*?=)/).map((c) => c.split(';')[0].trim());
  const map = new Map<string, string>();
  for (const pair of existing.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [k, ...rest] = pair.split('=');
    map.set(k.trim(), rest.join('=').trim());
  }
  for (const pair of newPairs) {
    const [k, ...rest] = pair.split('=');
    map.set(k.trim(), rest.join('=').trim());
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseAIS(raw: any, pan: string): ParsedPortalData {
  const tdsEntries: PortalTDSEntry[] = [];
  const tcsEntries: ParsedPortalData['tcsEntries'] = [];

  const tdsArr =
    raw?.aisData?.tdsDetails ??
    raw?.taxData?.tds ??
    raw?.tds ??
    raw?.data?.tdsDetails ??
    raw?.aisInfo?.taxDeducted ??
    raw?.tdsSummary ??
    [];

  for (const t of tdsArr) {
    const section = t.section ?? t.sectionCode ?? t.tdsSection ?? '';
    tdsEntries.push({
      tan:          t.tan ?? t.TAN ?? t.deductorTAN ?? t.tanOfDeductor ?? '',
      name:         t.payerName ?? t.deductorName ?? t.name ?? 'Unknown',
      section,
      incomeAmount: Number(t.grossAmount ?? t.amountCredited ?? t.income ?? 0),
      tdsDeducted:  Number(t.taxDeducted ?? t.tds ?? t.taxDeductedAmount ?? 0),
      entryType:    section.startsWith('192') ? 'SALARY' : 'OTHER',
    });
  }

  const tcsArr =
    raw?.aisData?.tcsDetails ??
    raw?.taxData?.tcs ??
    raw?.tcs ??
    raw?.data?.tcsDetails ??
    [];

  for (const t of tcsArr) {
    tcsEntries.push({
      tan:          t.tan ?? t.TAN ?? t.collectorTAN ?? '',
      name:         t.collectorName ?? t.payerName ?? t.name ?? 'Unknown',
      amount:       Number(t.amount ?? t.grossAmount ?? 0),
      tcsCollected: Number(t.taxCollected ?? t.tcs ?? 0),
    });
  }

  return {
    source:      'AIS (Portal)',
    importedAt:  new Date().toISOString(),
    pan,
    tdsEntries,
    tcsEntries,
  };
}

async function tryFetchAIS(pan: string, cookies: string, token?: string): Promise<any | null> {
  const headers: Record<string, string> = { ...BASE_HEADERS, Cookie: cookies };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const attempts = [
    { url: `${AIS_BASE}/ais-api/v1/AIS_NEW`,          method: 'POST', body: JSON.stringify({ pan, assessmentYear: '2025-26' }) },
    { url: `${AIS_BASE}/ais-api/v1/getAISSummary`,     method: 'POST', body: JSON.stringify({ pan, assessmentYear: '2025-26' }) },
    { url: `${PORTAL_BASE}/iec/services/AIS/downloadAIS`, method: 'GET', body: undefined },
  ];

  for (const { url, method, body } of attempts) {
    try {
      const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j) return j;
      }
    } catch {
      // try next
    }
  }
  return null;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { clientId, returnId } = body;
  if (!clientId || !returnId) return NextResponse.json({ error: 'clientId and returnId required' }, { status: 400 });

  // Verify client belongs to this firm and get credentials
  const rows = await prisma.$queryRaw<Array<{
    id: number; pan: string;
    portalUsername: string | null;
    portalPasswordEnc: string | null;
  }>>`
    SELECT id, pan, "portalUsername", "portalPasswordEnc"
    FROM "Client"
    WHERE id = ${Number(clientId)} AND "firmId" = ${auth.firmId}
    LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const client = rows[0];
  if (!client.portalPasswordEnc) {
    return NextResponse.json({
      error: 'Portal password not saved for this client. Edit the client record and enter the portal password.',
    }, { status: 400 });
  }

  let portalPassword: string;
  try {
    portalPassword = decryptPassword(client.portalPasswordEnc);
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt portal password. Re-enter it in client settings.' }, { status: 500 });
  }

  const pan = (client.portalUsername ?? client.pan).toUpperCase();

  try {
    // ── 1. Get session cookie from portal home ────────────────────────────────
    let cookies = '';
    try {
      const homeRes = await fetch(`${PORTAL_BASE}/iec/foservices/#/login`, {
        headers: BASE_HEADERS,
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      cookies = extractCookies(homeRes, cookies);
    } catch {
      // Non-fatal — continue without initial cookies
    }

    // ── 2. Fetch RSA public key ───────────────────────────────────────────────
    let publicKey: string;
    try {
      publicKey = await getPublicKey(cookies);
    } catch (e: any) {
      return NextResponse.json({
        error: `Cannot reach Income Tax portal: ${e.message}. The portal may be down or blocking server-side access.`,
        code: 'PORTAL_UNREACHABLE',
      }, { status: 502 });
    }

    // ── 3. Encrypt password ───────────────────────────────────────────────────
    let encPwd: string;
    try {
      encPwd = encryptWithKey(publicKey, portalPassword);
    } catch (e: any) {
      return NextResponse.json({ error: `Password encryption failed: ${e.message}` }, { status: 500 });
    }

    // ── 4. Login ──────────────────────────────────────────────────────────────
    const loginRes = await fetch(`${PORTAL_BASE}/iec/services/login`, {
      method: 'POST',
      headers: { ...BASE_HEADERS, Cookie: cookies },
      body: JSON.stringify({
        userId:        pan,
        interfaceName: 'V2.0',
        journeyType:   'login',
        stepName:      'loginStep1',
        payload:       { password: encPwd },
      }),
      signal: AbortSignal.timeout(20000),
    });

    cookies = extractCookies(loginRes, cookies);
    const loginJson = await loginRes.json().catch(() => ({}));

    if (loginJson?.status === 'FAILURE' || loginJson?.errorMessage) {
      return NextResponse.json({
        error: loginJson.errorMessage ?? loginJson.message ?? 'Login failed. Check portal username/password.',
        code: 'LOGIN_FAILED',
      }, { status: 400 });
    }

    const token = loginJson?.token ?? loginJson?.data?.token ?? loginJson?.data?.sessionToken ?? '';

    // ── 5. Fetch AIS ──────────────────────────────────────────────────────────
    const aisRaw = await tryFetchAIS(pan, cookies, token);

    if (!aisRaw) {
      return NextResponse.json({
        error: 'Login succeeded but AIS download failed. The portal API may have changed. Use "Upload File" to upload AIS JSON manually.',
        code: 'AIS_FETCH_FAILED',
      }, { status: 502 });
    }

    // ── 6. Parse and save ─────────────────────────────────────────────────────
    const parsed = parseAIS(aisRaw, pan);

    await prisma.$executeRaw`
      UPDATE "Return"
      SET "portalData" = ${JSON.stringify(parsed)}, "updatedAt" = NOW()
      WHERE id = ${Number(returnId)}
    `;

    return NextResponse.json({
      status: 'SUCCESS',
      imported: { tdsCount: parsed.tdsEntries.length, tcsCount: parsed.tcsEntries.length },
    });

  } catch (e: any) {
    console.error('[fetch-ais]', e);
    return NextResponse.json({ error: e.message ?? 'Unexpected error' }, { status: 500 });
  }
}
