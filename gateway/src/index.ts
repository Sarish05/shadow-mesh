import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import { registerIdentity, getPublicKey, writeAuditLog, getAuditLogs, queueOfflineMessage, getAndClearOfflineMessages } from './db';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// relayToken → socket.id mapping (gateway only knows tokens, not IPs)
const tokenToSocket = new Map<string, string>();
const socketToToken = new Map<string, string>();

io.on('connection', (socket) => {
  // This connection comes from the Relay, not from clients directly
  socket.on('register', async ({ relayToken }: { relayToken: string }) => {
    tokenToSocket.set(relayToken, socket.id);
    socketToToken.set(socket.id, relayToken);

    // Flush any offline messages (Redis or SQLite)
    const offlineMsgs = await getAndClearOfflineMessages(relayToken);
    for (const msg of offlineMsgs) {
      io.to(socket.id).emit('deliver', {
        recipientToken: relayToken,
        data: {
          senderToken: msg.senderToken,
          encryptedBlob: JSON.parse(msg.encryptedBlob),
          action: msg.action
        },
      });
    }
  });

  socket.on('unregister', ({ relayToken }: { relayToken: string }) => {
    tokenToSocket.delete(relayToken);
    socketToToken.delete(socket.id);
  });

  socket.on('route', async ({ relayToken, packet }: { relayToken: string; packet: RoutePacket }) => {
    const { recipientToken, encryptedBlob, action, commitment } = packet;

    // Audit log: actor = sender token, no content stored
    writeAuditLog(relayToken, action || 'message', recipientToken, commitment);

    const recipientSocketId = tokenToSocket.get(recipientToken);
    if (recipientSocketId) {
      // Deliver to recipient's relay connection
      io.to(recipientSocketId).emit('deliver', {
        recipientToken,
        data: { senderToken: relayToken, encryptedBlob, action, commitment },
      });
    } else {
      // Offline queue with Redis TTL (or SQLite fallback)
      await queueOfflineMessage(recipientToken, relayToken, action || 'message', JSON.stringify(encryptedBlob));
    }
  });

  socket.on('disconnect', () => {
    const token = socketToToken.get(socket.id);
    if (token) {
      tokenToSocket.delete(token);
      socketToToken.delete(socket.id);
    }
  });
});

// REST: identity registration (public key only, no real identity)
app.post('/api/identity', (req, res) => {
  const { pseudoId, publicKey } = req.body as { pseudoId: string; publicKey: string };
  if (!pseudoId || !publicKey) return res.status(400).json({ error: 'missing fields' });
  const idHash = registerIdentity(pseudoId, publicKey);
  res.json({ idHash });
});

// REST: fetch someone's public key for key exchange
app.get('/api/identity/:pseudoId', (req, res) => {
  const key = getPublicKey(req.params.pseudoId);
  if (!key) return res.status(404).json({ error: 'not found' });
  res.json({ publicKey: key });
});

// REST: audit log (hashed, no content)
app.get('/api/audit', (_req, res) => {
  res.json(getAuditLogs(200));
});

app.get('/health', (_req, res) => res.json({ status: 'gateway-ok' }));

interface RoutePacket {
  recipientToken: string;
  encryptedBlob: string;
  action?: string;
  commitment?: string;
}

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => console.log(`[Gateway] Listening on :${PORT}`));

