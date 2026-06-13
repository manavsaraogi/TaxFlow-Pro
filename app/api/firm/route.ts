import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { prisma } from '@/lib/prisma';

// POST /api/firm — called on first login to provision firm + member record
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if this user already has a firm
  const existing = await prisma.firmMember.findUnique({
    where: { supabaseUid: user.id },
    include: { firm: true },
  });

  if (existing) {
    // Always re-stamp metadata so firm_id is present in the JWT even after re-login
    await supabase.auth.updateUser({
      data: { firm_id: existing.firmId, firm_name: existing.firm.name, role: existing.role },
    });
    return NextResponse.json({ data: { firmId: existing.firmId, firmName: existing.firm.name } });
  }

  const meta = user.user_metadata;
  const firmName: string = meta?.firm_name ?? 'My Firm';
  const displayName: string = meta?.display_name ?? user.email ?? '';

  // Create firm and member in a transaction
  const member = await prisma.$transaction(async (tx) => {
    const firm = await tx.firm.create({
      data: { name: firmName, email: user.email },
    });

    return tx.firmMember.create({
      data: {
        firmId: firm.id,
        supabaseUid: user.id,
        displayName,
        role: 'ADMIN',
      },
      include: { firm: true },
    });
  });

  // Update Supabase user metadata with the new firm_id
  await supabase.auth.updateUser({
    data: { firm_id: member.firmId, firm_name: firmName, role: 'ADMIN' },
  });

  return NextResponse.json({ data: { firmId: member.firmId, firmName: member.firm.name } });
}

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const member = await prisma.firmMember.findUnique({
    where: { supabaseUid: user.id },
    include: { firm: true },
  });

  if (!member) return NextResponse.json({ error: 'Firm not found' }, { status: 404 });

  return NextResponse.json({ data: member.firm });
}
