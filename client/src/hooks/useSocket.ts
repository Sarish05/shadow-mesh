import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useIdentityStore } from '../store/identityStore';
import { useChatStore } from '../store/chatStore';
import { useAuditStore } from '../store/auditStore';
import { decryptPayload, type EncryptedPacket } from '../crypto/encrypt';
import { getOrCreateSession } from '../crypto/session';
import { bytesToText, bytesToImageUrl, bytesToAudioUrl } from '../crypto/normalize';
import { v4 as uuidv4 } from 'uuid';

const RELAY_URL = 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { identity, setRelayToken, relayToken } = useIdentityStore();
  const { addMessage, contacts } = useChatStore();
  const { addEntry } = useAuditStore();

  useEffect(() => {
    if (!identity) return;

    const socket = io(RELAY_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('relay:token', (token: string) => {
      setRelayToken(token);
      fetch('http://localhost:3002/api/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudoId: identity.pseudoId, publicKey: identity.dhPublicKey }),
      }).catch(console.error);
    });

    socket.on('message', async (data: {
      senderToken: string;
      encryptedBlob: EncryptedPacket;
      action: string;
    }) => {
      try {
        const contact = contacts.find(c => c.relayToken === data.senderToken);
        if (!contact || !identity) return;

        const channelId = [identity.pseudoId, contact.pseudoId].sort().join(':');
        const session = await getOrCreateSession(identity.dhSecretKey, contact.dhPublicKey, channelId);
        const decrypted = await decryptPayload(session.key, data.encryptedBlob);
        const msgId = uuidv4();

        const base: Parameters<typeof addMessage>[0] = {
          id: msgId,
          senderToken: data.senderToken,
          contentType: decrypted.contentType,
          timestamp: Date.now(),
          expiresAt: data.encryptedBlob.expiresAt,
          isMine: false,
          commitment: data.encryptedBlob.commitment,
        };

        if (decrypted.contentType === 'text') base.text = bytesToText(decrypted.data);
        else if (decrypted.contentType === 'image') base.imageUrl = bytesToImageUrl(decrypted.data);
        else if (decrypted.contentType === 'voice') base.audioUrl = bytesToAudioUrl(decrypted.data);

        addMessage(base);
        await addEntry(data.senderToken, data.action || 'message', channelId, data.encryptedBlob.commitment);
      } catch (e) {
        console.error('[useSocket] decrypt failed', e);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [identity?.pseudoId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const sendPacket = useCallback((packet: {
    recipientToken: string;
    encryptedBlob: EncryptedPacket;
    action: string;
  }) => {
    socketRef.current?.emit('send', packet);
  }, []);

  return { socket: socketRef.current, relayToken, sendPacket };
}
