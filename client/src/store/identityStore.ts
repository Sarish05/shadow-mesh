import { create } from 'zustand';
import { type Identity, generateIdentity, saveIdentity, loadIdentity } from '../crypto/identity';
import { clearSecureStore, getSecureRecord, setSecureRecord } from '../crypto/secureStorage';

const RELAY_TOKEN_KEY = 'relay_token';

interface IdentityState {
  identity: Identity | null;
  relayToken: string | null;
  isOnboarded: boolean;
  createIdentity: () => Promise<Identity>;
  restoreIdentity: () => Promise<Identity | null>;
  setRelayToken: (token: string) => Promise<void>;
  reset: () => Promise<void>;
}

export const useIdentityStore = create<IdentityState>((set) => ({
  identity: null,
  relayToken: null,
  isOnboarded: false,

  createIdentity: async () => {
    const identity = generateIdentity();
    await saveIdentity(identity);
    set({ identity, isOnboarded: true });
    return identity;
  },

  restoreIdentity: async () => {
    const identity = await loadIdentity();
    const storedToken = await getSecureRecord<string>(RELAY_TOKEN_KEY);
    const legacyToken = localStorage.getItem('shadow_mesh_relay_token');
    const existingToken = storedToken || legacyToken;
    if (identity) {
      set({ identity, isOnboarded: true });
      if (existingToken) {
        set({ relayToken: existingToken });
        if (!storedToken) await setSecureRecord(RELAY_TOKEN_KEY, existingToken);
        localStorage.removeItem('shadow_mesh_relay_token');
      }
    }
    return identity;
  },

  setRelayToken: async (relayToken) => {
    await setSecureRecord(RELAY_TOKEN_KEY, relayToken);
    localStorage.removeItem('shadow_mesh_relay_token');
    set({ relayToken });
  },

  reset: async () => {
    await clearSecureStore();
    localStorage.removeItem('sm_identity');
    localStorage.removeItem('shadow_mesh_relay_token');
    set({ identity: null, relayToken: null, isOnboarded: false });
  },
}));
