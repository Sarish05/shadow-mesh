import { encodeBase64 } from 'tweetnacl-util';

// Privacy-preserving audit commitment
// Proves "a message was sent" without revealing content or identity

export async function generateCommitment(
  sessionToken: string,
  action: string,
  payloadSizeBytes: number
): Promise<string> {
  const input = `${sessionToken}:${action}:${payloadSizeBytes}:${Date.now()}`;
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return encodeBase64(new Uint8Array(hashBuf));
}

export async function hashId(id: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Fuzzy timestamp: rounds to nearest 5-minute bucket
export function fuzzyTimestamp(): number {
  return Math.floor(Date.now() / 300000) * 300000;
}
