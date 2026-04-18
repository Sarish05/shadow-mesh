import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export interface SessionKey {
  key: CryptoKey;
  rawB64: string;
}

const u8 = (x: ArrayLike<number>): Uint8Array<ArrayBuffer> => {
  const r = new Uint8Array(x.length);
  r.set(x);
  return r;
};

function deriveSharedSecret(ourSecretKeyB64: string, theirPublicKeyB64: string): Uint8Array<ArrayBuffer> {
  const ourSK = u8(decodeBase64(ourSecretKeyB64));
  const theirPK = u8(decodeBase64(theirPublicKeyB64));
  return u8(nacl.scalarMult(ourSK, theirPK));
}

async function hkdf(sharedSecret: Uint8Array<ArrayBuffer>, info: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: u8(new TextEncoder().encode(info)) },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function deriveSessionKey(
  ourDhSecretKeyB64: string,
  theirDhPublicKeyB64: string,
  channelId: string
): Promise<SessionKey> {
  const sharedSecret = deriveSharedSecret(ourDhSecretKeyB64, theirDhPublicKeyB64);
  const key = await hkdf(sharedSecret, `shadow-mesh-v1:${channelId}`);
  const raw = await crypto.subtle.exportKey('raw', key);
  return { key, rawB64: encodeBase64(u8(new Uint8Array(raw))) };
}

const sessionCache = new Map<string, SessionKey>();

export async function getOrCreateSession(
  ourDhSecretKeyB64: string,
  theirDhPublicKeyB64: string,
  channelId: string
): Promise<SessionKey> {
  if (sessionCache.has(channelId)) return sessionCache.get(channelId)!;
  const sk = await deriveSessionKey(ourDhSecretKeyB64, theirDhPublicKeyB64, channelId);
  sessionCache.set(channelId, sk);
  return sk;
}

export function clearSession(channelId: string) {
  sessionCache.delete(channelId);
}
