import { useState } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '../store/chatStore';
import { X, UserPlus, Search } from 'lucide-react';

interface Props { onClose: () => void; }

export default function AddContact({ onClose }: Props) {
  const [pseudoId, setPseudoId] = useState('');
  const [relayToken, setRelayToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { addContact } = useChatStore();

  async function handleAdd() {
    if (!pseudoId.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`http://localhost:3002/api/identity/${pseudoId.trim().toUpperCase()}`);
      if (!res.ok) throw new Error('Callsign not found on network');
      const { publicKey } = await res.json() as { publicKey: string };
      addContact({ pseudoId: pseudoId.trim().toUpperCase(), dhPublicKey: publicKey, relayToken: relayToken.trim() || undefined, displayName: pseudoId.trim().toUpperCase() });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#050a0e] border border-emerald-900/50 rounded-2xl p-6 w-full max-w-sm glow-green"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-sm text-white font-semibold">ADD CONTACT</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 block">Operational Callsign</label>
            <div className="flex gap-2">
              <input
                value={pseudoId}
                onChange={e => setPseudoId(e.target.value.toUpperCase())}
                placeholder="ALPHA7XKR9P2"
                className="flex-1 bg-[#0a0f14] border border-slate-700/50 rounded-lg px-3 py-2.5 text-white font-mono text-sm placeholder:text-slate-700 focus:outline-none focus:border-emerald-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 block">
              Relay Token <span className="text-slate-700 normal-case">(for direct delivery)</span>
            </label>
            <input
              value={relayToken}
              onChange={e => setRelayToken(e.target.value)}
              placeholder="paste relay token..."
              className="w-full bg-[#0a0f14] border border-slate-700/50 rounded-lg px-3 py-2.5 text-white font-mono text-xs placeholder:text-slate-700 focus:outline-none focus:border-emerald-600 transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <p className="font-mono text-xs text-red-400">✗ {error}</p>
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={loading || !pseudoId.trim()}
            className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-mono font-semibold text-sm tracking-wider transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> RESOLVING...</>
            ) : (
              <><Search className="w-3.5 h-3.5" /> LOOKUP &amp; ADD</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
