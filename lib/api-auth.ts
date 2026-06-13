import { createServerSupabaseClient } from './supabase-server';
import { prisma } from './prisma';

export interface AuthContext {
  supabaseUid: string;
  firmId: number;
  displayName: string;
  role: string;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Try metadata first (fast path, no DB hit)
  const metaFirmId = user.user_metadata?.firm_id as number | undefined;

  if (metaFirmId) {
    return {
      supabaseUid: user.id,
      firmId: metaFirmId,
      displayName: user.user_metadata?.display_name ?? user.email ?? '',
      role: user.user_metadata?.role ?? 'STAFF',
    };
  }

  // Fallback: look up from DB (covers the case where metadata hasn't propagated yet)
  try {
    const member = await prisma.firmMember.findUnique({
      where: { supabaseUid: user.id },
      include: { firm: true },
    });

    if (!member) return null;

    return {
      supabaseUid: user.id,
      firmId: member.firmId,
      displayName: member.displayName,
      role: member.role,
    };
  } catch (e) {
    console.error('[getAuthContext] DB fallback failed:', e);
    return null;
  }
}
