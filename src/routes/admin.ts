// Admin API (class representative) — کلاس‌هاب
// All routes require a valid session except /auth/login and /auth/bootstrap.

import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../index';

type Ctx = Context<{ Bindings: Env }>;
import {
  hashPassword, verifyPassword, newSessionToken, hashSessionToken, bearerFrom,
} from '../auth';
import { ValidationError, bad, str, int, bool, timeStr, isoDate, oneOf, readJson } from '../validation';
import { rateLimit, sweepBuckets, clientIp } from '../ratelimit';
import {
  MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES, safeFilename, validateMime,
} from '../attachments';

const adminRoutes = new Hono<{ Bindings: Env }>();

const SESSION_COOKIE = 'ch_session';
const TASK_KINDS = ['project', 'research', 'presentation', 'exam', 'quiz', 'submission'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;
const COLOR_KEYS = ['lavender', 'blue', 'mint', 'pink', 'cream', 'green'] as const;

function tzTehran(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tehran' });
}

/** Resolve the current admin from cookie or bearer token. */
function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function currentAdmin(c: Ctx, tokenOverride?: string | null): Promise<{ id: number; username: string } | null> {
  const token = tokenOverride
    ?? readCookie(c.req.header('Cookie'), SESSION_COOKIE)
    ?? bearerFrom(c.req.raw);
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

function requireAdmin() {
  return async (c: Ctx, next: () => Promise<void>) => {
    const admin = await currentAdmin(c);
    if (!admin) return c.json({ ok: false, error: 'ابتدا وارد شوید.' }, 401);
    (c as unknown as { admin: { id: number; username: string } }).admin = admin;
    await next();
  };
}

// ---------- Auth ----------

// Public status endpoint (no secrets): reports whether first-run bootstrap is needed.
adminRoutes.get('/auth/status', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>();
  return c.json({ ok: true, bootstrapRequired: (row?.n ?? 0) === 0 });
});

adminRoutes.post('/auth/bootstrap', async (c) => {
  const rl = rateLimit(`bootstrap:${clientIp(c.req.raw)}`, 3, 60_000);
  if (!rl.ok) return c.json({ ok: false, error: 'درخواست‌های بیش از حد. بعداً تلاش کنید.' }, 429, { 'Retry-After': String(rl.retryAfter) });
  const body = await readJson(c.req.raw);
  const username = str(body.username, 'نام کاربری', { min: 3, max: 40 });
  const password = str(body.password, 'گذرواژه', { min: 8, max: 200 });
  const existing = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) {
    return c.json({ ok: false, error: 'مدیر از قبل وجود دارد. وارد شوید.' }, 409);
  }
  const salt = crypto.randomUUID().replace(/-/g, '');
  const passwordHash = await hashPassword(password, salt);
  await c.env.DB.prepare(
    'INSERT INTO admins (username, password_hash, salt) VALUES (?, ?, ?)',
  ).bind(username, passwordHash, salt).run();
  return c.json({ ok: true });
});

adminRoutes.post('/auth/login', async (c) => {
  sweepBuckets();
  const rl = rateLimit(`login:${clientIp(c.req.raw)}`, 8, 60_000);
  if (!rl.ok) return c.json({ ok: false, error: 'تلاش‌های بیش از حد. یک دقیقه صبر کنید.' }, 429, { 'Retry-After': String(rl.retryAfter) });
  const body = await readJson(c.req.raw);
  const username = str(body.username, 'نام کاربری', { min: 1, max: 40 });
  const password = str(body.password, 'گذرواژه', { min: 1, max: 200 });
  const admin = await c.env.DB.prepare(
    'SELECT id, username, password_hash, salt FROM admins WHERE username = ?',
  ).bind(username).first<{ id: number; username: string; password_hash: string; salt: string }>();
  const ok = admin && await verifyPassword(password, admin.salt, admin.password_hash);
  if (!ok) return c.json({ ok: false, error: 'نام کاربری یا گذرواژه اشتباه است.' }, 401);
  const token = newSessionToken();
  const tokenHash = await hashSessionToken(token);
  const ttlHours = Number(c.env.SESSION_TTL_HOURS ?? '12') || 12;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  await c.env.DB.prepare(
    'INSERT INTO sessions (admin_id, token_hash, expires_at) VALUES (?, ?, ?)',
  ).bind(admin!.id, tokenHash, expiresAt).run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    // کوکی فقط روی https ؛ روی http (حالت نجات بدون-VPN) secure=false تا لاگین ممکن بماند.
    // خود URL ادمین همیشه https توصیه می‌شود؛ این فقط برای شبکه‌های فیلترشده است.
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax', path: '/', maxAge: ttlHours * 3600,
  });
  return c.json({ ok: true, token, admin: { id: admin!.id, username: admin!.username } });
});

adminRoutes.post('/auth/logout', async (c) => {
  const token = readCookie(c.req.header('Cookie'), SESSION_COOKIE) ?? bearerFrom(c.req.raw);
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await hashSessionToken(token)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

adminRoutes.get('/auth/me', requireAdmin(), (c) => {
  const admin = (c as unknown as { admin: { id: number; username: string } }).admin;
  return c.json({ ok: true, admin });
});

// ---------- Lessons (timetable) ----------

async function subjectExists(db: D1Database, subjectId: number): Promise<boolean> {
  const r = await db.prepare('SELECT 1 AS x FROM subjects WHERE id = ?').bind(subjectId).first();
  return Boolean(r);
}

/** اعتبارسنجی درس گردشی: null یا عدد معتبر در subjects */
function parseAltSubject(body: Record<string, unknown>): number | null | 'invalid' {
  const raw = body.altSubjectId ?? body.alt_subject_id;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 10_000) return 'invalid';
  return n;
}

adminRoutes.post('/lessons', requireAdmin(), async (c) => {
  const body = await readJson(c.req.raw);
  const day = int(body.day, 'روز', 0, 6);
  const period = int(body.period, 'زنگ', 1, 12);
  const subjectId = int(body.subjectId ?? body.subject_id, 'درس', 1, 10_000);
  const altRaw = parseAltSubject(body);
  if (altRaw === 'invalid') bad('درس گردشی نامعتبر است.');
  const altSubjectId = altRaw && altRaw === subjectId ? null : altRaw; // همان درس؟ گردشی بی‌معنی است
  const startTime = timeStr(body.startTime ?? body.start_time, 'ساعت شروع');
  const endTime = timeStr(body.endTime ?? body.end_time, 'ساعت پایان');
  if (endTime <= startTime) bad('ساعت پایان باید بعد از شروع باشد.');
  if (!(await subjectExists(c.env.DB, subjectId))) bad('درس انتخاب‌شده وجود ندارد.');
  if (altSubjectId && !(await subjectExists(c.env.DB, altSubjectId))) bad('درس گردشی انتخاب‌شده وجود ندارد.');
  try {
    const r = await c.env.DB.prepare(
      'INSERT INTO lessons (day, period, subject_id, alt_subject_id, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(day, period, subjectId, altSubjectId, startTime, endTime).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return c.json({ ok: false, error: 'این روز و زنگ قبلاً پر شده است.' }, 409);
    throw e;
  }
});

adminRoutes.put('/lessons/:id', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c.req.raw);
  const day = int(body.day, 'روز', 0, 6);
  const period = int(body.period, 'زنگ', 1, 12);
  const subjectId = int(body.subjectId ?? body.subject_id, 'درس', 1, 10_000);
  const altRaw = parseAltSubject(body);
  if (altRaw === 'invalid') bad('درس گردشی نامعتبر است.');
  const altSubjectId = altRaw && altRaw === subjectId ? null : altRaw;
  const startTime = timeStr(body.startTime ?? body.start_time, 'ساعت شروع');
  const endTime = timeStr(body.endTime ?? body.end_time, 'ساعت پایان');
  if (endTime <= startTime) bad('ساعت پایان باید بعد از شروع باشد.');
  if (!(await subjectExists(c.env.DB, subjectId))) bad('درس انتخاب‌شده وجود ندارد.');
  if (altSubjectId && !(await subjectExists(c.env.DB, altSubjectId))) bad('درس گردشی انتخاب‌شده وجود ندارد.');
  try {
    const r = await c.env.DB.prepare(
      `UPDATE lessons SET day=?, period=?, subject_id=?, alt_subject_id=?, start_time=?, end_time=?, updated_at=datetime('now') WHERE id=?`,
    ).bind(day, period, subjectId, altSubjectId, startTime, endTime, id).run();
    if (!r.meta.changes) return c.json({ ok: false, error: 'درس پیدا نشد.' }, 404);
    return c.json({ ok: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return c.json({ ok: false, error: 'این روز و زنگ قبلاً پر شده است.' }, 409);
    throw e;
  }
});

adminRoutes.delete('/lessons/:id', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('DELETE FROM lessons WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return c.json({ ok: false, error: 'درس پیدا نشد.' }, 404);
  return c.json({ ok: true });
});

// ---------- Homework ----------

adminRoutes.put('/lessons/:id/homework', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const lesson = await c.env.DB.prepare('SELECT id FROM lessons WHERE id = ?').bind(id).first();
  if (!lesson) return c.json({ ok: false, error: 'درس پیدا نشد.' }, 404);
  const body = await readJson(c.req.raw);
  const title = str(body.title, 'عنوان تکلیف', { min: 2, max: 200 });
  const description = str(body.description, 'توضیحات', { required: false, max: 4000 });
  const textbookPages = str(body.textbookPages ?? body.textbook_pages, 'صفحات کتاب', { required: false, max: 200 });
  const instructions = str(body.instructions, 'دستورالعمل', { required: false, max: 2000 });
  const notes = str(body.notes, 'یادداشت سرِ کلاس', { required: false, max: 2000 });
  const dueAt = isoDate(body.dueAt ?? body.due_at, 'مهلت تحویل', false);
  const r = await c.env.DB.prepare(`
    INSERT INTO homework (lesson_id, title, description, textbook_pages, instructions, notes, due_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lesson_id) DO UPDATE SET
      title=excluded.title, description=excluded.description, textbook_pages=excluded.textbook_pages,
      instructions=excluded.instructions, notes=excluded.notes, due_at=excluded.due_at,
      updated_at=datetime('now')
  `).bind(id, title, description, textbookPages, instructions, notes, dueAt).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

adminRoutes.delete('/lessons/:id/homework', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('DELETE FROM homework WHERE lesson_id = ?').bind(id).run();
  if (!r.meta.changes) return c.json({ ok: false, error: 'تکلیفی برای حذف نبود.' }, 404);
  return c.json({ ok: true });
});

// ---------- Tasks (deadlines) ----------

adminRoutes.post('/tasks', requireAdmin(), async (c) => {
  const body = await readJson(c.req.raw);
  const kind = oneOf(body.kind, 'نوع', TASK_KINDS);
  const title = str(body.title, 'عنوان', { min: 2, max: 200 });
  const subjectIdRaw = body.subjectId ?? body.subject_id;
  let subjectId: number | null = null;
  if (subjectIdRaw !== undefined && subjectIdRaw !== null && subjectIdRaw !== '') {
    subjectId = int(subjectIdRaw, 'درس', 1, 10_000);
    if (!(await subjectExists(c.env.DB, subjectId))) bad('درس انتخاب‌شده وجود ندارد.');
  }
  const description = str(body.description, 'توضیحات', { required: false, max: 4000 });
  const dueAt = isoDate(body.dueAt ?? body.due_at, 'مهلت', true)!;
  const priority = oneOf(body.priority ?? 'normal', 'اولویت', PRIORITIES);
  const r = await c.env.DB.prepare(`
    INSERT INTO tasks (kind, title, subject_id, description, due_at, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(kind, title, subjectId, description, dueAt, priority).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

adminRoutes.put('/tasks/:id', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c.req.raw);
  const kind = oneOf(body.kind, 'نوع', TASK_KINDS);
  const title = str(body.title, 'عنوان', { min: 2, max: 200 });
  let subjectId: number | null = null;
  const subjectIdRaw = body.subjectId ?? body.subject_id;
  if (subjectIdRaw !== undefined && subjectIdRaw !== null && subjectIdRaw !== '') {
    subjectId = int(subjectIdRaw, 'درس', 1, 10_000);
    if (!(await subjectExists(c.env.DB, subjectId))) bad('درس انتخاب‌شده وجود ندارد.');
  }
  const description = str(body.description, 'توضیحات', { required: false, max: 4000 });
  const dueAt = isoDate(body.dueAt ?? body.due_at, 'مهلت', true)!;
  const priority = oneOf(body.priority ?? 'normal', 'اولویت', PRIORITIES);
  const r = await c.env.DB.prepare(`
    UPDATE tasks SET kind=?, title=?, subject_id=?, description=?, due_at=?, priority=?,
      updated_at=datetime('now') WHERE id=?
  `).bind(kind, title, subjectId, description, dueAt, priority, id).run();
  if (!r.meta.changes) return c.json({ ok: false, error: 'مورد پیدا نشد.' }, 404);
  return c.json({ ok: true });
});

adminRoutes.delete('/tasks/:id', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return c.json({ ok: false, error: 'مورد پیدا نشد.' }, 404);
  return c.json({ ok: true });
});

adminRoutes.post('/tasks/:id/archive', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const archived = (() => {
    // body optional; toggle when absent
    return null;
  })();
  const cur = await c.env.DB.prepare('SELECT archived FROM tasks WHERE id = ?').bind(id)
    .first<{ archived: number }>();
  if (!cur) return c.json({ ok: false, error: 'مورد پیدا نشد.' }, 404);
  const next = cur.archived ? 0 : 1;
  await c.env.DB.prepare(
    `UPDATE tasks SET archived=?, updated_at=datetime('now') WHERE id=?`,
  ).bind(next, id).run();
  return c.json({ ok: true, archived: Boolean(next) });
});

// ---------- Announcements ----------

adminRoutes.post('/announcements', requireAdmin(), async (c) => {
  const body = await readJson(c.req.raw);
  const title = str(body.title, 'عنوان', { min: 2, max: 200 });
  const bodyText = str(body.body, 'متن', { min: 2, max: 4000 });
  const pinned = bool(body.pinned);
  const r = await c.env.DB.prepare(
    'INSERT INTO announcements (title, body, pinned) VALUES (?, ?, ?)',
  ).bind(title, bodyText, pinned ? 1 : 0).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

adminRoutes.put('/announcements/:id', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c.req.raw);
  const title = str(body.title, 'عنوان', { min: 2, max: 200 });
  const bodyText = str(body.body, 'متن', { min: 2, max: 4000 });
  const pinned = bool(body.pinned);
  const r = await c.env.DB.prepare(
    `UPDATE announcements SET title=?, body=?, pinned=?, updated_at=datetime('now') WHERE id=?`,
  ).bind(title, bodyText, pinned ? 1 : 0, id).run();
  if (!r.meta.changes) return c.json({ ok: false, error: 'اطلاعیه پیدا نشد.' }, 404);
  return c.json({ ok: true });
});

adminRoutes.delete('/announcements/:id', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return c.json({ ok: false, error: 'اطلاعیه پیدا نشد.' }, 404);
  return c.json({ ok: true });
});

// ---------- Attachments (uploads) ----------

function parentExists(db: D1Database, type: string, id: number): Promise<boolean> {
  const table = type === 'homework' ? 'homework' : type === 'task' ? 'tasks' : 'announcements';
  return db.prepare(`SELECT 1 AS x FROM ${table} WHERE id = ?`).bind(id).first().then(Boolean);
}

adminRoutes.post('/attachments', requireAdmin(), async (c) => {
  const rl = rateLimit(`upload:${(c.req.raw as { headers: Headers }).headers.get('CF-Connecting-IP') ?? 'x'}`, 20, 60_000);
  if (!rl.ok) return c.json({ ok: false, error: 'درخواست‌های بیش از حد.' }, 429, { 'Retry-After': String(rl.retryAfter) });

  const form = await c.req.raw.formData();
  const file = form.get('file');
  const parentType = oneOf(form.get('parentType'), 'نوع والد', ['homework', 'task', 'announcement'] as const);
  const parentId = int(form.get('parentId'), 'شناسه والد', 1, 10_000_000);
  if (!(file instanceof File)) bad('فایلی ارسال نشده است.');
  if (file.size <= 0) bad('فایل خالی است.');
  if (file.size > MAX_ATTACHMENT_BYTES) bad(`حجم فایل بیش از حد مجاز است (حداکثر ۱.۵ مگابایت).`);
  const filename = safeFilename(file.name || 'file');
  validateMime(file.type, filename);
  if (!(await parentExists(c.env.DB, parentType, parentId))) bad('مورد والد پیدا نشد.');
  const totalRow = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(size),0) AS total FROM attachments WHERE parent_type=? AND parent_id=?`,
  ).bind(parentType, parentId).first<{ total: number }>();
  if ((totalRow?.total ?? 0) + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
    bad('مجموع حجم پیوست‌های این مورد به سقف رسیده است.');
  }
  const data = await file.arrayBuffer();
  const r = await c.env.DB.prepare(
    'INSERT INTO attachments (parent_type, parent_id, filename, mime, size, data) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(parentType, parentId, filename, file.type, file.size, data).run();
  return c.json({ ok: true, id: r.meta.last_row_id, filename, size: file.size });
});

adminRoutes.delete('/attachments/:id', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return c.json({ ok: false, error: 'پیوست پیدا نشد.' }, 404);
  return c.json({ ok: true });
});

// ---------- Subjects & settings ----------

adminRoutes.post('/subjects', requireAdmin(), async (c) => {
  const body = await readJson(c.req.raw);
  const name = str(body.name, 'نام درس', { min: 2, max: 60 });
  const colorKey = oneOf(body.colorKey ?? body.color_key, 'رنگ', COLOR_KEYS);
  try {
    const r = await c.env.DB.prepare(
      'INSERT INTO subjects (name, color_key) VALUES (?, ?)',
    ).bind(name, colorKey).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return c.json({ ok: false, error: 'این درس قبلاً ثبت شده است.' }, 409);
    throw e;
  }
});

adminRoutes.put('/settings', requireAdmin(), async (c) => {
  const body = await readJson(c.req.raw);
  const allowed: Record<string, [number, number]> = {
    class_name: [2, 120],
    welcome_message: [2, 200],
    admin_note: [0, 300],
  };
  const entries: [string, string][] = [];
  for (const [key, [min, max]] of Object.entries(allowed)) {
    if (body[key] !== undefined) {
      entries.push([key, str(body[key], key, { min, max })]);
    }
  }
  if (!entries.length) bad('هیچ تنظیمی ارسال نشد.');
  for (const [key, value] of entries) {
    await c.env.DB.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).bind(key, value).run();
  }
  return c.json({ ok: true });
});

export default adminRoutes;
