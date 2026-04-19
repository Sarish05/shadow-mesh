import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import nacl from 'tweetnacl';

export type ContentType = 'text' | 'image' | 'voice';

export interface EncryptedPacket {
  ciphertext: string;
  iv: string;
  contentType: number;
  paddedSize: number;
  commitment: string;
  expiresAt: number;
  msgId?: string;
  x3dh?: {
    senderIdentityPublicKey: string;
    senderEphemeralPublicKey: string;
  };
}

const u8 = (x: ArrayLike<number>): Uint8Array<ArrayBuffer> => {
  const r = new Uint8Array(x.length);
  r.set(x);
  return r;
};

function padToBucket(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const buckets = [1024, 4096, 16384, 65536, 262144, 1048576, 4194304];
  const target = buckets.find(b => b >= data.length) ?? data.length + 1024;
  const padded = new Uint8Array(target);
  padded.set(data);
  padded.set(u8(nacl.randomBytes(target - data.length)), data.length);
  return padded;
}

export async function encryptPayload(
  sessionKey: CryptoKey,
  contentType: ContentType,
  payload: Uint8Array,
  ttlMs = 0
): Promise<EncryptedPacket> {
  const header = new Uint8Array(5);
  const typeMap: Record<ContentType, number> = { text: 1, image: 2, voice: 3 };
  header[0] = typeMap[contentType];
  new DataView(header.buffer).setUint32(1, payload.length, true);

  const combined = new Uint8Array(header.length + payload.length);
  combined.set(header);
  combined.set(payload, header.length);

  const padded = padToBucket(combined);
  const iv = u8(nacl.randomBytes(12));

  const ciphertext = u8(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, padded)));

  const keyRaw = u8(new Uint8Array(await crypto.subtle.exportKey('raw', sessionKey)));
  const hmacKey = await crypto.subtle.importKey('raw', keyRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const commitInput = u8([...iv, ...ciphertext.slice(0, 32)]);
  const commitment = u8(new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, commitInput)));

  console.log(`%c[ENIGMA: CRYPTO] %cAES-256-GCM Encryption Complete:`, 'color: #00ff00; font-weight: bold', 'color: #a3a3a3', { type: contentType, originalSize: payload.length, paddedSize: padded.length, ivB64: encodeBase64(iv).substring(0, 10) + '...' });
  return {
    ciphertext: encodeBase64(ciphertext),
    iv: encodeBase64(iv),
    contentType: 0,
    paddedSize: padded.length,
    commitment: encodeBase64(commitment),
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
  };
}

export interface DecryptedPayload {
  contentType: ContentType;
  data: Uint8Array;
}

export async function decryptPayload(
  sessionKey: CryptoKey,
  packet: EncryptedPacket
): Promise<DecryptedPayload> {
  const iv = u8(decodeBase64(packet.iv));
  const ciphertext = u8(decodeBase64(packet.ciphertext));

  const decrypted = u8(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, ciphertext)));

  const typeCode = decrypted[0];
  const originalLength = new DataView(decrypted.buffer).getUint32(1, true);
  const data = decrypted.slice(5, 5 + originalLength);

  const typeMap: Record<number, ContentType> = { 1: 'text', 2: 'image', 3: 'voice' };
  const detectedType = typeMap[typeCode] ?? 'text';
  
  console.log(`%c[ENIGMA: CRYPTO] %cAES-256-GCM Decryption Complete:`, 'color: #00ff00; font-weight: bold', 'color: #a3a3a3', { type: detectedType, unpaddedSize: data.length });

  return { contentType: detectedType, data };
}

