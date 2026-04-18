import { create } from 'zustand';
import { type Identity, generateIdentity, saveIdentity, loadIdentity } from '../crypto/identity';

interface IdentityState {
  identity: Identity | null;
  relayToken: string | null;
  isOnboarded: boolean;
  createIdentity: () => Identity;
  restoreIdentity: () => Identity | null;
  setRelayToken: (token: string) => void;
  reset: () => void;
}

export const useIdentityStore = create<IdentityState>((set) => ({
  identity: null,
  relayToken: null,
  isOnboarded: false,

  createIdentity: () => {
    const identity = generateIdentity();
    saveIdentity(identity);
    set({ identity, isOnboarded: true });
    return identity;
  },

  restoreIdentity: () => {
    const identity = loadIdentity();
    if (identity) set({ identity, isOnboarded: true });
    return identity;
  },

  setRelayToken: (relayToken) => set({ relayToken }),

  reset: () => {
    localStorage.clear();
    set({ identity: null, relayToken: null, isOnboarded: false });
  },
}));
