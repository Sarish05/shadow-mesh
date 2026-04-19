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
  identityPublicKey: string;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  signingPublicKey: string;
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
  removeContact: (pseudoId: string) => void;
  deleteMessage: (id: string) => void;
  clearChannelMessages: (channelToken: string) => void;
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
      deleteMessage: (id) => set((s) => ({ messages: s.messages.filter(m => m.id !== id) })),
      clearChannelMessages: (channelToken) => set((s) => ({ messages: s.messages.filter(m => !((m.isMine && m.senderToken === channelToken) || (!m.isMine && m.senderToken === channelToken))) })), 
      removeContact: (pseudoId) => set((s) => ({
        contacts: s.contacts.filter(c => c.pseudoId !== pseudoId),
        activeContactId: s.activeContactId === pseudoId ? null : s.activeContactId,
        messages: s.messages.filter(m => s.contacts.find(c => c.pseudoId === pseudoId)?.relayToken !== m.senderToken)
      })),
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



