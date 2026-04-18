import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export interface Identity {
  pseudoId: string;
  publicKey: string;
  secretKey: string;
  dhPublicKey: string;
  dhSecretKey: string;
}

const STORAGE_KEY = 'sm_identity';

// Explicit ArrayBuffer-backed Uint8Array — required for Web Crypto API in TS 5.7+
const u8 = (x: ArrayLike<number>): Uint8Array<ArrayBuffer> => {
  const r = new Uint8Array(x.length);
  r.set(x);
  return r;
};

export function generateIdentity(): Identity {
  const pseudoId = encodeBase64(u8(nacl.randomBytes(16)))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12)
    .toUpperCase();

  const signKP = nacl.sign.keyPair();
  const dhKP = nacl.box.keyPair();

  return {
    pseudoId,
    publicKey: encodeBase64(u8(signKP.publicKey)),
    secretKey: encodeBase64(u8(signKP.secretKey)),
    dhPublicKey: encodeBase64(u8(dhKP.publicKey)),
    dhSecretKey: encodeBase64(u8(dhKP.secretKey)),
  };
}

export function saveIdentity(identity: Identity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function loadIdentity(): Identity | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Identity) : null;
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function signMessage(message: string, secretKeyB64: string): string {
  const sk = u8(decodeBase64(secretKeyB64));
  const msgBytes = new TextEncoder().encode(message);
  const signed = nacl.sign(msgBytes, sk);
  return encodeBase64(u8(signed));
}

export function verifySignature(signedB64: string, publicKeyB64: string): string | null {
  try {
    const pk = u8(decodeBase64(publicKeyB64));
    const signed = u8(decodeBase64(signedB64));
    const opened = nacl.sign.open(signed, pk);
    if (!opened) return null;
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}
