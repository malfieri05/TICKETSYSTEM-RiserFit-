import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * 32-byte key: prefer INVITE_TOKEN_WRAP_KEY (64 hex chars).
 * If unset, derive from JWT_SECRET so production deploys (e.g. Vercel) work without a second secret;
 * set INVITE_TOKEN_WRAP_KEY for stronger key separation when you can.
 */
export function getInviteWrapKey(): Buffer {
  const hex = process.env.INVITE_TOKEN_WRAP_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  if (process.env.JWT_SECRET) {
    return createHash('sha256').update(process.env.JWT_SECRET).digest();
  }
  throw new Error(
    'INVITE_TOKEN_WRAP_KEY (64 hex chars) or JWT_SECRET must be set to wrap invitation tokens.',
  );
}

export function wrapInviteTokenRaw(raw: Buffer): string {
  const key = getInviteWrapKey();
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([c.update(raw), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function unwrapInviteTokenWrap(wrapped: string): Buffer | null {
  try {
    const key = getInviteWrapKey();
    const buf = Buffer.from(wrapped, 'base64url');
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const d = createDecipheriv(ALGO, key, iv);
    d.setAuthTag(tag);
    const raw = Buffer.concat([d.update(data), d.final()]);
    if (raw.length !== 32) return null;
    return raw;
  } catch {
    return null;
  }
}
