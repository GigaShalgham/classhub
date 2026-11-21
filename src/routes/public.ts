// Public read-only API (students) — درس من

import { Hono } from 'hono';
import type { Env } from '../index';
import type { Announcement, AttachmentMeta, Lesson, Task } from '../types';
import { downloadHeaders } from '../attachments';

const WEEK_DAYS = 7;

const publicRoutes = new Hono<{ Bindings: Env }>();

/** lessons with subject info + rotating alt subject + latest homework + attachment counts */
function lessonQuery() {
  return `
    SELECT l.id, l.day, l.period, l.start_time AS startTime, l.end_time AS endTime,
           s.id AS subjectId, s.name AS subjectName, s.color_key AS colorKey,
           a.id AS altSubjectId, a.name AS altSubjectName, a.color_key AS altColorKey,
           h.id AS hwId, h.title AS hwTitle, h.due_at AS hwDueAt,
           (SELECT COUNT(*) FROM attachments a2 WHERE a2.parent_type='homework' AND a2.parent_id = h.id) AS hwAtt
    FROM lessons l
    JOIN subjects s ON s.id = l.subject_id
    LEFT JOIN subjects a ON a.id = l.alt_subject_id
    LEFT JOIN homework h ON h.lesson_id = l.id
    ORDER BY l.day, l.period
  `;
}

interface LessonRow {
  id: number; day: number; period: number; startTime: string; endTime: string;
  subjectId: number; subjectName: string; colorKey: string;
  altSubjectId: number | null; altSubjectName: string | null; altColorKey: string | null;
  hwId: number | null; hwTitle: string | null; hwDueAt: string | null; hwAtt: number;
}

function rowToLesson(r: LessonRow): Lesson {
  return {
    id: r.id,
    day: r.day,
    period: r.period,
    subject_id: r.subjectId,
    subject_name: r.subjectName,
    color_key: r.colorKey as Lesson['color_key'],
    alt_subject_id: r.altSubjectId ?? null,
    alt_subject_name: r.altSubjectName ?? null,
    alt_color_key: (r.altColorKey ?? null) as Lesson['alt_color_key'],
    start_time: r.startTime,
    end_time: r.endTime,
    homework: r.hwId ? {
      id: r.hwId,
      lesson_id: r.id,
      title: r.hwTitle ?? '',
      description: '',      // list view: headline only
      textbook_pages: '',
      instructions: '',
      notes: '',
      due_at: r.hwDueAt,
      created_at: '',
      updated_at: '',
    } : null,
    attachment_count: r.hwAtt ?? 0,
  };
}

publicRoutes.get('/schedule', async (c) => {
  const { results } = await c.env.DB.prepare(lessonQuery()).all<LessonRow>();
  const days: (Lesson[] | null)[] = Array.from({ length: WEEK_DAYS }, () => null);
  for (const r of results ?? []) {
    (days[r.day] ??= []).push(rowToLesson(r));
  }
  return c.json({ ok: true, days });
});

// Single round-trip bootstrap for the student page (weak-network optimization):
// merges /schedule + /tasks + /announcements + /settings into one payload.
// Read-only, additive; the individual endpoints stay untouched.
publicRoutes.get('/bootstrap', async (c) => {
  const [lessonRows, taskRows, annRows, settingRows] = await Promise.all([
    c.env.DB.prepare(lessonQuery()).all<LessonRow>(),
    c.env.DB.prepare(`
      SELECT t.id, t.kind, t.title, t.description, t.due_at AS dueAt, t.priority, t.archived,
             s.id AS subjectId, s.name AS subjectName, s.color_key AS colorKey,
             (SELECT COUNT(*) FROM attachments a WHERE a.parent_type='task' AND a.parent_id = t.id) AS att
      FROM tasks t
      LEFT JOIN subjects s ON s.id = t.subject_id
      ORDER BY t.archived, t.due_at
    `).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT n.id, n.title, n.body, n.pinned, n.published_at AS publishedAt,
             (SELECT COUNT(*) FROM attachments a WHERE a.parent_type='announcement' AND a.parent_id = n.id) AS att
      FROM announcements n
      ORDER BY n.pinned DESC, n.published_at DESC
    `).all<Record<string, unknown>>(),
    c.env.DB.prepare(
      'SELECT key, value FROM settings WHERE key IN (?,?,?,?)',
    ).bind('class_name', 'welcome_message', 'admin_note', 'rotation_anchor').all<{ key: string; value: string }>(),
  ]);

  const days: (Lesson[] | null)[] = Array.from({ length: WEEK_DAYS }, () => null);
  for (const r of lessonRows.results ?? []) {
    (days[r.day] ??= []).push(rowToLesson(r));
  }

  const now = Date.now();
  const active: Task[] = [];
  const expired: Task[] = [];
  for (const r of taskRows.results ?? []) {
    const t: Task = {
      id: r.id as number,
      kind: r.kind as Task['kind'],
      title: r.title as string,
      subject_id: (r.subjectId ?? null) as number | null,
      subject_name: (r.subjectName ?? null) as string | null,
      color_key: (r.colorKey ?? null) as Task['color_key'],
      description: r.description as string,
      due_at: r.dueAt as string,
      priority: r.priority as Task['priority'],
      archived: Boolean(r.archived),
      created_at: '',
      updated_at: '',
      attachment_count: (r.att ?? 0) as number,
    };
    if (t.archived || new Date(t.due_at).getTime() < now) expired.push(t);
    else active.push(t);
  }
  active.sort((a, b) => a.due_at.localeCompare(b.due_at));
  expired.sort((a, b) => b.due_at.localeCompare(a.due_at));

  const announcements: Announcement[] = (annRows.results ?? []).map((r) => ({
    id: r.id as number,
    title: r.title as string,
    body: r.body as string,
    pinned: Boolean(r.pinned),
    published_at: r.publishedAt as string,
    attachment_count: (r.att ?? 0) as number,
  }));

  const settings: Record<string, string> = {};
  for (const r of settingRows.results ?? []) settings[r.key] = r.value;

  return c.json({ ok: true, days, tasks: { active, expired }, announcements, settings });
});

publicRoutes.get('/lessons/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ ok: false, error: 'شناسه نامعتبر.' }, 400);
  const row = await c.env.DB.prepare(`
    SELECT l.*, s.name AS subjectName, s.color_key AS colorKey,
           sa.id AS altSubjectId, sa.name AS altSubjectName, sa.color_key AS altColorKey,
           h.id AS hwId, h.title AS hwTitle, h.description AS hwDescription,
           h.textbook_pages AS hwPages, h.instructions AS hwInstructions,
           h.notes AS hwNotes, h.due_at AS hwDueAt, h.created_at AS hwCreated, h.updated_at AS hwUpdated
    FROM lessons l
    JOIN subjects s ON s.id = l.subject_id
    LEFT JOIN subjects sa ON sa.id = l.alt_subject_id
    LEFT JOIN homework h ON h.lesson_id = l.id
    WHERE l.id = ?
  `).bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ ok: false, error: 'درس پیدا نشد.' }, 404);
  const hwId = row.hwId as number | null;
  const attachments = hwId
    ? await c.env.DB.prepare(
        `SELECT id, filename, mime, size, created_at AS createdAt FROM attachments
         WHERE parent_type='homework' AND parent_id=? ORDER BY id`,
      ).bind(hwId).all<AttachmentMeta>()
    : { results: [] };
  return c.json({
    ok: true,
    lesson: {
      id: row.id,
      day: row.day,
      period: row.period,
      start_time: row.startTime ?? row.start_time,
      end_time: row.endTime ?? row.end_time,
      subject_id: row.subjectId ?? row.subject_id,
      subject_name: row.subjectName,
      color_key: row.colorKey,
      alt_subject_id: row.altSubjectId ?? null,
      alt_subject_name: row.altSubjectName ?? null,
      alt_color_key: row.altColorKey ?? null,
      homework: hwId ? {
        id: hwId,
        lesson_id: id,
        title: row.hwTitle,
        description: row.hwDescription,
        textbook_pages: row.hwPages,
        instructions: row.hwInstructions,
        notes: row.hwNotes,
        due_at: row.hwDueAt,
        created_at: row.hwCreated,
        updated_at: row.hwUpdated,
      } : null,
      attachments: attachments.results,
    },
  });
});

publicRoutes.get('/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.id, t.kind, t.title, t.description, t.due_at AS dueAt, t.priority, t.archived,
           s.id AS subjectId, s.name AS subjectName, s.color_key AS colorKey,
           (SELECT COUNT(*) FROM attachments a WHERE a.parent_type='task' AND a.parent_id = t.id) AS att
    FROM tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    ORDER BY t.archived, t.due_at
  `).all<Record<string, unknown>>();
  const now = Date.now();
  const active: Task[] = [];
  const expired: Task[] = [];
  for (const r of results ?? []) {
    const t: Task = {
      id: r.id as number,
      kind: r.kind as Task['kind'],
      title: r.title as string,
      subject_id: (r.subjectId ?? null) as number | null,
      subject_name: (r.subjectName ?? null) as string | null,
      color_key: (r.colorKey ?? null) as Task['color_key'],
      description: r.description as string,
      due_at: r.dueAt as string,
      priority: r.priority as Task['priority'],
      archived: Boolean(r.archived),
      created_at: '',
      updated_at: '',
      attachment_count: (r.att ?? 0) as number,
    };
    if (t.archived || new Date(t.due_at).getTime() < now) expired.push(t);
    else active.push(t);
  }
  active.sort((a, b) => a.due_at.localeCompare(b.due_at));
  expired.sort((a, b) => b.due_at.localeCompare(a.due_at));
  return c.json({ ok: true, active, expired });
});

publicRoutes.get('/tasks/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ ok: false, error: 'شناسه نامعتبر.' }, 400);
  const r = await c.env.DB.prepare(`
    SELECT t.*, s.name AS subjectName, s.color_key AS colorKey
    FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id WHERE t.id = ?
  `).bind(id).first<Record<string, unknown>>();
  if (!r) return c.json({ ok: false, error: 'مورد پیدا نشد.' }, 404);
  const att = await c.env.DB.prepare(
    `SELECT id, filename, mime, size, created_at AS createdAt FROM attachments
     WHERE parent_type='task' AND parent_id=? ORDER BY id`,
  ).bind(id).all<AttachmentMeta>();
  return c.json({
    ok: true,
    task: {
      ...r,
      subject_name: r.subjectName ?? null,
      color_key: r.colorKey ?? null,
      attachments: att.results,
    },
  });
});

publicRoutes.get('/announcements', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT n.id, n.title, n.body, n.pinned, n.published_at AS publishedAt,
           (SELECT COUNT(*) FROM attachments a WHERE a.parent_type='announcement' AND a.parent_id = n.id) AS att
    FROM announcements n
    ORDER BY n.pinned DESC, n.published_at DESC
  `).all<Record<string, unknown>>();
  const items: Announcement[] = (results ?? []).map((r) => ({
    id: r.id as number,
    title: r.title as string,
    body: r.body as string,
    pinned: Boolean(r.pinned),
    published_at: r.publishedAt as string,
    attachment_count: (r.att ?? 0) as number,
  }));
  return c.json({ ok: true, announcements: items });
});

publicRoutes.get('/announcements/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ ok: false, error: 'شناسه نامعتبر.' }, 400);
  const r = await c.env.DB.prepare(
    'SELECT id, title, body, pinned, published_at AS publishedAt FROM announcements WHERE id = ?',
  ).bind(id).first<Record<string, unknown>>();
  if (!r) return c.json({ ok: false, error: 'اطلاعیه پیدا نشد.' }, 404);
  const att = await c.env.DB.prepare(
    `SELECT id, filename, mime, size, created_at AS createdAt FROM attachments
     WHERE parent_type='announcement' AND parent_id=? ORDER BY id`,
  ).bind(id).all<AttachmentMeta>();
  return c.json({ ok: true, announcement: { ...r, attachments: att.results } });
});

publicRoutes.get('/subjects', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, color_key AS colorKey FROM subjects ORDER BY name',
  ).all();
  return c.json({ ok: true, subjects: results });
});

publicRoutes.get('/settings', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT key, value FROM settings WHERE key IN (?,?,?,?)',
  ).bind('class_name', 'welcome_message', 'admin_note', 'rotation_anchor').all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const r of results ?? []) out[r.key] = r.value;
  return c.json({ ok: true, settings: out });
});

// Attachment download — public read (students need to see homework files).
// Content-Disposition: attachment prevents rendering untrusted HTML/SVG inline.
publicRoutes.get('/attachments/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ ok: false, error: 'شناسه نامعتبر.' }, 400);
  const row = await c.env.DB.prepare(
    'SELECT id, filename, mime, size, data FROM attachments WHERE id = ?',
  ).bind(id).first<{ id: number; filename: string; mime: string; size: number; data: unknown }>();
  if (!row) return c.json({ ok: false, error: 'فایل پیدا نشد.' }, 404);
  // D1 returns BLOB columns as byte arrays (or ArrayBuffer depending on driver path)
  let bytes: ArrayBuffer;
  if (row.data instanceof ArrayBuffer) {
    bytes = row.data;
  } else if (Array.isArray(row.data)) {
    bytes = new Uint8Array(row.data as number[]).buffer;
  } else if (row.data instanceof Uint8Array) {
    bytes = row.data.buffer as ArrayBuffer;
  } else if (typeof row.data === 'string') {
    bytes = new TextEncoder().encode(row.data).buffer as ArrayBuffer;
  } else {
    return c.json({ ok: false, error: 'فایل خراب است.' }, 500);
  }
  return new Response(bytes, {
    status: 200,
    headers: downloadHeaders({ filename: row.filename, mime: row.mime }),
  });
});

export default publicRoutes;
