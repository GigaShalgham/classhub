// Admin authentication for کلاس‌هاب
// - PBKDF2-SHA256 password hashing (WebCrypto, Workers-compatible)
// - Session tokens: 32 random bytes, only the SHA-256 hash is stored in D1
// - Constant-time comparisons

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf.buffer);
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100_000 },
    key, 256,
  );
  return toHex(bits);
}

export async function verifyPassword(
  password: string, salt: string, expectedHash: string,
): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  // constant-time compare
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

export function newSessionToken(): string {
  return randomHex(32); // 64 hex chars
}

export async function hashSessionToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/** Extract bearer token from an Authorization header. */
export function bearerFrom(request: Request): string | null {
  const h = request.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
