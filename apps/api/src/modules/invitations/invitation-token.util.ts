import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/** Canonical email key for invites + user rows (spec §3). */
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 32 bytes CSPRNG → base64url; hash stored = SHA-256(raw bytes), hex. */
export function mintInviteToken(): { raw: Buffer; tokenString: string } {
  const raw = randomBytes(32);
  return { raw, tokenString: raw.toString('base64url') };
}

export function tokenStringToRawBytes(tokenString: string): Buffer | null {
  try {
    const buf = Buffer.from(tokenString, 'base64url');
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Constant-time compare of two equal-length hex strings (64 chars). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
