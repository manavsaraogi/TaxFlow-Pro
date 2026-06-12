import { createServerSupabaseClient } from './supabase-server';

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

  const firmId = user.user_metadata?.firm_id as number | undefined;
  if (!firmId) return null;

  return {
    supabaseUid: user.id,
    firmId,
    displayName: user.user_metadata?.display_name ?? user.email ?? '',
    role: user.user_metadata?.role ?? 'STAFF',
  };
}
