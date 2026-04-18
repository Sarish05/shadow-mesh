import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentityStore } from '../store/identityStore';
import { useChatStore, type Contact } from '../store/chatStore';
import { useAuditStore } from '../store/auditStore';
import { useSocket } from '../hooks/useSocket';
import { encryptPayload, type EncryptedPacket } from '../crypto/encrypt';
import { getOrCreateSession } from '../crypto/session';
import { textToBytes, normalizeImage, normalizeAudio } from '../crypto/normalize';
import { generateCommitment } from '../crypto/commitment';
import AddContact from '../components/AddContact';
import MessageBubble from '../components/MessageBubble';
import MyProfile from '../components/MyProfile';
import { v4 as uuidv4 } from 'uuid';
import {
  Send, ImageIcon, Mic, UserPlus, ShieldCheck,
  LayoutDashboard, LogOut, Clock, Lock,
  QrCode, Key, Radio, Plus, ChevronRight
} from 'lucide-react';

const TTL_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30s', value: 30_000 },
  { label: '5m', value: 300_000 },
  { label: '1h', value: 3_600_000 },
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
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
      textAreaRef.current.style.height = Math.min(textAreaRef.current.scrollHeight, 120) + 'px';
    }
  }, [text]);

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
    const msgId = uuidv4();
    const packet = await encryptPayload(session.key, 'text', payload, ttl);
    const packetWithId: EncryptedPacket & { msgId: string } = { ...packet, msgId };
    const commitment = await generateCommitment(relayToken, 'text_message', payload.length);
    const createdAt = new Date().getTime();
    sendPacket({ recipientToken: activeContact.relayToken, encryptedBlob: packetWithId, action: 'text_message', commitment });
    addMessage({ id: msgId, senderToken: relayToken, contentType: 'text', text: text.trim(), timestamp: createdAt, expiresAt: ttl > 0 ? createdAt + ttl : 0, isMine: true, commitment, status: 'sent' });
    await addEntry(relayToken, 'text_message', channelId, commitment);
    setText('');
  }

  async function sendImage(file: File) {
    if (!activeContact?.relayToken || !identity || !relayToken) return;
    const normalized = await normalizeImage(file);
    const { session, channelId } = await getSession(activeContact);
    const msgId = uuidv4();
    const packet = await encryptPayload(session.key, 'image', normalized, ttl);
    const packetWithId: EncryptedPacket & { msgId: string } = { ...packet, msgId };
    const commitment = await generateCommitment(relayToken, 'image_message', normalized.length);
    const createdAt = new Date().getTime();
    sendPacket({ recipientToken: activeContact.relayToken, encryptedBlob: packetWithId, action: 'image_message', commitment });
    const safeNorm = new Uint8Array(normalized.length); safeNorm.set(normalized);
    addMessage({ id: msgId, senderToken: relayToken, contentType: 'image', imageUrl: URL.createObjectURL(new Blob([safeNorm], { type: 'image/jpeg' })), timestamp: createdAt, expiresAt: ttl > 0 ? createdAt + ttl : 0, isMine: true, commitment, status: 'sent' });
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
    const msgId = uuidv4();
    const packet = await encryptPayload(session.key, 'voice', normalized, ttl);
    const packetWithId: EncryptedPacket & { msgId: string } = { ...packet, msgId };
    const commitment = await generateCommitment(relayToken, 'voice_message', normalized.length);
    const createdAt = new Date().getTime();
    sendPacket({ recipientToken: activeContact.relayToken, encryptedBlob: packetWithId, action: 'voice_message', commitment });
    addMessage({ id: msgId, senderToken: relayToken, contentType: 'voice', audioUrl: URL.createObjectURL(blob), timestamp: createdAt, expiresAt: ttl > 0 ? createdAt + ttl : 0, isMine: true, commitment, status: 'sent' });
    await addEntry(relayToken, 'voice_message', channelId, commitment);
  }

  return (
    <div className="chat-app">

      {/* ── SIDEBAR ─────────────────────────────────────── */}
      <div className="chat-sidebar">

        {/* User profile section */}
        <div className="sidebar-profile">
            <div className="avatar">
              {identity?.pseudoId.slice(0, 2)}
            </div>
            <div>
              <div className="sidebar-name">{identity?.pseudoId}</div>
              <div className="sidebar-status">
                <div className="status-dot" />
                <span>Connected to Relay</span>
              </div>
            </div>
            <button
              onClick={() => setShowMyProfile(true)}
              className="sidebar-profile-button"
              title="Show Profile & Identity"
            >
              <QrCode className="w-4 h-4" />
            </button>
        </div>

        {/* Contacts Header */}
        <div className="contacts-header">
          <span className="contacts-title">
            <Radio className="w-3.5 h-3.5" /> Secure Contacts
          </span>
          <button
            onClick={() => setShowAddContact(true)}
            className="contact-add-button"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Contacts List */}
        <div className="contacts-list">
          {contacts.length === 0 ? (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon">
                <UserPlus className="w-6 h-6" />
              </div>
              <p className="sidebar-empty-title">No connections yet.</p>
              <p className="sidebar-empty-copy">Add a contact to start an encrypted channel.</p>
            </div>
          ) : (
            contacts.map(c => (
              <button
                key={c.pseudoId}
                onClick={() => setActiveContact(c.pseudoId)}
                className={`contact-row ${activeContactId === c.pseudoId ? 'active' : ''}`}
              >
                <div className="relative shrink-0">
                  <div className="contact-avatar">
                    {c.pseudoId.slice(0, 2)}
                  </div>
                  {c.relayToken && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--success)] border-2 border-[var(--bg-surface)]" />
                  )}
                </div>
                <div>
                  <div className="contact-name">
                    {c.pseudoId}
                  </div>
                  <div className="contact-meta">
                    {c.relayToken ? 'E2E Secured' : 'No Relay'}
                  </div>
                </div>
                <ChevronRight />
              </button>
            ))
          )}
        </div>

        {/* Nav Footer */}
        <div className="sidebar-footer">
          <button
            onClick={onShowDashboard}
            className="sidebar-nav-button"
          >
            <LayoutDashboard className="w-4 h-4" /> Audit Logs
          </button>
          <button
            onClick={onLogout}
            className="sidebar-nav-button danger"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>


      {/* ── MAIN CHAT AREA ──────────────────────────────── */}
      <div className="chat-main">

        {!activeContact ? (
          <div className="chat-empty">
            <div className="chat-empty-card">
              <div className="empty-icon">
                <Lock />
              </div>
              <h2 className="empty-title">Shadow Mesh</h2>
              <p className="empty-copy">
                Select a contact to begin secure communication. All messages are end-to-end encrypted locally.
              </p>
              <div className="proof-grid">
                  <MiniProof icon={<ShieldCheck />} label="Local encryption" />
                  <MiniProof icon={<Key />} label="Zero relay access" />
                  <MiniProof icon={<Radio />} label="Audit ready" />
              </div>
              <button onClick={() => setShowAddContact(true)} className="app-button primary">
                <Plus className="w-4 h-4" /> New Connection
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="chat-header">
              <div className="chat-header-person">
                <div className="chat-header-avatar">
                  {activeContact.pseudoId.slice(0, 2)}
                </div>
                <div>
                  <div className="chat-header-name">{activeContact.pseudoId}</div>
                  <div className="chat-header-meta">
                    <ShieldCheck className="w-3 h-3 text-[var(--success)]" />
                    <span className="text-xs text-[var(--text-muted)]">AES-256-GCM Secure Channel</span>
                  </div>
                </div>
              </div>

              {/* TTL Select */}
              <div className="flex items-center gap-2">
                <div className="ttl-picker">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <select
                    value={ttl}
                    onChange={e => setTtl(Number(e.target.value))}
                    className="bg-transparent text-xs text-[var(--text-primary)] outline-none cursor-pointer"
                  >
                    {TTL_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-[var(--bg-surface)]">{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="messages-area">
              <AnimatePresence initial={false}>
                {channelMessages.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="message-empty">
                    <div>
                    <div className="message-empty-icon empty-icon">
                      <ShieldCheck className="w-7 h-7" />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] font-medium">End-to-end encrypted connection established.</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Messages cannot be read by any intermediate server.</p>
                    </div>
                  </motion.div>
                ) : (
                  channelMessages.map(m => <MessageBubble key={m.id} msg={m} />)
                )}
              </AnimatePresence>
              <div ref={bottomRef} className="h-4" />
            </div>

            {/* Input Bar */}
            <div className="chat-composer">
              <div className="composer-inner">
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="composer-button"
                  title="Send Image"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={e => e.target.files?.[0] && sendImage(e.target.files[0])}
                />

                <div className="composer-input">
                  <textarea
                    ref={textAreaRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendText();
                      }
                    }}
                    placeholder="Message..."
                    className=""
                    rows={1}
                  />
                </div>

                {!text.trim() ? (
                  <button
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onMouseLeave={stopRecording}
                    className={`composer-button ${
                      recording
                        ? 'bg-[rgba(239,68,68,0.1)] text-[var(--danger)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={sendText}
                    className="composer-button send"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {showAddContact && <AddContact onClose={() => setShowAddContact(false)} />}
        {showMyProfile && <MyProfile onClose={() => setShowMyProfile(false)} />}
      </AnimatePresence>

    </div>
  );
}

function MiniProof({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="proof-item">
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}
