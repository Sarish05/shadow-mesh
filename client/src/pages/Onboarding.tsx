import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdentityStore } from '../store/identityStore';
import { Shield, Fingerprint, Lock, ShieldCheck, Cpu } from 'lucide-react';

interface Props { onComplete: () => void; }

export default function Onboarding({ onComplete }: Props) {
  const { createIdentity } = useIdentityStore();
  const [phase, setPhase] = useState<'intro' | 'generating' | 'done'>('intro');
  const [generated, setGenerated] = useState<{ pseudoId: string; publicKey: string } | null>(null);

  async function handleGenerate() {
    setPhase('generating');
    // Simulate slight delay for the feeling of key generation
    await new Promise(r => setTimeout(r, 1200));
    const id = createIdentity();
    setGenerated({ pseudoId: id.pseudoId, publicKey: id.publicKey });
    setPhase('done');
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-shell">
        <div className="brand-lockup">
          <div className="brand-icon">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="brand-title">Shadow Mesh</h1>
          <p className="brand-subtitle">Secure, anonymous intelligence sharing.</p>
        </div>

        <motion.div
          className="onboarding-card"
          layout
        >
          <AnimatePresence mode="wait">
              
            {phase === 'intro' && (
              <motion.div
                key="intro"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="feature-list">
                  <Feature icon={<Lock />} title="End-to-End Encrypted" desc="AES-256-GCM encryption for all payloads." />
                  <Feature icon={<Fingerprint />} title="Anonymous Identity" desc="No phone or email required. Ed25519-backed." />
                  <Feature icon={<ShieldCheck />} title="Zero-Trust Architecture" desc="Server routes ciphertext without decryption capabilities." />
                </div>
                
                <button onClick={handleGenerate} className="app-button primary" style={{ width: '100%' }}>
                  Generate Identity
                </button>
              </motion.div>
            )}

            {phase === 'generating' && (
              <motion.div
                key="generating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="state-panel"
              >
                <div>
                  <div className="state-icon">
                    <Cpu />
                  </div>
                  <h3 className="state-title">Generating Keypairs...</h3>
                  <p className="state-copy">Creating local Ed25519 and X25519 keys</p>
                </div>
              </motion.div>
            )}

            {phase === 'done' && generated && (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ textAlign: 'center' }}
              >
                <div className="state-icon">
                  <ShieldCheck />
                </div>
                <h3 className="state-title">Identity Generated</h3>
                <p className="state-copy">Your local credentials have been secured.</p>
                
                <div className="identity-card">
                  <div className="identity-label">Callsign ID</div>
                  <div className="identity-value">{generated.pseudoId}</div>
                  
                  <div className="identity-label">Public Key</div>
                  <div className="identity-key">{generated.publicKey}</div>
                </div>

                <button onClick={onComplete} className="app-button primary" style={{ width: '100%' }}>
                  Enter Platform
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="feature-row">
      <div className="feature-icon">
        {icon}
      </div>
      <div>
        <h4 className="feature-title">{title}</h4>
        <p className="feature-copy">{desc}</p>
      </div>
    </div>
  );
}
