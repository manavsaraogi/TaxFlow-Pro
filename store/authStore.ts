import { create } from 'zustand';
import { createClient } from '@/lib/supabase';

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  firmId: number;
  firmName: string;
}

interface AuthState {
  user: UserInfo | null;
  isLoggedIn: boolean;
  firmName: string;
  loading: boolean;

  setUser: (user: UserInfo | null) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoggedIn: false,
  firmName: 'TaxFlow Pro',
  loading: true,

  setUser: (user) =>
    set({
      user,
      isLoggedIn: !!user,
      firmName: user?.firmName ?? 'TaxFlow Pro',
      loading: false,
    }),

  logout: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, isLoggedIn: false, firmName: 'TaxFlow Pro' });
  },

  refreshUser: async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      set({ user: null, isLoggedIn: false, loading: false });
      return;
    }

    const meta = user.user_metadata;
    set({
      user: {
        id: user.id,
        email: user.email ?? '',
        name: meta?.display_name ?? user.email ?? '',
        role: meta?.role ?? 'STAFF',
        firmId: meta?.firm_id ?? 0,
        firmName: meta?.firm_name ?? 'TaxFlow Pro',
      },
      isLoggedIn: true,
      firmName: meta?.firm_name ?? 'TaxFlow Pro',
      loading: false,
    });
  },
}));
