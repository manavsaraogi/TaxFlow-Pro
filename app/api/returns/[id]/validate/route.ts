import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

type Params = { params: { id: string } };

interface ValidationResponse {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// GET /api/returns/[id]/validate
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ret = await prisma.return.findFirst({
    where: { id: Number(params.id), client: { firmId: auth.firmId } },
    include: {
      client: {
        include: {
          bankAccounts: { where: { isPrimary: true, isActive: true }, take: 1 },
        },
      },
      assessmentYear: true,
      salarySchedule: true,
      hpSchedule: true,
      osSchedule: true,
      deductionSchedule: true,
      tdsEntries: true,
      taxPayments: true,
      verification: true,
    },
  });

  if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const errors: string[] = [];
  const warnings: string[] = [];

  const c = ret.client;

  // ── PersonalInfo validation ──
  if (!c.pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(c.pan)) {
    errors.push('PAN is missing or invalid (expected format: ABCDE1234F)');
  }
  if (!c.fullName || c.fullName.trim().length < 2) {
    errors.push('Client full name is missing');
  }
  if (!c.dateOfBirth) {
    errors.push('Date of birth is missing');
  }
  if (!c.address || c.address.trim().length < 3) {
    errors.push('Address is missing or too short');
  }
  if (!c.city) {
    warnings.push('City is not set — recommended for PersonalInfo');
  }
  if (!c.stateCode) {
    warnings.push('State code is not set — recommended for PersonalInfo');
  }
  if (!c.mobileNumber) {
    warnings.push('Mobile number is not set — required for e-verification');
  }
  if (!c.email) {
    warnings.push('Email address is not set — required for acknowledgement');
  }

  // ── Income validation ──
  const hasSalary = ret.salarySchedule && ret.salarySchedule.incomeFromSalary > 0;
  const hasHP = ret.hpSchedule && ret.hpSchedule.length > 0;
  const hasOS = ret.osSchedule && ret.osSchedule.incomeFromOtherSources > 0;

  if (!hasSalary && !hasHP && !hasOS) {
    warnings.push('No income data found — at least one income head should have a value');
  }

  if (ret.salarySchedule && ret.salarySchedule.incomeFromSalary < 0) {
    errors.push('Income from salary cannot be negative');
  }

  // ── ITR-1 specific ──
  if (ret.formType === 'ITR-1') {
    if (ret.hpSchedule && ret.hpSchedule.length > 1) {
      errors.push('ITR-1 supports only 1 house property; multiple properties found — consider ITR-2');
    }
    const gti = ret.grossTotalIncome ?? 0;
    if (gti > 5_000_000) {
      errors.push(`ITR-1 is applicable only for income up to ₹50L; computed GTI is ₹${gti.toLocaleString('en-IN')} — consider ITR-2`);
    }
  }

  // ── Bank account for refund ──
  if (c.bankAccounts.length === 0) {
    warnings.push('No primary bank account found — required for refund credit');
  } else {
    const bank = c.bankAccounts[0];
    if (!bank.ifscCode || bank.ifscCode.length !== 11) {
      errors.push('Primary bank account has invalid or missing IFSC code');
    }
    if (!bank.accountNumber || bank.accountNumber.length < 5) {
      errors.push('Primary bank account number is missing or invalid');
    }
  }

  // ── Verification ──
  if (!ret.verification) {
    warnings.push('Verification details not filled — required before filing');
  } else {
    if (!ret.verification.assesseeVerName) {
      errors.push('Verification: assesseee name is missing');
    }
    if (!ret.verification.placeVerSign) {
      errors.push('Verification: place of signing is missing');
    }
  }

  // ── TDS consistency ──
  const tdsOnSalary = ret.tdsEntries.filter((e) => e.entryType === 'SALARY');
  if (hasSalary && tdsOnSalary.length === 0) {
    warnings.push('Salary income is present but no TDS on salary entries found — verify Form 16');
  }

  const result: ValidationResponse = {
    valid: errors.length === 0,
    errors,
    warnings,
  };

  return NextResponse.json(result);
}
