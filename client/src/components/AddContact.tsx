import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '../store/chatStore';
import { UserPlus, X, ScanLine, XCircle, Check, Loader2, Search, ClipboardPaste } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { type PublicIdentityBundle, verifyPublicBundle } from '../crypto/identity';

interface Props { onClose: () => void; }

export default function AddContact({ onClose }: Props) {
  const [pseudoId, setPseudoId] = useState('');
  const [relayToken, setRelayToken] = useState('');
  const [identityPublicKey, setIdentityPublicKey] = useState('');
  const [signedPreKeyPublic, setSignedPreKeyPublic] = useState('');
  const [signedPreKeySignature, setSignedPreKeySignature] = useState('');
  const [signingPublicKey, setSigningPublicKey] = useState('');
  const [identityJson, setIdentityJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'found' | 'not-found'>('idle');
  const { addContact } = useChatStore();

  function fillFromBundle(raw: string) {
    setJsonError('');
    try {
      const data = JSON.parse(raw.trim()) as Partial<PublicIdentityBundle>;
      if (
        data.version !== 1 ||
        !data.pseudoId ||
        !data.relayToken ||
        !data.identityPublicKey ||
        !data.signedPreKeyPublic ||
        !data.signedPreKeySignature ||
        !data.signingPublicKey
      ) {
        setJsonError('Identity JSON must include the signed X3DH contact bundle.');
        return;
      }
      if (!verifyPublicBundle(data as PublicIdentityBundle)) {
        setJsonError('Identity bundle signature is invalid.');
        return;
      }
      setPseudoId(data.pseudoId.trim());
      setRelayToken(data.relayToken.trim());
      setIdentityPublicKey(data.identityPublicKey.trim());
      setSignedPreKeyPublic(data.signedPreKeyPublic.trim());
      setSignedPreKeySignature(data.signedPreKeySignature.trim());
      setSigningPublicKey(data.signingPublicKey.trim());
      setLookupStatus('found');
      setIdentityJson('');
    } catch {
      setJsonError('Could not parse identity JSON.');
    }
  }

  useEffect(() => {
    if (!isScanning) return;
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1.0 },
      false
    );
    scanner.render(
      (decodedText) => {
        try {
          const data = JSON.parse(decodedText);
          if (data.pseudoId && data.signedPreKeyPublic && data.relayToken) {
            fillFromBundle(decodedText);
            scanner.clear();
            setIsScanning(false);
          } else {
            setScanError('Invalid QR format');
          }
        } catch {
          setScanError('Invalid QR data');
        }
      },
      (error) => { console.warn(error); }
    );
    return () => { scanner.clear().catch(console.error); };
  }, [isScanning]);

  async function lookupCallsign() {
    if (!pseudoId.trim()) return;
    setLookingUp(true);
    setLookupStatus('idle');
    try {
      const res = await fetch(`http://localhost:3002/api/identity/${encodeURIComponent(pseudoId.trim())}`);
      if (res.ok) {
        const data = await res.json() as { publicKey: string };
        fillFromBundle(data.publicKey);
      } else {
        setLookupStatus('not-found');
      }
    } catch {
      setLookupStatus('not-found');
    }
    setLookingUp(false);
  }

  function handleSave() {
    if (!pseudoId || !identityPublicKey || !signedPreKeyPublic || !signedPreKeySignature || !signingPublicKey || !relayToken) return;
    addContact({
      pseudoId: pseudoId.trim(),
      identityPublicKey,
      signedPreKeyPublic,
      signedPreKeySignature,
      signingPublicKey,
      relayToken: relayToken.trim(),
    });
    onClose();
  }

  const canSave = pseudoId.trim() && identityPublicKey && signedPreKeyPublic && signedPreKeySignature && signingPublicKey && relayToken.trim();

  return (
    <div className="modal-overlay">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="modal-panel"
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <div className="modal-title-icon">
              <UserPlus />
            </div>
            <div>
              <h3 className="modal-title">New Connection</h3>
              <p className="modal-subtitle">Add a secure contact</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close" aria-label="Close connection modal">
            <X />
          </button>
        </div>

        <div className="modal-body">
           {!isScanning ? (
            <button
              onClick={() => setIsScanning(true)}
              className="connection-scanner-button"
            >
              <ScanLine />
              <span>Scan QR Code</span>
            </button>
          ) : (
            <div className="scanner-wrap">
              <button onClick={() => setIsScanning(false)} className="scanner-close" aria-label="Stop scanning">
                <XCircle />
              </button>
              <div id="qr-reader" />
              {scanError && <p className="scanner-error">{scanError}</p>}
            </div>
          )}

          <div className="manual-divider">or enter manually</div>

          <div className="form-stack">
          <div>
            <label className="field-label">Paste Identity JSON</label>
            <div className="json-import">
              <textarea
                value={identityJson}
                onChange={e => { setIdentityJson(e.target.value); setJsonError(''); }}
                placeholder='Paste the copied identity JSON here'
                rows={3}
              />
              <button
                type="button"
                onClick={() => fillFromBundle(identityJson)}
                disabled={!identityJson.trim()}
                className="app-button"
              >
                <ClipboardPaste /> Fill From JSON
              </button>
            </div>
            {jsonError && <p className="field-note danger">{jsonError}</p>}
          </div>

          <div className="manual-divider compact">or edit fields</div>

          <div>
            <label className="field-label">Callsign ID</label>
            <div className="lookup-row">
              <input
                type="text"
                value={pseudoId}
                onChange={e => { setPseudoId(e.target.value); setLookupStatus('idle'); }}
                className="input-tactical flex-1"
                placeholder="Enter callsign"
              />
              <button
                onClick={lookupCallsign}
                disabled={!pseudoId.trim() || lookingUp}
                className="lookup-button"
              >
                 {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
             {lookupStatus === 'found' && (
              <p className="field-note success"><Check className="w-3 h-3"/> Public key retrieved</p>
            )}
             {lookupStatus === 'not-found' && (
              <p className="field-note danger">Callsign not found - enter public key manually</p>
            )}
          </div>

          <div>
             <label className="field-label">Relay Token</label>
             <input
              type="text"
              value={relayToken}
              onChange={e => setRelayToken(e.target.value)}
              className="input-tactical"
              placeholder="Paste token"
            />
          </div>

          <div>
             <label className="field-label">Identity Public Key</label>
             <input
              type="text"
              value={identityPublicKey}
              onChange={e => setIdentityPublicKey(e.target.value)}
              className="input-tactical font-mono text-[11px]"
              placeholder="Base64 identity public key"
            />
          </div>

          <div>
             <label className="field-label">Signed Prekey Public Key</label>
             <input
              type="text"
              value={signedPreKeyPublic}
              onChange={e => setSignedPreKeyPublic(e.target.value)}
              className="input-tactical font-mono text-[11px]"
              placeholder="Base64 signed prekey"
            />
          </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={handleSave} disabled={!canSave} className="app-button primary" style={{ width: '100%' }}>
              Add Connection
            </button>
        </div>
      </motion.div>
    </div>
  );
}
