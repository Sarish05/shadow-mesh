import { useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useIdentityStore } from '../store/identityStore';
import { useChatStore } from '../store/chatStore';
import { useAuditStore } from '../store/auditStore';
import { decryptPayload, type EncryptedPacket } from '../crypto/encrypt';
import { deriveX3DHRecipientSession } from '../crypto/session';
import { createPublicBundle } from '../crypto/identity';
import { bytesToText, bytesToImageUrl, bytesToAudioUrl } from '../crypto/normalize';
import { v4 as uuidv4 } from 'uuid';

const RELAY_URL = 'http://localhost:3001';
let globalSocket: Socket | null = null;
let activeConnections = 0;

export function useSocket() {
  const { identity, relayToken } = useIdentityStore();

  useEffect(() => {
    if (!identity) return;

    activeConnections++;
    if (!globalSocket) {
      const socket = io(RELAY_URL, { transports: ['websocket'] });
      globalSocket = socket;

      socket.on('connect', () => {
        socket.emit('authenticate', useIdentityStore.getState().relayToken || null);
      });

      socket.on('relay:token', (token: string) => {
        useIdentityStore.getState().setRelayToken(token);
        fetch('http://localhost:3002/api/identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pseudoId: identity.pseudoId, publicKey: JSON.stringify(createPublicBundle(identity, token)) }),
        }).catch(console.error);
      });

      socket.on('message', async (data: {
        senderToken: string;
        encryptedBlob: EncryptedPacket | { type: 'ack', id?: string };
        action: string;
        commitment?: string;
      }) => {
        try {
          const { contacts, addMessage, updateMessageStatus } = useChatStore.getState();
          const { addEntry } = useAuditStore.getState();
          
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
          if (!packet.x3dh) return;
          if (packet.x3dh.senderIdentityPublicKey !== contact.identityPublicKey) return;
          const session = await deriveX3DHRecipientSession(
            identity,
            contact.identityPublicKey,
            packet.x3dh.senderEphemeralPublicKey,
            channelId
          );
          const decrypted = await decryptPayload(session.key, packet);
          const msgId = packet.msgId || uuidv4();

          const base: any = {
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

          socket.emit('send', {
            recipientToken: data.senderToken,
            action: 'ack',
            encryptedBlob: { type: 'ack', id: packet.msgId }
          });
        } catch (e) {
           // Invalid keys or decipher failed.
        }
      });
    }

    return () => {
      activeConnections--;
      if (activeConnections === 0 && globalSocket) {
        globalSocket.disconnect();
        globalSocket = null;
      }
    };
  }, [identity?.pseudoId]);

  const sendPacket = useCallback((packet: {
    recipientToken: string;
    encryptedBlob: EncryptedPacket;
    action: string;
    commitment?: string;
  }) => {
    globalSocket?.emit('send', packet);
  }, []);

  return { socket: globalSocket, relayToken, sendPacket };
}

