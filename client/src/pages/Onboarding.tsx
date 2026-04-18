import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentityStore } from '../store/identityStore';

interface Props { onComplete: () => void; }

const BOOT_LINES = [
  '> Initializing Shadow Mesh Protocol v2.1...',
  '> Loading cryptographic primitives...',
  '> Ed25519 + X25519 curve operations: READY',
  '> AES-256-GCM cipher engine: READY',
  '> HKDF key derivation: READY',
  '> Zero-knowledge commitment module: READY',
  '> Anonymity layer (dual-relay): ONLINE',
  '> System ready. Awaiting identity generation.',
];

export default function Onboarding({ onComplete }: Props) {
  const { createIdentity } = useIdentityStore();
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [booted, setBooted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ pseudoId: string; publicKey: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [genSteps, setGenSteps] = useState<string[]>([]);

  // Boot sequence
  useEffect(() => {
    // Reset on re-mount (React Strict Mode fires twice in dev)
    setBootLines([]);
    setBooted(false);
    let i = 0;
    const t = setInterval(() => {
      const line = BOOT_LINES[i];
      if (i < BOOT_LINES.length && line !== undefined) {
        setBootLines(prev => [...prev, line]);
        i++;
      } else {
        clearInterval(t);
        setTimeout(() => setBooted(true), 400);
      }
    }, 180);
    return () => { clearInterval(t); };
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    const steps = [
      'Generating entropy from WebCrypto RNG...',
      'Creating Ed25519 identity keypair...',
      'Creating X25519 key-exchange keypair...',
      'Deriving pseudonymous operational ID...',
      'Encrypting private keys to local store...',
      'Registering public key with gateway...',
    ];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 220));
      setGenSteps(prev => [...prev, steps[i]]);
      setProgress(Math.round(((i + 1) / steps.length) * 100));
    }
    const id = createIdentity();
    await new Promise(r => setTimeout(r, 300));
    setGenerated({ pseudoId: id.pseudoId, publicKey: id.publicKey });
    setGenerating(false);
  }

  return (
    <div className="min-h-screen bg-[#020409] grid-bg scanlines flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-emerald-700/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-2xl relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-emerald-400 pulse-ring relative" />
            </div>
            <span className="font-mono text-emerald-400 text-xs tracking-[0.3em] uppercase">Shadow Mesh Protocol</span>
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight text-glow">SHADOW MESH</h1>
          <p className="text-slate-500 text-sm mt-1 font-mono tracking-wider">SECURE · ANONYMOUS · ENCRYPTED</p>
        </motion.div>

        {/* Terminal box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-[#050a0e] border border-emerald-900/50 rounded-2xl overflow-hidden glow-green"
        >
          {/* Terminal title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-900/40 bg-[#070d11]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
            </div>
            <span className="font-mono text-xs text-slate-500 ml-2">shadow-mesh — identity-bootstrap</span>
          </div>

          <div className="p-6">
            {/* Boot log */}
            <div className="font-mono text-xs space-y-1 mb-6 min-h-[160px]">
              {bootLines.filter((l): l is string => typeof l === 'string').map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={
                    line.includes('READY') || line.includes('ONLINE')
                      ? 'text-emerald-400'
                      : line.includes('Awaiting')
                      ? 'text-yellow-400 cursor-blink'
                      : 'text-slate-400'
                  }
                >
                  {line}
                </motion.div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {!booted && (
                <motion.div key="loading" exit={{ opacity: 0 }}
                  className="h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent animate-pulse"
                />
              )}

              {booted && !generating && !generated && (
                <motion.div key="cta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="border border-emerald-900/50 rounded-xl p-4 mb-4 bg-emerald-500/5">
                    <p className="font-mono text-xs text-slate-400 leading-relaxed">
                      <span className="text-emerald-400">NOTICE:</span> No personal information required.
                      Your identity is a cryptographic keypair generated entirely on this device.
                      Private keys are stored locally and <span className="text-emerald-400">never transmitted</span>.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerate}
                    className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-semibold tracking-wider text-sm transition-all hover:scale-[1.01] active:scale-[0.99] glow-green-strong"
                  >
                    [ GENERATE SECURE IDENTITY ]
                  </button>
                </motion.div>
              )}

              {generating && (
                <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="space-y-1.5 mb-4 font-mono text-xs">
                    {genSteps.map((s, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 text-emerald-300">
                        <span className="text-emerald-500">✓</span>{s}
                      </motion.div>
                    ))}
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="font-mono text-xs text-slate-500 mt-2 text-right">{progress}%</p>
                </motion.div>
              )}

              {generated && (
                <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="border border-emerald-500/30 rounded-xl p-5 bg-emerald-500/5 mb-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-mono text-xs text-emerald-400 uppercase tracking-wider">Identity Generated Successfully</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1">Operational Callsign</p>
                        <p className="font-mono text-3xl font-bold text-emerald-400 tracking-[0.2em] text-glow">
                          {generated.pseudoId}
                        </p>
                      </div>
                      <div className="h-px bg-emerald-900/50" />
                      <div>
                        <p className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1">Public Key Fingerprint (Ed25519)</p>
                        <p className="font-mono text-[11px] text-slate-400 break-all">
                          {generated.publicKey.slice(0, 44)}
                          <span className="text-slate-600">...</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2.5 mb-4">
                    <p className="font-mono text-[11px] text-yellow-400">
                      ⚠ OPSEC: Your callsign is your only identifier. Private keys stored in browser — do not clear browser data.
                    </p>
                  </div>
                  <button
                    onClick={onComplete}
                    className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-semibold tracking-wider text-sm transition-all hover:scale-[1.01] active:scale-[0.99] glow-green-strong"
                  >
                    [ ENTER SECURE CHANNEL ] →
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="flex justify-center gap-6 mt-4 font-mono text-[10px] text-slate-600">
          <span>AES-256-GCM</span>
          <span>·</span>
          <span>X25519-ECDH</span>
          <span>·</span>
          <span>Ed25519</span>
          <span>·</span>
          <span>HKDF-SHA256</span>
          <span>·</span>
          <span>DUAL-RELAY</span>
        </div>
      </div>
    </div>
  );
}
