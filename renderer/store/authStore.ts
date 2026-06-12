// File: renderer/store/authStore.ts

import { create } from 'zustand';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  firmId: string;
  firmName: string;
}

interface AuthState {
  isSetupRequired: boolean | null;
  isVaultUnlocked: boolean;
  isLoggedIn: boolean;
  user: UserInfo | null;
  firmName: string;
  
  setSetupRequired: (required: boolean) => void;
  setVaultUnlocked: (unlocked: boolean) => void;
  setUser: (user: UserInfo | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isSetupRequired: null,
  isVaultUnlocked: false,
  isLoggedIn: false,
  user: null,
  firmName: 'TaxFlow Pro',

  setSetupRequired: (required) => set({ isSetupRequired: required }),
  setVaultUnlocked: (unlocked) => set({ isVaultUnlocked: unlocked }),
  setUser: (user) => set({ user, isLoggedIn: !!user, firmName: user?.firmName || 'TaxFlow Pro' }),
  logout: () => {
    if (typeof window !== 'undefined') {
      window.taxflow?.auth.lock();
    }
    set({ user: null, isLoggedIn: false, isVaultUnlocked: false });
  },
}));
