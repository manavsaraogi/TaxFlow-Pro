import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/clients/import
 * Body: { clients: Array<ClientImportRecord> }
 *
 * Bulk-create or update clients from JSON.
 * Minimum required: pan + fullName (or name)
 * Optional: portalPassword (stored in DB — encrypted at rest by Supabase)
 */

interface ClientImportRecord {
  pan: string;
  fullName?: string;
  name?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  surName?: string;
  dateOfBirth?: string;
  dob?: string;
  assesseeType?: string;
  mobileNumber?: string;
  mobile?: string;
  email?: string;
  address?: string;
  city?: string;
  stateCode?: string;
  state?: string;
  pinCode?: string | number;
  aadhaarNumber?: string;
  aadhaar?: string;
  residentialStatus?: string;
  taxRegimePreference?: string;
  portalUsername?: string;
  portalPassword?: string;
  password?: string;
  bankAccounts?: Array<{
    bankName: string;
    accountNumber: string;
    ifscCode?: string;
    ifsc?: string;
    accountType?: string;
    isPrimary?: boolean;
  }>;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Support single client or array
  const rawList = Array.isArray(body) ? body
    : Array.isArray(body.clients) ? body.clients
    : body.pan ? [body]
    : null;

  if (!rawList || rawList.length === 0) {
    return NextResponse.json({
      error: 'Provide an array of clients or a single client object with at least pan and name',
    }, { status: 400 });
  }

  const results: Array<{ pan: string; status: string; id?: number; error?: string }> = [];

  for (const raw of rawList as ClientImportRecord[]) {
    const pan = raw.pan?.trim().toUpperCase();
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      results.push({ pan: pan ?? 'UNKNOWN', status: 'error', error: 'Invalid PAN format' });
      continue;
    }

    // Resolve full name
    let fullName = raw.fullName ?? raw.name;
    if (!fullName && (raw.firstName || raw.lastName || raw.surName)) {
      fullName = [raw.firstName, raw.middleName, raw.lastName ?? raw.surName]
        .filter(Boolean).join(' ').trim();
    }
    if (!fullName) {
      results.push({ pan, status: 'error', error: 'fullName or name is required' });
      continue;
    }

    const dob = raw.dateOfBirth ?? raw.dob;
    const mobile = raw.mobileNumber ?? raw.mobile;
    const aadhaar = raw.aadhaarNumber ?? raw.aadhaar;
    const stateCode = raw.stateCode ?? raw.state;
    const pinCode = raw.pinCode ? Number(raw.pinCode) : undefined;
    const portalPass = raw.portalPassword ?? raw.password;

    try {
      const existing = await prisma.client.findUnique({
        where: { firmId_pan: { firmId: auth.firmId, pan } },
      });

      let clientId: number;

      if (existing) {
        await prisma.client.update({
          where: { id: existing.id },
          data: {
            fullName,
            dateOfBirth: dob ? new Date(dob) : existing.dateOfBirth,
            mobileNumber: mobile ?? existing.mobileNumber,
            email: raw.email ?? existing.email,
            address: raw.address ?? existing.address,
            city: raw.city ?? existing.city,
            stateCode: stateCode ?? existing.stateCode,
            pinCode: pinCode ?? existing.pinCode,
            aadhaarNumber: aadhaar ?? existing.aadhaarNumber,
            assesseeType: (raw.assesseeType as any) ?? existing.assesseeType,
            residentialStatus: raw.residentialStatus ?? existing.residentialStatus,
            taxRegimePreference: (raw.taxRegimePreference as any) ?? existing.taxRegimePreference,
            portalUsername: raw.portalUsername ?? existing.portalUsername,
          },
        });
        clientId = existing.id;
        results.push({ pan, status: 'updated', id: clientId });
      } else {
        const created = await prisma.client.create({
          data: {
            firmId: auth.firmId,
            pan,
            fullName,
            assesseeType: (raw.assesseeType as any) ?? 'INDIVIDUAL',
            dateOfBirth: dob ? new Date(dob) : null,
            mobileNumber: mobile ?? null,
            email: raw.email ?? null,
            address: raw.address ?? null,
            city: raw.city ?? null,
            stateCode: stateCode ?? null,
            pinCode: pinCode ?? null,
            aadhaarNumber: aadhaar ?? null,
            residentialStatus: raw.residentialStatus ?? 'RES',
            taxRegimePreference: (raw.taxRegimePreference as any) ?? 'NEW',
            portalUsername: raw.portalUsername ?? pan,
          },
        });
        clientId = created.id;
        results.push({ pan, status: 'created', id: clientId });
      }

      // Import bank accounts if provided
      if (raw.bankAccounts?.length) {
        for (const bank of raw.bankAccounts) {
          const ifsc = (bank.ifscCode ?? bank.ifsc ?? '').toUpperCase();
          if (!bank.bankName || !bank.accountNumber) continue;
          // Avoid duplicates
          const existingBank = await prisma.bankAccount.findFirst({
            where: { clientId, accountNumber: bank.accountNumber },
          });
          if (!existingBank) {
            await prisma.bankAccount.create({
              data: {
                clientId,
                bankName: bank.bankName,
                accountNumber: bank.accountNumber,
                ifscCode: ifsc,
                accountType: (bank.accountType as any) ?? 'SAVINGS',
                isPrimary: bank.isPrimary ?? false,
              },
            });
          }
        }
      }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      results.push({ pan, status: 'error', error: msg });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const updated = results.filter((r) => r.status === 'updated').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return NextResponse.json({
    data: { created, updated, errors, results },
  }, { status: errors === results.length ? 400 : 201 });
}
