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

  // Always look up from DB — JWT metadata is unreliable across sessions
  try {
    const member = await prisma.firmMember.findUnique({
      where: { supabaseUid: user.id },
    });

    if (!member) return null;

    return {
      supabaseUid: user.id,
      firmId: member.firmId,
      displayName: member.displayName,
      role: member.role,
    };
  } catch (e) {
    console.error('[getAuthContext] DB lookup failed:', e);
    return null;
  }
}
