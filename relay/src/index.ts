import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Gateway connection (relay forwards to gateway)
import { io as ioClient } from 'socket.io-client';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3002';
const gateway = ioClient(GATEWAY_URL, { reconnection: true });

gateway.on('connect', () => console.log('[Relay] Connected to Gateway'));
gateway.on('disconnect', () => console.log('[Relay] Disconnected from Gateway'));

// Gateway → Client delivery
gateway.on('deliver', (packet: { recipientToken: string; data: unknown }) => {
  io.to(packet.recipientToken).emit('message', packet.data);
});

io.on('connection', (socket) => {
  let relayToken: string;

  socket.on('authenticate', (existingToken?: string) => {
    // Re-use existing token or generate a new anonymous one
    relayToken = existingToken || uuidv4();
    socket.join(relayToken);
    socket.emit('relay:token', relayToken);

    console.log(`[Relay] Client auth → token ${relayToken.slice(0, 8)}...`);

    // Register with gateway using token only (no IP forwarded)
    gateway.emit('register', { relayToken });
  });

  socket.on('send', (packet: unknown) => {
    if (!relayToken) return;
    // Relay forwards encrypted blob to gateway — never inspects content
    gateway.emit('route', { relayToken, packet });
  });

  socket.on('disconnect', () => {
    if (relayToken) {
      gateway.emit('unregister', { relayToken });
      console.log(`[Relay] Client disconnected → token ${relayToken.slice(0, 8)}...`);
    }
  });
});

app.get('/health', (_req, res) => res.json({ status: 'relay-ok' }));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`[Relay] Listening on :${PORT}`));

