import { create } from 'zustand';
import { fuzzyTimestamp, hashId } from '../crypto/commitment';

export interface AuditEntry {
  actorHash: string;    // SHA-256 of session token
  action: string;
  channelHash: string;
  fuzzyTs: number;
  commitment: string;
}

interface AuditState {
  entries: AuditEntry[];
  addEntry: (sessionToken: string, action: string, channelId: string, commitment: string) => Promise<void>;
}

export const useAuditStore = create<AuditState>((set) => ({
  entries: [],

  addEntry: async (sessionToken, action, channelId, commitment) => {
    const [actorHash, channelHash] = await Promise.all([
      hashId(sessionToken),
      hashId(channelId),
    ]);
    const entry: AuditEntry = {
      actorHash,
      action,
      channelHash,
      fuzzyTs: fuzzyTimestamp(),
      commitment,
    };
    set((s) => ({ entries: [...s.entries, entry] }));
  },
}));
