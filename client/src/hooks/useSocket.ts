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
  const { addMessage, contacts, updateMessageStatus } = useChatStore();
  const { addEntry } = useAuditStore();

  useEffect(() => {
    if (!identity) return;

    const socket = io(RELAY_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      const savedToken = localStorage.getItem('shadow_mesh_relay_token');
      socket.emit('authenticate', savedToken || null);
    });

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
      encryptedBlob: EncryptedPacket | { type: 'ack', id?: string };
      action: string;
      commitment?: string;
    }) => {
      try {
        if (data.action === 'ack') {
          const ackData = data.encryptedBlob as any;
          if (ackData.id) {
             updateMessageStatus(ackData.id, 'delivered');
          }
          return;
        }
        
        const contact = contacts.find(c => c.relayToken === data.senderToken);
        if (!contact || !identity) return;

        const channelId = [identity.pseudoId, contact.pseudoId].sort().join(':');
        const packet = data.encryptedBlob as EncryptedPacket;
        // Check for id inside packet if custom attached upstream
        const session = await getOrCreateSession(identity.dhSecretKey, contact.dhPublicKey, channelId);
        const decrypted = await decryptPayload(session.key, packet);
        const msgId = (packet as any).msgId || uuidv4();

        const base: Parameters<typeof addMessage>[0] = {
          id: msgId,
          senderToken: data.senderToken,
          contentType: decrypted.contentType,
          timestamp: Date.now(),
          expiresAt: packet.expiresAt,
          isMine: false,
          commitment: data.commitment || packet.commitment || '',
        };

        if (decrypted.contentType === 'text') base.text = bytesToText(decrypted.data);
        else if (decrypted.contentType === 'image') base.imageUrl = bytesToImageUrl(decrypted.data);
        else if (decrypted.contentType === 'voice') base.audioUrl = bytesToAudioUrl(decrypted.data);

        addMessage(base);
        await addEntry(data.senderToken, data.action || 'message', channelId, base.commitment);

        // Send ACK back
        socketRef.current?.emit('send', {
          recipientToken: data.senderToken,
          action: 'ack',
          encryptedBlob: { type: 'ack', id: (packet as any).msgId }
        });
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
    commitment?: string;
  }) => {
    socketRef.current?.emit('send', packet);
  }, []);

  return { socket: socketRef.current, relayToken, sendPacket };
}
