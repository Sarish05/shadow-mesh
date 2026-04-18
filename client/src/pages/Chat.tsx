import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentityStore } from '../store/identityStore';
import { useChatStore, type Contact } from '../store/chatStore';
import { useAuditStore } from '../store/auditStore';
import { useSocket } from '../hooks/useSocket';
import { encryptPayload } from '../crypto/encrypt';
import { getOrCreateSession } from '../crypto/session';
import { textToBytes, normalizeImage, normalizeAudio } from '../crypto/normalize';
import { generateCommitment } from '../crypto/commitment';
import AddContact from '../components/AddContact';
import MessageBubble from '../components/MessageBubble';
import { v4 as uuidv4 } from 'uuid';
import {
  Send, ImageIcon, Mic, MicOff, UserPlus, ShieldCheck,
  Copy, LayoutDashboard, LogOut, Clock, ChevronRight,
  Radio, Lock,
} from 'lucide-react';

const TTL_OPTIONS = [
  { label: '∞  No expiry', value: 0 },
  { label: '⏱ 30 seconds', value: 30_000 },
  { label: '⏱ 5 minutes', value: 300_000 },
  { label: '⏱ 1 hour', value: 3_600_000 },
];

interface Props {
  onShowDashboard: () => void;
  onLogout: () => void;
}

export default function Chat({ onShowDashboard, onLogout }: Props) {
  const { identity, relayToken } = useIdentityStore();
  const { messages, contacts, activeContactId, addMessage, setActiveContact, expireMessages } = useChatStore();
  const { addEntry } = useAuditStore();
  const { sendPacket } = useSocket();

  const [text, setText] = useState('');
  const [ttl, setTtl] = useState(0);
  const [showAddContact, setShowAddContact] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeContact = contacts.find(c => c.pseudoId === activeContactId) ?? null;
  const channelMessages = messages.filter(
    m => activeContact && (m.senderToken === activeContact.relayToken || m.isMine)
  );

  useEffect(() => {
    const t = setInterval(expireMessages, 1000);
    return () => clearInterval(t);
  }, [expireMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length]);

  const getSession = useCallback(async (contact: Contact) => {
    if (!identity) throw new Error('No identity');
    const channelId = [identity.pseudoId, contact.pseudoId].sort().join(':');
    return { session: await getOrCreateSession(identity.dhSecretKey, contact.dhPublicKey, channelId), channelId };
  }, [identity]);

  async function sendText() {
    if (!text.trim() || !activeContact || !identity || !relayToken) return;
    if (!activeContact.relayToken) { alert('Share your relay token with this contact first.'); return; }
    const { session, channelId } = await getSession(activeContact);
    const payload = textToBytes(text.trim());
    const packet = await encryptPayload(session.key, 'text', payload, ttl);
    const commitment = await generateCommitment(relayToken, 'text_message', payload.length);
    sendPacket({ recipientToken: activeContact.relayToken, encryptedBlob: packet, action: 'message' });
    addMessage({ id: uuidv4(), senderToken: relayToken, contentType: 'text', text: text.trim(), timestamp: Date.now(), expiresAt: ttl > 0 ? Date.now() + ttl : 0, isMine: true, commitment });
    await addEntry(relayToken, 'text_message', channelId, commitment);
    setText('');
  }

  async function sendImage(file: File) {
    if (!activeContact?.relayToken || !identity || !relayToken) return;
    const normalized = await normalizeImage(file);
    const { session, channelId } = await getSession(activeContact);
    const packet = await encryptPayload(session.key, 'image', normalized, ttl);
    const commitment = await generateCommitment(relayToken, 'image_message', normalized.length);
    sendPacket({ recipientToken: activeContact.relayToken, encryptedBlob: packet, action: 'message' });
    const safeNorm = new Uint8Array(normalized.length); safeNorm.set(normalized);
    addMessage({ id: uuidv4(), senderToken: relayToken, contentType: 'image', imageUrl: URL.createObjectURL(new Blob([safeNorm], { type: 'image/jpeg' })), timestamp: Date.now(), expiresAt: ttl > 0 ? Date.now() + ttl : 0, isMine: true, commitment });
    await addEntry(relayToken, 'image_message', channelId, commitment);
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = e => chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      await sendVoice(new Blob(chunks, { type: 'audio/webm;codecs=opus' }));
    };
    mr.start(); setMediaRecorder(mr); setRecording(true);
  }

  function stopRecording() { mediaRecorder?.stop(); setRecording(false); setMediaRecorder(null); }

  async function sendVoice(blob: Blob) {
    if (!activeContact?.relayToken || !identity || !relayToken) return;
    const normalized = await normalizeAudio(blob);
    const { session, channelId } = await getSession(activeContact);
    const packet = await encryptPayload(session.key, 'voice', normalized, ttl);
    const commitment = await generateCommitment(relayToken, 'voice_message', normalized.length);
    sendPacket({ recipientToken: activeContact.relayToken, encryptedBlob: packet, action: 'message' });
    addMessage({ id: uuidv4(), senderToken: relayToken, contentType: 'voice', audioUrl: URL.createObjectURL(blob), timestamp: Date.now(), expiresAt: ttl > 0 ? Date.now() + ttl : 0, isMine: true, commitment });
    await addEntry(relayToken, 'voice_message', channelId, commitment);
  }

  function copyToken() {
    if (relayToken) { navigator.clipboard.writeText(relayToken); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div className="flex h-screen bg-[#020409] grid-bg overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-72 border-r border-emerald-900/30 flex flex-col bg-[#040810]">
        {/* Identity card */}
        <div className="p-4 border-b border-emerald-900/30">
          <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[10px] text-emerald-600 uppercase tracking-widest">Active Identity</span>
            </div>
            <div className="font-mono text-lg font-bold text-emerald-400 tracking-widest text-glow mb-2">
              {identity?.pseudoId}
            </div>
            <button
              onClick={copyToken}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 hover:text-emerald-400 transition-colors group"
            >
              <Copy className="w-3 h-3 group-hover:text-emerald-400" />
              {copied ? <span className="text-emerald-400">Copied!</span> : 'Copy relay token'}
            </button>
          </div>
        </div>

        {/* Contacts list */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">Contacts</span>
            <button
              onClick={() => setShowAddContact(true)}
              className="flex items-center gap-1 text-slate-600 hover:text-emerald-400 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {contacts.length === 0 ? (
            <div className="text-center py-8 px-2">
              <Radio className="w-6 h-6 text-slate-700 mx-auto mb-2" />
              <p className="font-mono text-[11px] text-slate-700">No contacts on network.</p>
              <p className="font-mono text-[10px] text-slate-800 mt-1">Add by Operational ID</p>
            </div>
          ) : (
            contacts.map(c => (
              <button
                key={c.pseudoId}
                onClick={() => setActiveContact(c.pseudoId)}
                className={`w-full text-left px-3 py-3 rounded-xl mb-1 transition-all group ${
                  activeContactId === c.pseudoId
                    ? 'bg-emerald-900/30 border border-emerald-700/40'
                    : 'hover:bg-slate-900/50 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm font-bold text-emerald-400 tracking-widest">{c.pseudoId}</div>
                    <div className="font-mono text-[10px] text-slate-700 mt-0.5">
                      {c.relayToken ? `token: ${c.relayToken.slice(0, 8)}...` : 'no relay token'}
                    </div>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 transition-colors ${activeContactId === c.pseudoId ? 'text-emerald-600' : 'text-slate-800 group-hover:text-slate-600'}`} />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Bottom nav */}
        <div className="p-3 border-t border-emerald-900/30 space-y-1">
          <button onClick={onShowDashboard} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20 transition-all text-sm font-mono">
            <LayoutDashboard className="w-4 h-4" />AUDIT DASHBOARD
          </button>
          <button onClick={onLogout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-900/10 transition-all text-sm font-mono">
            <LogOut className="w-4 h-4" />CLEAR IDENTITY
          </button>
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeContact ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-emerald-900/20 border border-emerald-900/40 flex items-center justify-center mx-auto">
                <Lock className="w-9 h-9 text-emerald-800" />
              </div>
              <div>
                <p className="font-mono text-slate-500 text-sm">SELECT A CONTACT TO BEGIN</p>
                <p className="font-mono text-slate-700 text-xs mt-1">All comms are end-to-end encrypted</p>
              </div>
              <div className="flex items-center justify-center gap-2 font-mono text-[10px] text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-800 inline-block" />AES-256-GCM
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-800 inline-block" />X25519-ECDH
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-800 inline-block" />DUAL-RELAY
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-16 border-b border-emerald-900/30 px-5 flex items-center justify-between bg-[#040810]/80 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-900/30 border border-emerald-800/40 flex items-center justify-center">
                  <span className="font-mono text-sm font-bold text-emerald-400">{activeContact.pseudoId.slice(0, 2)}</span>
                </div>
                <div>
                  <div className="font-mono font-bold text-emerald-300 tracking-widest text-sm">{activeContact.pseudoId}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span className="font-mono text-[10px] text-emerald-700">E2E ENCRYPTED · AES-256-GCM · X25519 SESSION KEY</span>
                  </div>
                </div>
              </div>

              {/* TTL selector */}
              <div className="flex items-center gap-2 bg-[#070d11] border border-slate-800 rounded-lg px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                <select
                  value={ttl}
                  onChange={e => setTtl(Number(e.target.value))}
                  className="bg-transparent text-slate-400 font-mono text-xs focus:outline-none cursor-pointer"
                >
                  {TTL_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-[#0a0f14]">{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-4 px-4">
              {channelMessages.length === 0 && (
                <div className="text-center py-12">
                  <div className="font-mono text-xs text-slate-700 space-y-1">
                    <p>[ SECURE CHANNEL ESTABLISHED ]</p>
                    <p>[ SESSION KEY DERIVED VIA X25519-ECDH ]</p>
                    <p>[ WAITING FOR FIRST TRANSMISSION ]</p>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {channelMessages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div className="border-t border-emerald-900/30 p-4 bg-[#040810]/80 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ''; }}
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 rounded-xl bg-[#070d11] border border-slate-800 hover:border-emerald-700/50 flex items-center justify-center text-slate-600 hover:text-emerald-400 transition-all"
                  title="Send encrypted image"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>

                <button
                  onClick={recording ? stopRecording : startRecording}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
                    recording
                      ? 'bg-red-900/40 border-red-700/50 text-red-400 animate-pulse'
                      : 'bg-[#070d11] border-slate-800 hover:border-emerald-700/50 text-slate-600 hover:text-emerald-400'
                  }`}
                  title={recording ? 'Stop recording' : 'Record voice note'}
                >
                  {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <div className="flex-1 relative">
                  <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendText())}
                    placeholder="Compose encrypted message..."
                    className="w-full bg-[#070d11] border border-slate-800 focus:border-emerald-700/60 rounded-xl px-4 py-2.5 text-white text-sm font-mono placeholder:text-slate-700 focus:outline-none transition-colors"
                  />
                </div>

                <button
                  onClick={sendText}
                  disabled={!text.trim()}
                  className="w-10 h-10 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {recording && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-center gap-2 mt-2 px-1"
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono text-[11px] text-red-500">RECORDING · CBR OPUS · Click mic to send</span>
                </motion.div>
              )}

              {/* Encryption status bar */}
              <div className="flex items-center gap-3 mt-2 px-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-mono text-[10px] text-slate-700">AES-256-GCM</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  <span className="font-mono text-[10px] text-slate-700">DUAL RELAY ACTIVE</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                  <span className="font-mono text-[10px] text-slate-700">IP MASKED</span>
                </div>
                <div className="ml-auto font-mono text-[10px] text-slate-800">
                  {ttl > 0 ? `EPHEMERAL · ${TTL_OPTIONS.find(o => o.value === ttl)?.label.replace('⏱ ', '')}` : 'PERSISTENT'}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {showAddContact && <AddContact onClose={() => setShowAddContact(false)} />}
      </AnimatePresence>
    </div>
  );
}
