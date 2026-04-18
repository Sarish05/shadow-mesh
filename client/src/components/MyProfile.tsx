import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useIdentityStore } from '../store/identityStore';
import { X, Copy, QrCode } from 'lucide-react';
import { useState } from 'react';

interface Props { onClose: () => void; }

export default function MyProfile({ onClose }: Props) {
  const { identity, relayToken } = useIdentityStore();
  const [copied, setCopied] = useState(false);

  if (!identity || !relayToken) return null;

  function copyAll() {
    const data = JSON.stringify({ pseudoId: identity!.pseudoId, dhPublicKey: identity!.dhPublicKey, relayToken });
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const qrData = JSON.stringify({ pseudoId: identity.pseudoId, dhPublicKey: identity.dhPublicKey, relayToken });

  return (
    <div className="modal-overlay">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="modal-panel profile"
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <div className="modal-title-icon">
              <QrCode />
            </div>
            <div>
              <h3 className="modal-title">My Identity</h3>
              <p className="modal-subtitle">Share your secure contact code</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close" aria-label="Close identity modal">
            <X />
          </button>
        </div>

        <div className="profile-body">
          <div className="profile-avatar">
            {identity.pseudoId.slice(0, 2)}
          </div>

          <div className="profile-id">{identity.pseudoId}</div>
          <div className="profile-copy">Share this QR code or identity JSON to connect with others securely.</div>

          <div className="qr-card">
            <QRCodeSVG
              value={qrData}
              size={208}
              level="M"
              includeMargin={true}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>

          <button onClick={copyAll} className="app-button" style={{ width: '100%' }}>
            <Copy /> {copied ? 'Copied Identity' : 'Copy Full Identity JSON'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
