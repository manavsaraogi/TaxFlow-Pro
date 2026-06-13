/**
 * POST /api/portal/fetch-ais
 *
 * Multi-step IT portal fetch for AIS / 26AS data.
 *
 * Step 1 — initiate login:
 *   Body: { clientId: number, returnId: number, step: 'initiate' }
 *   → Fetches RSA public key from IT portal, encrypts client password,
 *     POSTs to portal login endpoint.
 *   → Response: { status: 'OTP_REQUIRED', sessionToken: string }
 *              | { status: 'SUCCESS', imported: { tdsCount, tcsCount } }
 *
 * Step 2 — verify OTP and fetch data:
 *   Body: { clientId: number, returnId: number, step: 'verify_otp', otp: string, sessionToken: string }
 *   → Verifies OTP with portal, downloads AIS JSON, parses, saves.
 *   → Response: { status: 'SUCCESS', imported: { tdsCount, tcsCount } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { decryptPassword } from '@/lib/portal-encrypt';
import { publicEncrypt, constants } from 'crypto';

const PORTAL_BASE = 'https://eportal.incometax.gov.in';
const AIS_BASE = 'https://service.eportal.incometax.gov.in';

const PORTAL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Content-Type': 'application/json',
  'Origin': PORTAL_BASE,
  'Referer': `${PORTAL_BASE}/iec/foservices/#/login`,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getPortalPublicKey(): Promise<string> {
  const res = await fetch(
    `${PORTAL_BASE}/iec/services/publicIPPublicKeyDownloadV2`,
    { headers: PORTAL_HEADERS, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Portal public key fetch failed: ${res.status}`);
  const json = await res.json();
  // The portal returns { status: 'SUCCESS', data: { keyPair: { publicKey: '...' } } }
  const key =
    json?.data?.keyPair?.publicKey ??
    json?.publicKey ??
    json?.data?.publicKey ??
    json?.key;
  if (!key) throw new Error('Public key not found in portal response');
  return key;
}

function encryptWithPortalKey(publicKeyPem: string, password: string): string {
  const pemFormatted = publicKeyPem.includes('BEGIN')
    ? publicKeyPem
    : `-----BEGIN PUBLIC KEY-----\n${publicKeyPem.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;

  const encrypted = publicEncrypt(
    { key: pemFormatted, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(password)
  );
  return encrypted.toString('base64');
}

function parseAISResponse(raw: any, pan: string): ParsedPortalData {
  const tdsEntries: PortalTDSEntry[] = [];
  const tcsEntries: ParsedPortalData['tcsEntries'] = [];

  // Traverse common AIS response shapes
  const tdsArr =
    raw?.aisData?.tdsDetails ??
    raw?.taxData?.tds ??
    raw?.tds ??
    raw?.data?.tdsDetails ??
    raw?.aisInfo?.taxDeducted ??
    [];

  for (const t of tdsArr) {
    const section = t.section ?? t.sectionCode ?? t.tdsSection ?? '';
    const isSalary = section.startsWith('192');
    tdsEntries.push({
      tan: t.tan ?? t.TAN ?? t.deductorTAN ?? t.tanOfDeductor ?? '',
      name: t.payerName ?? t.deductorName ?? t.name ?? 'Unknown',
      section,
      incomeAmount: Number(t.grossAmount ?? t.amountCredited ?? t.income ?? 0),
      tdsDeducted: Number(t.taxDeducted ?? t.tds ?? t.taxDeductedAmount ?? 0),
      entryType: isSalary ? 'SALARY' : 'OTHER',
    });
  }

  const tcsArr =
    raw?.aisData?.tcsDetails ??
    raw?.taxData?.tcs ??
    raw?.tcs ??
    raw?.data?.tcsDetails ??
    raw?.aisInfo?.taxCollected ??
    [];

  for (const t of tcsArr) {
    tcsEntries.push({
      tan: t.tan ?? t.TAN ?? t.collectorTAN ?? '',
      name: t.collectorName ?? t.payerName ?? t.name ?? 'Unknown',
      amount: Number(t.amount ?? t.grossAmount ?? 0),
      tcsCollected: Number(t.taxCollected ?? t.tcs ?? 0),
    });
  }

  return {
    source: 'AIS (Portal)',
    importedAt: new Date().toISOString(),
    pan,
    tdsEntries,
    tcsEntries,
  };
}

async function savePortalDataToReturn(returnId: number, data: ParsedPortalData) {
  await prisma.$executeRaw`
    UPDATE "Return"
    SET "portalData" = ${JSON.stringify(data)}, "updatedAt" = NOW()
    WHERE id = ${returnId}
  `;
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { clientId, returnId, step, otp, sessionToken } = body;

  if (!clientId || !returnId) {
    return NextResponse.json({ error: 'clientId and returnId are required' }, { status: 400 });
  }

  // Verify client belongs to this firm
  const rows = await prisma.$queryRaw<Array<{ id: number; pan: string; portalUsername: string | null; portalPasswordEnc: string | null }>>`
    SELECT id, pan, "portalUsername", "portalPasswordEnc"
    FROM "Client"
    WHERE id = ${Number(clientId)} AND "firmId" = ${auth.firmId}
    LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const client = rows[0];
  if (!client.portalPasswordEnc) {
    return NextResponse.json({ error: 'Portal password not set for this client. Edit the client and save a portal password.' }, { status: 400 });
  }

  let portalPassword: string;
  try {
    portalPassword = decryptPassword(client.portalPasswordEnc);
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt portal password. Please re-enter the password in client settings.' }, { status: 500 });
  }

  const pan = client.portalUsername ?? client.pan;

  try {
    if (step === 'initiate' || !step) {
      // ── Step 1: Login to IT portal ──────────────────────────────────────────

      // Get RSA public key from portal
      let publicKey: string;
      try {
        publicKey = await getPortalPublicKey();
      } catch (e: any) {
        return NextResponse.json({
          error: `Could not reach Income Tax portal: ${e.message}. The portal may be down or blocking automated access.`,
          code: 'PORTAL_UNREACHABLE',
        }, { status: 502 });
      }

      // Encrypt password with portal's public key
      let encryptedPassword: string;
      try {
        encryptedPassword = encryptWithPortalKey(publicKey, portalPassword);
      } catch (e: any) {
        return NextResponse.json({ error: `Password encryption failed: ${e.message}` }, { status: 500 });
      }

      // POST login step 1
      const loginRes = await fetch(`${PORTAL_BASE}/iec/services/login`, {
        method: 'POST',
        headers: PORTAL_HEADERS,
        body: JSON.stringify({
          userId: pan.toUpperCase(),
          interfaceName: 'V2.0',
          journeyType: 'login',
          stepName: 'loginStep1',
          payload: { password: encryptedPassword },
        }),
        signal: AbortSignal.timeout(15000),
      });

      const loginJson = await loginRes.json().catch(() => ({}));

      if (!loginRes.ok && loginRes.status !== 200) {
        return NextResponse.json({
          error: loginJson?.errorMessage ?? loginJson?.message ?? `Portal login failed (${loginRes.status})`,
          code: 'LOGIN_FAILED',
        }, { status: 400 });
      }

      // Extract transaction ID / session token for OTP step
      const txnId =
        loginJson?.transactionId ??
        loginJson?.data?.transactionId ??
        loginJson?.data?.token ??
        loginJson?.token;

      // Extract set-cookie header to maintain session
      const cookies = loginRes.headers.get('set-cookie') ?? '';

      // If status is SUCCESS and no OTP needed (some accounts skip OTP)
      if (loginJson?.status === 'SUCCESS' && !txnId) {
        // Try to fetch AIS directly
        const aisData = await fetchAIS(pan, cookies, loginJson?.token);
        if (aisData) {
          const parsed = parseAISResponse(aisData, pan);
          await savePortalDataToReturn(Number(returnId), parsed);
          return NextResponse.json({
            status: 'SUCCESS',
            imported: { tdsCount: parsed.tdsEntries.length, tcsCount: parsed.tcsEntries.length },
          });
        }
      }

      if (!txnId) {
        return NextResponse.json({
          error: 'Portal did not return a transaction ID. The portal may require CAPTCHA or is blocking automated access.',
          code: 'NO_TXN_ID',
          raw: loginJson,
        }, { status: 400 });
      }

      // Return session token (txnId + cookies encoded) to client for step 2
      const sessionPayload = Buffer.from(JSON.stringify({ txnId, cookies })).toString('base64');
      return NextResponse.json({ status: 'OTP_REQUIRED', sessionToken: sessionPayload });

    } else if (step === 'verify_otp') {
      // ── Step 2: Submit OTP ──────────────────────────────────────────────────
      if (!otp || !sessionToken) {
        return NextResponse.json({ error: 'OTP and sessionToken are required' }, { status: 400 });
      }

      let txnId: string;
      let cookies: string;
      try {
        const decoded = JSON.parse(Buffer.from(sessionToken, 'base64').toString('utf8'));
        txnId = decoded.txnId;
        cookies = decoded.cookies;
      } catch {
        return NextResponse.json({ error: 'Invalid session token' }, { status: 400 });
      }

      // Submit OTP
      const otpRes = await fetch(`${PORTAL_BASE}/iec/services/login`, {
        method: 'POST',
        headers: { ...PORTAL_HEADERS, Cookie: cookies },
        body: JSON.stringify({
          userId: pan.toUpperCase(),
          interfaceName: 'V2.0',
          journeyType: 'login',
          stepName: 'loginStep2',
          transactionId: txnId,
          payload: { otp: otp.trim() },
        }),
        signal: AbortSignal.timeout(15000),
      });

      const otpJson = await otpRes.json().catch(() => ({}));

      if (otpJson?.status !== 'SUCCESS' && otpJson?.errorMessage) {
        return NextResponse.json({
          error: otpJson.errorMessage ?? 'OTP verification failed',
          code: 'OTP_FAILED',
        }, { status: 400 });
      }

      const authToken = otpJson?.token ?? otpJson?.data?.token ?? otpJson?.data?.sessionToken ?? '';
      const updatedCookies = otpRes.headers.get('set-cookie') ?? cookies;

      // Fetch AIS data
      const aisData = await fetchAIS(pan, updatedCookies, authToken);
      if (!aisData) {
        return NextResponse.json({
          error: 'Login succeeded but could not download AIS data. Try again or download manually.',
          code: 'AIS_FETCH_FAILED',
        }, { status: 502 });
      }

      const parsed = parseAISResponse(aisData, pan);
      await savePortalDataToReturn(Number(returnId), parsed);

      return NextResponse.json({
        status: 'SUCCESS',
        imported: { tdsCount: parsed.tdsEntries.length, tcsCount: parsed.tcsEntries.length },
      });

    } else {
      return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error('[fetch-ais]', e);
    return NextResponse.json({
      error: e.message ?? 'Unexpected error',
      code: 'INTERNAL',
    }, { status: 500 });
  }
}

async function fetchAIS(pan: string, cookies: string, authToken?: string): Promise<any> {
  const headers: Record<string, string> = {
    ...PORTAL_HEADERS,
    Cookie: cookies,
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  // Try the AIS API endpoint
  const endpoints = [
    `${AIS_BASE}/ais-api/v1/AIS_NEW`,
    `${AIS_BASE}/ais-api/v1/getAISSummary`,
    `${PORTAL_BASE}/iec/services/AIS/downloadAIS`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pan: pan.toUpperCase(), assessmentYear: '2025-26' }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json) return json;
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}
