import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import { getSecureRecord, setSecureRecord } from './secureStorage';

export interface Identity {
  pseudoId: string;
  identityPublicKey: string;
  identitySecretKey: string;
  signedPreKeyPublic: string;
  signedPreKeySecret: string;
  signedPreKeySignature: string;
  signingPublicKey: string;
  signingSecretKey: string;
}

export interface PublicIdentityBundle {
  version: 1;
  pseudoId: string;
  relayToken: string;
  identityPublicKey: string;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  signingPublicKey: string;
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

  const signing = nacl.sign.keyPair();
  const identityDh = nacl.box.keyPair();
  const signedPreKey = nacl.box.keyPair();
  const signedPreKeySignature = nacl.sign.detached(
    signedPreKey.publicKey,
    signing.secretKey
  );

  return {
    pseudoId,
    identityPublicKey: encodeBase64(u8(identityDh.publicKey)),
    identitySecretKey: encodeBase64(u8(identityDh.secretKey)),
    signedPreKeyPublic: encodeBase64(u8(signedPreKey.publicKey)),
    signedPreKeySecret: encodeBase64(u8(signedPreKey.secretKey)),
    signedPreKeySignature: encodeBase64(u8(signedPreKeySignature)),
    signingPublicKey: encodeBase64(u8(signing.publicKey)),
    signingSecretKey: encodeBase64(u8(signing.secretKey)),
  };
}

export function createPublicBundle(identity: Identity, relayToken: string): PublicIdentityBundle {
  return {
    version: 1,
    pseudoId: identity.pseudoId,
    relayToken,
    identityPublicKey: identity.identityPublicKey,
    signedPreKeyPublic: identity.signedPreKeyPublic,
    signedPreKeySignature: identity.signedPreKeySignature,
    signingPublicKey: identity.signingPublicKey,
  };
}

export function verifyPublicBundle(bundle: PublicIdentityBundle): boolean {
  try {
    return nacl.sign.detached.verify(
      decodeBase64(bundle.signedPreKeyPublic),
      decodeBase64(bundle.signedPreKeySignature),
      decodeBase64(bundle.signingPublicKey)
    );
  } catch {
    return false;
  }
}

function isIdentity(value: Identity | null): value is Identity {
  return Boolean(
    value?.pseudoId &&
    value.identityPublicKey &&
    value.identitySecretKey &&
    value.signedPreKeyPublic &&
    value.signedPreKeySecret &&
    value.signedPreKeySignature &&
    value.signingPublicKey &&
    value.signingSecretKey
  );
}

export async function saveIdentity(identity: Identity): Promise<void> {
  await setSecureRecord(STORAGE_KEY, identity);
}

export async function loadIdentity(): Promise<Identity | null> {
  const stored = await getSecureRecord<Identity>(STORAGE_KEY);
  if (isIdentity(stored)) return stored;

  const legacy = localStorage.getItem(STORAGE_KEY);
  if (!legacy) return null;

  localStorage.removeItem(STORAGE_KEY);
  return null;
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}
