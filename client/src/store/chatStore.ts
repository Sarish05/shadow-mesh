import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  status?: 'sending' | 'sent' | 'delivered';
}

export interface Contact {
  pseudoId: string;
  dhPublicKey: string;
  relayToken?: string;
  displayName?: string;
  lastSeen?: number;
}

interface ChatState {
  messages: ChatMessage[];
  contacts: Contact[];
  activeContactId: string | null;
  addMessage: (msg: ChatMessage) => void;
  updateMessageStatus: (id: string, status: 'sending' | 'sent' | 'delivered') => void;
  expireMessages: () => void;
  addContact: (contact: Contact) => void;
  setActiveContact: (pseudoId: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      contacts: [],
      activeContactId: null,

      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

      updateMessageStatus: (id, status) => set((s) => ({
        messages: s.messages.map(m => m.id === id ? { ...m, status } : m)
      })),

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
    }),
    {
      name: 'shadow-mesh-chat-storage',
      // We only persist contacts and active contact, and messages that are not expired.
      // Audio blobs might be lost on reload as they are object URLs, but text works.
      partialize: (state) => ({
        ...state,
        messages: state.messages.filter(m => m.expiresAt === 0 || m.expiresAt > Date.now()),
      }),
    }
  )
);
