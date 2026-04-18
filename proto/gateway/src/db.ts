import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import Redis from 'ioredis';

const db = new Database(path.join(__dirname, '../../gateway.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS identities (
    id_hash TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_hash TEXT NOT NULL,
    action TEXT NOT NULL,
    channel_hash TEXT,
    commitment TEXT,
    fuzzy_ts INTEGER NOT NULL
  );
`);

// ─── Redis (ephemeral offline queue with TTL) ───────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let redis: Redis | null = null;

try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  redis.connect()
    .then(() => console.log('[Gateway] Redis connected'))
    .catch(() => {
      console.warn('[Gateway] Redis unavailable — using SQLite fallback for offline queue');
      redis = null;
    });
  redis.on('error', () => { /* suppress after connect */ });
} catch {
  redis = null;
}

const OFFLINE_TTL_SECONDS = 3600; // 1 hour
const OFFLINE_KEY = (token: string) => `offline:${token}`;

// ─── Identity registry ──────────────────────────────────────
export function registerIdentity(pseudoId: string, publicKey: string) {
  const idHash = crypto.createHash('sha256').update(pseudoId).digest('hex');
  db.prepare(`
    INSERT OR REPLACE INTO identities (id_hash, public_key, created_at)
    VALUES (?, ?, ?)
  `).run(idHash, publicKey, Date.now());
  return idHash;
}

export function getPublicKey(pseudoId: string): string | null {
  const idHash = crypto.createHash('sha256').update(pseudoId).digest('hex');
  const row = db.prepare('SELECT public_key FROM identities WHERE id_hash = ?').get(idHash) as { public_key: string } | undefined;
  return row?.public_key ?? null;
}

// ─── Audit log ──────────────────────────────────────────────
export function writeAuditLog(sessionToken: string, action: string, channelId?: string, commitment?: string) {
  const actorHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
  const channelHash = channelId ? crypto.createHash('sha256').update(channelId).digest('hex') : null;
  const fuzzyTs = Math.floor(Date.now() / 300000) * 300000;
  db.prepare(`
    INSERT INTO audit_log (actor_hash, action, channel_hash, commitment, fuzzy_ts)
    VALUES (?, ?, ?, ?, ?)
  `).run(actorHash, action, channelHash, commitment || null, fuzzyTs);
}

export function getAuditLogs(limit = 100) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
}

// ─── Offline queue (Redis-first, SQLite fallback) ───────────
interface OfflineMsg {
  senderToken: string;
  action: string;
  encryptedBlob: string;
  ts: number;
}

export async function queueOfflineMessage(recipientToken: string, senderToken: string, action: string, encryptedBlob: string) {
  const msg: OfflineMsg = { senderToken, action, encryptedBlob, ts: Date.now() };

  if (redis?.status === 'ready') {
    // Push JSON into a Redis list with a 1-hour TTL
    const key = OFFLINE_KEY(recipientToken);
    await redis.rpush(key, JSON.stringify(msg));
    await redis.expire(key, OFFLINE_TTL_SECONDS);
  } else {
    // SQLite fallback
    db.prepare(`
      CREATE TABLE IF NOT EXISTS offline_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_token TEXT NOT NULL,
        sender_token TEXT NOT NULL,
        action TEXT,
        encrypted_blob TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `).run();
    db.prepare(`
      INSERT INTO offline_messages (recipient_token, sender_token, action, encrypted_blob, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(recipientToken, senderToken, action, encryptedBlob, Date.now());
  }
}

export async function getAndClearOfflineMessages(recipientToken: string): Promise<OfflineMsg[]> {
  if (redis?.status === 'ready') {
    const key = OFFLINE_KEY(recipientToken);
    const raw = await redis.lrange(key, 0, -1);
    if (raw.length > 0) await redis.del(key);
    return raw.map(r => {
      try { return JSON.parse(r) as OfflineMsg; } catch { return null; }
    }).filter(Boolean) as OfflineMsg[];
  }

  // SQLite fallback
  try {
    const rows = db.prepare('SELECT * FROM offline_messages WHERE recipient_token = ?').all(recipientToken) as Array<{
      id: number; sender_token: string; action: string; encrypted_blob: string; created_at: number;
    }>;
    if (rows.length > 0) {
      db.prepare('DELETE FROM offline_messages WHERE recipient_token = ?').run(recipientToken);
    }
    return rows.map(r => ({ senderToken: r.sender_token, action: r.action, encryptedBlob: r.encrypted_blob, ts: r.created_at }));
  } catch {
    return [];
  }
}

export default db;
