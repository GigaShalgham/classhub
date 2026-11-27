// کمکی‌های مشترک احراز مدیر — بین admin.ts و v1.ts (کلیدهای API).
// نشست: کوکی ch_session یا توکن Bearer (همان قرارداد پنل ادمین).

import type { Context } from 'hono';
import type { Env } from '../index.ts';
import { hashSessionToken, bearerFrom } from '../auth.ts';

type Ctx = Context<{ Bindings: Env }>;

const SESSION_COOKIE = 'ch_session';

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function currentAdmin(c: Ctx): Promise<{ id: number; username: string } | null> {
  const token = readCookie(c.req.header('Cookie'), SESSION_COOKIE) ?? bearerFrom(c.req.raw);
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const row = await c.env.DB.prepare(`
    SELECT s.id AS sid, s.expires_at AS expiresAt, a.id, a.username
    FROM sessions s JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = ?
  `).bind(tokenHash).first<{ sid: number; expiresAt: string; id: number; username: string }>();
  if (!row) return null;
  if (new Date(row.expiresAt + 'Z').getTime() < Date.now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(row.sid).run();
    return null;
  }
  return { id: row.id, username: row.username };
}

export function requireAdmin() {
  return async (c: Ctx, next: () => Promise<void>) => {
    const admin = await currentAdmin(c);
    if (!admin) return c.json({ ok: false, error: 'ابتدا وارد شوید.' }, 401);
    (c as unknown as { admin: { id: number; username: string } }).admin = admin;
    await next();
  };
}
