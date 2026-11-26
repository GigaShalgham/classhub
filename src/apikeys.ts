// سیستم کلید API برای /api/v1 — صدور، اعتبارسنجی، اسکوپ‌ها.
// کلید خام فقط یک‌بار به مدیر نشان داده می‌شود؛ در دیتابیس فقط هش SHA-256
// نگه داشته می‌شود (همان الگوی admins/sessions). پسوند «شیء اضافه‌ای
// فاش نمی‌کند» چون پیشوند هش با کلید واقعی قابل بازسازی نیست.
// قالب کلید: hubk_<32 hex>
// مثال: hubk_9f2c8a41d7b34e50a1c2f8e6d0b7a931

import { randomHex, sha256Hex } from './auth.ts';

export const API_KEY_PREFIX = 'hubk_';
export const API_KEY_REGEX = /^hubk_[0-9a-f]{32}$/;

export type ApiScope = 'read' | 'write';

export interface ApiKeyInfo {
  id: number;
  label: string;
  key_prefix: string;
  scopes: ApiScope[];
  active: boolean;
  requests: number;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
}

/** ساخت کلید جدید — رشته‌ی خام فقط همین‌جا وجود دارد. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomHex(16); // 16 bytes = 32 hex chars
}

export async function hashApiKey(rawKey: string): Promise<string> {
  return sha256Hex(rawKey.trim().toLowerCase());
}

/** استخراج کلید از هدر X-API-Key یا Authorization: Bearer */
export function apiKeyFromRequest(request: Request): string | null {
  const h = request.headers.get('X-API-Key');
  if (h && API_KEY_REGEX.test(h)) return h;
  const auth = request.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    const tok = auth.slice(7).trim();
    if (API_KEY_REGEX.test(tok)) return tok;
  }
  return null;
}

export interface AuthKeyResult {
  ok: boolean;
  status?: number;
  error?: string;
  key?: ApiKeyInfo;
}

/**
 * اعتبارسنجی کامل: هش کلید را در api_keys جست‌وجو، انقضا/فعالیت بسنج،
 * اسکوپ خواسته‌شده مجاز است؟ (مصرف/امضا فقط موقع «اجازه» آپدیت می‌شود
 * تا درخواست‌های ردشده دیتابیس را نمی‌نویسند.)
 */
export async function authApiKey(
  db: D1Database,
  request: Request,
  required: ApiScope,
): Promise<AuthKeyResult> {
  const raw = apiKeyFromRequest(request);
  if (!raw) {
    const sent = request.headers.get('X-API-Key') ?? request.headers.get('Authorization');
    return { ok: false, status: 401, error: sent ? 'قالب کلید API درست نیست (hubk_…).' : 'کلید API ارسال نشده است.' };
  }
  const keyHash = await hashApiKey(raw);
  const row = await db.prepare(
    'SELECT id, label, key_prefix, scopes, active, requests, last_used_at AS lastUsedAt, created_at, expires_at FROM api_keys WHERE key_hash = ?',
  ).bind(keyHash).first<Record<string, unknown>>();
  if (!row) return { ok: false, status: 401, error: 'کلید API معتبر نیست.' };
  if (!row.active) return { ok: false, status: 403, error: 'کلید API از کار افتاده است.' };
  if (row.expires_at && new Date(row.expires_at + 'Z').getTime() < Date.now()) {
    return { ok: false, status: 403, error: 'کلید API منقضی شده است.' };
  }
  const scopes = String(row.scopes ?? 'read').split(',').map((s) => s.trim()) as ApiScope[];
  if (!scopes.includes(required)) {
    return { ok: false, status: 403, error: `کلید API مجوز «${required}» ندارد.` };
  }
  const info: ApiKeyInfo = {
    id: row.id as number,
    label: row.label as string,
    key_prefix: row.key_prefix as string,
    scopes,
    active: Boolean(row.active),
    requests: (row.requests ?? 0) as number,
    last_used_at: (row.lastUsedAt ?? null) as string | null,
    created_at: row.created_at as string,
    expires_at: (row.expires_at ?? null) as string | null,
  };
  // امضای مصرف (نرخِ نوشتن را پایین نگه می‌دارد: حداکثر یک آپدیت در دقیقه)
  const last = info.last_used_at ? new Date(info.last_used_at + 'Z').getTime() : 0;
  if (Date.now() - last > 60_000) {
    await db.prepare(
      "UPDATE api_keys SET requests = requests + 1, last_used_at = datetime('now') WHERE id = ?",
    ).bind(info.id).run();
  }
  return { ok: true, key: info };
}

/** ساخت ردیف کلید جدید — خروجی: کلید خام (برای نمایش یک‌باره) + اطاعات. */
export async function createApiKey(
  db: D1Database,
  label: string,
  scopes: ApiScope[],
  expiresAt: string | null = null,
): Promise<{ rawKey: string; info: ApiKeyInfo }> {
  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const r = await db.prepare(
    'INSERT INTO api_keys (label, key_hash, key_prefix, scopes, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(label, keyHash, rawKey.slice(0, 8), scopes.join(','), expiresAt).run();
  const info: ApiKeyInfo = {
    id: r.meta.last_row_id,
    label,
    key_prefix: rawKey.slice(0, 8),
    scopes,
    active: true,
    requests: 0,
    last_used_at: null,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    expires_at: expiresAt,
  };
  return { rawKey, info };
}

export async function listApiKeys(db: D1Database): Promise<ApiKeyInfo[]> {
  const { results } = await db.prepare(
    'SELECT id, label, key_prefix, scopes, active, requests, last_used_at AS lastUsedAt, created_at, expires_at FROM api_keys ORDER BY id DESC',
  ).all<Record<string, unknown>>();
  return (results ?? []).map(rowToKey);
}

export function rowToKey(row: Record<string, unknown>): ApiKeyInfo {
  return {
    id: row.id as number,
    label: row.label as string,
    key_prefix: row.key_prefix as string,
    scopes: String(row.scopes ?? 'read').split(',').map((s) => s.trim()).filter(Boolean) as ApiScope[],
    active: Boolean(row.active),
    requests: (row.requests ?? 0) as number,
    last_used_at: (row.lastUsedAt ?? row.last_used_at ?? null) as string | null,
    created_at: row.created_at as string,
    expires_at: (row.expires_at ?? null) as string | null,
  };
}

export function maskKey(prefix: string): string {
  return `${prefix}…`;
}
