/**
 * prisma/seed.ts
 * Development seed script — populates DB with a firm, admin user, and sample clients.
 * Run with: npx prisma db seed
 * Or automatically via AUTO_SEED=true in .env (triggered from database.ts on first launch).
 */

import { PrismaClient, AssesseeType, ReturnStatus, FilingType } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

function encryptPortalPassword(plaintext: string, vaultKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Derives a deterministic vault key from the seed master password.
 * In production, this is done interactively from vault.ts — this is for seed only.
 */
function deriveSeedVaultKey(): Buffer {
  const salt = process.env.VAULT_SALT
    ? Buffer.from(process.env.VAULT_SALT, 'hex')
    : crypto.randomBytes(32); // fallback for fresh dev environments
  const iterations = parseInt(process.env.VAULT_KDF_ITERATIONS || '600000', 10);
  const masterPassword = process.env.SEED_MASTER_PASSWORD || 'DevPassword@123';
  return crypto.pbkdf2Sync(masterPassword, salt, iterations, 32, 'sha512');
}

function currentAY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year - 1}-${String(year).slice(-2)}`;
}

function previousAY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year - 1}-${String(year).slice(-2)}`;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const FIRM = {
  name: 'Mehta & Associates',
  registrationNumber: 'FRN123456W',
  address: '304, Shree Complex, Ring Road, Surat, Gujarat - 395002',
  phone: '+91 98765 43210',
  email: 'info@mehtaassociates.in',
  gstin: '24AABFM1234A1Z5',
};

const ADMIN_USER = {
  username: 'admin',
  displayName: 'Rajesh Mehta',
  role: 'ADMIN' as const,
  password: process.env.SEED_MASTER_PASSWORD || 'DevPassword@123',
};

const SAMPLE_CLIENTS = [
  {
    pan: 'ABCPK1234E',
    assesseeType: AssesseeType.INDIVIDUAL,
    fullName: 'Priya Kapoor',
    dateOfBirth: new Date('1988-04-15'),
    mobileNumber: '9876543210',
    email: 'priya.kapoor@email.com',
    address: '12, Sunrise Apartments, Andheri West, Mumbai - 400058',
    portalUsername: 'ABCPK1234E',
    portalPasswordPlain: 'Portal@Priya1',
    aadhaarNumber: '234567890123',
    bankAccounts: [
      {
        bankName: 'HDFC Bank',
        accountNumber: '00112233445566',
        ifscCode: 'HDFC0001234',
        accountType: 'SAVINGS' as const,
        isPrimary: true,
      },
    ],
  },
  {
    pan: 'BCDRS5678F',
    assesseeType: AssesseeType.INDIVIDUAL,
    fullName: 'Suresh Rathi',
    dateOfBirth: new Date('1975-11-22'),
    mobileNumber: '9988776655',
    email: 'suresh.rathi@business.com',
    address: '45, Patel Nagar, Ahmedabad, Gujarat - 380009',
    portalUsername: 'BCDRS5678F',
    portalPasswordPlain: 'Portal@Suresh2',
    aadhaarNumber: '345678901234',
    bankAccounts: [
      {
        bankName: 'SBI',
        accountNumber: '11223344556677',
        ifscCode: 'SBIN0005432',
        accountType: 'SAVINGS' as const,
        isPrimary: true,
      },
      {
        bankName: 'ICICI Bank',
        accountNumber: '22334455667788',
        ifscCode: 'ICIC0009876',
        accountType: 'CURRENT' as const,
        isPrimary: false,
      },
    ],
  },
  {
    pan: 'CDEFG3456H',
    assesseeType: AssesseeType.HUF,
    fullName: 'Gupta HUF',
    dateOfBirth: new Date('2005-01-01'), // date of formation
    mobileNumber: '9123456789',
    email: 'gupta.huf@gmail.com',
    address: '78, Gandhi Road, Jaipur, Rajasthan - 302001',
    portalUsername: 'CDEFG3456H',
    portalPasswordPlain: 'Portal@GuptaHUF3',
    bankAccounts: [
      {
        bankName: 'Kotak Mahindra Bank',
        accountNumber: '33445566778899',
        ifscCode: 'KKBK0004321',
        accountType: 'SAVINGS' as const,
        isPrimary: true,
      },
    ],
  },
  {
    pan: 'DEFPL7890J',
    assesseeType: AssesseeType.DOMESTIC_COMPANY,
    fullName: 'Patel Logistics Pvt Ltd',
    dateOfBirth: new Date('2010-07-14'), // date of incorporation
    mobileNumber: '9234567890',
    email: 'accounts@patellogistics.in',
    address: '156, GIDC Industrial Estate, Vadodara, Gujarat - 390010',
    portalUsername: 'DEFPL7890J',
    portalPasswordPlain: 'Portal@PatelCo4',
    bankAccounts: [
      {
        bankName: 'Axis Bank',
        accountNumber: '44556677889900',
        ifscCode: 'UTIB0003210',
        accountType: 'CURRENT' as const,
        isPrimary: true,
      },
    ],
  },
  {
    pan: 'EFGSH2345K',
    assesseeType: AssesseeType.FIRM,
    fullName: 'Shah & Sons',
    dateOfBirth: new Date('2008-03-10'),
    mobileNumber: '9345678901',
    email: 'shahsons@firm.com',
    address: '23, Commercial Complex, Borivali East, Mumbai - 400066',
    portalUsername: 'EFGSH2345K',
    portalPasswordPlain: 'Portal@ShahFirm5',
    bankAccounts: [
      {
        bankName: 'Bank of Baroda',
        accountNumber: '55667788991011',
        ifscCode: 'BARB0BORIVE',
        accountType: 'CURRENT' as const,
        isPrimary: true,
      },
    ],
  },
];

// ─── Main Seed Function ───────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Starting TaxFlow Pro seed...');

  // 1. Firm
  console.log('  → Creating firm...');
  const firm = await prisma.firm.upsert({
    where: { id: 1 },
    update: {},
    create: FIRM,
  });

  // 2. Admin user
  console.log('  → Creating admin user...');
  await prisma.user.upsert({
    where: { username: ADMIN_USER.username },
    update: {},
    create: {
      firmId: firm.id,
      username: ADMIN_USER.username,
      displayName: ADMIN_USER.displayName,
      role: ADMIN_USER.role,
      passwordHash: hashPassword(ADMIN_USER.password),
      isActive: true,
    },
  });

  // 3. Derive vault key for encrypting portal passwords
  const vaultKey = deriveSeedVaultKey();

  // 4. App settings
  console.log('  → Writing app settings...');
  await prisma.appSetting.upsert({
    where: { key: 'isSetupComplete' },
    update: {},
    create: { key: 'isSetupComplete', value: 'true' },
  });
  await prisma.appSetting.upsert({
    where: { key: 'defaultRegime' },
    update: {},
    create: { key: 'defaultRegime', value: 'NEW' },
  });

  // 5. Sample clients with bank accounts and returns
  console.log('  → Creating sample clients...');
  const ay1 = currentAY();
  const ay2 = previousAY();

  for (const clientData of SAMPLE_CLIENTS) {
    const { bankAccounts, portalPasswordPlain, ...clientFields } = clientData;

    const existing = await prisma.client.findUnique({ where: { pan: clientFields.pan } });
    if (existing) {
      console.log(`     Skipping existing client: ${clientFields.pan}`);
      continue;
    }

    const client = await prisma.client.create({
      data: {
        firmId: firm.id,
        ...clientFields,
        portalPasswordEncrypted: encryptPortalPassword(portalPasswordPlain, vaultKey),
        isActive: true,
      },
    });

    // Bank accounts
    for (const bank of bankAccounts) {
      await prisma.bankAccount.create({
        data: { clientId: client.id, ...bank },
      });
    }

    // Assessment years
    const ayRecord1 = await prisma.assessmentYear.create({
      data: {
        clientId: client.id,
        ayLabel: ay1,
        regime: 'NEW',
        filingType: FilingType.ORIGINAL,
      },
    });

    const ayRecord2 = await prisma.assessmentYear.create({
      data: {
        clientId: client.id,
        ayLabel: ay2,
        regime: 'OLD',
        filingType: FilingType.ORIGINAL,
      },
    });

    // Current AY return — in progress
    await prisma.return.create({
      data: {
        clientId: client.id,
        assessmentYearId: ayRecord1.id,
        status: ReturnStatus.IN_PROGRESS,
        filingType: FilingType.ORIGINAL,
        formType: clientFields.assesseeType === AssesseeType.INDIVIDUAL ||
                  clientFields.assesseeType === AssesseeType.HUF
                  ? 'ITR-1'
                  : 'ITR-6',
      },
    });

    // Previous AY return — filed
    await prisma.return.create({
      data: {
        clientId: client.id,
        assessmentYearId: ayRecord2.id,
        status: ReturnStatus.FILED,
        filingType: FilingType.ORIGINAL,
        formType: 'ITR-1',
        filedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        acknowledgementNumber: `ACK${Math.floor(Math.random() * 900000000 + 100000000)}`,
      },
    });

    console.log(`     ✓ ${clientFields.pan} — ${clientFields.fullName}`);
  }

  // 6. Audit log entry for seed
  await prisma.auditLog.create({
    data: {
      firmId: firm.id,
      action: 'SEED',
      entity: 'SYSTEM',
      description: 'Database seeded by prisma/seed.ts',
      ipAddress: '127.0.0.1',
    },
  });

  console.log('✅  Seed complete.\n');
  console.log('   Login credentials:');
  console.log(`   Username : ${ADMIN_USER.username}`);
  console.log(`   Password : ${ADMIN_USER.password}`);
  console.log(`   Master PW: ${ADMIN_USER.password}  (vault unlock)\n`);
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
