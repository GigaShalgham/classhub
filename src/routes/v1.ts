// مسیرهای /api/v1 — دروازه‌ی API عمومی برای هر کلاینت بیرونی
// (ربات تلگرام، اسکریپت، اپ دیگر). احراز با کلید API (X-API-Key یا Bearer).
//
// لایه‌ها:
//   GET  /api/v1/…          → «read» scope
//   POST /api/v1/…          → «write» scope
//   /api/v1/keys/…          → همیشه admin session (کلیدها فقط از پنل مدیریت می‌شوند)
//   /api/v1/telegram/*       → با همان تلگرامِ موجود؛ اینجا فقط «خواندن» اضافه شد
//
// چرا برای «نوشتن» از منطق موجود admin.ts استفاده نمی‌کنیم: admin.ts برای
// نشست کوکی/تولنِ مدیر است و پیام‌هایش برای پنل فارسی است. اینجا همان
// اعتبارسنجی/جداول را با پاسخ‌های مستقل-از-UI تکرار می‌کنیم (کپی کوچک،
// جداسازی کامل قراردادها).

import { Hono, type Context } from 'hono';
import type { Env } from '../index.ts';
import { bad, str, int, bool, oneOf, readJson, isoDate } from '../validation.ts';
import { rateLimit, clientIp } from '../ratelimit.ts';
import { authApiKey, createApiKey, listApiKeys, maskKey } from '../apikeys.ts';
import { tgConfig } from '../telegram.ts';
import { requireAdmin } from './admin-helpers.ts';

type AppEnv = { Bindings: Env; Variables: { apiKey?: unknown } };
const v1 = new Hono<AppEnv>();

const TASK_KINDS = ['project', 'research', 'presentation', 'exam', 'quiz', 'submission'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;

// ---------- helpers ----------

type Ctx = Context<AppEnv>;

/** پاسخ خطای یکدست v1 (انگلیسی — کلاینت بیرونی است نه کاربر فارسی). */
function err(c: Ctx, status: number, message: string) {
  return c.json({ ok: false, error: message }, status as 400);
}

async function requireScope(c: Ctx, scope: 'read' | 'write') {
  const res = await authApiKey(c.env.DB, c.req.raw, scope);
  if (!res.ok) return { ok: false as const, res: err(c, res.status ?? 401, res.error ?? 'unauthorized') };
  c.set('apiKey', res.key!);
  return { ok: true as const };
}

function tehranDateUTC(offsetDays = 0): string {
  const now = Date.now() + 3.5 * 3600_000 + offsetDays * 86_400_000;
  return new Date(now).toISOString().slice(0, 10);
}

const HW_RANGE_DAYS = { past: 21, future: 45 };
function hwRange(): { from: string; to: string } {
  return { from: tehranDateUTC(-HW_RANGE_DAYS.past), to: tehranDateUTC(HW_RANGE_DAYS.future) };
}

// ---------- پروکسی خواندن: همان کوئری‌های public.ts ولی با هدر v1 ----------

v1.get('/schedule', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const { from, to } = hwRange();
  const [lessonRes, bellRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT l.id, l.day, l.period, l.start_time AS startTime, l.end_time AS endTime,
             s.id AS subjectId, s.name AS subjectName, s.color_key AS colorKey,
             a.id AS altSubjectId, a.name AS altSubjectName, a.color_key AS altColorKey,
             h.id AS hwId, h.title AS hwTitle, h.hw_date AS hwDate,
             (SELECT COUNT(*) FROM attachments a2 WHERE a2.parent_type='homework' AND a2.parent_id = h.id) AS hwAtt
      FROM lessons l
      JOIN subjects s ON s.id = l.subject_id
      LEFT JOIN subjects a ON a.id = l.alt_subject_id
      LEFT JOIN homework h ON h.lesson_id = l.id AND h.hw_date BETWEEN '${from}' AND '${to}'
      ORDER BY l.day, l.period
    `).all<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT day, period, start_time AS startTime, end_time AS endTime FROM bells ORDER BY day, period').all(),
  ]);
  return c.json({ ok: true, lessons: lessonRes.results ?? [], bells: bellRes.results ?? [], hwRange: hwRange() });
});

v1.get('/tasks', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const { results } = await c.env.DB.prepare(`
    SELECT t.id, t.kind, t.title, t.description, t.due_at AS dueAt, t.priority, t.archived,
           t.created_at AS createdAt, t.updated_at AS updatedAt,
           s.id AS subjectId, s.name AS subjectName, s.color_key AS colorKey,
           (SELECT COUNT(*) FROM attachments a WHERE a.parent_type='task' AND a.parent_id = t.id) AS attachmentCount
    FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id
    ORDER BY t.archived, t.due_at
  `).all<Record<string, unknown>>();
  const now = Date.now();
  const active: Record<string, unknown>[] = [];
  const expired: Record<string, unknown>[] = [];
  for (const r of results ?? []) {
    (r.archived || new Date(String(r.dueAt)).getTime() < now ? expired : active).push(r);
  }
  const byDue = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a.dueAt).localeCompare(String(b.dueAt));
  active.sort(byDue);
  expired.sort((a, b) => byDue(b, a));
  return c.json({ ok: true, active, expired });
});

v1.get('/announcements', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const { results } = await c.env.DB.prepare(`
    SELECT n.id, n.title, n.body, n.pinned, n.published_at AS publishedAt,
           (SELECT COUNT(*) FROM attachments a WHERE a.parent_type='announcement' AND a.parent_id = n.id) AS attachmentCount
    FROM announcements n ORDER BY n.pinned DESC, n.published_at DESC
  `).all();
  return c.json({ ok: true, announcements: results ?? [] });
});

v1.get('/announcements/:id', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return err(c, 400, 'invalid id');
  const r = await c.env.DB.prepare(
    'SELECT id, title, body, pinned, published_at AS publishedAt FROM announcements WHERE id = ?',
  ).bind(id).first();
  if (!r) return err(c, 404, 'announcement not found');
  return c.json({ ok: true, announcement: r });
});

v1.get('/subjects', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, color_key AS colorKey FROM subjects ORDER BY name',
  ).all();
  return c.json({ ok: true, subjects: results ?? [] });
});

v1.get('/settings', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const { results } = await c.env.DB.prepare(
    'SELECT key, value FROM settings WHERE key IN (?,?,?,?)',
  ).bind('class_name', 'welcome_message', 'admin_note', 'rotation_anchor').all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const r of results ?? []) out[r.key] = r.value;
  return c.json({ ok: true, settings: out });
});

v1.get('/handouts', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const { results } = await c.env.DB.prepare(`
    SELECT h.id, h.title, h.description, h.created_at AS createdAt, h.updated_at AS updatedAt,
           s.id AS subjectId, s.name AS subjectName, s.color_key AS colorKey
    FROM handouts h LEFT JOIN subjects s ON s.id = h.subject_id
    ORDER BY h.updated_at DESC, h.id DESC
  `).all();
  return c.json({ ok: true, handouts: results ?? [] });
});

// تکلیف‌های تاریخ‌محور — برای ربات تلگرام «تکلیف امروز/فردا/این هفته»
v1.get('/homework', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('from') ?? '')
    ? (c.req.query('from') as string) : tehranDateUTC(-HW_RANGE_DAYS.past);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('to') ?? '')
    ? (c.req.query('to') as string) : tehranDateUTC(HW_RANGE_DAYS.future);
  const { results } = await c.env.DB.prepare(`
    SELECT h.id, h.hw_date AS hwDate, h.title, h.description, h.textbook_pages AS textbookPages,
           h.instructions, h.notes, h.updated_at AS updatedAt,
           l.id AS lessonId, l.day, l.period, l.start_time AS startTime, l.end_time AS endTime,
           s.name AS subjectName, s.color_key AS colorKey
    FROM homework h
    JOIN lessons l ON l.id = h.lesson_id
    JOIN subjects s ON s.id = l.subject_id
    WHERE h.hw_date BETWEEN ? AND ?
    ORDER BY h.hw_date, l.period
  `).bind(from, to).all();
  return c.json({ ok: true, homework: results ?? [], from, to });
});

// چکیده‌ی یک‌رضاختی برای ربات‌ها: امروز + فردا + مهلت‌های فعال
v1.get('/digest', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const today = tehranDateUTC();
  const tomorrow = tehranDateUTC(1);
  const [hwRes, tasksRes, bellsRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT h.id, h.hw_date AS hwDate, h.title, h.textbook_pages AS textbookPages, h.notes,
             l.period, l.start_time AS startTime, l.end_time AS endTime, s.name AS subjectName
      FROM homework h
      JOIN lessons l ON l.id = h.lesson_id
      JOIN subjects s ON s.id = l.subject_id
      WHERE h.hw_date IN (?, ?)
      ORDER BY h.hw_date, l.period
    `).bind(today, tomorrow).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT t.id, t.kind, t.title, t.due_at AS dueAt, t.priority, s.name AS subjectName
      FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id
      WHERE t.archived = 0 AND t.due_at >= datetime('now')
      ORDER BY t.due_at LIMIT 10
    `).all<Record<string, unknown>>(),
    c.env.DB.prepare(
      'SELECT day, period, start_time AS startTime, end_time AS endTime FROM bells ORDER BY day, period',
    ).all<Record<string, unknown>>(),
  ]);
  return c.json({
    ok: true,
    today,
    tomorrow,
    homeworkToday: (hwRes.results ?? []).filter((h) => h.hwDate === today),
    homeworkTomorrow: (hwRes.results ?? []).filter((h) => h.hwDate === tomorrow),
    upcomingTasks: tasksRes.results ?? [],
    bells: bellsRes.results ?? [],
  });
});

// ---------- نوشتن (write scope) — همان اعتبارسنجی admin، پاسخ JSON v1 ----------

v1.post('/tasks', async (c) => {
  const gate = await requireScope(c, 'write');
  if (!gate.ok) return gate.res;
  const body = await readJson(c.req.raw);
  const kind = oneOf(body.kind, 'kind', TASK_KINDS);
  const title = str(body.title, 'title', { min: 2, max: 200 });
  const subjectIdRaw = body.subjectId ?? body.subject_id;
  let subjectId: number | null = null;
  if (subjectIdRaw !== undefined && subjectIdRaw !== null && subjectIdRaw !== '') {
    subjectId = int(subjectIdRaw, 'subjectId', 1, 10_000);
    if (!(await subjectExists(c.env.DB, subjectId))) bad('subject not found');
  }
  const description = str(body.description, 'description', { required: false, max: 4000 });
  const dueAt = isoDate(body.dueAt ?? body.due_at, 'dueAt', true)!;
  const priority = oneOf(body.priority ?? 'normal', 'priority', PRIORITIES);
  const r = await c.env.DB.prepare(
    'INSERT INTO tasks (kind, title, subject_id, description, due_at, priority) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(kind, title, subjectId, description, dueAt, priority).run();
  return c.json({ ok: true, id: r.meta.last_row_id }, 201);
});v1.post('/announcements', async (c) => {
  const gate = await requireScope(c, 'write');
  if (!gate.ok) return gate.res;
  const body = await readJson(c.req.raw);
  const title = str(body.title, 'title', { min: 2, max: 200 });
  const bodyText = str(body.body, 'body', { min: 2, max: 4000 });
  const pinned = bool(body.pinned);
  const r = await c.env.DB.prepare(
    'INSERT INTO announcements (title, body, pinned) VALUES (?, ?, ?)',
  ).bind(title, bodyText, pinned ? 1 : 0).run();
  return c.json({ ok: true, id: r.meta.last_row_id }, 201);
});

v1.post('/homework', async (c) => {
  const gate = await requireScope(c, 'write');
  if (!gate.ok) return gate.res;
  const body = await readJson(c.req.raw);
  const lessonId = int(body.lessonId ?? body.lesson_id, 'lessonId', 1, 10_000_000);
  const lesson = await c.env.DB.prepare('SELECT id, day FROM lessons WHERE id = ?').bind(lessonId)
    .first<{ id: number; day: number }>();
  if (!lesson) return err(c, 404, 'lesson not found');
  const hwDate = str(body.hwDate ?? body.hw_date, 'hwDate', { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hwDate)) bad('hwDate must be YYYY-MM-DD');
  const givenDow = new Date(hwDate + 'T00:00:00Z').getUTCDay();
  if (((givenDow + 1) % 7) !== lesson.day) bad('hwDate does not match the lesson weekday');
  const title = str(body.title, 'title', { min: 2, max: 200 });
  const description = str(body.description, 'description', { required: false, max: 4000 });
  const textbookPages = str(body.textbookPages ?? body.textbook_pages, 'textbookPages', { required: false, max: 200 });
  const instructions = str(body.instructions, 'instructions', { required: false, max: 2000 });
  const notes = str(body.notes, 'notes', { required: false, max: 2000 });
  const r = await c.env.DB.prepare(`
    INSERT INTO homework (lesson_id, hw_date, title, description, textbook_pages, instructions, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lesson_id, hw_date) DO UPDATE SET
      title=excluded.title, description=excluded.description, textbook_pages=excluded.textbook_pages,
      instructions=excluded.instructions, notes=excluded.notes,
      updated_at=datetime('now')
  `).bind(lessonId, hwDate, title, description, textbookPages, instructions, notes).run();
  return c.json({ ok: true, id: r.meta.last_row_id, hwDate }, 201);
});

v1.delete('/tasks/:id', async (c) => {
  const gate = await requireScope(c, 'write');
  if (!gate.ok) return gate.res;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return err(c, 400, 'invalid id');
  const r = await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return err(c, 404, 'task not found');
  await c.env.DB.prepare("DELETE FROM attachments WHERE parent_type='task' AND parent_id=?").bind(id).run();
  return c.json({ ok: true });
});

v1.post('/tasks/:id/archive', async (c) => {
  const gate = await requireScope(c, 'write');
  if (!gate.ok) return gate.res;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return err(c, 400, 'invalid id');
  const cur = await c.env.DB.prepare('SELECT archived FROM tasks WHERE id = ?').bind(id)
    .first<{ archived: number }>();
  if (!cur) return err(c, 404, 'task not found');
  const next = cur.archived ? 0 : 1;
  await c.env.DB.prepare(
    "UPDATE tasks SET archived=?, updated_at=datetime('now') WHERE id=?",
  ).bind(next, id).run();
  return c.json({ ok: true, archived: Boolean(next) });
});

async function subjectExists(db: D1Database, subjectId: number): Promise<boolean> {
  const r = await db.prepare('SELECT 1 AS x FROM subjects WHERE id = ?').bind(subjectId).first();
  return Boolean(r);
}

// ---------- /api/v1/telegram/* — خواندنِ پیکربندی تلگرام برای ربات‌سازها ----------

v1.get('/telegram/status', async (c) => {
  const gate = await requireScope(c, 'read');
  if (!gate.ok) return gate.res;
  const cfg = await tgConfig(c.env.DB);
  if (!cfg) return c.json({ ok: true, configured: false });
  return c.json({ ok: true, configured: true, chatId: cfg.chatId });
});

// ---------- مدیریت کلیدها (فقط نشست ادمین — مثل بقیه‌ی /api/admin) ----------

v1.use('/keys/*', requireAdmin());

v1.get('/keys', requireAdmin(), async (c) => {
  const keys = await listApiKeys(c.env.DB);
  return c.json({ ok: true, keys: keys.map((k) => ({ ...k, key_prefix: maskKey(k.key_prefix) })) });
});

v1.post('/keys', async (c) => {
  const rl = rateLimit(`apikey:${clientIp(c.req.raw)}`, 10, 60_000);
  if (!rl.ok) return err(c, 429, 'too many requests');
  const body = await readJson(c.req.raw);
  const label = str(body.label, 'label', { min: 2, max: 60 });
  const scopesRaw = body.scopes;
  const scopes = scopesRaw === undefined ? ['read'] as const
    : Array.isArray(scopesRaw) ? scopesRaw.map((s) => oneOf(s, 'scope', ['read', 'write'] as const))
    : bad('scopes must be an array');
  const expiresAt = body.expiresAt === undefined || body.expiresAt === null || body.expiresAt === ''
    ? null : str(body.expiresAt, 'expiresAt', { max: 40 });
  const { rawKey, info } = await createApiKey(c.env.DB, label, [...scopes], expiresAt);
  return c.json({ ok: true, key: rawKey, info: { ...info, key_prefix: maskKey(info.key_prefix) } }, 201);
});

v1.post('/keys/:id/toggle', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return err(c, 400, 'invalid id');
  const cur = await c.env.DB.prepare('SELECT active FROM api_keys WHERE id = ?').bind(id)
    .first<{ active: number }>();
  if (!cur) return err(c, 404, 'key not found');
  const next = cur.active ? 0 : 1;
  await c.env.DB.prepare('UPDATE api_keys SET active = ? WHERE id = ?').bind(next, id).run();
  return c.json({ ok: true, active: Boolean(next) });
});

v1.delete('/keys/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return err(c, 400, 'invalid id');
  const r = await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return err(c, 404, 'key not found');
  return c.json({ ok: true });
});

export default v1;
