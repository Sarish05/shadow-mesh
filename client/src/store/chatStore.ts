import { create } from 'zustand';
import { type ContentType } from '../crypto/encrypt';

export interface ChatMessage {
  id: string;
  senderToken: string;
  contentType: ContentType;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  timestamp: number;
  expiresAt: number;
  isMine: boolean;
  commitment: string;
}

export interface Contact {
  pseudoId: string;
  dhPublicKey: string;
  relayToken?: string;
  displayName?: string;
}

interface ChatState {
  messages: ChatMessage[];
  contacts: Contact[];
  activeContactId: string | null;
  addMessage: (msg: ChatMessage) => void;
  expireMessages: () => void;
  addContact: (contact: Contact) => void;
  setActiveContact: (pseudoId: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  contacts: [],
  activeContactId: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  expireMessages: () => {
    const now = Date.now();
    set((s) => ({ messages: s.messages.filter(m => m.expiresAt === 0 || m.expiresAt > now) }));
  },

  addContact: (contact) =>
    set((s) => ({
      contacts: [...s.contacts.filter(c => c.pseudoId !== contact.pseudoId), contact],
    })),

  setActiveContact: (pseudoId) => set({ activeContactId: pseudoId }),

  clearMessages: () => set({ messages: [] }),
}));
