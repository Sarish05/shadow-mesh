import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { type Identity } from './identity';

export interface SessionKey {
  key: CryptoKey;
  rawB64: string;
}

export interface X3DHHeader {
  senderIdentityPublicKey: string;
  senderEphemeralPublicKey: string;
}

export interface X3DHSession {
  session: SessionKey;
  header: X3DHHeader;
}

const u8 = (x: ArrayLike<number>): Uint8Array<ArrayBuffer> => {
  const r = new Uint8Array(x.length);
  r.set(x);
  return r;
};

function deriveSharedSecret(ourSecretKeyB64: string, theirPublicKeyB64: string): Uint8Array<ArrayBuffer> {
  if (!ourSecretKeyB64 || !theirPublicKeyB64) throw new Error('Attempted to derive shared secret with missing or invalid keys (Legacy Contact). Please delete this contact and add them again.');
  try {
    const ourSK = u8(decodeBase64(ourSecretKeyB64));
    const theirPK = u8(decodeBase64(theirPublicKeyB64));
    return u8(nacl.scalarMult(ourSK, theirPK));
  } catch (err) {
    throw new Error('Contact keys are corrupted or from an older version. Please delete this contact and add them again.');
  }
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

function concatSecrets(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return u8(out);
}

async function makeSession(secretMaterial: Uint8Array<ArrayBuffer>, info: string): Promise<SessionKey> {
  const key = await hkdf(secretMaterial, info);
  const raw = await crypto.subtle.exportKey('raw', key);
  return { key, rawB64: encodeBase64(u8(new Uint8Array(raw))) };
}

export async function deriveX3DHInitiatorSession(
  ourIdentity: Identity,
  theirIdentityPublicKeyB64: string,
  theirSignedPreKeyPublicB64: string,
  channelId: string
): Promise<X3DHSession> {
console.log(`%c[ENIGMA: X3DH] %cAlice (Initiator) Deriving Session:`, 'color: #3b82f6; font-weight: bold', 'color: #a3a3a3', { channelId });

  const eph = nacl.box.keyPair();
  const ephPublic = encodeBase64(u8(eph.publicKey));
  const ephSecret = encodeBase64(u8(eph.secretKey));

  const dh1 = deriveSharedSecret(ourIdentity.identitySecretKey, theirSignedPreKeyPublicB64);
  const dh2 = deriveSharedSecret(ephSecret, theirIdentityPublicKeyB64);
  const dh3 = deriveSharedSecret(ephSecret, theirSignedPreKeyPublicB64);        
  const session = await makeSession(concatSecrets(dh1, dh2, dh3), `shadow-mesh-x3dh-v1:${channelId}`);

  console.log(`%c[ENIGMA: HKDF] %cMaster Key Material Expanded. Ephemeral Key Burned.`, 'color: #3b82f6; font-weight: bold', 'color: #a3a3a3');

  return {
    session,
    header: {
      senderIdentityPublicKey: ourIdentity.identityPublicKey,
      senderEphemeralPublicKey: ephPublic,
    },
  };
}

export async function deriveX3DHRecipientSession(
  ourIdentity: Identity,
  theirIdentityPublicKeyB64: string,
  theirEphemeralPublicKeyB64: string,
  channelId: string
): Promise<SessionKey> {
  console.log(`%c[ENIGMA: X3DH] %cBob (Recipient) Deriving Session:`, 'color: #3b82f6; font-weight: bold', 'color: #a3a3a3', { channelId });

  const dh1 = deriveSharedSecret(ourIdentity.signedPreKeySecret, theirIdentityPublicKeyB64);
  const dh2 = deriveSharedSecret(ourIdentity.identitySecretKey, theirEphemeralPublicKeyB64);
  const dh3 = deriveSharedSecret(ourIdentity.signedPreKeySecret, theirEphemeralPublicKeyB64);
  
  const session = await makeSession(concatSecrets(dh1, dh2, dh3), `shadow-mesh-x3dh-v1:${channelId}`);
  console.log(`%c[ENIGMA: HKDF] %cMaster Key Material Expanded. Shared Secret matched.`, 'color: #3b82f6; font-weight: bold', 'color: #a3a3a3');
  return session;
}

